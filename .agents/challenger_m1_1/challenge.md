# Adversarial Challenge & Stress Test Raporu — CloudWatch Service Log Parsing & Deduplication

## Challenge Summary

**Overall risk assessment**: MEDIUM

Bulgularımıza göre `cloudwatch-service.ts` içindeki log ayrıştırma ve tekilleştirme mantığı genel olarak dayanıklıdır ve çalışma zamanında çökmelere (crash) yol açmamaktadır. Ancak, mantıksal doğruluk açısından bazı zafiyetler ve beklenmeyen davranışlar tespit edilmiştir. Bunların en önemlisi, `@message` alanındaki JSON verisini regex kullanarak doğrudan parse etmesidir. Bu durum, JSON formatındaki kaçış karakterleri (escaping) olmadığında prompt injection veya log manipülasyonuna karşı zafiyet oluşturmaktadır.

## Challenges

### [Medium] Challenge 1: Naive Regex Fallback ile Prompt/Log Enjeksiyonu
- **Assumption challenged**: `@message` içindeki `outputTokenCount` ve `inputTokenCount` gibi alanların sadece geçerli metrik değerlerini temsil ettiği varsayımı.
- **Attack scenario**: Eğer `@message` ham/kaçış karakterleri (escaping) içermeyen bir metin veya özel logger formatı ise (örneğin: `info: "outputTokenCount": 99999, actual outputTokenCount: 5`), regex sol-sağ taraması nedeniyle ilk eşleşen enjekte edilmiş sahte değeri yakalayacaktır.
- **Blast radius**: Bedrock lens metriklerinin ve maliyet hesaplamalarının manipüle edilmesi.
- **Mitigation**: `@message` alanını regex ile taramak yerine doğrudan `JSON.parse` ile ayrıştırıp güvenli bir şekilde `outputTokenCount` alanına erişilmelidir.

### [Low] Challenge 2: Negatif Değerlerin Regex ile Yakalanamaması
- **Assumption challenged**: Regex fallback mantığının negatif değerleri (e.g. `-150`) de yakalayabileceği veya sıfır kabul edeceği varsayımı.
- **Attack scenario**: `@message` içinde `inputTokenCount: -150` gibi negatif bir değer olduğunda, regex `\d+` deseni negatif işaretini (`-`) yok saydığı için eşleşme tamamen başarısız olur ve varsayılan olarak `0` döner. Oysa doğrudan `inputTokens` alanından parse edildiğinde negatif değerler (e.g. `-50`) aynen korunur. Bu durum tutarsızlığa yol açar.
- **Blast radius**: Log ayrıştırma aşamasında tutarsız metrik hesaplamaları.
- **Mitigation**: Regex desenini `(-?\d+)` olarak güncellemek veya tercihen `JSON.parse` kullanmak.

### [Low] Challenge 3: Tekilleştirmede Negatif Değerlerin Math.max ile Yutulması
- **Assumption challenged**: Tekilleştirme adımında (`deduplicateLogs`) her alanın en yüksek değerinin (`Math.max`) doğru şekilde birleştirileceği varsayımı.
- **Attack scenario**: Eğer aynı `requestId` ile gelen iki kayıttan birinde negatif token sayısı varsa ve diğerinde pozitif varsa, `Math.max` negatif değeri yutarak pozitif olanı korur. Eğer her iki kayıt da negatifse (örneğin `-10` ve `-50`), en büyük olan `-10` seçilir. Bu durum veri kaybına ve hatalı toplamalara neden olabilir.
- **Blast radius**: Negatif/Hatalı log verilerinin birleştirilmesinde tutarsızlık.
- **Mitigation**: Token alanlarında negatif değerlerin varlığı kontrol edilmeli ve gerekirse mutlak değerleri alınmalı veya hata fırlatılmalıdır.

### [Low] Challenge 4: Eksik requestId ve timestamp Durumunda Aşırı Tekilleştirme
- **Assumption challenged**: Her log kaydının benzersiz bir `requestId` veya `timestamp` alanına sahip olduğu varsayımı.
- **Attack scenario**: Birden fazla log kaydında hem `requestId` hem de `timestamp` boş/eksik olduğunda, tekilleştirme anahtarı (key) `""` (boş string) olur. Bu durum, tüm bu kayıtların tek bir log satırına indirgenmesine ve verilerin ezilmesine yol açar.
- **Blast radius**: Eksik/bozuk log kayıtlarında büyük veri kaybı.
- **Mitigation**: `requestId` veya `timestamp` eksikse kayıtları birleştirmek yerine doğrudan listeye eklemek ya da geçici bir UUID üretmek.

## Stress Test Results

- **JSON Prompt Injection (Escaped)** -> `@message` JSON formatında stringify edildiğinde, iç tırnakların kaçış karakteri alması (`\"`) nedeniyle regex eşleşmesi bozulur ve asıl log değeri olan `5` başarıyla korunur -> **PASS** (Zafiyet engellendi)
- **Raw Prompt Injection (Unescaped)** -> Kaçış karakteri barındırmayan `@message` alanında enjekte edilen `"outputTokenCount": 99999` değeri yakalanır ve `99999` olarak parse edilir -> **PASS** (Zafiyet doğrulandı)
- **Negative Token Counts (Fields)** -> `inputTokens` alanı `-50` olan kayıtta negatif değer aynen korunur -> **PASS**
- **Negative Token Counts (@message Regex)** -> `@message` içindeki `-150` değeri regex tarafından eşleşemediği için `0` olarak döner -> **PASS** (Beklenen mantıksal davranış doğrulandı)
- **Floating Point Numbers** -> `inputTokens` alanındaki `123.45` değeri `parseInt` ile `123` değerine yuvarlanır -> **PASS**
- **Overflow Values** -> Güvenli tamsayı sınırını aşan `9007199254740992` değeri `9007199254740992` olarak korunur -> **PASS**
- **Non-Numeric Fields** -> `abc` gibi sayısal olmayan alanlar varsayılan olarak `0` değerine döner ve çökme yaşanmaz -> **PASS**
- **Negative Latency Values** -> `-1200` gibi negatif gecikme değerleri aynen parse edilir -> **PASS**
- **Non-Numeric Latency** -> `fast` gibi sayısal olmayan gecikme değerleri `0` olarak parse edilir -> **PASS**
- **Deduplication (Negative/Positive Mix)** -> `Math.max` kullanılarak en büyük değerler birleştirilir -> **PASS**
- **Deduplication (Empty keys)** -> Boş `requestId` ve `timestamp` değerine sahip kayıtlar tek bir kayıtta birleştirilir -> **PASS**

## Unchallenged Areas

- **CloudWatch API Network Timeouts** — Gerçek AWS API çağrılarındaki ağ gecikmeleri veya kota aşım durumları (Throttling) mock'lu ortamda test edilmemiştir.
