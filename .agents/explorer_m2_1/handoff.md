# Handoff Report - Milestone 2: AWS Cost Explorer Comparison Script

Bu rapor, AWS Cost Explorer Karşılaştırma Betiği için yapılan teknik analiz bulgularını ve çözüm stratejisini içermektedir.

---

## 1. Observation
Kod tabanında yapılan incelemede aşağıdaki dosyalar ve satırlardaki yapılar doğrudan gözlemlenmiştir:

*   **`src/main/services/cost-explorer-service.ts`**:
    *   **Bölge kısıtlaması (Satır 23-26)**: Cost Explorer istemcisi global fatura verisi için her zaman `us-east-1` bölgesinde başlatılmaktadır:
        ```typescript
        this.client = new CostExplorerClient({
          region: 'us-east-1',
          credentials: credProvider
        })
        ```
    *   **Zaman aralığı ve Exclusive End kısıtlaması (Satır 32-40)**: `GetCostAndUsageCommand` çağrılırken `Start` ve `End` tarihleri `yyyy-MM-dd` formatındadır:
        ```typescript
        TimePeriod: {
          Start: format(startDate, 'yyyy-MM-dd'),
          End: format(endDate, 'yyyy-MM-dd')
        }
        ```
        *Not:* AWS Cost Explorer API'sinde `End` tarihi hariçtir (exclusive). Örneğin, 11 Temmuz dahil edilmek isteniyorsa, `End` tarihi olarak 12 Temmuz verilmelidir.
    *   **Filtreler (Satır 42-47)**: Amazon Bedrock servis maliyetleri için servis adı filtresi uygulanmaktadır:
        ```typescript
        Filter: {
          Dimensions: {
            Key: 'SERVICE',
            Values: ['Amazon Bedrock', 'AWS Bedrock']
          }
        }
        ```

*   **`src/main/services/cloudwatch-service.ts`**:
    *   **Epoch Saniye Kısıtlaması (Satır 66-73)**: CloudWatch Logs Insights sorgusunda `startTime` ve `endTime` değerleri epoch saniye cinsinden verilmektedir:
        ```typescript
        new StartQueryCommand({
          logGroupName: this.logGroupName,
          startTime: Math.floor(startTime.getTime() / 1000),
          endTime: Math.floor(endTime.getTime() / 1000),
          queryString: query
        })
        ```
    *   **Tekilleştirme Algoritması (Satır 225-247)**: Aynı isteğe ait mükerrer log kayıtlarını temizlemek ve en yüksek değerleri korumak için `deduplicateLogs` kullanılmaktadır:
        ```typescript
        export function deduplicateLogs(logs: BedrockInvocationLog[]): BedrockInvocationLog[] { ... }
        ```

