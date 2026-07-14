# Milestone 1: Log Parsing & Calculator Tests Analizi

## 1. Yönetici Özeti
Bu rapor, Amazon Bedrock invocation loglarının çözümlenmesi (parsing), mükerrer kayıtların ayıklanması (deduplication) ve fiyatlandırma hesaplamalarının (PricingEngine) doğruluğunu sınamak için Vitest tabanlı bir birim test (unit test) stratejisi sunmaktadır. Yapılan analizde, kritik log parsing fonksiyonlarının dışa aktarılmadığı görülmüş ve test edilebilirliği artırmak adına bu fonksiyonların dışa aktarılması veya test arayüzleri sağlanması önerilmiştir.

---

## 2. Log Parsing ve Regex Fallback Analizi (`parseQueryResults`)
`src/main/services/cloudwatch-service.ts` dosyasındaki `parseQueryResults` fonksiyonu, CloudWatch Logs Insights sorgusundan dönen ham verileri (`results: Array<Array<{ field?: string; value?: string }>>`) alır ve `BedrockInvocationLog[]` dizisine dönüştürür.

### Token Çözümleme Aşamaları ve Fallback Mekanizmaları:
1. **Output Tokens:**
   - İlk öncelik: `record['outputTokens']` alanından doğrudan tam sayı okuma (`parseInt(..., 10) || 0`).
   - İkinci öncelik (Fallback 1): Eğer değer `0` ise ve `record['parsedOutputTokens']` mevcutsa buradan okuma.
   - Üçüncü öncelik (Fallback 2): Eğer değer hala `0` ise ve `record['@message']` mevcutsa regex (`/"outputTokenCount"\s*:\s*(\d+)/`) ile ham JSON mesajından çekme.
2. **Input Tokens:**
   - İlk öncelik: `record['inputTokens']` alanından okuma.
   - Fallback: Eğer değer `0` ise ve `record['@message']` mevcutsa regex (`/"inputTokenCount"\s*:\s*(\d+)/`) ile okuma.
3. **Cache Read Tokens:**
   - İlk öncelik: `record['cacheReadTokens']` alanından okuma.
   - Fallback: Eğer değer `0` ise ve `record['@message']` mevcutsa regex (`/"cacheReadInputTokenCount"\s*:\s*(\d+)/`) ile okuma.
4. **Cache Write Tokens:**
   - İlk öncelik: `record['cacheWriteTokens']` alanından okuma.
   - Fallback: Eğer değer `0` ise ve `record['@message']` mevcutsa regex (`/"cacheWriteInputTokenCount"\s*:\s*(\d+)/`) ile okuma.

