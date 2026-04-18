# Valide Sultan Mail Notları

Bugün hazırlanan şablon dosyası:
- `utils/email-templates.ts`

## Buton Mantığı

- `Evet Benim`:
  - Doğrulama mailinde: kullanıcıyı doğrulama linkine götürür.
  - Şifre sıfırlama mailinde: kullanıcıyı şifre yenileme linkine götürür.

## Yarın Profesyonel Hesapla Yapılacaklar

1. Mail sağlayıcı bağlanacak (SendGrid/Resend/Mailgun/SES).
2. Domain doğrulama yapılacak (SPF, DKIM, DMARC).
3. Backend endpointleri eklenecek:
   - Doğrulama maili gönder
   - Şifre sıfırlama maili gönder
4. Uygulamadaki Firebase hazır mail akışı yerine bu endpointler kullanılacak.

## Not

Bu repo içinde şu an backend mail gönderim fonksiyonu yok. Bu nedenle bugün sadece tasarım ve içerik şablonları hazırlandı.
