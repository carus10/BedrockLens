# Milestone 2: AWS Cost Explorer Comparison Script - Teknik Analiz Raporu

Bu rapor, CloudWatch loglarından hesaplanan tahmini Bedrock kullanım maliyetleri ile AWS Cost Explorer'dan alınan gerçek fatura verilerini karşılaştıracak doğrulama betiğinin (verification script) mimarisini, veri çekme stratejilerini ve gereksinimlerini belirlemektedir.

---

## 1. Mevcut Servis Altyapısı Analizi

### A. AWS Cost Explorer Servisi (`cost-explorer-service.ts`)
*   **SDK İstemcisi**: `@aws-sdk/client-cost-explorer` kütüphanesinden `CostExplorerClient` kullanılmaktadır.
*   **Bölge (Region)**: Cost Explorer API uç noktaları globaldir ve her zaman `us-east-1` bölgesinde başlatılmalıdır (kod içerisinde `region: 'us-east-1'` olarak sabitlenmiştir).
*   **Sorgulama Komutu**: `GetCostAndUsageCommand` kullanılır.
*   **Veri Filtreleme**: 
    *   `SERVICE` boyutu (Dimension) üzerinden `['Amazon Bedrock', 'AWS Bedrock']` değerleri filtrelenir.
    *   `Metrics` olarak `['UnblendedCost']` (Net maliyet) talep edilir.
    *   `Granularity` değeri `DAILY` olarak ayarlanır.
*   **Zaman Aralığı (TimePeriod)**: `Start` (dahil) ve `End` (hariç) tarihleri `yyyy-MM-dd` formatında gönderilir. 
    *   *Kritik Detay:* `End` tarihi hariç tutulduğu için (exclusive), örn. 7 günlük veri çekilmek istendiğinde `End` tarihi `T` günü ise veriler en son `T-1` gününü kapsar. Betikte `End` tarihi olarak gerçekte istenen son günün 1 gün sonrası verilmelidir.

### B. CloudWatch Logs Servisi (`cloudwatch-service.ts`)
*   **SDK İstemcisi**: `@aws-sdk/client-cloudwatch-logs` kütüphanesinden `CloudWatchLogsClient`.
*   **Bölge (Region)**: Dinamik olarak `CredentialConfig.region` değerinden alınır (Bedrock invocation loglarının yazıldığı bölge).
*   **Log Grubu**: Varsayılan olarak `/aws/bedrock/modelinvocations` log grubu hedef alınır.
*   **Sorgulama Yöntemi**: CloudWatch Logs Insights sorgusu çalıştırılır.
    *   `StartQueryCommand` ile sorgu başlatılır ve `queryId` alınır.
    *   `GetQueryResultsCommand` ile sorgu durumu `Complete` olana kadar her 1000ms'de bir poll edilir (`QUERY_TIMEOUT_MS = 30000`).
