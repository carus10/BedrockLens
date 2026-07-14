# AWS Cost Explorer Karşılaştırma Betiği Analiz Raporu (Milestone 2)

Bu rapor, CloudWatch invocation loglarından hesaplanan Bedrock maliyetleri ile AWS Cost Explorer API'den alınan gerçek Bedrock fatura tutarlarının günlük bazda karşılaştırılmasını sağlayacak CLI betiğinin tasarım mantığını detaylandırmaktadır.

---

## 1. Veri Kaynakları ve Fiyatlandırma Hesaplama
Karşılaştırma mantığı iki ana veri kaynağı ile `PricingEngine` modülünü bir araya getirir:

### A. CloudWatch Logs Insights (Hesaplanan Maliyet)
* `CloudWatchService.queryInvocations(startTime, endTime)` metodu kullanılarak belirtilen zaman aralığındaki invocation logları çekilir.
* Çekilen loglar `deduplicateLogs` fonksiyonu ile `requestId` bazında tekilleştirilir.
* Her bir `BedrockInvocationLog` nesnesi için `PricingEngine.calculateCost` metodu çağrılarak log bazında harcama hesaplanır:
  ```typescript
  const invocationCost = pricingEngine.calculateCost(
    {
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      cacheReadTokens: log.cacheReadTokens,
      cacheWriteTokens: log.cacheWriteTokens,
      thinkingTokens: 0
    },
    log.modelId,
    pricingType,     // settings.pricingType (onDemand veya provisionedThroughput)
    overrides        // settings.pricingOverrides (özel model fiyat tanımları)
  );
  ```

### B. AWS Cost Explorer API (Gerçek Fatura Tutarı)
* `CostExplorerService` aracılığıyla Amazon Bedrock servisi için günlük `UnblendedCost` metriği çekilir.
* Cost Explorer sonuçları `CostExplorerDay[]` tipinde döner:
  ```typescript
  export interface CostExplorerDay {
    date: string       // YYYY-MM-DD
    totalCost: number
    bedrockCost: number
  }
  ```

---

## 2. Zaman Dilimi ve Tarih Hizalama (Timezone Alignment)
Tarih/zaman uyuşmazlıkları, iki veri kümesinin yanlış eşleşmesine ve hatalı alarm/fail durumlarına neden olabilir.

### Tasarım Kuralları:
1. **UTC Sınırları**: AWS Cost Explorer faturalama verilerini strictly UTC takvim günlerine göre (`00:00:00 UTC` - `23:59:59 UTC`) gruplar. Bu nedenle karşılaştırma aralığı tam UTC günlerine göre kurulmalıdır.
2. **Devam Eden Günün Dışlanması (Excluding Today)**: Cost Explorer verileri gerçek zamanlı değildir ve 24 saate kadar gecikmeyle yansır. Devam eden UTC günü (`todayUTC`) sorguya dahil edilirse, CloudWatch log maliyeti > Cost Explorer fatura tutarı olacağından uyuşmazlık çıkacaktır. Bu nedenle sorgu yalnızca **tamamlanmış tam UTC günlerini** kapsamalıdır.

### Hizalama Kodu Tasarımı:
```typescript
const now = new Date();
// Mevcut günün UTC bazındaki başlangıcı (00:00:00.000 UTC)
const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

// N tamamlanmış gün
const lookbackDays = 7;
const endDate = todayUTC; // Özel olarak hariç (exclusive)
const startDate = new Date(todayUTC.getTime() - lookbackDays * 24 * 60 * 60 * 1000); // Dahil (inclusive)

// CloudWatch Query Parametreleri (Unix Timestamp - Saniye)
const cwStartTime = startDate;
const cwEndTime = endDate;

// Cost Explorer Query Parametreleri (YYYY-MM-DD)
// Cost Explorer'da End tarihi exclusive olduğundan startDate ve endDate formatları birebir eşleşir.
const ceStart = startDate.toISOString().split('T')[0];
const ceEnd = endDate.toISOString().split('T')[0];
```

---

## 3. Günlük Maliyet Agregasyonu ve Haritalama
Karşılaştırma yapılabilmesi için log verilerinin günlük seviyeye indirilmesi gerekir.

1. **Agregasyon**:
   * Boş bir `Map<string, number>` (Log daily costs) oluşturulur ve sorgulanan tarih aralığındaki tüm günler `0` değeri ile init edilir.
   * `deduplicateLogs` sonrasındaki her log nesnesi için:
     * `log.timestamp` alanından UTC tarih string'i çıkartılır. Log timestamp formatı `YYYY-MM-DD HH:mm:ss.SSS` olduğundan split veya regex ile kolayca `YYYY-MM-DD` elde edilir:
       ```typescript
       const dateKey = log.timestamp.split(' ')[0]; // "YYYY-MM-DD"
       ```
     * Hesaplanan maliyet ilgili günün toplamına eklenir.
