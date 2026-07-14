---
name: debugging-systematic
description: "Hata çözümü, log analizi ve sistematik problem giderme yöntemleri. Agent'ların bug çözerken izlemesi gereken süreç."
risk: safe
category: quality
---

# Sistematik Debugging (Hata Ayıklama)

Kullanıcı "Şu kod çalışmıyor", "Şu hatayı alıyorum" dediğinde veya agent testlerde hata tespit ettiğinde, rastgele deneme-yanılma yapmak (shotgun debugging) yerine bu sistematik yaklaşım uygulanır.

## 1. Hatayı Anla ve İzole Et
- **Hata Mesajını Oku:** Stack trace'i inceleyin. Hatanın başladığı dosyayı ve satırı bulun. 
- **Reprodüksiyon (Yeniden Üretme):** Hatayı tetikleyen girdiler (input) nelerdir? (Eğer bilinmiyorsa kullanıcıya sorun).
- **Kapsamı Daralt:** Hatanın nerede olduğunu bulana kadar parçaları izole edin (Örn: Veritabanından mı dönmüyor, API'den mi gelmiyor, yoksa frontend'de mi render edilmiyor?).

## 2. Hipotez Kur ve Test Et
- "Bunun sebebi X olabilir" diyerek sadece kod okuyarak tahmin yürütün.
- Kodda log (örn: `console.log`, `print`) atarak veya debugger kullanarak değişkenlerin o satırdaki durumunu doğrulayın.

## 3. Çözüm Uygula ve Doğrula
- Asıl (Root) sebebi bulduktan sonra, sadece semptomu (sonucu) değil, asıl nedeni çözecek bir yama yapın.
- "Bant yapıştırmak" (Örn: `if (undefined) return` demek) yerine, o değişkenin neden `undefined` geldiğini bulun ve orayı düzeltin.
- Hatanın çözüldüğünden ve **başka yerleri kırmadığından** emin olmak için ilgili testleri çalıştırın.

## 4. Geleceği Koru
- Bu hatanın bir daha yaşanmaması için, bu spesifik durumu test eden yeni bir birim (unit) veya entegrasyon testi yazın.