*   **Log Ayrıştırma ve Deduplication**:
    *   Loglar `parseQueryResults` ile ayrıştırılır. Token sayıları (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`) doğrudan log alanlarından veya `@message` JSON içeriğinden (regex / JSON parse fallbacks ile) okunur.
    *   Aynı istek için CloudWatch Logs Insights bazen mükerrer (duplicate) satırlar döndürdüğünden, `deduplicateLogs` fonksiyonu ile `requestId` (veya timestamp) bazında tekilleştirme yapılır ve maksimum token/gecikme değerleri korunur.

---

## 2. Zaman Aralığı Senkronizasyonu ve Veri Çekme Stratejisi

### A. Gecikme (Data Lag) ve Güvenilirlik Problemi
*   **Sorun**: CloudWatch logları neredeyse gerçek zamanlı (birkaç dakika gecikmeli) oluşurken, AWS Cost Explorer fatura verileri genellikle **24 ila 48 saat gecikmeli** güncellenir.
*   **Etkisi**: Eğer betik "son 7 günü" (bugün dahil) sorgularsa, son 2 güne ait Cost Explorer verisi `$0.00` görüneceğinden, CloudWatch loglarından hesaplanan maliyetle arasında çok yüksek varyans (hata) oluşacaktır.
*   **Çözüm**: Karşılaştırma aralığında bir kaydırma (offset/lag) uygulanmalıdır. Karşılaştırma aralığı son gün olarak `T - 2` gününü hedef almalıdır.
    *   Örnek (Son 7 Gün Analizi): Bugün `2026-07-14` ise;
        *   Sorgulanacak gün aralığı: `2026-07-05` ile `2026-07-11` arası olmalıdır (toplam 7 gün).
        *   Cost Explorer parametreleri: `Start: '2026-07-05'`, `End: '2026-07-12'` (`End` exclusive olduğu için 11 Temmuz dahil edilir).
        *   CloudWatch parametreleri: `startTime: 2026-07-05 00:00:00 UTC`, `endTime: 2026-07-11 23:59:59 UTC`.

### B. Zaman Dilimi Eşleştirme (UTC Standardizasyonu)
*   **Sorun**: AWS Cost Explorer verileri UTC gün sınırlarına göre toplar. Eğer CloudWatch logları betik tarafında lokal saate göre gruplanırsa, gün sınırındaki loglar yanlış günlere yazılacak ve günlük karşılaştırmalarda yapay sapmalar oluşacaktır.
*   **Çözüm**: Tüm log zaman damgaları (timestamp) UTC olarak ele alınmalı ve tarih eşleştirmesi sadece UTC gün damgası üzerinden yapılmalıdır:
    ```typescript
    const dateStr = log.timestamp.split('T')[0]; // ISO UTC formatından yyyy-MM-dd kısmını doğrudan çeker
    ```

### C. Başarısız İsteklerin (Failed Invocations) Filtrelenmesi
*   **Sorun**: AWS Bedrock başarısız olan (örn. status code 4xx veya 5xx alan) API çağrıları için token ücreti faturalandırmaz. Ancak CloudWatch loglarında bu çağrılar yer alır.
*   **Çözüm**: Maliyet hesaplanırken `statusCode !== 200` olan veya `errorCode` içeren log kayıtları tahmini maliyet toplamına **dahil edilmemelidir**. (Mevcut `data-service.ts` bu filtrelemeyi yapmamaktadır, bu nedenle karşılaştırma betiğinde bu filtre mutlaka uygulanmalıdır).

---

## 3. Gerekli AWS Kimlik Bilgileri ve Ortam Değişkenleri

Doğrulama betiğinin CI/CD boru hatlarında veya lokal terminalde bağımsız çalışabilmesi için aşağıdaki değişkenlere ve yetkilere ihtiyacı vardır:

### A. Ortam Değişkenleri (Environment Variables)
Betik çalıştırılmadan önce ortamda tanımlanması gereken değişkenler:

| Değişken Adı | Açıklama | Varsayılan Değer |
|---|---|---|
| `AWS_REGION` / `AWS_DEFAULT_REGION` | CloudWatch loglarının okunacağı AWS bölgesi | `us-east-1` |
| `AWS_PROFILE` | Lokal çalıştırılıyorsa kullanılacak AWS CLI profili | `default` (Opsiyonel) |
| `AWS_ACCESS_KEY_ID` | CI/CD ortamları için AWS Access Key | (Gerekli - Profile yoksa) |
| `AWS_SECRET_ACCESS_KEY` | CI/CD ortamları için AWS Secret Key | (Gerekli - Profile yoksa) |
| `AWS_SESSION_TOKEN` | Geçici kimlik doğrulaması için Session Token | (Opsiyonel) |
| `BEDROCK_LOG_GROUP_NAME` | Bedrock invocation loglarının toplandığı log grubu | `/aws/bedrock/modelinvocations` |
| `COMPARE_DAYS` | Karşılaştırılacak gün sayısı | `7` (veya `30`) |
| `OFFSET_DAYS` | Cost Explorer veri gecikmesini tolere edecek gün ofseti | `2` |
| `VARIANCE_THRESHOLD_PERCENT` | Kabul edilebilir maksimum varyans yüzdesi | `5` (yani %5) |

### B. AWS IAM İzinleri
Betiğin kullanacağı AWS kimliğinin (IAM Role/User) en az aşağıdaki izinlere sahip olması gerekir:
*   **Cost Explorer**:
    *   `ce:GetCostAndUsage`
*   **CloudWatch Logs**:
    *   `logs:DescribeLogGroups`
    *   `logs:StartQuery`
    *   `logs:GetQueryResults`
*   **STS**:
    *   `sts:GetCallerIdentity` (Kimlik doğrulama testi için)

---

## 4. Önerilen Veri Karşılaştırma Betiği Mimarisi

Betiğin `scripts/verify-billing.ts` olarak konumlandırılması ve `vitest` veya `npx tsx` ile bağımsız olarak yürütülebilmesi önerilir.

### Akış Diyagramı ve Adımları
1.  **Credential Yükleme**: Ortamdaki değişkenleri kontrol et. `aws-credentials.ts` içerisindeki `detectCredentials()` fonksiyonunu taklit et veya doğrudan projeden import ederek AWS kimliğini oluştur.
2.  **Zaman Aralığı Hesaplama**: `COMPARE_DAYS` ve `OFFSET_DAYS` değerlerine göre UTC başlangıç ve bitiş tarihlerini belirle.
3.  **Cost Explorer Verisi Çekme**: `us-east-1` bölgesinde Cost Explorer istemcisi oluşturup günlük Bedrock maliyetlerini çek.
4.  **CloudWatch Loglarını Sorgulama**: Hedef bölgedeki log grubundan ilgili zaman aralığındaki tüm log kayıtlarını çek ve tekilleştir.
5.  **Maliyet Hesaplama**:
    *   Başarısız istekleri filtrele (`statusCode === 200`).
    *   `PricingEngine` ve `pricing.json` kullanarak her istek için maliyeti hesapla.
    *   Hesaplanan maliyetleri UTC günlerine (`yyyy-MM-dd`) göre grupla.
6.  **Varyans Analizi**:
    *   Her gün için: `fark = |Actual - Estimated|`, `varyans = (fark / Actual) * 100`.
    *   Toplam dönem için genel varyansı hesapla.
7.  **Sonuç Raporlama ve Çıkış**:
    *   Günlük karşılaştırma tablosunu terminale yazdır.
    *   Eğer genel varyans `VARIANCE_THRESHOLD_PERCENT` değerini aşarsa `process.exit(1)` ile hata döndür (bu sayede CI/CD hattı kırılır). Aksi takdirde `process.exit(0)` ile başarıyla tamamla.

---

## 5. Mimariden Kod Taslağı (Geliştirici Referansı)

Betik implementasyonu için önerilen ana mantık yapısı şu şekildedir:

```typescript
// scripts/verify-billing.ts
import { CostExplorerClient, GetCostAndUsageCommand, Granularity, GroupDefinitionType } from '@aws-sdk/client-cost-explorer'
import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { PricingEngine } from '../src/shared/pricing-engine'
import pricingJson from '../src/shared/pricing.json'
import { parseQueryResults, deduplicateLogs } from '../src/main/services/cloudwatch-service'
import { buildCredentialProvider, detectCredentials } from '../src/main/services/aws-credentials'
import { subDays, format, startOfDay, endOfDay } from 'date-fns'

async function runVerification() {
  const compareDays = parseInt(process.env.COMPARE_DAYS || '7', 10)
  const offsetDays = parseInt(process.env.OFFSET_DAYS || '2', 10)
  const threshold = parseFloat(process.env.VARIANCE_THRESHOLD_PERCENT || '5.0')
  const logGroupName = process.env.BEDROCK_LOG_GROUP_NAME || '/aws/bedrock/modelinvocations'

  // 1. Detect Credentials
  const credentialsConfig = await detectCredentials()
  if (!credentialsConfig) {
    console.error('AWS kimlik bilgileri tespit edilemedi.')
    process.exit(1)
  }
  const credProvider = await buildCredentialProvider(credentialsConfig)

  // 2. Calculate Ranges (UTC aligned)
  const now = new Date()
  const endCompareDate = subDays(now, offsetDays)
  const startCompareDate = subDays(endCompareDate, compareDays)

  console.log(`Analiz Periyodu (UTC): ${format(startCompareDate, 'yyyy-MM-dd')} ile ${format(endCompareDate, 'yyyy-MM-dd')} arası`)

  // 3. Query Cost Explorer (us-east-1)
  const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials: credProvider })
  const ceResponse = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: {
      Start: format(startCompareDate, 'yyyy-MM-dd'),
      // End exclusive olduğu için karşılaştırma son gününün 1 gün sonrasını talep etmeliyiz
      End: format(subDays(endCompareDate, -1), 'yyyy-MM-dd')
    },
    Granularity: Granularity.DAILY,
    Filter: { Dimensions: { Key: 'SERVICE', Values: ['Amazon Bedrock', 'AWS Bedrock'] } },
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: GroupDefinitionType.DIMENSION, Key: 'SERVICE' }]
  }))

  const actualCosts: Record<string, number> = {}
  for (const result of ceResponse.ResultsByTime ?? []) {
    const date = result.TimePeriod?.Start ?? ''
    let bedrockCost = 0
    for (const group of result.Groups ?? []) {
      bedrockCost += parseFloat(group.Metrics?.['UnblendedCost']?.Amount ?? '0')
    }
    if (bedrockCost === 0) {
      bedrockCost = parseFloat(result.Total?.['UnblendedCost']?.Amount ?? '0')
    }
    actualCosts[date] = bedrockCost
  }

  // 4. Query CloudWatch Logs
  const cwClient = new CloudWatchLogsClient({ region: credentialsConfig.region, credentials: credProvider })
  // CloudWatch Logs query (StartQueryCommand expects Unix epoch seconds)
  const startTimeEpoch = Math.floor(startOfDay(startCompareDate).getTime() / 1000)
  const endTimeEpoch = Math.floor(endOfDay(endCompareDate).getTime() / 1000)

  const query = `
    fields @timestamp, @message, requestId, modelId,
           input.inputTokenCount as inputTokens,
           output.outputTokenCount as outputTokens,
           input.cacheReadInputTokenCount as cacheReadTokens,
           input.cacheWriteInputTokenCount as cacheWriteTokens,
           performanceData.latencyMs as latencyMs,
           statusCode, errorCode
    | filter ispresent(modelId)
    | sort @timestamp asc
    | limit 10000
  `
  // Start Query
  const startResp = await cwClient.send(new StartQueryCommand({
    logGroupName,
    startTime: startTimeEpoch,
    endTime: endTimeEpoch,
    queryString: query
  }))
  const queryId = startResp.queryId
  
  // Poll results...
  let queryStatus = 'Running'
  let resultsPayload: any[] = []
  while (queryStatus === 'Running' || queryStatus === 'Scheduled') {
    await new Promise(r => setTimeout(r, 1000))
    const results = await cwClient.send(new GetQueryResultsCommand({ queryId }))
    queryStatus = results.status ?? 'Failed'
    if (queryStatus === 'Complete') {
      resultsPayload = results.results ?? []
    }
  }

  const logs = deduplicateLogs(parseQueryResults(resultsPayload))

  // 5. Calculate and Aggregate Costs
  const pricingEngine = new PricingEngine(pricingJson as any)
  const estimatedCosts: Record<string, number> = {}
  
  // Initialize map keys
  for (let i = 0; i <= compareDays; i++) {
    const dStr = format(subDays(endCompareDate, i), 'yyyy-MM-dd')
    estimatedCosts[dStr] = 0
  }

  for (const log of logs) {
    // Sadece başarılı istekleri maliyete yansıt
    if (log.statusCode !== 200 || log.errorCode) continue

    const dateStr = log.timestamp.split('T')[0]
    const cost = pricingEngine.calculateCost({
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      cacheReadTokens: log.cacheReadTokens,
      cacheWriteTokens: log.cacheWriteTokens,
      thinkingTokens: 0
    }, log.modelId)

    if (estimatedCosts[dateStr] !== undefined) {
      estimatedCosts[dateStr] += cost
    }
  }

  // 6. Compare & Print Table
  console.log('\n--- VERIFICATION TABLE ---')
  console.log('| Tarih      | Logs Sayısı | CW Est. Cost | CE Act. Cost | Fark ($)   | Varyans % | Status |')
  console.log('|------------|-------------|--------------|--------------|------------|-----------|--------|')

  let totalEst = 0
  let totalAct = 0
  let hasThresholdViolation = false

  for (const date of Object.keys(estimatedCosts).sort()) {
    const est = estimatedCosts[date] || 0
    const act = actualCosts[date] || 0
    totalEst += est
    totalAct += act

    const diff = Math.abs(act - est)
    const varPct = act > 0 ? (diff / act) * 100 : 0
    const logsCount = logs.filter(l => l.timestamp.startsWith(date) && l.statusCode === 200).length
    const status = varPct > threshold ? '🚨 FAIL' : '✅ OK'
    if (varPct > threshold) hasThresholdViolation = true

    console.log(`| ${date} | ${logsCount.toString().padEnd(11)} | $${est.toFixed(4).padEnd(11)} | $${act.toFixed(4).padEnd(11)} | $${diff.toFixed(4).padEnd(9)} | ${varPct.toFixed(2).padEnd(8)}% | ${status}   |`)
  }

  const totalDiff = Math.abs(totalAct - totalEst)
  const totalVarPct = totalAct > 0 ? (totalDiff / totalAct) * 100 : 0
  
  console.log('--------------------------')
  console.log(`Toplam CW Est: $${totalEst.toFixed(4)}`)
  console.log(`Toplam CE Act: $${totalAct.toFixed(4)}`)
  console.log(`Toplam Fark  : $${totalDiff.toFixed(4)}`)
  console.log(`Toplam Varyans: ${totalVarPct.toFixed(2)}%`)

  if (hasThresholdViolation || totalVarPct > threshold) {
    console.error(`\nHATA: Varyans belirlenen %${threshold} eşik değerini aşıyor!`)
    process.exit(1)
  }

  console.log('\nBAŞARILI: Karşılaştırma varyansı kabul edilebilir sınırlar içinde.')
  process.exit(0)
}
```
