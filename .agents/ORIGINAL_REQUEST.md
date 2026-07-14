# Original User Request

## Initial Request — 2026-07-14T08:16:33Z

# Teamwork Proje İsterleri — Draft

Geliştirilen AWS Bedrock log analizi ve maliyet hesaplama uygulamasının, kullanılan token ve kredi maliyetlerini gerçek AWS fiyatlandırmasıyla doğru bir şekilde eşleştirdiğini doğrulayan bir test/verifikasyon sürecinin oluşturulması.

Working directory: c:\Users\taska\Desktop\tkip
Integrity mode: development

## İsterler (Requirements)

### R1. Statik Log Analizi Doğrulaması
Uygulamanın, mevcut veya oluşturulacak statik log dosyalarındaki Bedrock kullanımını (token sayısı, model tipleri) doğru şekilde parse edip etmediği ve iç hesaplamasının doğruluğu test edilmelidir.

### R2. AWS Faturalandırma Doğrulaması
Uygulamanın hesapladığı toplam kredi/maliyet kullanımı, Boto3 veya AWS CLI (Cost Explorer API) kullanılarak doğrudan kullanıcının gerçek AWS faturası/verileri ile karşılaştırılmalıdır. 

### R3. Güvenlik ve Harici Bağımlılıklar
Doğrulama scriptleri geliştirilirken gerekli test kütüphaneleri kullanılabilir. Ancak AWS erişimi sırasında sadece read-only (okuma) işlemleri yapılmalı, mevcut altyapıyı değiştirecek veya ek maliyet yaratacak işlemlerden kaçınılmalıdır.

## Kabul Kriterleri (Acceptance Criteria)

### Test & Doğrulama Scriptleri
- [ ] Uygulamanın loglardan okuduğu token miktarı ile beklenen değerleri kıyaslayan otomatik bir programatik test (örn. pytest/jest) çıktısı üretilmeli.
- [ ] Uygulamanın hesapladığı toplam maliyet ile AWS Cost Explorer üzerinden alınan gerçek maliyetleri karşılaştıran ve sonucu açıkça raporlayan (sapma var/yok) otomatik bir script bulunmalı.
- [ ] Scriptler, manuel bir insan müdahalesine gerek kalmadan çalıştırılabilir ve sonuçları "Success/Fail" olarak değerlendirilebilir olmalı.
