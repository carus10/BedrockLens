# Handoff Raporu — CloudWatch Service Log Parsing & Deduplication

## 1. Observation (Gözlem)
- `src/main/services/cloudwatch-service.ts` dosyasında `parseQueryResults` fonksiyonu, `@message` içindeki token sayılarını ayrıştırmak için Regex kullanmaktadır:
  - Satır 125-126: `const m = record['@message'].match(/"outputTokenCount"\s*:\s*(\d+)/)`
  - Satır 132-133: `const m = record['@message'].match(/"inputTokenCount"\s*:\s*(\d+)/)`
- Bu Regex deseni sayısal değerleri yakalamak için `\d+` kullanmaktadır. Negatif sayı işareti (`-`) veya kaçış karakterlerinin (`\`) yönetimine dair ek bir kontrol barındırmamaktadır.
- `src/main/services/cloudwatch-service.test.ts` dosyasına eklediğimiz test senaryolarını `npm test -- --run` komutu ile çalıştırdık.
  - Çalıştırma sonucu:
    ```
    ✓ src/shared/pricing-engine.test.ts  (27 tests) 20ms
    ✓ src/main/services/cloudwatch-service.test.ts  (21 tests) 7ms
    Test Files  2 passed (2)
    Tests  48 passed (48)
    ```
- `npm run build` komutu başarıyla tamamlandı ve derleme hatası alınmadı.

## 2. Logic Chain (Mantık Zinciri)
- `@message` alanı, JSON formatında kaçışlı (escaped) tırnak işaretleri barındırdığında (örneğin prompt içinde `"outputTokenCount": 99999` enjeksiyonu varken), regex deseninin sonundaki çift tırnak karakteri ile aradaki ters eğik çizgi (`\`) uyuşmazlığa neden olur. Bu sebeple regex enjekte edilmiş değeri eşleştiremez ve asıl log değerini yakalayarak doğru çalışır. (Bkz: `should NOT fall victim to prompt injection in JSON-stringified @message...` testi).
- Ancak `@message` alanı ham (unescaped) bir log satırı veya kaçışsız tırnak işaretleri barındıran farklı bir logger formatındaysa, regex sol-sağ taraması nedeniyle enjekte edilen sahte değeri ilk sırada yakalar ve asıl değeri görmezden gelir. (Bkz: `should fall victim to prompt injection in raw/non-escaped @message` testi).
- Regex deseni `\d+` kullandığı için negatif değerlerdeki eksi (`-`) işaretini tanımaz ve eşleşme sağlayamaz (Bkz: `should fail to match negative signs in @message regex...` testi). Diğer yandan `inputTokens` alanı doğrudan CloudWatch alanından alındığında sayı negatif ise (e.g. `-50`) doğrudan tamsayıya parse edilir. Bu durum mantıksal tutarsızlığa sebebiyet verir.
- `deduplicateLogs` fonksiyonunda tekilleştirme yaparken `Math.max` kullanılması, negatif değerler ile pozitif değerler veya sıfır birleştirildiğinde negatif değerlerin yutulmasına yol açar (Bkz: `should deduplicate negative/positive mix using Math.max` testi).

## 3. Caveats (Kısıtlar)
- AWS SDK çağrılarının gerçek ağ gecikmeleri, timeout veya API kotalarının aşılması (Throttling) durumları mock ortamında simüle edilmemiştir.
- `@message` alanının gerçek AWS ortamında her zaman geçerli bir JSON string olup olmayacağı ve farklı AWS SDK/Bedrock Log sürümlerinde değişip değişmeyeceği test edilmemiştir.

## 4. Conclusion (Sonuç)
- Kodun çalışma zamanında çökmediği (no crash) doğrulanmıştır.
- Ayrıştırma (parsing) mantığındaki zayıflıkların giderilmesi için `@message` alanındaki regex tabanlı fallback yaklaşımı yerine güvenli bir `JSON.parse` mantığına geçilmesi ve negatif/eksik değerler için ek doğrulama kontrolleri (validation) eklenmesi önerilmektedir.

## 5. Verification Method (Doğrulama Yöntemi)
- `c:\Users\taska\Desktop\tkip` dizininde terminalden `npm test -- --run` komutunu çalıştırarak eklenen 11 adet adversarial ve sınır durumu testinin sorunsuz geçtiğini görebilirsiniz.
- `src/main/services/cloudwatch-service.test.ts` içerisindeki `Adversarial & Edge Cases` blokları incelenerek zafiyet ve sınır durum senaryoları doğrulanabilir.
