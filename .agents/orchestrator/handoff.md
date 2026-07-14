# Soft Handoff - Orchestrator (Generation 1 to Generation 2)

## Milestone State
- **Milestone 1 (Statik Log Analizi ve Hesaplama Testleri)**: **DONE**
  - Tüm unit testler başarıyla entegre edilmiştir. Toplam 59 test geçmektedir.
  - Koddaki log/prompt injection açığı, gevşek log grubu eşleşmesi ve polling loop çökme riskleri düzeltilmiştir.
  - Pricing engine fuzzy matcher çakışması ve depletion date Vitest fake timer kararsızlıkları çözülmüştür.
  - Forensic Auditor "CLEAN" raporu vermiştir.
- **Milestone 2 (AWS Cost Explorer & Billing Karşılaştırma Scripti)**: **IN_PROGRESS** (Explorer aşaması tamamlandı, Worker aşamasına hazır).
- **Milestone 3 (Otomasyon ve Entegrasyon)**: **PENDING**

## Active Subagents
- Yok. Milestone 2 Explorer subagent'ları (`40600262-a9ea-4feb-9056-12d3b3a02204`, `ebd87af3-b881-4954-a52b-c9ce53ca8af4`, `0d33b5fd-fad7-4614-9f76-8f66e2929eda`) görevlerini başarıyla tamamlayıp raporlarını teslim etmişlerdir.

## Pending Decisions
- Yok. Karşılaştırma betiğinin tasarımı ve entegrasyon yöntemi üzerinde uzlaşılmıştır.

## Remaining Work
1. **Milestone 2 Worker Dispatch**:
   - `scripts/verify-billing.ts` scriptinin oluşturulması.
   - Script `detectCredentials` ile kimlik doğrulayıp, son N günü (örneğin completed UTC günlerini) hem CloudWatch hem Cost Explorer üzerinden çekecektir.
   - Bulunan logları `PricingEngine` ile hesaplayacak ve Cost Explorer'ın Bedrock maliyetleri ile karşılaştıracaktır.
   - Çift tolerans modeli ($T_{abs} = 0.01$ USD ve $T_{pct} = 1\%$) kullanarak sapma kontrolü yapacaktır.
   - Sapma aşımında exit code 1, başarıda exit code 0, sistem/bağlantı hatalarında exit code 2 verecektir.
   - `package.json` içerisine `"verify:billing": "vite-node scripts/verify-billing.ts"` scripti eklenecektir.
2. **Milestone 2 Verification**:
   - Reviewer, Challenger ve Auditor adımlarının koşturulması.
3. **Milestone 3 Implementation & E2E Validation**:
   - CI/CD ve otomasyon entegrasyonlarının doğrulanması.

## Key Artifacts
- `.agents/orchestrator/BRIEFING.md` - Durum ve roster hafızası.
- `.agents/orchestrator/progress.md` - İlerleme ve adım kontrol listesi.
- `PROJECT.md` - Global proje endeksi ve mimari detaylar.
- `.agents/explorer_m2_1/handoff.md` - AWS API veri çekme tasarımı.
- `.agents/explorer_m2_2/handoff.md` - Çift toleranslı sapma mantığı tasarımı.
- `.agents/explorer_m2_3/handoff.md` - TypeScript ve execution entegrasyonu tasarımı.
