type OrtakMailParametreleri = {
  kullaniciAdi?: string;
  evetBenimUrl: string;
};

type DogrulamaMailParametreleri = OrtakMailParametreleri & {
  destekSatiri?: string;
};

type SifreSifirlamaMailParametreleri = OrtakMailParametreleri & {
  gecerlilikNotu?: string;
};

const temelSablon = ({
  baslik,
  altBaslik,
  aciklama,
  kullaniciAdi,
  evetBenimUrl,
  evetEtiket,
  altNot,
}: {
  baslik: string;
  altBaslik: string;
  aciklama: string;
  kullaniciAdi?: string;
  evetBenimUrl: string;
  evetEtiket: string;
  altNot: string;
}) => `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ValideSultan</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f3f4f6;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:22px 24px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#ffffff;">
                <div style="font-size:24px;font-weight:800;letter-spacing:0.2px;">ValideSultan</div>
                <div style="margin-top:6px;font-size:13px;opacity:0.95;">${altBaslik}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.35;color:#0f172a;">${baslik}</h1>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#334155;">
                  Merhaba${kullaniciAdi ? ` ${kullaniciAdi}` : ''},
                </p>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.7;color:#334155;">
                  ${aciklama}
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 10px 0;">
                  <tr>
                    <td style="padding-bottom:8px;">
                      <a
                        href="${evetBenimUrl}"
                        target="_blank"
                        rel="noopener"
                        style="display:inline-block;padding:13px 20px;border-radius:12px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0.2px;">
                        ${evetEtiket}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:12px 0 0 0;font-size:12px;line-height:1.65;color:#64748b;">
                  Güvenlik notu: Buton görüntülenmezse aynı bağlantıyı tarayıcıda açıp işlemi tamamlayabilirsiniz.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#f8fafc;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                  ${altNot}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const dogrulamaMailiHtmlOlustur = ({
  kullaniciAdi,
  evetBenimUrl,
  destekSatiri = 'Bu işlem size ait değilse hesabınızın güvenliği için destek ekibine bildirin.',
}: DogrulamaMailParametreleri) =>
  temelSablon({
    baslik: 'ValideSultan Doğrulama',
    altBaslik: 'E-posta Onayı',
    aciklama: 'Hesabınızı doğrulamak için aşağıdaki “Evet, Benim” düğmesine dokunun.',
    kullaniciAdi,
    evetBenimUrl,
    evetEtiket: 'Evet, Benim',
    altNot: destekSatiri,
  });

export const sifreSifirlamaMailiHtmlOlustur = ({
  kullaniciAdi,
  evetBenimUrl,
  gecerlilikNotu = 'Bu bağlantı güvenlik nedeniyle sınırlı süre geçerlidir.',
}: SifreSifirlamaMailParametreleri) =>
  temelSablon({
    baslik: 'Şifre Sıfırlama',
    altBaslik: 'Hesap Erişimi',
    aciklama: 'Bu işlem size aitse aşağıdaki “Evet, Benim” düğmesine dokunarak yeni şifre belirleyin.',
    kullaniciAdi,
    evetBenimUrl,
    evetEtiket: 'Evet, Benim',
    altNot: gecerlilikNotu,
  });
