# Handoff Report — AWS Cost Explorer Comparison Script (Milestone 2)

## 1. Observation
* **Milestone 2 Scope**: `PROJECT.md` dosyasında satır 14'te Milestone 2 hedefleri şu şekilde belirtilmiştir:
  ```markdown
  | 2 | M2: AWS Cost Explorer Comparison Script | Create verification script comparing computed billing vs Cost Explorer billing with a variance check | M1 | PLANNED |
  ```
* **Maliyet Hesaplama Metotları**: `src/shared/pricing-engine.ts` dosyasında maliyet hesaplama fonksiyonları şunlardır (satır 57-62):
  ```typescript
  calculateCost(
    usage: TokenUsage,
    modelId: string,
    pricingType: 'onDemand' | 'provisionedThroughput' = 'onDemand',
    overrides?: Partial<PricingTier>
  ): number
  ```
* **Log Sorgulama**: `src/main/services/cloudwatch-service.ts` dosyasındaki sorgu metodu (satır 42-46):
  ```typescript
  async queryInvocations(
    startTime: Date,
    endTime: Date,
    limit = 10000
  ): Promise<BedrockInvocationLog[]>
  ```
* **Cost Explorer Sorgulama**: `src/main/services/cost-explorer-service.ts` dosyasındaki sorgu metodu (satır 29-33):
  ```typescript
  async getDailyCosts(days: number): Promise<CostExplorerDay[]>
  ```
  `CostExplorerDay` arayüzü (satır 11-15):
  ```typescript
  export interface CostExplorerDay {
    date: string
    totalCost: number
    bedrockCost: number
  }
  ```

## 2. Logic Chain
1. **Tarih Hizalaması (Date Alignment)**:
   * Cost Explorer verileri UTC gün sınırlarına göre (`00:00:00 UTC` - `23:59:59 UTC`) gruplandığı için, sorgu aralığı tam UTC günlerine göre kurulmalıdır.
   * `todayUTC` (mevcut günün başlangıcı olan 00:00:00 UTC) sorgu üst sınırı (`endDate` - exclusive) olarak seçilerek, devam eden ve henüz faturaya tam yansımamış gün sorgulama dışı bırakılmalıdır.
2. **Log ve Fatura Karşılaştırması**:
   * CloudWatch'tan çekilen loglar tekilleştirildikten sonra log timestamp'lerinden UTC gün bilgisi (`YYYY-MM-DD`) ayrıştırılır.
   * Her logun `PricingEngine` ile hesaplanan maliyeti günlük toplamlara eklenerek `Map<string, number>` yapısında toplanır.
   * Bu veriler, Cost Explorer'dan çekilen günlük Bedrock maliyetleri ile tarih bazında eşleştirilir.
3. **Çift Toleranslı Sapma Analizi (Double Tolerance Model)**:
   * Küçük yuvarlama hataları için mutlak tolerans ($T_{abs} = 0.01$ USD) ve büyük harcamalar için yüzdesel tolerans ($T_{pct} = 1\%$) tanımlanır.
   * $\Delta_{abs} \le T_{abs}$ veya ($C_{actual} > 0$ ve $\Delta_{pct} \le T_{pct}$) şartı sağlanırsa gün başarılı sayılır.
4. **Karar ve Hata Yönetimi**:
   * Uyuşmazlık bulunması durumunda detaylı hata raporu yazdırılır ve `Exit Code 1` ile betik sonlandırılır.
   * Başarı durumunda `Exit Code 0`, altyapısal/bağlantı hatalarında ise `Exit Code 2` dönülür.

## 3. Caveats
* **AWS Fatura Gecikmesi**: Cost Explorer verileri gerçek zamanlı değildir ve 24 saate kadar gecikmeyle yansır. Bu yüzden devam eden günün analize dahil edilmesi uyuşmazlığa neden olacağından dışlanmıştır.
* **Electron Bağımlılığı**: CLI betiğinin `electron-store` (SettingsService) bağımlılığı olmadan çalışabilmesi için AWS yapılandırmaları CLI parametreleri veya ortam değişkenleri (env) üzerinden alınmalıdır.

## 4. Conclusion
AWS Cost Explorer Karşılaştırma Betiği için UTC gün hizalamasını garanti eden, çift tolerans modeliyle (mutlak + yüzdesel) yuvarlama hatalarını tolere eden ve standart çıkış kodları sunan sağlam bir mantıksal tasarım (`analysis.md` dosyasında) önerilmiştir.

## 5. Verification Method
* **Birim Testleri (Vitest)**: Karşılaştırma mantığı `src/main/scripts/verify-billing.test.ts` (veya ilgili test dizini) dosyası altında test edilmelidir.
* **Test Senaryoları**:
  * Farklı zaman dilimlerinde (local vs UTC) log tarihlerinin doğru gruplanması.
  * Mutlak tolerans altında kalan farklar için başarılı (exit 0) dönülmesi.
  * Yüzdesel toleransı aşan farklar için başarısız (exit 1) dönülmesi.
  * AWS kimlik bilgisi hatalarında exit 2 dönülmesi.
* **Test Komutu**: `npx vitest run src/main/scripts/verify-billing.test.ts` veya `npm test` ile doğrulanır.