*   **`src/main/services/aws-credentials.ts`**:
    *   **Kimlik Bilgisi Tespiti (Satır 62-101)**: `detectCredentials` ortam değişkenlerini (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_PROFILE`), lokal config dosyalarını ve instance profillerini tarayarak geçerli bir `CredentialConfig` nesnesi döndürmektedir.

---

## 2. Logic Chain
Gözlemlerimiz doğrultusunda karşılaştırma betiğinin mimari kararları aşağıdaki mantık zinciriyle oluşturulmuştur:

1.  **Zaman Aralığı Eşleştirme**: AWS Cost Explorer verileri UTC gün sınırlarına göre kaydettiğinden, lokal zaman dilimiyle yapılacak gruplama gün sınırındaki loglarda sapmalara yol açacaktır. Bu nedenle CloudWatch loglarındaki timestamp değerlerinin UTC karşılıkları (`log.timestamp.split('T')[0]`) baz alınarak gruplama yapılmalıdır.
2.  **Veri Gecikmesi (Billing Lag)**: Fatura verilerinin AWS Cost Explorer'da yansıması 24-48 saat alabilmektedir. Bugün veya dünün verileri karşılaştırıldığında varyans yüksek çıkacaktır. Bu sebeple sorgulama aralığında varsayılan olarak `OFFSET_DAYS=2` (yani bugünden 2 gün öncesine kadar olan aralık) kullanılmalıdır.
3.  **End-Date Exclusive Telafisi**: Cost Explorer `End` parametresi exclusive olduğundan, sorgulanacak aralığın son gününün 1 gün sonrası `End` tarihi olarak atanmalıdır.
4.  **Başarısız İsteklerin Ayıklanması**: AWS Bedrock, başarısız olan API istekleri (`statusCode !== 200` veya hata kodu dönenler) için ücret yansıtmaz. Mevcut `data-service.ts` bu ayrımı yapmamaktadır. Bu nedenle, doğrulama betiğinde sadece başarılı istekler tahmini maliyet hesabına katılmalıdır.
5.  **Otomasyon (CI/CD)**: Hata eşiği aşımında betik `process.exit(1)` ile kapanarak CI/CD boru hattının durdurulabilmesini sağlamalıdır.

---

## 3. Caveats
*   **Büyük Veri Limitleri**: CloudWatch Logs sorgusu `limit 10000` satır ile sınırlandırılmıştır. Eğer sorgulanan gün aralığındaki toplam log sayısı 10.000'i aşarsa, log verisi eksik kalacağı için tahmini maliyet gerçek maliyetten çok daha düşük çıkacak ve varyans hatası verecektir. Log hacmi çok yüksek olan hesaplarda sorgunun günlük alt periyotlara bölünmesi gerekebilir.
*   **Fiyat Tanımları**: `pricing.json` dosyasındaki fiyat tarifesi güncel olmalıdır. Fiyat güncellemeleri veya indirimler yansıtılmazsa varyans artacaktır.
*   **Fatura Kredileri/Vergiler**: Cost Explorer üzerinden okunan `UnblendedCost` net maliyettir ancak vergi veya indirim kuponlarının nasıl yansıtıldığına dikkat edilmelidir.

---

## 4. Conclusion
AWS Cost Explorer karşılaştırma ve doğrulama betiği (`scripts/verify-billing.ts`), mevcut `PricingEngine`, `CloudWatchService` log parsing yapıları ve `detectCredentials` fonksiyonlarını import ederek bağımsız bir TypeScript modülü olarak uygulanabilir. Betik, veri gecikmesini tolere etmek için kaydırmalı gün aralıklarını (`OFFSET_DAYS=2`) kullanmalı, logları UTC gün sınırlarına göre tekilleştirip gruplamalı ve belirlenen hata oranını aşan varyans durumunda hata döndürmelidir.

---

## 5. Verification Method
1.  **Mevcut Testlerin Çalıştırılması**: Log ayrıştırma ve maliyet motorunun doğruluğunu kontrol etmek için aşağıdaki test komutu çalıştırılmalıdır:
    ```bash
    npm test
    ```
    (Bu komut `vitest` ile `src/main/services/cloudwatch-service.test.ts` ve `src/shared/pricing-engine.test.ts` dosyalarını çalıştıracaktır).
2.  **Karşılaştırma Betiğinin Doğrulanması**: Geliştirici tarafından `scripts/verify-billing.ts` implemente edildikten sonra, aşağıdaki ortam değişkenleri ile test edilmelidir:
    ```powershell
    $env:COMPARE_DAYS="7"
    $env:OFFSET_DAYS="2"
    $env:VARIANCE_THRESHOLD_PERCENT="5"
    npx tsx scripts/verify-billing.ts
    ```
    *   **Geçersiz Kılma Durumu (Invalidation)**: Eğer terminal tablosundaki günlük varyanslar veya toplam varyans, AWS konsolu üzerinden yapılan manuel doğrulamalarla uyuşmuyorsa, log gruplama saat dilimi (UTC) veya başarısız logların filtrelenip filtrelenmediği kontrol edilmelidir.