### Diğer Metadata Fallback'leri:
- **RequestId:** `record['requestId'] || record['_rid'] || ''` (CloudWatch Logs'taki farklı alan adlarına uyum için).
- **LatencyMs:** `parseInt(record['latencyMs'] ?? '0', 10) || 0`.
- **StatusCode:** `parseInt(record['statusCode'] ?? '200', 10) || 200` (Eksikse varsayılan `200` başarısı).

---

## 3. Log Deduplication Analizi (`deduplicateLogs`)
`deduplicateLogs` fonksiyonu, mükerrer CloudWatch log satırlarını birleştirir (örneğin istek ve yanıt loglarının ayrı satırlar olarak gelmesi durumu).

### Birleştirme Mantığı:
1. Her bir log kaydı için benzersiz anahtar (`key`): `log.requestId || log.timestamp` olarak belirlenir.
2. Eğer bu anahtar daha önce görülmemişse, kayıt haritaya (`byId` Map) eklenir.
3. Eğer anahtar daha önce görülmüşse, mevcut kayıt ile yeni kayıt birleştirilir:
   - Token sayıları ve gecikme süresi (`latencyMs`) için iki kayıttan en yüksek olan değer seçilir (`Math.max`).
   - Diğer tüm meta veriler (timestamp, requestId, modelId, statusCode, vb.) ilk karşılaşılan kaydın değerlerini korur.

---

## 4. Pricing Engine Analizi (`PricingEngine`)
`src/shared/pricing-engine.ts` dosyası, model ID'leri ile token fiyatlarını eşleştirir ve maliyeti hesaplar. Mevcut `pricing-engine.test.ts` dosyası bazı temel hesaplamaları test etmektedir, ancak şu kritik alanlarda test kapsamı eksiktir:

1. **Fuzzy Model Eşleştirme (`resolveModelKey`):**
   - Kayıtlı model anahtarlarından (ör. `claude-sonnet-4-6`) ve model ID'lerinden (ör. `us.anthropic.claude-sonnet-4-6`) gelen verileri eşleştirmek için karmaşık bir algoritma kullanmaktadır.
   - Model anahtarının tire (`-`) işaretlerine göre bölünüp `major` (parts[1]) ve `minor` (parts[2]) versiyonlarının eşleştirilmesi (`normalizedId.includes(`${major}-${minor}`)`) test edilmemiştir.
2. **Toplu Hesaplama (`calculateBatchCost`):**
   - Birden fazla log satırının ve farklı modellerin toplu maliyet hesaplaması ve model bazlı fiyat ezme (override) özellikleri test edilmemiştir.
3. **Provisioned Throughput Modu:**
   - `provisionedThroughput` fiyatlandırma modunun çalışması ve eğer konfigürasyonda bu fiyat mevcut değilse `onDemand` fiyatına geri dönmesi (fallback) doğrulanmamıştır.
4. **Para Birimi Biçimlendirme (`formatCost`):**
   - Farklı para birimleri ve yuvarlama mantığı doğrulanmamıştır.

---

## 5. Önerilen Test Stratejisi ve Yapısı

### A. Test Dosya Konumları
1. **Log Parsing ve Deduplication Testleri:**
   - Konum: `src/main/services/cloudwatch-service.test.ts`
   - Gerekçesi: `cloudwatch-service.ts` ile aynı dizinde bulunması projenin standartlarına uygundur.
2. **Pricing Engine Testleri Genişletmesi:**
   - Konum: `src/shared/pricing-engine.test.ts`
   - Gerekçesi: Mevcut test dosyasına yeni test bloklarının eklenmesi.

### B. Mock Veri Yapısı (TypeScript)

#### Log Parsing Mock Verileri:
```typescript
// 1. Yapılandırılmış alanları tam olan standart row (Happy Path)
const mockStructuredRow = [
  { field: '@timestamp', value: '2026-07-14 08:00:00.000' },
  { field: 'requestId', value: 'req-111' },
  { field: 'modelId', value: 'us.anthropic.claude-sonnet-4-6' },
  { field: 'inputTokens', value: '1000' },
  { field: 'outputTokens', value: '2000' },
  { field: 'cacheReadTokens', value: '500' },
  { field: 'cacheWriteTokens', value: '300' },
  { field: 'latencyMs', value: '450' },
  { field: 'statusCode', value: '200' }
];

// 2. outputTokens sıfır olan ama parsedOutputTokens içeren row
const mockParsedOutputRow = [
  { field: '@timestamp', value: '2026-07-14 08:01:00.000' },
  { field: 'requestId', value: 'req-222' },
  { field: 'modelId', value: 'us.anthropic.claude-sonnet-4-6' },
  { field: 'outputTokens', value: '0' },
  { field: 'parsedOutputTokens', value: '1500' }
];

// 3. Token alanları sıfır olan ve @message fallback gerektiren row
const mockMessageFallbackRow = [
  { field: '@timestamp', value: '2026-07-14 08:02:00.000' },
  { field: 'requestId', value: 'req-333' },
  { field: 'modelId', value: 'us.anthropic.claude-sonnet-4-6' },
  { field: 'inputTokens', value: '0' },
  { field: 'outputTokens', value: '0' },
  { field: 'cacheReadTokens', value: '0' },
  { field: 'cacheWriteTokens', value: '0' },
  { field: '@message', value: '{"inputTokenCount": 800, "outputTokenCount": 1200, "cacheReadInputTokenCount": 250, "cacheWriteInputTokenCount": 150}' }
];

// 4. requestId eksik olan ama _rid fallback içeren row
const mockRidFallbackRow = [
  { field: '@timestamp', value: '2026-07-14 08:03:00.000' },
  { field: '_rid', value: 'rid-444' },
  { field: 'modelId', value: 'us.anthropic.claude-sonnet-4-6' }
];
```

#### Deduplication Mock Verileri:
```typescript
import type { BedrockInvocationLog } from '../../shared/types';

// Aynı requestId'ye sahip fakat farklı token ve latency değerleri içeren loglar
const mockDuplicateLogs: BedrockInvocationLog[] = [
  {
    timestamp: '2026-07-14 08:00:00.000',
    requestId: 'req-dup-1',
    modelId: 'us.anthropic.claude-sonnet-4-6',
    inputTokens: 500,
    outputTokens: 0,
    cacheReadTokens: 100,
    cacheWriteTokens: 0,
    latencyMs: 150,
    statusCode: 200
  },
  {
    timestamp: '2026-07-14 08:00:00.500', // Farklı timestamp olsa dahi requestId aynı
    requestId: 'req-dup-1',
    modelId: 'us.anthropic.claude-sonnet-4-6',
    inputTokens: 0,
    outputTokens: 800,
    cacheReadTokens: 0,
    cacheWriteTokens: 200,
    latencyMs: 350,
    statusCode: 200
  }
];

// requestId boş olan ve timestamp değerine göre gruplanması gereken mükerrer loglar
const mockTimestampDuplicateLogs: BedrockInvocationLog[] = [
  {
    timestamp: '2026-07-14 08:05:00.000',
    requestId: '',
    modelId: 'us.anthropic.claude-sonnet-4-6',
    inputTokens: 400,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    latencyMs: 100,
    statusCode: 200
  },
  {
    timestamp: '2026-07-14 08:05:00.000',
    requestId: '',
    modelId: 'us.anthropic.claude-sonnet-4-6',
    inputTokens: 100,
    outputTokens: 600,
    cacheReadTokens: 50,
    cacheWriteTokens: 50,
    latencyMs: 250,
    statusCode: 200
  }
];
```

### C. Önerilen Test Yapısı (Vitest)

#### 1. `cloudwatch-service.test.ts` Yapısı:
```typescript
import { describe, it, expect } from 'vitest';
// Not: parseQueryResults ve deduplicateLogs fonksiyonlarının export edilmesi önerilir.
import { parseQueryResults, deduplicateLogs } from './cloudwatch-service';

describe('CloudWatch Log Parsing', () => {
  describe('parseQueryResults', () => {
    it('should successfully parse complete structured fields', () => {
      const parsed = parseQueryResults([mockStructuredRow]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        timestamp: '2026-07-14 08:00:00.000',
        requestId: 'req-111',
        modelId: 'us.anthropic.claude-sonnet-4-6',
        inputTokens: 1000,
        outputTokens: 2000,
        cacheReadTokens: 500,
        cacheWriteTokens: 300,
        latencyMs: 450,
        statusCode: 200,
        errorCode: undefined
      });
    });

    it('should fallback to parsedOutputTokens if outputTokens is 0', () => {
      const parsed = parseQueryResults([mockParsedOutputRow]);
      expect(parsed[0].outputTokens).toBe(1500);
    });

    it('should parse tokens from @message JSON string using regex fallbacks', () => {
      const parsed = parseQueryResults([mockMessageFallbackRow]);
      expect(parsed[0].inputTokens).toBe(800);
      expect(parsed[0].outputTokens).toBe(1200);
      expect(parsed[0].cacheReadTokens).toBe(250);
      expect(parsed[0].cacheWriteTokens).toBe(150);
    });

    it('should fallback to _rid if requestId is missing', () => {
      const parsed = parseQueryResults([mockRidFallbackRow]);
      expect(parsed[0].requestId).toBe('rid-444');
    });

    it('should use default values for statusCode and latencyMs if they are missing', () => {
      const parsed = parseQueryResults([[{ field: '@timestamp', value: '2026-07-14' }]]);
      expect(parsed[0].statusCode).toBe(200);
      expect(parsed[0].latencyMs).toBe(0);
    });
  });

  describe('deduplicateLogs', () => {
    it('should merge logs with the same requestId keeping the max value of token metrics and latency', () => {
      const merged = deduplicateLogs(mockDuplicateLogs);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(expect.objectContaining({
        requestId: 'req-dup-1',
        inputTokens: 500,        // Math.max(500, 0)
        outputTokens: 800,       // Math.max(0, 800)
        cacheReadTokens: 100,    // Math.max(100, 0)
        cacheWriteTokens: 200,   // Math.max(0, 200)
        latencyMs: 350           // Math.max(150, 350)
      }));
    });

    it('should merge logs with empty requestId using timestamp as grouping key', () => {
      const merged = deduplicateLogs(mockTimestampDuplicateLogs);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual(expect.objectContaining({
        timestamp: '2026-07-14 08:05:00.000',
        requestId: '',
        inputTokens: 400,
        outputTokens: 600,
        cacheReadTokens: 50,
        cacheWriteTokens: 50,
        latencyMs: 250
      }));
    });
  });
});
```

#### 2. `pricing-engine.test.ts` Genişletmesi:
```typescript
// Mevcut pricing-engine.test.ts dosyasına eklenecek yeni test case'leri:

describe('PricingEngine - Ek Test Senaryoları', () => {
  // ... mevcut beforeEach bloğu kullanılacak ...

  describe('resolveModelKey Fuzzy Matching', () => {
    it('should resolve model key using major-minor version matching (e.g. major is parts[1] and minor is parts[2])', () => {
      // Örnek: 'claude-sonnet-4-6' -> parts = ['claude', 'sonnet', '4', '6']. major = 'sonnet', minor = '4'.
      // normalizedId 'anthropic.claude-sonnet-4-6-v1:0' 'sonnet-4' ifadesini içerdiğinden eşleşmeli.
      const resolved = engine.resolveModelKey('anthropic.claude-sonnet-4-6-v1:0');
      expect(resolved).toBe('claude-sonnet-4-6');
    });

    it('should return undefined for entirely unknown model formats', () => {
      expect(engine.resolveModelKey('completely-random-model-name')).toBeUndefined();
    });
  });

  describe('calculateBatchCost', () => {
    it('should return 0 for an empty batch', () => {
      const cost = engine.calculateBatchCost([]);
      expect(cost).toBe(0);
    });

    it('should calculate cost correctly for a batch of multiple models and usages', () => {
      const batch = [
        {
          modelId: 'us.anthropic.claude-sonnet-4-6',
          usage: { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
        },
        {
          modelId: 'us.anthropic.claude-opus-4-8',
          usage: { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
        }
      ];
      // claude-sonnet-4-6: (1 * 0.003) + (1 * 0.015) = 0.018
      // claude-opus-4-8: (1 * 0.015) + (1 * 0.075) = 0.090
      // Toplam = 0.108
      const total = engine.calculateBatchCost(batch);
      expect(total).toBeCloseTo(0.108);
    });

    it('should apply individual model overrides within batch calculation', () => {
      const batch = [
        {
          modelId: 'us.anthropic.claude-sonnet-4-6',
          usage: { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
        }
      ];
      const overrides = {
        'us.anthropic.claude-sonnet-4-6': { inputPer1k: 0.010 }
      };
      const total = engine.calculateBatchCost(batch, 'onDemand', overrides);
      expect(total).toBeCloseTo(0.010);
    });
  });

  describe('Provisioned Throughput fallback logic', () => {
    it('should fallback to onDemand tier if provisionedThroughput config is missing for that model', () => {
      // claude-sonnet-4-6 modelinde provisionedThroughput ayarlanmamışsa onDemand kullanılmalı
      const cost = engine.calculateCost(
        { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-sonnet-4-6',
        'provisionedThroughput'
      );
      expect(cost).toBeCloseTo(0.003); // onDemand fiyatı
    });
  });

  describe('getModelDisplayName', () => {
    it('should return displayName for registered models', () => {
      expect(engine.getModelDisplayName('us.anthropic.claude-sonnet-4-6')).toBe('Claude Sonnet 4.6');
    });

    it('should return raw modelId for unregistered models', () => {
      expect(engine.getModelDisplayName('non-existent-id')).toBe('non-existent-id');
    });
  });

  describe('formatCost', () => {
    it('should format USD cost with 4 decimal places', () => {
      const formatted = engine.formatCost(0.12345);
      // Not: İşletim sistemi veya node locale bağımlılığına göre '$0.1235' veya benzer formatta olmalı
      expect(formatted).toContain('0.1235');
    });

    it('should format EUR cost if specified', () => {
      const formatted = engine.formatCost(1.23, 'EUR');
      expect(formatted).toContain('1.23');
    });
  });
});
```
