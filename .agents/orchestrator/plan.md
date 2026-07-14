# AWS Bedrock Maliyet Hesaplama Doğrulama Test Planı

Bu plan, AWS Bedrock log analizi ve maliyet hesaplama uygulamasının token ve kredi hesaplamalarını gerçek AWS fiyatlandırması ve faturalarıyla eşleştiğini doğrulamak amacıyla hazırlanmıştır.

## Milestones (Kilometre Taşları)

### Milestone 1: Statik Log Analizi ve Hesaplama Testleri
- **Hedef**: Log parsing ve PricingEngine hesaplama doğruluğunun otomatik testler (Vitest) ile güvenceye alınması.
- **İşler**:
  - `cloudwatch-service.ts` içerisindeki `parseQueryResults` ve `deduplicateLogs` fonksiyonları için mock CloudWatch log çıktıları ile test senaryoları yazılması.
  - Testlerin farklı model tiplerini (Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3.0 Opus vb.) ve farklı token formatlarını (normal, cache read/write, thinking token'lar) kapsaması.
  - `PricingEngine`'in mock ve gerçek `pricing.json` ile maliyet hesaplama doğruluğunun test edilmesi.
- **Çıktı**: Programatik test paketinin başarıyla geçmesi (`vitest` veya `npm run test`).

### Milestone 2: AWS Cost Explorer & Billing Karşılaştırma Scripti
- **Hedef**: CloudWatch loglarından hesaplanan Bedrock maliyetleri ile AWS Cost Explorer API'den çekilen gerçek Bedrock fatura tutarlarının karşılaştırılması.
- **İşler**:
  - `CostExplorerService` kullanarak son N günün (örn. 7 veya 30 gün) günlük Amazon Bedrock maliyetlerinin çekilmesi.
  - Aynı tarih aralığı için CloudWatch Bedrock loglarının `CloudWatchService` ile sorgulanması.
  - Çekilen logların `PricingEngine` ile hesaplanarak toplam maliyet çıkartılması.
  - Gerçek AWS faturası ile hesaplanan maliyet arasındaki sapmanın (variance/deviation) hesaplanması.
  - Hata payı (örn. %1 veya $0.05) altındaki sapmalarda Success (Exit Code 0), sapma büyükse Fail (Exit Code 1) dönen ve sapma detaylarını raporlayan otomatik script geliştirilmesi.
- **Çıktı**: `scripts/verify-billing.ts` veya test dosyası olarak programatik çalışan script.

### Milestone 3: Otomasyon ve CI/CD/Test Entegrasyonu
- **Hedef**: Tüm doğrulama sürecinin tek komutla veya manuel müdahale olmadan çalıştırılabilir olması.
- **İşler**:
  - package.json altına `test:verify` komutunun eklenmesi veya mevcut test akışına entegre edilmesi.
  - Çalıştırma talimatları ve rapor şablonunun hazırlanması.
  - Forensic Auditor ile bütünlük ve doğruluk denetiminin gerçekleştirilmesi.