2. **Eşleştirme**:
   * Cost Explorer'dan gelen `CostExplorerDay[]` verisi de hızlı erişim için bir `Map<string, number>` yapısına dönüştürülür.
   * Belirlenen tarih aralığındaki her gün için iki harita karşılaştırılır.

---

## 4. Sapma (Variance) ve Hata Tolerans Sınırları
Matematiksel yuvarlama farkları, çok küçük harcamalar veya ücretsiz katman kullanımları için testin kırılmasını önlemek amacıyla **Çift Tolerans Modeli** (Double Tolerance Model) önerilmektedir.

### Formüller:
Günlük maliyetler için:
* $C_{calc}$: Loglardan hesaplanan günlük maliyet (USD)
* $C_{actual}$: Cost Explorer'dan alınan gerçek günlük maliyet (USD)
* Mutlak Sapma: $\Delta_{abs} = |C_{calc} - C_{actual}|$
* Yüzdesel Sapma (yalnızca $C_{actual} > 0$ ise): $\Delta_{pct} = \frac{\Delta_{abs}}{C_{actual}} \times 100$

### Tolerans Eşikleri:
* $T_{abs}$: Mutlak tolerans eşiği (Önerilen varsayılan: `0.01` USD)
* $T_{pct}$: Yüzdesel tolerans eşiği (Önerilen varsayılan: `%1.0` veya `%2.0`)

### Karşılaştırma Doğrulama Mantığı:
```typescript
const isPassing = (cCalc: number, cActual: number, tAbs: number, tPct: number): boolean => {
  const absDiff = Math.abs(cCalc - cActual);
  if (absDiff <= tAbs) {
    return true; // Mutlak tolerans dahilindeyse başarılı (yuvarlama farkları)
  }
  if (cActual > 0) {
    const pctDiff = (absDiff / cActual) * 100;
    return pctDiff <= tPct; // Yüzdesel tolerans dahilindeyse başarılı
  }
  return false; // Fatura 0 iken log maliyeti mutlak toleranstan büyükse veya tam tersi
};
```

### Sıfır Maliyet Senaryoları (Zero Cost Handling):
* $C_{actual} = 0$ ve $C_{calc} = 0 \implies$ **PASS** (Hiçbir aktivite yok)
* $C_{actual} = 0$ ve $C_{calc} = 0.0002 \le T_{abs} \implies$ **PASS** (İhmal edilebilir çok küçük log aktivitesi)
* $C_{actual} = 0$ ve $C_{calc} = 0.15 > T_{abs} \implies$ **FAIL** (Loglarda harcama görünüyor ama AWS faturalandırmamış)
* $C_{actual} = 2.50$ ve $C_{calc} = 0 \implies$ **FAIL** (Fatura kesilmiş ancak loglar eksik veya okunamadı)

---

## 5. Çıkış Kodları (Exit Codes) ve Rapor Tasarımı
Betiğin CI/CD veya otomatik test süreçlerinde sağlıklı değerlendirilebilmesi için standart exit kodları belirlenmiştir:

* **Exit Code `0` (Success)**: Sorgulanan tüm günlerin sapma analizleri belirlenen toleranslar ($T_{abs}$ ve $T_{pct}$) dahilinde kalmıştır.
* **Exit Code `1` (Verification Failure)**: En az bir gün için sapma tolerans sınırlarını aşmıştır. Maliyet uyuşmazlığı raporlanır.
* **Exit Code `2` (System/Execution Error)**: API çağrı hatası, yetki eksikliği (STS/Cost Explorer izinleri), eksik konfigürasyon veya parametre hataları.

### Terminal Çıktı Rapor Tasarımı (Örnek):
```
=== BEDROCK BILLING VERIFICATION REPORT ===
Period: 2026-07-07 to 2026-07-13 (UTC)
Log Group: /aws/bedrock/modelinvocations
Tolerance: Absolute = $0.01, Percentage = 1.00%

| Date       | Calculated ($) | Actual CE ($)  | Abs Diff ($) | Pct Diff (%) | Status  |
|------------|----------------|----------------|--------------|--------------|---------|
| 2026-07-07 | 1.2450         | 1.2500         | 0.0050       | 0.40%        | PASS    |
| 2026-07-08 | 0.0000         | 0.0000         | 0.0000       | 0.00%        | PASS    |
| 2026-07-09 | 3.4891         | 3.4500         | 0.0391       | 1.13%        | FAIL *  |
| 2026-07-10 | 0.0002         | 0.0000         | 0.0002       | 0.00%        | PASS    |
| 2026-07-11 | 2.1000         | 2.1100         | 0.0100       | 0.47%        | PASS    |
| 2026-07-12 | 0.5000         | 0.5010         | 0.0010       | 0.20%        | PASS    |
| 2026-07-13 | 0.0000         | 0.4000         | 0.4000       | 100.00%      | FAIL *  |

[FAIL] Billing verification failed. 2 days exceeded the tolerance limits.
```
