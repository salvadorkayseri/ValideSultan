import { auth, db } from '@/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Alert, Animated, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const dateOku = (metin: string) => {
  const temiz = String(metin || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(temiz)) {
    const [y, a, g] = temiz.split('-');
    const yil = Number(y);
    const ay = Number(a);
    const gun = Number(g);
    if (!Number.isFinite(yil) || !Number.isFinite(ay) || !Number.isFinite(gun)) return null;
    const d = new Date(yil, ay - 1, gun);
    if (d.getFullYear() !== yil || d.getMonth() !== ay - 1 || d.getDate() !== gun) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const sadeceRakam = temiz.replace(/\D/g, '');
  if (sadeceRakam.length !== 8) return null;
  const gun = Number(sadeceRakam.slice(0, 2));
  const ay = Number(sadeceRakam.slice(2, 4));
  const yil = Number(sadeceRakam.slice(4, 8));
  if (!Number.isFinite(yil) || !Number.isFinite(ay) || !Number.isFinite(gun)) return null;
  const d = new Date(yil, ay - 1, gun);
  if (d.getFullYear() !== yil || d.getMonth() !== ay - 1 || d.getDate() !== gun) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const dateYaz = (tarih: Date) => {
  const yil = tarih.getFullYear();
  const ay = String(tarih.getMonth() + 1).padStart(2, '0');
  const gun = String(tarih.getDate()).padStart(2, '0');
  return `${yil}-${ay}-${gun}`;
};

const dateInputYaz = (tarih: Date) => {
  const gun = String(tarih.getDate()).padStart(2, '0');
  const ay = String(tarih.getMonth() + 1).padStart(2, '0');
  const yil = String(tarih.getFullYear());
  return `${gun}/${ay}/${yil}`;
};

const tarihInputMaskele = (ham: string) => {
  const rakam = String(ham || '').replace(/\D/g, '').slice(0, 8);
  if (rakam.length <= 2) return `${rakam}${rakam.length === 2 ? '/' : ''}`;
  if (rakam.length <= 4) return `${rakam.slice(0, 2)}/${rakam.slice(2)}${rakam.length === 4 ? '/' : ''}`;
  return `${rakam.slice(0, 2)}/${rakam.slice(2, 4)}/${rakam.slice(4)}`;
};

const tarihInputMaskeleAkilli = (onceki: string, yeniHam: string) => {
  const yeni = String(yeniHam || '');
  // Kullanıcı sadece slash silmek istediğinde slash'ı geri ekleme.
  if (onceki.endsWith('/') && yeni === onceki.slice(0, -1)) {
    return yeni;
  }
  return tarihInputMaskele(yeni);
};

const gunEkle = (tarih: Date, gun: number) => {
  const d = new Date(tarih);
  d.setDate(d.getDate() + gun);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Türkiye saati (UTC+3) baz alınarak mutlak tetikleme tarihi üretir.
const turkiyeSaatindeTarih = (gunBazliTarih: Date, saat: number, dakika: number) =>
  new Date(Date.UTC(gunBazliTarih.getFullYear(), gunBazliTarih.getMonth(), gunBazliTarih.getDate(), saat - 3, dakika, 0, 0));

const gunFarki = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
const pozitifMod = (n: number, m: number) => ((n % m) + m) % m;
const gunuAyGunMetnineCevir = (gun: number) => {
  const toplam = Math.max(0, Math.abs(Math.round(gun)));
  const ay = Math.floor(toplam / 30);
  const kalanGun = toplam % 30;
  if (ay === 0) return `${kalanGun} gün`;
  if (kalanGun === 0) return `${ay} ay`;
  return `${ay} ay ${kalanGun} gün`;
};

type DogumSonrasiAy = '1' | '2' | '3' | '4' | '5' | '6';
const DOGUM_SONRASI_FAVORI_AY_KEY = 'dogum_sonrasi_favori_ay_v1';
const BABA_DESTEK_PLAN_KEY = 'baba_destek_plani_v1';
const BABA_PARTNER_DONEM_GUN_KEY = 'baba_partner_donem_gunu_v1';
type TakipModu = 'adet' | 'hamilelik' | 'dogumsonrasi' | 'baba';
const erkekMiKontrol = (cinsiyet: any) => {
  const norm = String(cinsiyet || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return norm === 'erkek' || norm.includes('erkek') || norm === 'male' || norm === 'man';
};

const DOGUM_SONRASI_IKONLAR: Record<DogumSonrasiAy, keyof typeof Ionicons.glyphMap> = {
  '1': 'heart-outline',
  '2': 'fitness-outline',
  '3': 'happy-outline',
  '4': 'moon-outline',
  '5': 'walk-outline',
  '6': 'sparkles-outline',
};

const DOGUM_SONRASI_REHBER: {
  ay: DogumSonrasiAy;
  baslik: string;
  beden: string;
  duygu: string;
  bebek: string;
  destek: string;
}[] = [
  {
    ay: '1',
    baslik: '1. Ay',
    beden: 'Yorgunluk, kanama miktarında değişim, memede hassasiyet ve uyku bölünmeleri sık görülebilir. İyileşme hızı kişiden kişiye farklı olabilir.',
    duygu: 'Duygusal dalgalanmalar beklenebilir. Uzun süren yoğun mutsuzluk, kaygı veya umutsuzluk olursa profesyonel destek faydalı olabilir.',
    bebek: 'Yenidoğanda beslenme ve uyku düzeni değişken olabilir; bu dönemde sık temas ve güvenli bakım rutini önemlidir.',
    destek: 'Dinlenme, su tüketimi, düzenli yemek ve yakın çevre desteği bu dönemde toparlanmayı kolaylaştırabilir.',
  },
  {
    ay: '2',
    baslik: '2. Ay',
    beden: 'Ağrıda ve kanamada azalma beklenebilir; yine de beklenmeyen şiddetli ağrı veya yüksek ateş olursa sağlık kontrolü gerekir.',
    duygu: 'Bazı annelerde rutin oluşmaya başlarken bazılarında zorlanma devam edebilir. Bu farklılıklar oldukça yaygındır.',
    bebek: 'Bebeğin uyku ve beslenmesi hâlâ değişken olabilir. Kilo takibi ve rutin kontroller yol göstericidir.',
    destek: 'Kısa yürüyüşler, hafif hareket ve planlı dinlenme enerji seviyesine iyi gelebilir.',
  },
  {
    ay: '3',
    baslik: '3. Ay',
    beden: 'Birçok kişide fiziksel toparlanma belirginleşir; ancak sezaryen veya zor doğum sonrası toparlanma daha uzun sürebilir.',
    duygu: 'Yalnızlık hissi veya tükenmişlik ara ara görülebilir. Destek ağı ile bağda kalmak yararlıdır.',
    bebek: 'Bebekte iletişim sinyalleri artabilir. Her bebeğin gelişim hızı aynı olmayabilir.',
    destek: 'Kendi bakımına zaman ayırmak (kısa mola, duş, nefes egzersizi) günlük stresi azaltabilir.',
  },
  {
    ay: '4',
    baslik: '4. Ay',
    beden: 'Uyku düzensizliği sürerse gün içi kısa dinlenmeler fayda sağlayabilir. Emzirme süreci bazen bu aylarda yeniden şekil değiştirebilir.',
    duygu: 'Duygudurum dalgalanmaları devam ediyorsa bir uzmanla görüşmek güvenli bir adımdır.',
    bebek: 'Bebekte rutin oluşmaya başlasa da büyüme atakları nedeniyle geçici değişimler olabilir.',
    destek: 'Aile içi görev paylaşımı ve planlama, mental yükü azaltmaya yardımcı olabilir.',
  },
  {
    ay: '5',
    baslik: '5. Ay',
    beden: 'Birçok annede güç ve dayanıklılık artar. Pelvik taban ve core egzersizleri için uzman önerisi almak faydalı olabilir.',
    duygu: 'Kendini daha dengede hissetme beklenebilir; yine de düzenli kaygı veya huzursuzluk ihmal edilmemelidir.',
    bebek: 'Bebeğin sosyal tepkileri artabilir. Gelişim farklılıkları doğaldır.',
    destek: 'Rutin kontrolleri sürdürmek ve kendi sağlık belirtilerini takip etmek önemlidir.',
  },
  {
    ay: '6',
    baslik: '6. Ay',
    beden: 'Bu dönemde birçok kişide toparlanma belirgin olur; ancak bazı belirtiler daha uzun sürebilir ve kontrol gerektirebilir.',
    duygu: 'Ruhsal belirtiler düzelmediyse profesyonel yardım istemek güçlü ve doğru bir yaklaşımdır.',
    bebek: 'Ek gıda dönemine geçiş sürecinde doktor önerisiyle ilerlemek en güvenli yaklaşımdır.',
    destek: 'Kişisel iyilik hâli planını sürdürmek (uyku, beslenme, hareket, sosyal destek) uzun vadede fayda sağlar.',
  },
];

const BILIMSEL_KAYNAKLAR = [
  { baslik: 'WHO - Postnatal Care Guideline (2022)', url: 'https://www.who.int/publications/i/item/9789240045989' },
  { baslik: 'ACOG - Postpartum Care Checklist', url: 'https://www.acog.org/womens-health/health-tools/my-postpartum-care-checklist' },
  { baslik: 'CDC - Urgent Maternal Warning Signs', url: 'https://www.cdc.gov/hearher/maternal-warning-signs/index.html' },
  { baslik: 'WHO - Breastfeeding Counselling Guideline', url: 'https://www.who.int/publications-detail-redirect/9789241550468' },
];

const ADET_FAYDALI_BILGILER = {
  rahatlatma: [
    'Alt karına sıcak uygulama (sıcak su torbası/ısıtıcı ped) krampları azaltmaya yardımcı olabilir.',
    'Ağrı kesici kullanımında kişisel sağlık durumuna göre doktor veya eczacı önerisiyle ilerlemek daha güvenlidir.',
    'Hafif yürüyüş ve nazik esneme bazı kişilerde ağrı algısını azaltabilir.',
    'Uyku, su tüketimi ve düzenli öğünler ağrı ve halsizlik hissini hafifletebilir.',
    'Tatlı isteği olursa küçük porsiyon tercih etmek ve kan şekerini dengelemek daha iyi hissettirebilir.',
  ],
  doktoraBasvuru: [
    'Kanama 7 günden uzun sürüyorsa veya birkaç saat art arda her saat ped/tamponu tamamen dolduruyorsa.',
    'Şiddetli ağrı günlük yaşamı belirgin bozuyorsa veya ağrı giderek artıyorsa.',
    'Ara kanama, çok büyük pıhtılar, belirgin baş dönmesi, nefes darlığı veya bayılma hissi varsa.',
    '25 yaşından sonra yeni başlayan çok şiddetli adet ağrısı geliştiyse.',
  ],
};

type SemptomAgri = 'yok' | 'hafif' | 'orta' | 'siddetli';
type SemptomRuhHali = 'iyi' | 'dalgali' | 'gergin' | 'dusuk';
type SemptomKaydi = {
  tarih: string;
  agri: SemptomAgri | null;
  ruhHali: SemptomRuhHali | null;
};

const ADET_CANTA_OGETLERI = [
  { id: 'ped', etiket: 'Ped/Tampon' },
  { id: 'agri', etiket: 'Ağrı kesici' },
  { id: 'su', etiket: 'Su şişesi' },
  { id: 'iccamasir', etiket: 'Yedek iç çamaşırı' },
] as const;

const AGRI_SECENEKLERI: { id: SemptomAgri; etiket: string }[] = [
  { id: 'yok', etiket: 'Yok' },
  { id: 'hafif', etiket: 'Hafif' },
  { id: 'orta', etiket: 'Orta' },
  { id: 'siddetli', etiket: 'Şiddetli' },
];

const RUH_HALI_SECENEKLERI: { id: SemptomRuhHali; etiket: string }[] = [
  { id: 'iyi', etiket: 'İyi' },
  { id: 'dalgali', etiket: 'Dalgalı' },
  { id: 'gergin', etiket: 'Gergin' },
  { id: 'dusuk', etiket: 'Düşük' },
];

const bugunTarihi = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

const htmlKacis = (metin: string) =>
  String(metin || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const tarihUzunYaz = (tarih: Date) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(tarih);

type BabaRehberModu = 'hamilelik' | 'dogumsonrasi' | 'partneradet';
type BabaHamilelikAy = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type BabaDogumSonrasiAy = '1' | '2' | '3' | '4' | '5' | '6';

const BABA_BILDIRIM_SECIM_KEY = 'baba_bildirim_secim_v1';
const BABA_BILDIRIM_IDLERI_KEY = 'baba_bildirim_idleri_v1';
const BABA_BILDIRIM_SAAT_KEY = 'baba_bildirim_saat_v1';
const BABA_BILDIRIM_GUN_KEY = 'baba_bildirim_gun_v1';
const BABA_HAFTA_GUNLERI = [
  { gun: 0, etiket: 'Paz' },
  { gun: 1, etiket: 'Pzt' },
  { gun: 2, etiket: 'Sal' },
  { gun: 3, etiket: 'Çar' },
  { gun: 4, etiket: 'Per' },
  { gun: 5, etiket: 'Cum' },
  { gun: 6, etiket: 'Cmt' },
] as const;

const BABA_HAMILELIK_AYLIK: { ay: BabaHamilelikAy; baslik: string; esDestegi: string; dikkat: string; yapilacaklar: string }[] = [
  {
    ay: '1',
    baslik: '1. Ay',
    esDestegi: 'Hormon değişimleri nedeniyle duygusal hassasiyet artabilir. Daha nazik ve sabırlı iletişim çoğu çiftte rahatlatıcı olabilir.',
    dikkat: 'Bulantı, yorgunluk ve ani duygu değişimleri görülebilir. Şikâyetler kişiden kişiye farklılık gösterebilir.',
    yapilacaklar: 'Gebelik takibini başlatmak, ilk randevu için soru listesi hazırlamak ve günlük su-uyku düzenini desteklemek faydalı olabilir.',
  },
  {
    ay: '2',
    baslik: '2. Ay',
    esDestegi: 'Kokulara hassasiyet ve mide bulantısı devam edebilir. Evde koku/yiyecek düzenini buna göre ayarlamak işe yarayabilir.',
    dikkat: 'Aşırı yorgunluk ve uyku ihtiyacı artabilir. Dinlenme zamanına saygı göstermek önemlidir.',
    yapilacaklar: 'Kontrol günlerini takvime eklemek, acil durumda aranacak kişileri belirlemek yararlı olabilir.',
  },
  {
    ay: '3',
    baslik: '3. Ay',
    esDestegi: 'Bazı kişilerde bulantı azalmaya başlayabilir, bazılarında devam edebilir. Kıyas yapmadan sürece uyum sağlamak önemlidir.',
    dikkat: 'Duygudurum dalgalanmaları bu ayda da görülebilir; yargılayıcı olmayan yaklaşım destekleyici olur.',
    yapilacaklar: 'Birlikte kısa yürüyüş rutini ve uygun beslenme planı oluşturmak iyi gelebilir.',
  },
  {
    ay: '4',
    baslik: '4. Ay',
    esDestegi: 'Genelde ikinci trimesterde enerji artışı olabilir. Birlikte kaliteli zaman planlamak ilişkiyi güçlendirebilir.',
    dikkat: 'Her gebelikte belirtiler aynı değildir; “neden sende böyle” dili yerine destek dili önerilir.',
    yapilacaklar: 'Doğum eğitimi seçeneklerini araştırmak ve temel bebek bakımını öğrenmeye başlamak faydalı olabilir.',
  },
  {
    ay: '5',
    baslik: '5. Ay',
    esDestegi: 'Bebek hareketleri hissedilmeye başlayabilir. Bu deneyimi birlikte takip etmek bağlılığı artırabilir.',
    dikkat: 'Bel-sırt ağrıları artabilir; günlük iş yükünü hafifletmek rahatlatıcı olabilir.',
    yapilacaklar: 'Bebek için temel ihtiyaç listesi çıkarıp gereksiz ürünlerden kaçınmak bütçe açısından iyi olabilir.',
  },
  {
    ay: '6',
    baslik: '6. Ay',
    esDestegi: 'Uyku düzeni zorlanabilir. Gece konforunu artıracak küçük düzenlemeler yapmak destek olabilir.',
    dikkat: 'Bacak/ayak şişlikleri görülebilir; ani ve belirgin artışta sağlık desteği alınmalıdır.',
    yapilacaklar: 'Doğum çantası taslağı hazırlamak ve hastane sürecini birlikte gözden geçirmek faydalı olabilir.',
  },
  {
    ay: '7',
    baslik: '7. Ay',
    esDestegi: 'Üçüncü trimesterde fiziksel rahatsızlık artabilir. Günlük tempoyu birlikte yavaşlatmak iyi gelebilir.',
    dikkat: 'Nefes darlığı, uykusuzluk veya yoğun rahatsızlıkta gecikmeden profesyonel destek alınmalıdır.',
    yapilacaklar: 'Ev içi görevleri sadeleştirmek ve doğuma gidiş planını netleştirmek stresi azaltabilir.',
  },
  {
    ay: '8',
    baslik: '8. Ay',
    esDestegi: 'Kaygı ve heyecan birlikte artabilir. “Birlikte yönetiriz” yaklaşımı güven hissini artırır.',
    dikkat: 'Dinlenme ve sıvı takibi kritik olabilir; belirtiler normalden farklıysa sağlık ekibine danışılmalıdır.',
    yapilacaklar: 'Bebek bezi, ıslak mendil, temel bakım ürünleri ve hastane evrak kontrolünü tamamlamak yararlı olabilir.',
  },
  {
    ay: '9',
    baslik: '9. Ay',
    esDestegi: 'Son günlerde sabır ve sakin iletişim çok kıymetlidir. Eşinin ihtiyaçlarını kısa aralıklarla sormak destek sağlar.',
    dikkat: 'Düzenli olmayan belirtiler ile acil belirtileri ayırt etmek için doktorun verdiği yönlendirmeleri hazır bulundur.',
    yapilacaklar: 'Ulaşım planı, destek kişisi, bebek çıkış kıyafeti ve ilk hafta ev düzeni kontrol listesi tamamlanabilir.',
  },
];

const BABA_DOGUM_SONRASI_AYLIK: { ay: BabaDogumSonrasiAy; baslik: string; esDestegi: string; dikkat: string; yapilacaklar: string }[] = [
  {
    ay: '1',
    baslik: '1. Ay',
    esDestegi: 'İlk haftalarda fiziksel ve duygusal toparlanma zorlayıcı olabilir. Yargısız dinlemek ve ev işini üstlenmek güçlü destek sağlar.',
    dikkat: 'Anne ve bebek için ilk 6 hafta kritik dönemdir; acil uyarı belirtilerinde hızlı hareket edilmelidir.',
    yapilacaklar: 'Gece bakımını paylaşmak, bez/mama-stok kontrolü yapmak ve doktor randevularını takip etmek faydalı olabilir.',
  },
  {
    ay: '2',
    baslik: '2. Ay',
    esDestegi: 'Uyku bölünmeleri devam edebilir. Eşinin kesintisiz dinlenebileceği kısa zaman blokları planlamak işe yarar.',
    dikkat: 'Uzayan çökkünlük, yoğun kaygı veya bağ kurmada zorlanma durumlarında profesyonel destek düşünülmelidir.',
    yapilacaklar: 'Evde görev rotasyonu kurmak, günlük ihtiyaç listesini birlikte güncellemek yararlı olabilir.',
  },
  {
    ay: '3',
    baslik: '3. Ay',
    esDestegi: 'Rutinler oturmaya başlasa da zor günler olabilir. “Yetişemiyorum” hissinde eleştiri yerine birlikte plan önerilir.',
    dikkat: 'Aşırı yorgunluk ve duygusal tükenme belirtileri gözden kaçırılmamalıdır.',
    yapilacaklar: 'Bebek bakımında dönüşümlü görev, kısa yürüyüş ve destek ağıyla temas sürdürmek iyi gelebilir.',
  },
  {
    ay: '4',
    baslik: '4. Ay',
    esDestegi: 'Eşinin kendine zaman ayırabilmesi için haftalık mini mola planı yapmak ilişkide dengeyi artırabilir.',
    dikkat: 'Uyku düzensizliği sürerse aile içi iş bölümü yeniden düzenlenebilir.',
    yapilacaklar: 'Bez, mama/ek gıda hazırlığı ve sağlık kontrol takvimini haftalık olarak gözden geçirmek faydalı olabilir.',
  },
  {
    ay: '5',
    baslik: '5. Ay',
    esDestegi: 'Enerji artışı olabilir ama herkes için aynı değildir. Destek beklentisini açık konuşmak önemlidir.',
    dikkat: 'Süregelen kaygı veya mutsuzluk durumunda yardım istemek geciktirilmemelidir.',
    yapilacaklar: 'Aşı-randevu günlerini planlamak, bebek bakım malzemesi stoklarını düzenli kontrol etmek yararlı olabilir.',
  },
  {
    ay: '6',
    baslik: '6. Ay',
    esDestegi: 'Aile rutini daha düzenli hale gelebilir. İş bölümü sürdürülebilir değilse yeniden paylaşmak gerekir.',
    dikkat: 'Anne sağlığı ve ruhsal iyi oluş hâli, bebek bakım planı kadar öncelikli kalmalıdır.',
    yapilacaklar: 'Uzun vadeli bakım planı, bütçe ve destek ağı planlamasını birlikte güncellemek iyi olabilir.',
  },
];

const BABA_UNUTMA_LISTESI = [
  { id: 'bez', etiket: 'Bez almayı unutma', bildirim: 'Bez stokunu kontrol etmeni hatırlatıyoruz.' },
  { id: 'mama', etiket: 'Mama/ek gıda kontrolü', bildirim: 'Mama veya ek gıda planını kontrol etmeni hatırlatıyoruz.' },
  { id: 'islakmendil', etiket: 'Islak mendil ve bakım ürünü', bildirim: 'Islak mendil ve bakım ürünlerini yenilemeyi unutma.' },
  { id: 'randevu', etiket: 'Doktor randevusu notu', bildirim: 'Yaklaşan doktor kontrolü için notlarını gözden geçir.' },
  { id: 'ilac', etiket: 'İlaç-vitamin takibi', bildirim: 'İlaç veya vitamin takibini kontrol etmeyi unutma.' },
] as const;

const BABA_REHBER_KAYNAKLARI = [
  { baslik: 'CDC - Pregnant/Postpartum Support (HEAR HER)', url: 'https://www.cdc.gov/hearher/caring/index.html' },
  { baslik: 'CDC - Urgent Maternal Warning Signs', url: 'https://www.cdc.gov/hearher/pregnant-postpartum-women/index.html' },
  { baslik: 'NHS - Symptoms of Postnatal Depression', url: 'https://www.nhs.uk/mental-health/conditions/post-natal-depression/symptoms/' },
  { baslik: 'WHO - Postnatal Care Guidelines', url: 'https://www.who.int/publications/i/item/9789240045989' },
];
const PARTNER_DONEM_DESTEK_ONERILERI: Record<
  number,
  { hazirlik: string; iletisim: string; pratik: string }
> = {
  1: {
    hazirlik: 'Sıcak su torbası, su ve kolay sindirilen atıştırmalıkları hazır tut.',
    iletisim: 'Kısa ve nazik sorular sor: “Nasıl hissediyorsun, şimdi ne iyi gelir?”',
    pratik: 'Evde bir işi tamamen üstlen (bulaşık, yemek veya çamaşır).',
  },
  2: {
    hazirlik: 'Ağrı artabiliyorsa dinlenme alanını sessiz ve konforlu hale getir.',
    iletisim: 'Yargılamadan dinle, çözüm dayatmak yerine yanında olduğunu hissettir.',
    pratik: 'Su, bitki çayı ve küçük öğün düzenine destek ol.',
  },
  3: {
    hazirlik: 'Enerji düşüklüğü için pratik destek planı yap (alışveriş, kısa işler).',
    iletisim: '“Bugün tempoyu birlikte düşürelim mi?” gibi destekleyici dil kullan.',
    pratik: 'Rutin iş yükünü azaltarak dinlenme zamanı aç.',
  },
  4: {
    hazirlik: 'Günlük ihtiyaçları önceden hazırlayarak stresi azalt.',
    iletisim: 'Günün nasıl geçtiğini akşam kısa bir check ile sor.',
    pratik: 'Yemek/temizlikte aktif rol alarak toparlanma sürecini kolaylaştır.',
  },
  5: {
    hazirlik: 'Bir sonraki dönem için küçük hazırlık listesi çıkarın.',
    iletisim: 'Nazik geri bildirim iste: “Bu dönemde sana en iyi ne geldi?”',
    pratik: 'Birlikte hafif yürüyüş veya rahatlatıcı kısa aktivite planla.',
  },
  6: {
    hazirlik: 'Konfor ürünleri stok kontrolü yap (ped, atıştırmalık, su vb.).',
    iletisim: 'Normal rutine dönüşte acele ettirmeyen bir dil kullan.',
    pratik: 'Ev içi iş bölümü dengesini yeniden kur.',
  },
  7: {
    hazirlik: 'Bir sonraki dönem öncesi ihtiyaçları birlikte not alın.',
    iletisim: 'Süreci birlikte yönettiğinizi hissettiren sakin iletişimi sürdür.',
    pratik: 'Haftalık planı birlikte sadeleştirerek mental yükü azalt.',
  },
};
const PARTNER_DIL_ONERILERI: Record<number, { kacin: string; yerine: string }> = {
  1: {
    kacin: '“Abartıyorsun.”',
    yerine: '“Zorlandığını görüyorum, şimdi sana nasıl destek olayım?”',
  },
  2: {
    kacin: '“Yine mi aynı şey?”',
    yerine: '“Bugün daha iyi hissetmen için birlikte ne yapabiliriz?”',
  },
  3: {
    kacin: '“Bunda büyütecek ne var?”',
    yerine: '“Seni anlıyorum, istersen biraz dinlenmene yardımcı olayım.”',
  },
  4: {
    kacin: '“Neden bu kadar gerginsin?”',
    yerine: '“Bugün zor bir gün gibi, seni dinlemek isterim.”',
  },
  5: {
    kacin: '“Hadi toparlan artık.”',
    yerine: '“Toparlanman için sana alan açayım, yanında olduğumu bil.”',
  },
  6: {
    kacin: '“Bu kadar hassas olma.”',
    yerine: '“Duyguların önemli, seni ciddiye alıyorum.”',
  },
  7: {
    kacin: '“Bunu kişisel alma.”',
    yerine: '“Sana daha iyi yaklaşmak istiyorum, nasıl daha doğru iletişim kurabilirim?”',
  },
};
const kaynakEtiketi = (url: string) => {
  if (url.includes('who.int')) return 'WHO • Dünya Sağlık Örgütü';
  if (url.includes('acog.org')) return 'ACOG • Klinik rehber';
  if (url.includes('cdc.gov')) return 'CDC • Resmî sağlık kaynağı';
  if (url.includes('nhs.uk')) return 'NHS • Ulusal sağlık rehberi';
  return 'Bilimsel kaynak';
};

export default function TakipEkrani() {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mod, setMod] = useState<TakipModu>('adet');
  const [erkekKullanici, setErkekKullanici] = useState(false);

  const [sonBaslangic, setSonBaslangic] = useState('');
  const [donguSuresi, setDonguSuresi] = useState('');
  const [adetSuresi, setAdetSuresi] = useState('');
  const [notMetni, setNotMetni] = useState('');
  const [adetTakipAktif, setAdetTakipAktif] = useState(false);
  const [bildirimIdleri, setBildirimIdleri] = useState<string[]>([]);
  const [gunlukBildirimIdMap, setGunlukBildirimIdMap] = useState<Record<string, string>>({});
  const [erkenBitisTarihi, setErkenBitisTarihi] = useState('');
  const [cantaSecimleri, setCantaSecimleri] = useState<string[]>([]);
  const [semptomKayitlari, setSemptomKayitlari] = useState<SemptomKaydi[]>([]);
  const [gunlukAgri, setGunlukAgri] = useState<SemptomAgri | null>(null);
  const [gunlukRuhHali, setGunlukRuhHali] = useState<SemptomRuhHali | null>(null);
  const [semptomKaydediliyor, setSemptomKaydediliyor] = useState(false);
  const [adetBitiriliyor, setAdetBitiriliyor] = useState(false);
  const [pdfOlusturuluyor, setPdfOlusturuluyor] = useState(false);

  const [tahminiDogumTarihi, setTahminiDogumTarihi] = useState('');
  const [hamilelikYontemi, setHamilelikYontemi] = useState<'tarih' | 'aygun'>('tarih');
  const [gebelikAyi, setGebelikAyi] = useState('');
  const [gebelikGunu, setGebelikGunu] = useState('');
  const [tarihSeciciAcik, setTarihSeciciAcik] = useState(false);
  const [tarihSeciciHedef, setTarihSeciciHedef] = useState<'sonBaslangic' | 'tahminiDogum'>('sonBaslangic');
  const [tarihSeciciDeger, setTarihSeciciDeger] = useState(new Date());
  const [dogumSonrasiAy, setDogumSonrasiAy] = useState<DogumSonrasiAy>('1');
  const [favoriAy, setFavoriAy] = useState<DogumSonrasiAy | null>(null);
  const [babaRehberModu, setBabaRehberModu] = useState<BabaRehberModu>('hamilelik');
  const [babaHamilelikAy, setBabaHamilelikAy] = useState<BabaHamilelikAy>('1');
  const [babaDogumSonrasiAy, setBabaDogumSonrasiAy] = useState<BabaDogumSonrasiAy>('1');
  const [partnerDonemGunu, setPartnerDonemGunu] = useState<number>(1);
  const [babaBildirimSaati, setBabaBildirimSaati] = useState<number>(17);
  const [babaBildirimGunleri, setBabaBildirimGunleri] = useState<number[]>([1]);
  const [destekPlanDurum, setDestekPlanDurum] = useState<Record<string, boolean>>({});
  const [babaBildirimIdleri, setBabaBildirimIdleri] = useState<string[]>([]);
  const seciliAyAnim = useRef(new Animated.Value(1)).current;
  const takipGirisAnim = useRef(new Animated.Value(0)).current;
  const modIcerikAnim = useRef(new Animated.Value(1)).current;
  const donemKartAnim = useRef(new Animated.Value(0)).current;
  const [donemKartlariRender, setDonemKartlariRender] = useState(false);

  useEffect(() => {
    takipGirisAnim.setValue(0);
    Animated.timing(takipGirisAnim, {
      toValue: 1,
      duration: 460,
      useNativeDriver: true,
    }).start();
  }, [takipGirisAnim]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('adet-hatirlatma', {
        name: 'Adet Hatırlatma',
        importance: Notifications.AndroidImportance.DEFAULT,
      }).catch(() => {});
    }

    const yukle = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setYukleniyor(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'kullanicilar', uid));
        const data = snap.data() || {};
        setErkekKullanici(erkekMiKontrol((data as any)?.cinsiyet));

        const adetTakibi = data.adetTakibi || {};
        const kayitTarih = String(adetTakibi.sonBaslangic || '');
        const parsed = dateOku(kayitTarih);
        setSonBaslangic(parsed ? dateInputYaz(parsed) : '');
        setDonguSuresi(adetTakibi.donguSuresi ? String(adetTakibi.donguSuresi) : '');
        setAdetSuresi(adetTakibi.adetSuresi ? String(adetTakibi.adetSuresi) : '');
        setNotMetni(String(adetTakibi.notMetni || ''));
        const takipBaslatildiMi =
          !!parsed &&
          Number.isFinite(Number(adetTakibi.donguSuresi)) &&
          Number(adetTakibi.donguSuresi) >= 20 &&
          Number(adetTakibi.donguSuresi) <= 45 &&
          Number.isFinite(Number(adetTakibi.adetSuresi)) &&
          Number(adetTakibi.adetSuresi) >= 2 &&
          Number(adetTakibi.adetSuresi) <= 10;
        setAdetTakipAktif(takipBaslatildiMi);
        const ids = Array.isArray(adetTakibi.bildirimIdleri) ? adetTakibi.bildirimIdleri.filter((i: any) => typeof i === 'string') : [];
        setBildirimIdleri(ids);
        const gunlukMapHam = adetTakibi.gunlukBildirimIdMap;
        const gunlukMap: Record<string, string> = {};
        if (gunlukMapHam && typeof gunlukMapHam === 'object' && !Array.isArray(gunlukMapHam)) {
          Object.entries(gunlukMapHam).forEach(([tarih, id]) => {
            if (typeof tarih === 'string' && typeof id === 'string') gunlukMap[tarih] = id;
          });
        }
        setGunlukBildirimIdMap(gunlukMap);
        setErkenBitisTarihi(typeof adetTakibi.erkenBitisTarihi === 'string' ? adetTakibi.erkenBitisTarihi : '');
        const canta = Array.isArray(adetTakibi.cantaSecimleri) ? adetTakibi.cantaSecimleri.filter((i: any) => typeof i === 'string') : [];
        setCantaSecimleri(canta);
        const semptomlerHam = Array.isArray(adetTakibi.semptomKayitlari) ? adetTakibi.semptomKayitlari : [];
        const semptomler: SemptomKaydi[] = semptomlerHam
          .map((item: any) => ({
            tarih: typeof item?.tarih === 'string' ? item.tarih : '',
            agri: item?.agri === 'yok' || item?.agri === 'hafif' || item?.agri === 'orta' || item?.agri === 'siddetli' ? item.agri : null,
            ruhHali:
              item?.ruhHali === 'iyi' || item?.ruhHali === 'dalgali' || item?.ruhHali === 'gergin' || item?.ruhHali === 'dusuk'
                ? item.ruhHali
                : null,
          }))
          .filter((item: SemptomKaydi) => !!dateOku(item.tarih))
          .sort((a: SemptomKaydi, b: SemptomKaydi) => (a.tarih < b.tarih ? 1 : -1))
          .slice(0, 220);
        setSemptomKayitlari(semptomler);

        const hamilelikTakibi = data.hamilelikTakibi || {};
        const yontem = String(hamilelikTakibi.hesaplamaYontemi || 'tarih');
        setHamilelikYontemi(yontem === 'aygun' ? 'aygun' : 'tarih');
        const tdt = String(hamilelikTakibi.tahminiDogumTarihi || '');
        const tdtParsed = dateOku(tdt);
        setTahminiDogumTarihi(tdtParsed ? dateInputYaz(tdtParsed) : '');
        setGebelikAyi(hamilelikTakibi.gebelikAyi ? String(hamilelikTakibi.gebelikAyi) : '');
        setGebelikGunu(hamilelikTakibi.gebelikGunu ? String(hamilelikTakibi.gebelikGunu) : '');
      } finally {
        setYukleniyor(false);
      }
    };

    yukle();
  }, []);

  const izinliModlar = useMemo<TakipModu[]>(
    () => (erkekKullanici ? ['baba'] : ['adet', 'hamilelik', 'dogumsonrasi']),
    [erkekKullanici]
  );
  const takipBaslik = erkekKullanici ? 'Baba Rehberi' : 'Takip';
  const takipAltMetin = erkekKullanici ? 'Babalık sürecini tek ekranda planla.' : 'Kişisel takibini tek ekranda yönet.';
  const takipIkonKutuRenk = erkekKullanici ? '#38bdf8' : '#ec4899';

  useEffect(() => {
    if (!izinliModlar.includes(mod)) {
      setMod(izinliModlar[0]);
    }
  }, [izinliModlar, mod]);

  useEffect(() => {
    let aktif = true;
    AsyncStorage.getItem(DOGUM_SONRASI_FAVORI_AY_KEY)
      .then((kayit) => {
        if (!aktif || !kayit) return;
        if (DOGUM_SONRASI_REHBER.some((item) => item.ay === kayit)) {
          const ay = kayit as DogumSonrasiAy;
          setFavoriAy(ay);
          setDogumSonrasiAy(ay);
        }
      })
      .catch(() => {});

    return () => {
      aktif = false;
    };
  }, []);

  useEffect(() => {
    let aktif = true;
    Promise.all([
      AsyncStorage.getItem(BABA_DESTEK_PLAN_KEY),
      AsyncStorage.getItem(BABA_BILDIRIM_IDLERI_KEY),
      AsyncStorage.getItem(BABA_BILDIRIM_SECIM_KEY),
      AsyncStorage.getItem(BABA_PARTNER_DONEM_GUN_KEY),
      AsyncStorage.getItem(BABA_BILDIRIM_SAAT_KEY),
      AsyncStorage.getItem(BABA_BILDIRIM_GUN_KEY),
    ])
      .then(([kayit, idKayit, secimKayit, partnerDonemGunKaydi, bildirimSaatKaydi, bildirimGunKaydi]) => {
        if (!aktif) return;
        if (kayit) {
          const parsed = JSON.parse(kayit);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const temiz: Record<string, boolean> = {};
            Object.entries(parsed).forEach(([anahtar, deger]) => {
              temiz[anahtar] = !!deger;
            });
            setDestekPlanDurum(temiz);
          }
        } else if (secimKayit) {
          const parsedSecim = JSON.parse(secimKayit);
          if (Array.isArray(parsedSecim)) {
            const secimMap: Record<string, boolean> = {};
            parsedSecim.forEach((id) => {
              if (typeof id === 'string') secimMap[id] = true;
            });
            setDestekPlanDurum(secimMap);
          }
        }
        if (idKayit) {
          const parsedIds = JSON.parse(idKayit);
          if (Array.isArray(parsedIds)) {
            setBabaBildirimIdleri(parsedIds.filter((i) => typeof i === 'string'));
          }
        }
        const gunNum = Number(partnerDonemGunKaydi || '');
        if (Number.isFinite(gunNum) && gunNum >= 1 && gunNum <= 7) {
          setPartnerDonemGunu(gunNum);
        }
        const saatNum = Number(bildirimSaatKaydi || '');
        if (Number.isFinite(saatNum) && saatNum >= 1 && saatNum <= 24) {
          setBabaBildirimSaati(saatNum);
        }
        if (bildirimGunKaydi) {
          try {
            const parsedGunler = JSON.parse(bildirimGunKaydi);
            if (Array.isArray(parsedGunler)) {
              const temiz = parsedGunler
                .map((g) => Number(g))
                .filter((g) => Number.isFinite(g) && g >= 0 && g <= 6);
              if (temiz.length > 0) setBabaBildirimGunleri(Array.from(new Set(temiz)));
            } else {
              const tekGun = Number(parsedGunler);
              if (Number.isFinite(tekGun) && tekGun >= 0 && tekGun <= 6) setBabaBildirimGunleri([tekGun]);
            }
          } catch {
            const tekGun = Number(bildirimGunKaydi || '');
            if (Number.isFinite(tekGun) && tekGun >= 0 && tekGun <= 6) setBabaBildirimGunleri([tekGun]);
          }
        }
      })
      .catch(() => {});

    return () => {
      aktif = false;
    };
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(seciliAyAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(seciliAyAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [dogumSonrasiAy, seciliAyAnim]);

  useEffect(() => {
    modIcerikAnim.setValue(0);
    Animated.timing(modIcerikAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [mod, modIcerikAnim]);

  useEffect(() => {
    const donemKartlariGoster = adetTakipAktif && !erkenBitisTarihi;
    if (donemKartlariGoster) {
      setDonemKartlariRender(true);
      donemKartAnim.setValue(0);
      Animated.timing(donemKartAnim, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!donemKartlariRender) return;
    Animated.timing(donemKartAnim, {
      toValue: 0,
      duration: 620,
      useNativeDriver: true,
    }).start(() => setDonemKartlariRender(false));
  }, [adetTakipAktif, erkenBitisTarihi, donemKartlariRender, donemKartAnim]);

  useEffect(() => {
    const bugun = dateYaz(bugunTarihi());
    const bugunKaydi = semptomKayitlari.find((item) => item.tarih === bugun);
    setGunlukAgri(bugunKaydi?.agri || null);
    setGunlukRuhHali(bugunKaydi?.ruhHali || null);
  }, [semptomKayitlari]);

  const ayGunYontemindenDogumTarihi = useMemo(() => {
    const ay = Number(gebelikAyi);
    const gun = Number(gebelikGunu);
    if (!Number.isFinite(ay) || !Number.isFinite(gun)) return null;
    if (ay < 1 || ay > 10) return null;
    if (gun < 0 || gun > 30) return null;

    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const gecenGunYaklasik = (ay - 1) * 30 + gun;
    if (gecenGunYaklasik < 0 || gecenGunYaklasik > 280) return null;
    const kalanGunYaklasik = 280 - gecenGunYaklasik;
    return gunEkle(bugun, kalanGunYaklasik);
  }, [gebelikAyi, gebelikGunu]);

  const adetHesap = useMemo(() => {
    const baslangic = dateOku(sonBaslangic);
    const dongu = Number(donguSuresi);
    const adet = Number(adetSuresi);
    if (!baslangic || !Number.isFinite(dongu) || !Number.isFinite(adet) || dongu < 20 || dongu > 45 || adet < 2 || adet > 10) {
      return null;
    }

    const sonrakiAdet = gunEkle(baslangic, dongu);
    const yumurtlama = gunEkle(sonrakiAdet, -14);
    const dogurganBaslangic = gunEkle(yumurtlama, -5);
    const dogurganBitis = gunEkle(yumurtlama, 1);
    const planlananAdetBitis = gunEkle(baslangic, adet - 1);
    const erkenBitis = dateOku(erkenBitisTarihi);
    const adetBitis =
      erkenBitis && erkenBitis.getTime() >= baslangic.getTime() && erkenBitis.getTime() <= planlananAdetBitis.getTime()
        ? erkenBitis
        : planlananAdetBitis;
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);

    const kalanGun = gunFarki(sonrakiAdet, bugun);
    let uyari = 'Tahmin takvimine göre döngün düzenli görünüyor.';
    if (kalanGun < 0) uyari = 'Tahmini adet tarihi geçmiş görünüyor, son başlangıç tarihini güncelleyebilirsin.';
    else if (kalanGun === 0) uyari = 'Tahmini adet günün bugün.';
    else if (kalanGun <= 2) uyari = `Adet dönemi yaklaşıyor: ${kalanGun} gün kaldı.`;
    else if (kalanGun <= 5) uyari = `Adet dönemine ${kalanGun} gün kaldı.`;

    const takvimGunleri = Array.from({ length: 35 }, (_, i) => {
      const tarih = gunEkle(bugun, i - 3);
      const delta = gunFarki(tarih, baslangic);
      const cycleDay = pozitifMod(delta, dongu);
      const adetGunu = cycleDay < adet;
      const dogurganGunu = cycleDay >= dongu - 19 && cycleDay <= dongu - 13;
      return {
        etiket: dateYaz(tarih),
        gun: tarih.getDate(),
        bugun: i === 3,
        adetGunu,
        dogurganGunu: !adetGunu && dogurganGunu,
      };
    });

    return {
      adetBitis: dateYaz(adetBitis),
      adetErkenBitis: !!erkenBitis && adetBitis.getTime() === erkenBitis.getTime(),
      sonrakiAdet,
      sonrakiAdetMetin: dateYaz(sonrakiAdet),
      yumurtlama: dateYaz(yumurtlama),
      dogurganBaslangic: dateYaz(dogurganBaslangic),
      dogurganBitis: dateYaz(dogurganBitis),
      uyari,
      takvimGunleri,
    };
  }, [sonBaslangic, donguSuresi, adetSuresi, erkenBitisTarihi]);

  const hamilelikHesap = useMemo(() => {
    const dogum = hamilelikYontemi === 'tarih' ? dateOku(tahminiDogumTarihi) : ayGunYontemindenDogumTarihi;
    if (!dogum) return null;

    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);

    const kalanGun = gunFarki(dogum, bugun);
    const gebelikBaslangic = gunEkle(dogum, -280);
    const gecenGun = gunFarki(bugun, gebelikBaslangic);
    const hafta = Math.max(1, Math.floor(Math.max(0, gecenGun) / 7) + 1);
    const haftaIciGun = Math.max(0, gecenGun % 7);

    const trimester = hafta <= 13 ? '1. trimester' : hafta <= 27 ? '2. trimester' : '3. trimester';

    let haftalikBilgi = 'Bu bilgiler genel bilgilendirme amaçlıdır. Düzenli doktor takibi en güvenilir kaynaktır.';
    if (hafta <= 13) haftalikBilgi = 'İlk aylarda yorgunluk, bulantı gibi belirtiler görülebilir. Kişiden kişiye değişebilir.';
    else if (hafta <= 27) haftalikBilgi = 'Bu haftalarda bebek hareketleri çoğu kişide hissedilmeye başlayabilir. Her gebelikte zamanlama farklı olabilir.';
    else haftalikBilgi = 'Son dönemde dinlenme, sıvı alımı ve rutin kontrollerin düzenli sürmesi önemlidir.';

    const kalanAyGun = gunuAyGunMetnineCevir(kalanGun);
    let kalanMesaji = '';
    if (kalanGun < 0)
      kalanMesaji = `Tahmini tarihe göre ${Math.abs(kalanGun)} gün (${kalanAyGun}) geçmiş görünüyor. Bu normal farklılık gösterebilir, kontrol için doktoruna danışabilirsin.`;
    else if (kalanGun === 0) kalanMesaji = 'Tahmini doğum tarihi bugün görünüyor.';
    else kalanMesaji = `Tahmini doğuma yaklaşık ${kalanGun} gün (${kalanAyGun}) kaldı.`;

    return {
      kalanGun,
      kalanMesaji,
      gebelikHaftasi: `${hafta} hafta ${haftaIciGun} gün`,
      trimester,
      haftalikBilgi,
      hesapYontemiNotu:
        hamilelikYontemi === 'aygun'
          ? 'Ay/gün ile yapılan hesap yaklaşık sonuç üretir. Mümkünse doktorun verdiği tahmini doğum tarihini kullan.'
          : 'Tahmini doğum tarihine göre hesaplandı.',
      acilUyari: 'Şiddetli veya seni endişelendiren bir durum olursa (ör. kanama, su gelmesi, güçlü ağrı, ateş, hareketlerde belirgin azalma) gecikmeden sağlık desteği al.',
    };
  }, [hamilelikYontemi, tahminiDogumTarihi, ayGunYontemindenDogumTarihi]);

  const haftalikOzet = useMemo(() => {
    const dogumSonrasiOdak: Record<DogumSonrasiAy, string> = {
      '1': 'Dinlenme, beslenme ve destek isteme öncelikli olabilir.',
      '2': 'Rutin oluşturma ve kısa yürüyüşler iyi gelebilir.',
      '3': 'Kendi bakımına küçük ama düzenli zaman ayırmaya odaklan.',
      '4': 'Uyku ve görev paylaşımı planı bu hafta fark yaratabilir.',
      '5': 'Enerji artışıyla hafif egzersiz rutini güçlenebilir.',
      '6': 'Uzun vadeli iyilik hali planını sürdürülebilir kıl.',
    };

    const adetOzet = adetHesap
      ? {
          sonraki: adetHesap.sonrakiAdetMetin,
          durum: adetHesap.uyari,
          haftaIcinde: gunFarki(adetHesap.sonrakiAdet, new Date()) <= 7,
        }
      : null;

    const hamilelikOzet = hamilelikHesap
      ? {
          hafta: hamilelikHesap.gebelikHaftasi,
          trimester: hamilelikHesap.trimester,
          kalan: hamilelikHesap.kalanMesaji,
        }
      : null;

    const babaAyEtiketi =
      babaRehberModu === 'hamilelik' ? `${babaHamilelikAy}. ay` : babaRehberModu === 'dogumsonrasi' ? `${babaDogumSonrasiAy}. ay` : '';
    const tamamlananGorev = BABA_UNUTMA_LISTESI.filter((item) => destekPlanDurum[item.id]).length;

    return {
      adet: adetOzet,
      hamilelik: hamilelikOzet,
      dogumSonrasiAy: dogumSonrasiAy,
      dogumSonrasiOdak: dogumSonrasiOdak[dogumSonrasiAy],
      baba: {
        donem:
          babaRehberModu === 'hamilelik'
            ? `Hamilelik Süreci (${babaAyEtiketi})`
            : babaRehberModu === 'dogumsonrasi'
              ? `Doğum Sonrası (${babaAyEtiketi})`
              : `Partner Adet Dönemi (${partnerDonemGunu}. gün)`,
        tamamlananGorev,
        toplamGorev: BABA_UNUTMA_LISTESI.length,
      },
    };
  }, [adetHesap, hamilelikHesap, dogumSonrasiAy, babaRehberModu, babaHamilelikAy, babaDogumSonrasiAy, destekPlanDurum, partnerDonemGunu]);

  const sonAltiAySemptomOzeti = useMemo(() => {
    const bugun = bugunTarihi();
    const altiAyOnce = gunEkle(bugun, -180);
    const liste = semptomKayitlari.filter((item) => {
      const tarih = dateOku(item.tarih);
      return !!tarih && tarih.getTime() >= altiAyOnce.getTime();
    });
    const agriGunleri = liste.filter((item) => item.agri && item.agri !== 'yok').length;
    const siddetliAgriGunleri = liste.filter((item) => item.agri === 'siddetli').length;
    const ruhDalgaGunleri = liste.filter((item) => item.ruhHali && item.ruhHali !== 'iyi').length;
    const ruhSayim: Record<SemptomRuhHali, number> = { iyi: 0, dalgali: 0, gergin: 0, dusuk: 0 };
    liste.forEach((item) => {
      if (item.ruhHali) ruhSayim[item.ruhHali] += 1;
    });
    return {
      kayitSayisi: liste.length,
      agriGunleri,
      siddetliAgriGunleri,
      ruhDalgaGunleri,
      ruhSayim,
      liste,
      aralikBaslangic: altiAyOnce,
      aralikBitis: bugun,
    };
  }, [semptomKayitlari]);

  const seciliDogumSonrasiBilgi = useMemo(
    () => DOGUM_SONRASI_REHBER.find((item) => item.ay === dogumSonrasiAy) || DOGUM_SONRASI_REHBER[0],
    [dogumSonrasiAy]
  );
  const seciliBabaHamilelikBilgi = useMemo(
    () => BABA_HAMILELIK_AYLIK.find((item) => item.ay === babaHamilelikAy) || BABA_HAMILELIK_AYLIK[0],
    [babaHamilelikAy]
  );
  const seciliBabaDogumSonrasiBilgi = useMemo(
    () => BABA_DOGUM_SONRASI_AYLIK.find((item) => item.ay === babaDogumSonrasiAy) || BABA_DOGUM_SONRASI_AYLIK[0],
    [babaDogumSonrasiAy]
  );
  const partnerDonemDestegi = useMemo(() => PARTNER_DONEM_DESTEK_ONERILERI[partnerDonemGunu] || PARTNER_DONEM_DESTEK_ONERILERI[1], [partnerDonemGunu]);
  const partnerDilOnerisi = useMemo(() => PARTNER_DIL_ONERILERI[partnerDonemGunu] || PARTNER_DIL_ONERILERI[1], [partnerDonemGunu]);

  const favoriAyiDegistir = async () => {
    const yeniFavori = favoriAy === dogumSonrasiAy ? null : dogumSonrasiAy;
    setFavoriAy(yeniFavori);
    try {
      if (yeniFavori) await AsyncStorage.setItem(DOGUM_SONRASI_FAVORI_AY_KEY, yeniFavori);
      else await AsyncStorage.removeItem(DOGUM_SONRASI_FAVORI_AY_KEY);
    } catch {}
  };

  const destekGoreviDegistir = async (id: string) => {
    const yeni = { ...destekPlanDurum, [id]: !destekPlanDurum[id] };
    setDestekPlanDurum(yeni);
    try {
      await AsyncStorage.setItem(BABA_DESTEK_PLAN_KEY, JSON.stringify(yeni));
    } catch {}
  };

  const partnerDonemGunuDegistir = async (gun: number) => {
    const hedef = Math.max(1, Math.min(7, Math.round(gun)));
    setPartnerDonemGunu(hedef);
    try {
      await AsyncStorage.setItem(BABA_PARTNER_DONEM_GUN_KEY, String(hedef));
    } catch {}
  };

  const babaBildirimSaatiniDegistir = async (saat: number) => {
    const hedef = Math.max(1, Math.min(24, Math.round(saat)));
    setBabaBildirimSaati(hedef);
    try {
      await AsyncStorage.setItem(BABA_BILDIRIM_SAAT_KEY, String(hedef));
    } catch {}
  };

  const babaBildirimGununuDegistir = async (gun: number) => {
    const hedef = Math.max(0, Math.min(6, Math.round(gun)));
    const yeniGunler = babaBildirimGunleri.includes(hedef)
      ? babaBildirimGunleri.filter((g) => g !== hedef)
      : [...babaBildirimGunleri, hedef].sort((a, b) => a - b);
    setBabaBildirimGunleri(yeniGunler);
    try {
      await AsyncStorage.setItem(BABA_BILDIRIM_GUN_KEY, JSON.stringify(yeniGunler));
    } catch {}
  };

  const sonrakiHaftaGunuTarihSaat = (hedefGun: number, saat24: number) => {
    const simdi = new Date();
    const bazSaat = saat24 === 24 ? 0 : saat24;
    const hedef = new Date(simdi);
    hedef.setHours(bazSaat, 0, 0, 0);
    const bugun = simdi.getDay();
    let fark = (hedefGun - bugun + 7) % 7;
    if (fark === 0 && hedef.getTime() <= simdi.getTime()) fark = 7;
    hedef.setDate(hedef.getDate() + fark);
    return hedef;
  };

  const babaHatirlatmalariKur = async () => {
    const secilenler = BABA_UNUTMA_LISTESI.filter((item) => destekPlanDurum[item.id]);
    if (secilenler.length === 0) {
      Alert.alert('Bilgi', 'Önce en az bir unutma maddesi seçmelisin.');
      return;
    }
    if (babaBildirimGunleri.length === 0) {
      Alert.alert('Bilgi', 'En az bir gün seçmelisin (Paz-Cmt).');
      return;
    }

    try {
      const izin = await Notifications.requestPermissionsAsync();
      const bildirimIzniVar = izin.granted || izin.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      if (!bildirimIzniVar) {
        Alert.alert('Uyarı', 'Bildirim izni kapalı görünüyor. Ayarlardan izin verdiğinde tekrar deneyebilirsin.');
        return;
      }

      if (babaBildirimIdleri.length > 0) {
        await Promise.all(babaBildirimIdleri.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      }

      const yeniIdler: string[] = [];
      for (const gun of babaBildirimGunleri) {
        const tetik = sonrakiHaftaGunuTarihSaat(gun, babaBildirimSaati);
        for (const secim of secilenler) {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Baba Rehberi Hatırlatma',
              body: secim.bildirim,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: tetik,
            },
          });
          yeniIdler.push(id);
        }
      }

      setBabaBildirimIdleri(yeniIdler);
      await AsyncStorage.setItem(BABA_BILDIRIM_IDLERI_KEY, JSON.stringify(yeniIdler));
      await AsyncStorage.setItem(BABA_BILDIRIM_SECIM_KEY, JSON.stringify(secilenler.map((s) => s.id)));
      await AsyncStorage.setItem(BABA_BILDIRIM_GUN_KEY, JSON.stringify(babaBildirimGunleri));
      const gunEtiketleri = BABA_HAFTA_GUNLERI.filter((item) => babaBildirimGunleri.includes(item.gun))
        .map((item) => item.etiket)
        .join(', ');
      Alert.alert('Başarılı', `${gunEtiketleri} günleri ${String(babaBildirimSaati).padStart(2, '0')}:00 için tek seferlik hatırlatma kuruldu.`);
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'Hatırlatma kurulurken bir sorun oluştu.');
    }
  };

  const cantaSeciminiDegistir = (id: string) => {
    setCantaSecimleri((onceki) => (onceki.includes(id) ? onceki.filter((item) => item !== id) : [...onceki, id]));
  };

  const akilliHatirlatmaMetniUret = (sonrakiAdetMetni: string) => {
    const secilenEtiketler = ADET_CANTA_OGETLERI.filter((item) => cantaSecimleri.includes(item.id)).map((item) => item.etiket.toLowerCase());
    const cantaCumlesi =
      secilenEtiketler.length > 0 ? ` Çantanı hazırlamak için: ${secilenEtiketler.join(', ')}.` : ' Hazırlık için küçük bir çanta planı yapmak iyi gelebilir.';
    return {
      birGunOnce: `Yarın dönem bekleniyor (${sonrakiAdetMetni}).${cantaCumlesi}`,
      gununde: `Bugün dönem başlayabilir.${cantaCumlesi}`,
      semptom: 'Bugün neler yaşadın? Ağrı ve ruh halini işaretlemeyi unutma.',
    };
  };

  const semptomKaydet = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Uyarı', 'Kayıt için giriş yapmalısın.');
      return;
    }
    if (!gunlukAgri && !gunlukRuhHali) {
      Alert.alert('Bilgi', 'En az bir seçim yapmalısın (ağrı veya ruh hali).');
      return;
    }

    try {
      setSemptomKaydediliyor(true);
      const bugun = dateYaz(bugunTarihi());
      const yeniKayit: SemptomKaydi = {
        tarih: bugun,
        agri: gunlukAgri,
        ruhHali: gunlukRuhHali,
      };
      const guncel = [yeniKayit, ...semptomKayitlari.filter((item) => item.tarih !== bugun)]
        .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
        .slice(0, 220);
      const bugunBildirimId = gunlukBildirimIdMap[bugun];
      const guncelGunlukMap = { ...gunlukBildirimIdMap };
      if (bugunBildirimId) {
        await Notifications.cancelScheduledNotificationAsync(bugunBildirimId).catch(() => {});
        delete guncelGunlukMap[bugun];
      }
      const guncelBildirimIdleri = bugunBildirimId ? bildirimIdleri.filter((id) => id !== bugunBildirimId) : bildirimIdleri;

      await updateDoc(doc(db, 'kullanicilar', uid), {
        adetTakibi: {
          sonBaslangic: sonBaslangic.trim(),
          donguSuresi: Number(donguSuresi) || null,
          adetSuresi: Number(adetSuresi) || null,
          notMetni: notMetni.trim(),
          bildirimIdleri: guncelBildirimIdleri,
          gunlukBildirimIdMap: guncelGunlukMap,
          erkenBitisTarihi,
          cantaSecimleri,
          semptomKayitlari: guncel,
          updatedAt: new Date(),
        },
      });
      setBildirimIdleri(guncelBildirimIdleri);
      setGunlukBildirimIdMap(guncelGunlukMap);
      setSemptomKayitlari(guncel);
      Alert.alert('Kaydedildi', 'Bugünkü semptom kaydın güncellendi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'Semptom kaydı sırasında bir sorun oluştu.');
    } finally {
      setSemptomKaydediliyor(false);
    }
  };

  const adetBittiIsaretle = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    Alert.alert('Adetim Bitti', 'Kalan dönem hatırlatmaları durdurulsun mu?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Evet, Durdur',
        style: 'destructive',
        onPress: async () => {
          try {
            setAdetBitiriliyor(true);
            const bugun = dateYaz(bugunTarihi());
            const kalanBildirimler = Object.entries(gunlukBildirimIdMap).filter(([tarih]) => tarih >= bugun);
            if (kalanBildirimler.length > 0) {
              await Promise.all(kalanBildirimler.map(([, id]) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
            }
            const kalanMap: Record<string, string> = {};
            Object.entries(gunlukBildirimIdMap).forEach(([tarih, id]) => {
              if (tarih < bugun) kalanMap[tarih] = id;
            });
            const kalanIdler = bildirimIdleri.filter((id) => !kalanBildirimler.some(([, kalanId]) => kalanId === id));

            await updateDoc(doc(db, 'kullanicilar', uid), {
              adetTakibi: {
                sonBaslangic: sonBaslangic.trim(),
                donguSuresi: Number(donguSuresi) || null,
                adetSuresi: Number(adetSuresi) || null,
                notMetni: notMetni.trim(),
                bildirimIdleri: kalanIdler,
                gunlukBildirimIdMap: kalanMap,
                erkenBitisTarihi: bugun,
                cantaSecimleri,
                semptomKayitlari,
                updatedAt: new Date(),
              },
            });
            setBildirimIdleri(kalanIdler);
            setGunlukBildirimIdMap(kalanMap);
            setErkenBitisTarihi(bugun);
            Alert.alert('Tamam', 'Adet dönemi erken bitiş olarak kaydedildi. Kalan günlük hatırlatmalar durduruldu.');
          } catch (hata: any) {
            Alert.alert('Hata', hata?.message || 'Adet bitişi kaydedilemedi.');
          } finally {
            setAdetBitiriliyor(false);
          }
        },
      },
    ]);
  };

  const doktorOzetiPdfOlustur = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Uyarı', 'Rapor için giriş yapmalısın.');
      return;
    }
    try {
      setPdfOlusturuluyor(true);
      const bugun = bugunTarihi();
      const baslangic = sonAltiAySemptomOzeti.aralikBaslangic;
      const dongu = Number(donguSuresi);
      const donguMetni = Number.isFinite(dongu) ? `${dongu} gün` : 'Veri yok';
      const adet = Number(adetSuresi);
      const adetMetni = Number.isFinite(adet) ? `${adet} gün` : 'Veri yok';
      const semptomYeterli = sonAltiAySemptomOzeti.kayitSayisi >= 5;
      let duzensizlikNotu = 'Belirgin düzensizlik sinyali görünmüyor.';
      if (adetHesap?.uyari.includes('geçmiş')) duzensizlikNotu = 'Tahmini adet tarihi geçmiş görünüyor; son başlangıç tarihi güncellenmeli.';
      if (!semptomYeterli) duzensizlikNotu = `${duzensizlikNotu} Semptom kaydı az olduğu için yorum sınırlı olabilir.`;

      const semptomSatirlari = sonAltiAySemptomOzeti.liste
        .slice(0, 20)
        .map((item) => {
          const agri = item.agri ? AGRI_SECENEKLERI.find((opt) => opt.id === item.agri)?.etiket || '-' : '-';
          const ruh = item.ruhHali ? RUH_HALI_SECENEKLERI.find((opt) => opt.id === item.ruhHali)?.etiket || '-' : '-';
          return `<tr><td>${htmlKacis(item.tarih)}</td><td>${htmlKacis(agri)}</td><td>${htmlKacis(ruh)}</td></tr>`;
        })
        .join('');

      const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; padding: 22px; }
    .marka { color: #be185d; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
    h1 { color: #9d174d; margin: 0 0 10px 0; }
    h2 { color: #1e3a8a; margin: 18px 0 8px 0; font-size: 16px; }
    .kart { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 10px; background: #fff; }
    .aciklama { color: #334155; font-size: 12px; margin-bottom: 12px; }
    .etiket { color: #475569; font-size: 13px; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #e2e8f0; font-size: 12px; padding: 6px; text-align: left; }
    th { background: #f8fafc; }
    .dipnot { color: #64748b; font-size: 11px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="marka">ValideSultan</div>
  <h1>ValideSultan Doktor Özeti</h1>
  <div class="aciklama">Rapor tarihi: ${htmlKacis(tarihUzunYaz(bugun))} • Kapsam: ${htmlKacis(
        tarihUzunYaz(baslangic)
      )} - ${htmlKacis(tarihUzunYaz(bugun))}</div>

  <div class="kart">
    <h2>Döngü Özeti</h2>
    <div class="etiket">Son adet başlangıcı: ${htmlKacis(sonBaslangic || 'Veri yok')}</div>
    <div class="etiket">Döngü süresi: ${htmlKacis(donguMetni)}</div>
    <div class="etiket">Adet süresi: ${htmlKacis(adetMetni)}</div>
    <div class="etiket">Tahmini sonraki adet: ${htmlKacis(adetHesap?.sonrakiAdetMetin || 'Hesaplanamadı')}</div>
  </div>

  <div class="kart">
    <h2>Semptom Özeti (Son 6 Ay)</h2>
    <div class="etiket">Toplam günlük kayıt: ${sonAltiAySemptomOzeti.kayitSayisi}</div>
    <div class="etiket">Ağrı bildirilen gün: ${sonAltiAySemptomOzeti.agriGunleri}</div>
    <div class="etiket">Şiddetli ağrı günü: ${sonAltiAySemptomOzeti.siddetliAgriGunleri}</div>
    <div class="etiket">Ruh hali dalgalanması/gerginlik/düşük gün: ${sonAltiAySemptomOzeti.ruhDalgaGunleri}</div>
    <div class="etiket">Ruh hali dağılımı: İyi ${sonAltiAySemptomOzeti.ruhSayim.iyi}, Dalgalı ${sonAltiAySemptomOzeti.ruhSayim.dalgali}, Gergin ${sonAltiAySemptomOzeti.ruhSayim.gergin}, Düşük ${sonAltiAySemptomOzeti.ruhSayim.dusuk}</div>
  </div>

  <div class="kart">
    <h2>Düzensizlik Sinyali</h2>
    <div class="etiket">${htmlKacis(duzensizlikNotu)}</div>
  </div>

  <div class="kart">
    <h2>Yakın Dönem Semptom Kayıtları</h2>
    <table>
      <thead><tr><th>Tarih</th><th>Ağrı</th><th>Ruh hali</th></tr></thead>
      <tbody>${semptomSatirlari || '<tr><td colspan="3">Kayıt yok</td></tr>'}</tbody>
    </table>
  </div>

  <div class="dipnot">ValideSultan tarafından oluşturulmuştur. Bu rapor tıbbi tanı değildir, yalnızca kişisel takip ve doktor görüşmesini desteklemek amacıyla hazırlanmıştır.</div>
</body>
</html>`;

      const sonuc = await Print.printToFileAsync({ html });
      const paylasimVar = await Sharing.isAvailableAsync();
      if (!paylasimVar) {
        Alert.alert('Bilgi', `PDF oluşturuldu: ${sonuc.uri}`);
        return;
      }
      await Sharing.shareAsync(sonuc.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'ValideSultan Doktor Özeti',
        UTI: 'com.adobe.pdf',
      });
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'PDF oluşturma sırasında bir sorun oluştu.');
    } finally {
      setPdfOlusturuluyor(false);
    }
  };

  const tarihSeciciAc = (hedef: 'sonBaslangic' | 'tahminiDogum') => {
    const mevcutTarih = hedef === 'sonBaslangic' ? dateOku(sonBaslangic) : dateOku(tahminiDogumTarihi);
    const baslangic = mevcutTarih || new Date();
    baslangic.setHours(0, 0, 0, 0);
    setTarihSeciciHedef(hedef);
    setTarihSeciciDeger(baslangic);
    setTarihSeciciAcik(true);
  };

  const tarihSeciciDegisti = (event: DateTimePickerEvent, secilen?: Date) => {
    if (event.type === 'dismissed') {
      setTarihSeciciAcik(false);
      return;
    }
    if (!secilen) return;
    const temiz = new Date(secilen);
    temiz.setHours(0, 0, 0, 0);
    setTarihSeciciDeger(temiz);
    if (tarihSeciciHedef === 'sonBaslangic') {
      setSonBaslangic(dateInputYaz(temiz));
    } else {
      setTahminiDogumTarihi(dateInputYaz(temiz));
    }
    if (Platform.OS !== 'ios') {
      setTarihSeciciAcik(false);
    }
  };

  const adetKaydet = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Uyarı', 'Kayıt için giriş yapmalısın.');
      return;
    }
    if (!dateOku(sonBaslangic)) {
      Alert.alert('Hata', 'Son adet başlangıcını GG/AA/YYYY formatında gir.');
      return;
    }

    const dongu = Number(donguSuresi);
    const adet = Number(adetSuresi);
    if (!Number.isFinite(dongu) || dongu < 20 || dongu > 45) {
      Alert.alert('Hata', 'Döngü süresi 20-45 gün aralığında olmalı.');
      return;
    }
    if (!Number.isFinite(adet) || adet < 2 || adet > 10) {
      Alert.alert('Hata', 'Adet süresi 2-10 gün aralığında olmalı.');
      return;
    }

    try {
      setKaydediliyor(true);

      const izin = await Notifications.requestPermissionsAsync();
      const bildirimIzniVar = izin.granted || izin.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      if (bildirimIzniVar && bildirimIdleri.length > 0) {
        await Promise.all(bildirimIdleri.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      }
      const eskiGunlukIdler = Object.values(gunlukBildirimIdMap);
      if (bildirimIzniVar && eskiGunlukIdler.length > 0) {
        await Promise.all(eskiGunlukIdler.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      }

      const yeniBildirimIdleri: string[] = [];
      const yeniGunlukBildirimIdMap: Record<string, string> = {};
      if (bildirimIzniVar) {
        const baslangic = dateOku(sonBaslangic)!;
        const sonrakiAdet = gunEkle(baslangic, dongu);
        const oncekiGun = gunEkle(sonrakiAdet, -1);
        const adetBitis = gunEkle(baslangic, adet - 1);
        const mesajlar = akilliHatirlatmaMetniUret(dateYaz(sonrakiAdet));

        const planlar = [{ tarih: oncekiGun, mesaj: mesajlar.birGunOnce }];

        for (const plan of planlar) {
          const tetik = turkiyeSaatindeTarih(plan.tarih, 20, 0);
          if (tetik.getTime() <= Date.now()) continue;

          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Adet Takibi Hatırlatma',
              body: plan.mesaj,
              sound: true,
            },
            trigger:
              Platform.OS === 'android'
                ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tetik, channelId: 'adet-hatirlatma' }
                : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tetik },
          });
          yeniBildirimIdleri.push(id);
        }

        for (let i = 0; i < adet; i += 1) {
          const gunTarihi = gunEkle(baslangic, i);
          if (gunTarihi.getTime() > adetBitis.getTime()) break;
          const gunAnahtari = dateYaz(gunTarihi);
          const gunKaydiVar = semptomKayitlari.some((kayit) => kayit.tarih === gunAnahtari);
          if (gunKaydiVar) continue;
          const tetik = turkiyeSaatindeTarih(gunTarihi, 20, 0);
          if (tetik.getTime() <= Date.now()) continue;

          const gunlukId = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Adet Günlük Takibi',
              body: mesajlar.semptom,
              sound: true,
            },
            trigger:
              Platform.OS === 'android'
                ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tetik, channelId: 'adet-hatirlatma' }
                : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tetik },
          });
          yeniGunlukBildirimIdMap[gunAnahtari] = gunlukId;
          yeniBildirimIdleri.push(gunlukId);
        }
      }

      await updateDoc(doc(db, 'kullanicilar', uid), {
        adetTakibi: {
          sonBaslangic: sonBaslangic.trim(),
          donguSuresi: dongu,
          adetSuresi: adet,
          notMetni: notMetni.trim(),
          bildirimIdleri: yeniBildirimIdleri,
          gunlukBildirimIdMap: yeniGunlukBildirimIdMap,
          erkenBitisTarihi: '',
          cantaSecimleri,
          semptomKayitlari,
          updatedAt: new Date(),
        },
      });

      setBildirimIdleri(yeniBildirimIdleri);
      setGunlukBildirimIdMap(yeniGunlukBildirimIdMap);
      setErkenBitisTarihi('');
      setAdetTakipAktif(true);
      Alert.alert('Başarılı', bildirimIzniVar ? 'Adet takibi kaydedildi ve hatırlatma kuruldu.' : 'Adet takibi kaydedildi. Bildirim izni kapalı olduğu için hatırlatma kurulamadı.');
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'Kaydetme sırasında hata oluştu.');
    } finally {
      setKaydediliyor(false);
    }
  };

  const hamilelikKaydet = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Uyarı', 'Kayıt için giriş yapmalısın.');
      return;
    }

    const tdt = hamilelikYontemi === 'tarih' ? dateOku(tahminiDogumTarihi) : ayGunYontemindenDogumTarihi;
    if (!tdt) {
      Alert.alert('Hata', hamilelikYontemi === 'tarih' ? 'Tahmini doğum tarihini GG/AA/YYYY formatında gir.' : 'Gebelik ay/gün alanlarını doğru gir.');
      return;
    }

    const ay = Number(gebelikAyi);
    const gun = Number(gebelikGunu);
    if (hamilelikYontemi === 'aygun') {
      if (!Number.isFinite(ay) || ay < 1 || ay > 10) {
        Alert.alert('Hata', 'Gebelik ayı 1-10 aralığında olmalı.');
        return;
      }
      if (!Number.isFinite(gun) || gun < 0 || gun > 30) {
        Alert.alert('Hata', 'Gebelik günü 0-30 aralığında olmalı.');
        return;
      }
    }

    try {
      setKaydediliyor(true);
      await updateDoc(doc(db, 'kullanicilar', uid), {
        hamilelikTakibi: {
          hesaplamaYontemi: hamilelikYontemi,
          tahminiDogumTarihi: dateInputYaz(tdt),
          gebelikAyi: hamilelikYontemi === 'aygun' ? ay : null,
          gebelikGunu: hamilelikYontemi === 'aygun' ? gun : null,
          updatedAt: new Date(),
        },
      });
      Alert.alert('Başarılı', 'Hamilelik takibi bilgilerin kaydedildi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'Kaydetme sırasında hata oluştu.');
    } finally {
      setKaydediliyor(false);
    }
  };

  if (!auth.currentUser?.uid) {
    return (
      <View style={styles.container}>
        <View pointerEvents="none" style={styles.arkaPlanKatman}>
          <View style={styles.arkaBalonBir} />
          <View style={styles.arkaBalonIki} />
        </View>
        <View style={styles.icerik}>
          <View style={styles.heroKart}>
            <View style={styles.heroBaslikSatiri}>
              <View style={[styles.heroIkonKutu, { backgroundColor: takipIkonKutuRenk }]}>
                <Ionicons name="analytics-outline" size={18} color="#fff" />
              </View>
              <View>
                <Text style={styles.baslik}>{takipBaslik}</Text>
                <Text style={styles.alt}>Bu bölümü kullanmak için giriş yapmalısın.</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.icerik}>
      <View pointerEvents="none" style={styles.arkaPlanKatman}>
        <View style={styles.arkaBalonBir} />
        <View style={styles.arkaBalonIki} />
      </View>

      <Animated.View
        style={[
          styles.heroKart,
          {
            opacity: takipGirisAnim,
            transform: [{ translateY: takipGirisAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}>
        <View style={styles.heroBaslikSatiri}>
          <View style={[styles.heroIkonKutu, { backgroundColor: takipIkonKutuRenk }]}>
            <Ionicons name="analytics-outline" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.baslik}>{takipBaslik}</Text>
            <Text style={styles.alt}>{takipAltMetin}</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.modSatiri,
          {
            opacity: takipGirisAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
            transform: [{ translateY: takipGirisAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}>
        {izinliModlar.includes('hamilelik') ? (
          <TouchableOpacity style={[styles.modButon, mod === 'hamilelik' && styles.modButonAktif]} onPress={() => setMod('hamilelik')}>
            <Ionicons name="body-outline" size={15} color={mod === 'hamilelik' ? '#fff' : '#374151'} />
            <Text style={[styles.modYazi, mod === 'hamilelik' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Doğuma Kalan
            </Text>
          </TouchableOpacity>
        ) : null}
        {izinliModlar.includes('dogumsonrasi') ? (
          <TouchableOpacity style={[styles.modButon, mod === 'dogumsonrasi' && styles.modButonAktif]} onPress={() => setMod('dogumsonrasi')}>
            <Ionicons name="sparkles-outline" size={15} color={mod === 'dogumsonrasi' ? '#fff' : '#374151'} />
            <Text style={[styles.modYazi, mod === 'dogumsonrasi' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Doğum Sonrası
            </Text>
          </TouchableOpacity>
        ) : null}
        {izinliModlar.includes('adet') ? (
          <TouchableOpacity style={[styles.modButon, mod === 'adet' && styles.modButonAktif]} onPress={() => setMod('adet')}>
            <Ionicons name="calendar-outline" size={15} color={mod === 'adet' ? '#fff' : '#374151'} />
            <Text style={[styles.modYazi, mod === 'adet' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Adet Takibi
            </Text>
          </TouchableOpacity>
        ) : null}
        {izinliModlar.includes('baba') ? (
          <TouchableOpacity style={[styles.modButon, mod === 'baba' && styles.modButonAktifBaba]} onPress={() => setMod('baba')}>
            <Ionicons name="people-outline" size={15} color={mod === 'baba' ? '#fff' : '#374151'} />
            <Text style={[styles.modYazi, mod === 'baba' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Baba Rehberi
            </Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>

      {mod !== 'baba' ? (
        <View style={styles.haftalikOzetKart}>
        <View style={styles.haftalikOzetBaslikSatiri}>
          <Ionicons name="stats-chart-outline" size={16} color="#7c3aed" />
          <Text style={styles.haftalikOzetBaslik}>
            {mod === 'adet'
              ? 'Adet Özeti'
              : mod === 'hamilelik'
                ? 'Hamilelik Özeti'
                : mod === 'dogumsonrasi'
                  ? 'Doğum Sonrası Özeti'
                  : 'Baba Rehberi Özeti'}
          </Text>
        </View>
        <Text style={styles.haftalikOzetAlt}>Seçili sekme için hızlı durum özeti.</Text>

        {mod === 'adet' ? (
          <Text style={styles.haftalikOzetMadde}>
            Adet: {haftalikOzet.adet ? `Sonraki tahmini gün ${haftalikOzet.adet.sonraki}. ${haftalikOzet.adet.durum}` : 'Bilgi girildiğinde gösterilecek.'}
          </Text>
        ) : null}
        {mod === 'hamilelik' ? (
          <Text style={styles.haftalikOzetMadde}>
            Hamilelik:{' '}
            {haftalikOzet.hamilelik
              ? `${haftalikOzet.hamilelik.hafta} (${haftalikOzet.hamilelik.trimester}). ${haftalikOzet.hamilelik.kalan}`
              : 'Bilgi girildiğinde gösterilecek.'}
          </Text>
        ) : null}
        {mod === 'dogumsonrasi' ? (
          <Text style={styles.haftalikOzetMadde}>
            Doğum sonrası: {haftalikOzet.dogumSonrasiAy}. ay odağı: {haftalikOzet.dogumSonrasiOdak}
          </Text>
        ) : null}
        </View>
      ) : null}

      {mod === 'adet' ? (
        <Animated.View
          style={{
            opacity: modIcerikAnim,
            transform: [{ translateY: modIcerikAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}>
          <TouchableOpacity style={styles.tarihSeciciInput} onPress={() => tarihSeciciAc('sonBaslangic')}>
            <Text style={sonBaslangic ? styles.tarihSeciciMetin : styles.tarihSeciciYerTutucu}>
              {sonBaslangic || 'Son adet başlangıcı seç'}
            </Text>
            <Ionicons name="calendar-outline" size={17} color="#475569" />
          </TouchableOpacity>
          <TextInput style={styles.input} placeholder="Döngü süresi (gün, örn 28)" value={donguSuresi} onChangeText={setDonguSuresi} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Adet süresi (gün, örn 5)" value={adetSuresi} onChangeText={setAdetSuresi} keyboardType="numeric" />
          <TextInput style={[styles.input, styles.notInput]} placeholder="Not (opsiyonel)" value={notMetni} onChangeText={setNotMetni} multiline />

          {!erkenBitisTarihi ? (
            <View style={styles.akilliKart}>
              <View style={styles.akilliBaslikSatiri}>
                <Ionicons name="notifications-outline" size={16} color="#9d174d" />
                <Text style={styles.akilliBaslik}>Akıllı Hazırlık Hatırlatıcıları</Text>
              </View>
              <Text style={styles.akilliAlt}>Hatırlatmalarda hangi hazırlıkları görmek istediğini seç.</Text>
              <View style={styles.cantaChipSatiri}>
                {ADET_CANTA_OGETLERI.map((oge) => {
                  const secili = cantaSecimleri.includes(oge.id);
                  return (
                    <TouchableOpacity key={oge.id} style={[styles.cantaChip, secili && styles.cantaChipAktif]} onPress={() => cantaSeciminiDegistir(oge.id)}>
                      <Ionicons name={secili ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={secili ? '#fff' : '#9d174d'} />
                      <Text style={[styles.cantaChipYazi, secili && styles.cantaChipYaziAktif]}>{oge.etiket}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={[styles.kaydetButon, (kaydediliyor || yukleniyor) && styles.pasif]} onPress={adetKaydet} disabled={kaydediliyor || yukleniyor}>
            <Text style={styles.kaydetYazi}>
              {kaydediliyor ? 'Kaydediliyor...' : adetTakipAktif ? 'Adet Takibini Güncelle' : 'Adet Takibini Başlat'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.takipDurumMetni}>
            <Text style={styles.takipDurumEtiket}>Durum: </Text>
            <Text style={erkenBitisTarihi ? styles.takipDurumTamamlandi : adetTakipAktif ? styles.takipDurumAktif : styles.takipDurumPasif}>
              {erkenBitisTarihi ? '✓ Dönem tamamlandı' : adetTakipAktif ? 'Aktif takip' : 'Henüz başlatılmadı'}
            </Text>
          </Text>
          {erkenBitisTarihi ? (
            <View style={styles.donemTamamlandiKart}>
              <Text style={styles.donemTamamlandiBaslik}>✓ Dönem tamamlandı</Text>
              <Text style={styles.donemTamamlandiYazi}>
                Kalan günlük hatırlatmalar durduruldu. Yeni dönem başladığında tarih ve süreyi güncelleyip takibi yeniden başlatabilirsin.
              </Text>
            </View>
          ) : null}

          {donemKartlariRender ? (
          <Animated.View
            style={{
              opacity: donemKartAnim,
              transform: [
                { translateY: donemKartAnim.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) },
                { scale: donemKartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            }}>
          <View style={styles.semptomKart}>
            <View style={styles.semptomBaslikSatiri}>
              <Ionicons name="pulse-outline" size={16} color="#0f766e" />
              <Text style={styles.semptomBaslik}>Bugün neler yaşadın?</Text>
            </View>
            <Text style={styles.semptomAlt}>Gün içinde ağrın oldu mu, ruh halin nasıldı?</Text>

            <Text style={styles.semptomEtiket}>Ağrı</Text>
            <View style={styles.semptomSecimSatiri}>
              {AGRI_SECENEKLERI.map((secenek) => {
                const secili = gunlukAgri === secenek.id;
                return (
                  <TouchableOpacity key={secenek.id} style={[styles.semptomButon, secili && styles.semptomButonAktif]} onPress={() => setGunlukAgri(secili ? null : secenek.id)}>
                    <Text style={[styles.semptomButonYazi, secili && styles.semptomButonYaziAktif]}>{secenek.etiket}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.semptomEtiket}>Ruh hali</Text>
            <View style={styles.semptomSecimSatiri}>
              {RUH_HALI_SECENEKLERI.map((secenek) => {
                const secili = gunlukRuhHali === secenek.id;
                return (
                  <TouchableOpacity key={secenek.id} style={[styles.semptomButon, secili && styles.semptomButonAktifTurkuaz]} onPress={() => setGunlukRuhHali(secili ? null : secenek.id)}>
                    <Text style={[styles.semptomButonYazi, secili && styles.semptomButonYaziAktif]}>{secenek.etiket}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.semptomKaydetButon, semptomKaydediliyor && styles.pasif]}
              onPress={semptomKaydet}
              disabled={semptomKaydediliyor || yukleniyor}>
              <Ionicons name="save-outline" size={15} color="#fff" />
              <Text style={styles.semptomKaydetYazi}>{semptomKaydediliyor ? 'Kaydediliyor...' : 'Bugünkü Semptomu Kaydet'}</Text>
            </TouchableOpacity>
            <Text style={styles.semptomBilgi}>
              Bu kayıtlar güvenli şekilde saklanır. Doktoruna veya aile hekimine göstermek istersen aşağıdan PDF özeti oluşturabilirsin.
            </Text>
          </View>
          <View style={styles.donemBitisKart}>
            <Text style={styles.donemBitisBaslik}>Dönem Erken Bittiyse</Text>
            <Text style={styles.donemBitisYazi}>
              Adetin beklenenden erken bittiyse kalan günlük hatırlatmaları durdurabilirsin.
            </Text>
            {erkenBitisTarihi ? <Text style={styles.donemBitisDurum}>Erken bitiş kaydı: {erkenBitisTarihi}</Text> : null}
            <TouchableOpacity
              style={[styles.donemBitisButon, adetBitiriliyor && styles.pasif]}
              onPress={adetBittiIsaretle}
              disabled={adetBitiriliyor || yukleniyor}>
              <Ionicons name="checkmark-done-outline" size={15} color="#0f766e" />
              <Text style={styles.donemBitisButonYazi}>{adetBitiriliyor ? 'Kaydediliyor...' : 'Adetim Bitti'}</Text>
            </TouchableOpacity>
          </View>
          </Animated.View>
          ) : null}

          {adetHesap ? (
            <>
              <View style={styles.uyariKutu}>
                <Text style={styles.uyariBaslik}>Yaklaşan Dönem Uyarısı</Text>
                <Text style={styles.uyariYazi}>{adetHesap.uyari}</Text>
              </View>

              <View style={styles.sonucKutu}>
                <Text style={styles.sonucBaslik}>Tahmini Takvim</Text>
                <Text style={styles.sonucYazi}>Bu adet bitişi: {adetHesap.adetBitis}{adetHesap.adetErkenBitis ? ' (erken bitiş kaydı)' : ''}</Text>
                <Text style={styles.sonucYazi}>Sonraki adet: {adetHesap.sonrakiAdetMetin}</Text>
                <Text style={styles.sonucYazi}>Yumurtlama günü: {adetHesap.yumurtlama}</Text>
                <Text style={styles.sonucYazi}>Doğurgan dönem: {adetHesap.dogurganBaslangic} - {adetHesap.dogurganBitis}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.bilgi}>Geçerli tarih ve süre girince adet tahmini burada görünecek.</Text>
          )}

          <View style={styles.adetBilgiKart}>
            <Text style={styles.adetBilgiBaslik}>Adet Döneminde Faydalı Bilgiler</Text>
            {ADET_FAYDALI_BILGILER.rahatlatma.map((madde) => (
              <Text key={madde} style={styles.adetBilgiMadde}>• {madde}</Text>
            ))}
          </View>

          <View style={styles.adetUyariKart}>
            <Text style={styles.adetUyariBaslik}>Sağlık Profesyoneli ile Görüş</Text>
            {ADET_FAYDALI_BILGILER.doktoraBasvuru.map((madde) => (
              <Text key={madde} style={styles.adetUyariMadde}>• {madde}</Text>
            ))}
          </View>

          {adetTakipAktif ? (
            <TouchableOpacity style={[styles.pdfButon, pdfOlusturuluyor && styles.pasif]} onPress={doktorOzetiPdfOlustur} disabled={pdfOlusturuluyor || yukleniyor}>
              <Ionicons name="document-text-outline" size={16} color="#fff" />
              <Text style={styles.pdfButonYazi}>{pdfOlusturuluyor ? 'PDF hazırlanıyor...' : 'Doktor Özeti PDF Oluştur'}</Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      ) : mod === 'hamilelik' ? (
        <Animated.View
          style={{
            opacity: modIcerikAnim,
            transform: [{ translateY: modIcerikAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}>
          <Text style={styles.alt}>Bu alan genel bilgilendirme amaçlıdır ve tıbbi teşhis yerine geçmez.</Text>
          <View style={styles.modSatiri}>
            <TouchableOpacity
              style={[styles.modButon, hamilelikYontemi === 'tarih' && styles.modButonAktif]}
              onPress={() => setHamilelikYontemi('tarih')}>
              <Ionicons name="calendar-number-outline" size={15} color={hamilelikYontemi === 'tarih' ? '#fff' : '#374151'} />
              <Text style={[styles.modYazi, hamilelikYontemi === 'tarih' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Tahmini Tarih
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modButon, hamilelikYontemi === 'aygun' && styles.modButonAktif]}
              onPress={() => setHamilelikYontemi('aygun')}>
              <Ionicons name="calculator-outline" size={15} color={hamilelikYontemi === 'aygun' ? '#fff' : '#374151'} />
              <Text style={[styles.modYazi, hamilelikYontemi === 'aygun' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Gebelik Ay/Gün
              </Text>
            </TouchableOpacity>
          </View>

          {hamilelikYontemi === 'tarih' ? (
            <TouchableOpacity style={styles.tarihSeciciInput} onPress={() => tarihSeciciAc('tahminiDogum')}>
              <Text style={tahminiDogumTarihi ? styles.tarihSeciciMetin : styles.tarihSeciciYerTutucu}>
                {tahminiDogumTarihi || 'Tahmini doğum tarihi seç'}
              </Text>
              <Ionicons name="calendar-outline" size={17} color="#475569" />
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Gebelik ayı (örn 4)"
                value={gebelikAyi}
                onChangeText={setGebelikAyi}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Gebelik günü (örn 3)"
                value={gebelikGunu}
                onChangeText={setGebelikGunu}
                keyboardType="numeric"
              />
              <Text style={styles.bilgi}>
                {ayGunYontemindenDogumTarihi
                  ? `Bugüne göre tahmini doğum: ${dateInputYaz(ayGunYontemindenDogumTarihi)}`
                  : 'Ay/gün girdikçe tahmini doğum tarihi otomatik hesaplanır.'}
              </Text>
            </>
          )}
          <TouchableOpacity style={[styles.kaydetButon, (kaydediliyor || yukleniyor) && styles.pasif]} onPress={hamilelikKaydet} disabled={kaydediliyor || yukleniyor}>
            <Text style={styles.kaydetYazi}>{kaydediliyor ? 'Kaydediliyor...' : 'Hamilelik Takibini Kaydet'}</Text>
          </TouchableOpacity>

          {hamilelikHesap ? (
            <>
              <View style={styles.sonucKutu}>
                <Text style={styles.sonucBaslik}>Doğuma Kalan Süre</Text>
                <Text style={styles.sonucYazi}>{hamilelikHesap.kalanMesaji}</Text>
                <Text style={styles.sonucYazi}>Tahmini gebelik haftası: {hamilelikHesap.gebelikHaftasi}</Text>
                <Text style={styles.sonucYazi}>Dönem: {hamilelikHesap.trimester}</Text>
              </View>
              <View style={styles.uyariKutuMavi}>
                <Text style={styles.uyariBaslikMavi}>Haftalık Bilgi</Text>
                <Text style={styles.uyariYaziMavi}>{hamilelikHesap.haftalikBilgi}</Text>
                <Text style={styles.uyariYaziMaviNot}>{hamilelikHesap.hesapYontemiNotu}</Text>
              </View>
              <View style={styles.uyariKutuKirmizi}>
                <Text style={styles.uyariBaslikKirmizi}>Dikkat</Text>
                <Text style={styles.uyariYaziKirmizi}>{hamilelikHesap.acilUyari}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.bilgi}>Tahmini doğum tarihini girince doğuma kalan süre hesaplanacak.</Text>
          )}
        </Animated.View>
      ) : mod === 'dogumsonrasi' ? (
        <Animated.View
          style={{
            opacity: modIcerikAnim,
            transform: [{ translateY: modIcerikAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}>
          <View style={styles.dogumSonrasiHero}>
            <Text style={styles.dogumSonrasiHeroBaslik}>Doğum Sonrası Rehber</Text>
            <Text style={styles.dogumSonrasiHeroYazi}>
              Bu bölüm genel bilgi içindir. Belirtiler kişiden kişiye değişebilir; şiddetli veya endişe verici bir durum olursa sağlık uzmanına başvur.
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ayChipSatiri}>
            {DOGUM_SONRASI_REHBER.map((item) => (
              <Animated.View key={item.ay} style={[dogumSonrasiAy === item.ay && { transform: [{ scale: seciliAyAnim }] }]}>
                <TouchableOpacity style={[styles.ayChip, dogumSonrasiAy === item.ay && styles.ayChipAktif]} onPress={() => setDogumSonrasiAy(item.ay)}>
                  <View style={styles.ayChipIcerik}>
                    <Ionicons name={DOGUM_SONRASI_IKONLAR[item.ay]} size={14} color={dogumSonrasiAy === item.ay ? '#fff' : '#4b5563'} />
                    <Text style={[styles.ayChipYazi, dogumSonrasiAy === item.ay && styles.ayChipYaziAktif]}>{item.baslik}</Text>
                    {favoriAy === item.ay ? <Ionicons name="star" size={13} color={dogumSonrasiAy === item.ay ? '#fde68a' : '#f59e0b'} /> : null}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>

          <View style={styles.rehberKart}>
            <View style={styles.rehberBaslikSatiri}>
              <Text style={styles.rehberKartBaslik}>{seciliDogumSonrasiBilgi.baslik} İçin Beklenenler</Text>
              <TouchableOpacity style={styles.favoriButon} onPress={favoriAyiDegistir}>
                <Ionicons name={favoriAy === dogumSonrasiAy ? 'star' : 'star-outline'} size={14} color={favoriAy === dogumSonrasiAy ? '#92400e' : '#6b7280'} />
                <Text style={styles.favoriButonYazi}>{favoriAy === dogumSonrasiAy ? 'Favori Ay' : 'Favori Yap'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.rehberKartMadde}>Beden: {seciliDogumSonrasiBilgi.beden}</Text>
            <Text style={styles.rehberKartMadde}>Duygu: {seciliDogumSonrasiBilgi.duygu}</Text>
            <Text style={styles.rehberKartMadde}>Bebek: {seciliDogumSonrasiBilgi.bebek}</Text>
            <Text style={styles.rehberKartMadde}>Destek: {seciliDogumSonrasiBilgi.destek}</Text>
          </View>

          <View style={styles.emzirmeKart}>
            <Text style={styles.emzirmeBaslik}>Süt Azlığı Hissinde Ne Yapılabilir?</Text>
            <Text style={styles.emzirmeYazi}>Bu durum bazı annelerde görülebilir ve her zaman gerçek süt azlığı anlamına gelmeyebilir.</Text>
            <Text style={styles.emzirmeYazi}>Daha sık emzirme, doğru tutuş pozisyonu ve ten tene temas çoğu kişide fayda sağlayabilir.</Text>
            <Text style={styles.emzirmeYazi}>Islak bez sayısında azalma, bebekte belirgin halsizlik veya kilo alımı kaygısı varsa bir uzmana başvurmak önemlidir.</Text>
          </View>

          <View style={styles.kaynakKart}>
            <View style={styles.kaynakBaslikSatiri}>
              <Ionicons name="library-outline" size={16} color="#1d4ed8" />
              <Text style={styles.kaynakBaslik}>Bilimsel Kaynaklar</Text>
            </View>
            <Text style={styles.kaynakAlt}>Doğrulanmış rehberlere hızlı erişim.</Text>
            {BILIMSEL_KAYNAKLAR.map((kaynak) => (
              <TouchableOpacity key={kaynak.url} style={styles.kaynakSatir} onPress={() => Linking.openURL(kaynak.url)}>
                <View style={styles.kaynakSol}>
                  <View style={styles.kaynakIkonKutu}>
                    <Ionicons name="document-text-outline" size={14} color="#1d4ed8" />
                  </View>
                  <View style={styles.kaynakMetinKutu}>
                    <Text style={styles.kaynakLink}>{kaynak.baslik}</Text>
                    <Text style={styles.kaynakEtiket}>{kaynakEtiketi(kaynak.url)}</Text>
                  </View>
                </View>
                <Ionicons name="open-outline" size={15} color="#1d4ed8" />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          style={{
            opacity: modIcerikAnim,
            transform: [{ translateY: modIcerikAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}>
          <View style={styles.modSatiri}>
            <TouchableOpacity
              style={[styles.modButon, babaRehberModu === 'hamilelik' && styles.modButonAktifBaba]}
              onPress={() => setBabaRehberModu('hamilelik')}>
              <Ionicons name="body-outline" size={15} color={babaRehberModu === 'hamilelik' ? '#fff' : '#374151'} />
              <Text style={[styles.modYazi, babaRehberModu === 'hamilelik' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Hamilelik Süreci
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modButon, babaRehberModu === 'dogumsonrasi' && styles.modButonAktifBaba]}
              onPress={() => setBabaRehberModu('dogumsonrasi')}>
              <Ionicons name="sparkles-outline" size={15} color={babaRehberModu === 'dogumsonrasi' ? '#fff' : '#374151'} />
              <Text style={[styles.modYazi, babaRehberModu === 'dogumsonrasi' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Doğum Sonrası
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modButon, babaRehberModu === 'partneradet' && styles.modButonAktifBaba]}
              onPress={() => setBabaRehberModu('partneradet')}>
              <Ionicons name="heart-half-outline" size={15} color={babaRehberModu === 'partneradet' ? '#fff' : '#374151'} />
              <Text style={[styles.modYazi, babaRehberModu === 'partneradet' && styles.modYaziAktif]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Partner Adet Dönemi
              </Text>
            </TouchableOpacity>
          </View>

          {babaRehberModu === 'partneradet' ? (
            <View style={styles.partnerDestekKart}>
              <View style={styles.partnerHeroSatiri}>
                <View style={styles.partnerHeroIconKutu}>
                  <Ionicons name="heart-circle-outline" size={18} color="#0369a1" />
                </View>
                <View style={styles.partnerHeroMetinKutu}>
                  <Text style={styles.partnerDestekBaslik}>Bugün nasıl destek olabilirim?</Text>
                  <Text style={styles.partnerDestekAlt}>Partnerinin dönem gününü manuel seç, öneriler otomatik güncellensin.</Text>
                </View>
                <View style={styles.partnerGostergeChip}>
                  <Text style={styles.partnerGostergeYazi}>{partnerDonemGunu}. gün</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.partnerGunSatiri}>
                {Array.from({ length: 7 }, (_, i) => i + 1).map((gun) => {
                  const secili = partnerDonemGunu === gun;
                  return (
                    <TouchableOpacity key={`partner-gun-${gun}`} style={[styles.partnerGunChip, secili && styles.partnerGunChipAktif]} onPress={() => partnerDonemGunuDegistir(gun)}>
                      <Text style={[styles.partnerGunYazi, secili && styles.partnerGunYaziAktif]}>{gun}. gün</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.partnerOneriKutu}>
                <Text style={styles.partnerOneriMadde}>
                  <Text style={styles.partnerOneriEtiket}>Hazırlık: </Text>
                  {partnerDonemDestegi.hazirlik}
                </Text>
                <Text style={styles.partnerOneriMadde}>
                  <Text style={styles.partnerOneriEtiket}>İletişim: </Text>
                  {partnerDonemDestegi.iletisim}
                </Text>
                <Text style={styles.partnerOneriMadde}>
                  <Text style={styles.partnerOneriEtiket}>Pratik destek: </Text>
                  {partnerDonemDestegi.pratik}
                </Text>
              </View>
              <View style={styles.partnerDilKart}>
                <Text style={styles.partnerDilBaslik}>Kaçınma Dili Kutusu</Text>
                <View style={styles.partnerDilKacinKutu}>
                  <Text style={styles.partnerDilEtiket}>Bugün kaçın:</Text>
                  <Text style={styles.partnerDilKacin}>{'"'}{partnerDilOnerisi.kacin}{'"'}</Text>
                </View>
                <View style={styles.partnerDilYerineKutu}>
                  <Text style={styles.partnerDilEtiket}>Bunun yerine şöyle söyle:</Text>
                  <Text style={styles.partnerDilYerine}>{'"'}{partnerDilOnerisi.yerine}{'"'}</Text>
                </View>
              </View>
            </View>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ayChipSatiri}>
                {(babaRehberModu === 'hamilelik' ? BABA_HAMILELIK_AYLIK : BABA_DOGUM_SONRASI_AYLIK).map((item) => {
                  const secili = babaRehberModu === 'hamilelik' ? babaHamilelikAy === item.ay : babaDogumSonrasiAy === item.ay;
                  return (
                    <TouchableOpacity
                      key={`${babaRehberModu}-${item.ay}`}
                      style={[styles.ayChip, secili && styles.babaDonemChipAktif]}
                      onPress={() => (babaRehberModu === 'hamilelik' ? setBabaHamilelikAy(item.ay as BabaHamilelikAy) : setBabaDogumSonrasiAy(item.ay as BabaDogumSonrasiAy))}>
                      <Text style={[styles.ayChipYazi, secili && styles.ayChipYaziAktif]}>{item.baslik}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.babaDetayKart}>
                <Text style={styles.babaDetayBaslik}>
                  {(babaRehberModu === 'hamilelik' ? seciliBabaHamilelikBilgi : seciliBabaDogumSonrasiBilgi).baslik} Rehberi
                </Text>
                <Text style={styles.babaDetayMadde}>
                  Eşe destek: {(babaRehberModu === 'hamilelik' ? seciliBabaHamilelikBilgi : seciliBabaDogumSonrasiBilgi).esDestegi}
                </Text>
                <Text style={styles.babaDetayMadde}>
                  Dikkat: {(babaRehberModu === 'hamilelik' ? seciliBabaHamilelikBilgi : seciliBabaDogumSonrasiBilgi).dikkat}
                </Text>
                <Text style={styles.babaDetayMadde}>
                  Yapılacaklar: {(babaRehberModu === 'hamilelik' ? seciliBabaHamilelikBilgi : seciliBabaDogumSonrasiBilgi).yapilacaklar}
                </Text>
              </View>
            </>
          )}

          {babaRehberModu === 'dogumsonrasi' ? (
            <View style={styles.destekPlanKart}>
              <View style={styles.kaynakBaslikSatiri}>
                <Ionicons name="checkmark-done-outline" size={16} color="#0369a1" />
                <Text style={styles.destekPlanBaslik}>Unutma Listesi ve Bildirim</Text>
              </View>
              <Text style={styles.destekPlanAlt}>Hatırlatmak istediğin maddeleri seç, gün ve saat belirleyip tek seferlik bildirim kur.</Text>
              <Text style={styles.destekSaatBaslik}>Gün seç (Paz-Cmt)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destekSaatSatiri}>
                {BABA_HAFTA_GUNLERI.map((item) => {
                  const secili = babaBildirimGunleri.includes(item.gun);
                  return (
                    <TouchableOpacity key={`baba-gun-${item.gun}`} style={[styles.destekSaatChip, secili && styles.destekSaatChipAktif]} onPress={() => babaBildirimGununuDegistir(item.gun)}>
                      <Text style={[styles.destekSaatYazi, secili && styles.destekSaatYaziAktif]}>{item.etiket}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.destekSaatBaslik}>Bildirim saati seç</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destekSaatSatiri}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((saat) => {
                  const secili = babaBildirimSaati === saat;
                  return (
                    <TouchableOpacity key={`baba-saat-${saat}`} style={[styles.destekSaatChip, secili && styles.destekSaatChipAktif]} onPress={() => babaBildirimSaatiniDegistir(saat)}>
                      <Text style={[styles.destekSaatYazi, secili && styles.destekSaatYaziAktif]}>{String(saat).padStart(2, '0')}:00</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {BABA_UNUTMA_LISTESI.map((gorev) => {
                const tamamlandi = !!destekPlanDurum[gorev.id];
                return (
                  <TouchableOpacity key={gorev.id} style={[styles.destekGorevSatir, tamamlandi && styles.destekGorevSatirTamam]} onPress={() => destekGoreviDegistir(gorev.id)}>
                    <Ionicons name={tamamlandi ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={tamamlandi ? '#0284c7' : '#64748b'} />
                    <View style={styles.destekGorevMetinKutu}>
                      <Text style={[styles.destekGorevBaslik, tamamlandi && styles.destekGorevBaslikTamam]}>{gorev.etiket}</Text>
                      <Text style={styles.destekGorevNot}>{gorev.bildirim}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.babaBildirimButon} onPress={babaHatirlatmalariKur}>
                <Ionicons name="notifications-outline" size={16} color="#fff" />
                <Text style={styles.babaBildirimButonYazi}>Seçtiklerim İçin Bildirim Kur</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {babaRehberModu !== 'partneradet' ? (
            <View style={styles.kaynakKart}>
              <View style={styles.kaynakBaslikSatiri}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#1d4ed8" />
                <Text style={styles.kaynakBaslik}>Baba Rehberi Kaynakları</Text>
              </View>
              <Text style={styles.kaynakAlt}>İçerikler güncel resmî sağlık rehberlerinden derlenmiştir.</Text>
              {BABA_REHBER_KAYNAKLARI.map((kaynak) => (
                <TouchableOpacity key={kaynak.url} style={styles.kaynakSatir} onPress={() => Linking.openURL(kaynak.url)}>
                  <View style={styles.kaynakSol}>
                    <View style={styles.kaynakIkonKutu}>
                      <Ionicons name="document-text-outline" size={14} color="#1d4ed8" />
                    </View>
                    <View style={styles.kaynakMetinKutu}>
                      <Text style={styles.kaynakLink}>{kaynak.baslik}</Text>
                      <Text style={styles.kaynakEtiket}>{kaynakEtiketi(kaynak.url)}</Text>
                    </View>
                  </View>
                  <Ionicons name="open-outline" size={15} color="#1d4ed8" />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {babaRehberModu !== 'partneradet' ? (
            <View style={styles.babaHeroKart}>
              <Text style={styles.babaHeroBaslik}>Baba Rehberi</Text>
              <Text style={styles.babaHeroYazi}>
                Bu içerikler genel yol haritası içindir. Gebelik ve doğum sonrası süreç kişiden kişiye değişebilir; tıbbi kararlar için sağlık profesyoneli görüşü esastır.
              </Text>
            </View>
          ) : null}
        </Animated.View>
      )}
      {tarihSeciciAcik && Platform.OS === 'ios' ? (
        <Modal transparent animationType="slide" visible={tarihSeciciAcik} onRequestClose={() => setTarihSeciciAcik(false)}>
          <View style={styles.tarihModalArka}>
            <View style={styles.tarihModalIcerik}>
              <View style={styles.tarihModalUst}>
                <TouchableOpacity onPress={() => setTarihSeciciAcik(false)}>
                  <Text style={styles.tarihModalButon}>Kapat</Text>
                </TouchableOpacity>
                <Text style={styles.tarihModalBaslik}>{tarihSeciciHedef === 'sonBaslangic' ? 'Son adet başlangıcı' : 'Tahmini doğum tarihi'}</Text>
                <TouchableOpacity onPress={() => setTarihSeciciAcik(false)}>
                  <Text style={styles.tarihModalButon}>Tamam</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tarihSeciciDeger}
                mode="date"
                display="spinner"
                locale="tr-TR"
                onChange={tarihSeciciDegisti}
                maximumDate={new Date(2100, 11, 31)}
              />
            </View>
          </View>
        </Modal>
      ) : null}
      {tarihSeciciAcik && Platform.OS !== 'ios' ? (
        <DateTimePicker
          value={tarihSeciciDeger}
          mode="date"
          display="default"
          locale="tr-TR"
          onChange={tarihSeciciDegisti}
          maximumDate={new Date(2100, 11, 31)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  icerik: { padding: 16, paddingTop: 56, paddingBottom: 24 },
  arkaPlanKatman: { position: 'absolute', top: 0, left: 0, right: 0, height: 250 },
  arkaBalonBir: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(236,72,153,0.1)',
    top: -90,
    right: -64,
  },
  arkaBalonIki: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(14,165,233,0.1)',
    top: 24,
    left: -78,
  },
  heroKart: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroBaslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIkonKutu: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baslik: { fontSize: 27, fontWeight: '800', color: '#111827' },
  alt: { marginTop: 2, marginBottom: 0, color: '#475569', fontWeight: '500' },
  modSatiri: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  modButon: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 130,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modButonAktif: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  modButonAktifBaba: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  modYazi: { color: '#374151', fontWeight: '700', fontSize: 12, flexShrink: 1, minWidth: 0, textAlign: 'center' },
  modYaziAktif: { color: '#fff' },
  haftalikOzetKart: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  haftalikOzetBaslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  haftalikOzetBaslik: { color: '#5b21b6', fontWeight: '800' },
  haftalikOzetAlt: { color: '#6d28d9', fontSize: 12, marginBottom: 6 },
  haftalikOzetMadde: { color: '#374151', marginBottom: 4, lineHeight: 19 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tarihSeciciInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tarihSeciciMetin: { color: '#0f172a', fontWeight: '600' },
  tarihSeciciYerTutucu: { color: '#94a3b8', fontWeight: '600' },
  notInput: { minHeight: 90, textAlignVertical: 'top' },
  akilliKart: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  akilliBaslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  akilliBaslik: { color: '#9d174d', fontWeight: '800' },
  akilliAlt: { color: '#7c2d12', fontSize: 12, marginBottom: 8 },
  cantaChipSatiri: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cantaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fda4af',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cantaChipAktif: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  cantaChipYazi: { color: '#9d174d', fontWeight: '700', fontSize: 12 },
  cantaChipYaziAktif: { color: '#fff' },
  kaydetButon: {
    backgroundColor: '#ec4899',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#9d174d',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kaydetYazi: { color: '#fff', fontWeight: '700' },
  takipDurumMetni: { fontSize: 12, marginBottom: 10, marginTop: -4, fontWeight: '700' },
  takipDurumEtiket: { color: '#475569' },
  takipDurumAktif: { color: '#15803d' },
  takipDurumPasif: { color: '#b91c1c' },
  takipDurumTamamlandi: { color: '#15803d' },
  donemTamamlandiKart: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  donemTamamlandiBaslik: { color: '#166534', fontWeight: '800', marginBottom: 4 },
  donemTamamlandiYazi: { color: '#14532d', fontSize: 12, lineHeight: 18 },
  semptomKart: {
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  semptomBaslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  semptomBaslik: { color: '#115e59', fontWeight: '800' },
  semptomAlt: { color: '#0f766e', fontSize: 12, marginBottom: 8 },
  semptomEtiket: { color: '#134e4a', fontWeight: '700', marginBottom: 6, marginTop: 2 },
  semptomSecimSatiri: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  semptomButon: {
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  semptomButonAktif: { backgroundColor: '#14b8a6', borderColor: '#14b8a6' },
  semptomButonAktifTurkuaz: { backgroundColor: '#0ea5a4', borderColor: '#0ea5a4' },
  semptomButonYazi: { color: '#0f766e', fontWeight: '700', fontSize: 12 },
  semptomButonYaziAktif: { color: '#fff' },
  semptomKaydetButon: {
    marginTop: 4,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  semptomKaydetYazi: { color: '#fff', fontWeight: '800' },
  semptomBilgi: { color: '#0f766e', fontSize: 12, marginTop: 8, lineHeight: 18 },
  donemBitisKart: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  donemBitisBaslik: { color: '#0f172a', fontWeight: '800', marginBottom: 4 },
  donemBitisYazi: { color: '#475569', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  donemBitisDurum: { color: '#0f766e', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  donemBitisButon: {
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#ecfeff',
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  donemBitisButonYazi: { color: '#0f766e', fontWeight: '800' },
  pdfButon: {
    marginBottom: 10,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowColor: '#4c1d95',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pdfButonYazi: { color: '#fff', fontWeight: '800' },
  pasif: { opacity: 0.7 },
  sonucKutu: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fbcfe8', marginBottom: 10 },
  sonucBaslik: { fontWeight: '700', marginBottom: 6, color: '#9d174d' },
  sonucYazi: { color: '#374151', marginBottom: 4 },
  uyariKutu: { backgroundColor: '#fff1f2', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fecdd3', marginBottom: 10 },
  uyariBaslik: { color: '#be123c', fontWeight: '700', marginBottom: 4 },
  uyariYazi: { color: '#881337' },
  uyariKutuMavi: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 10 },
  uyariBaslikMavi: { color: '#1d4ed8', fontWeight: '700', marginBottom: 4 },
  uyariYaziMavi: { color: '#1e3a8a' },
  uyariYaziMaviNot: { color: '#1e40af', marginTop: 6, fontSize: 12 },
  uyariKutuKirmizi: { backgroundColor: '#fef2f2', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fecaca', marginBottom: 10 },
  uyariBaslikKirmizi: { color: '#b91c1c', fontWeight: '700', marginBottom: 4 },
  uyariYaziKirmizi: { color: '#7f1d1d' },
  adetBilgiKart: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 10 },
  adetBilgiBaslik: { color: '#1d4ed8', fontWeight: '800', marginBottom: 6 },
  adetBilgiMadde: { color: '#1e3a8a', marginBottom: 5, lineHeight: 20 },
  adetUyariKart: { backgroundColor: '#fff7ed', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fed7aa', marginBottom: 10 },
  adetUyariBaslik: { color: '#9a3412', fontWeight: '800', marginBottom: 6 },
  adetUyariMadde: { color: '#7c2d12', marginBottom: 5, lineHeight: 20 },
  dogumSonrasiHero: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  dogumSonrasiHeroBaslik: { color: '#9a3412', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  dogumSonrasiHeroYazi: { color: '#7c2d12' },
  ayChipSatiri: { gap: 8, paddingBottom: 8, marginBottom: 6 },
  ayChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ayChipIcerik: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ayChipAktif: { backgroundColor: '#f97316', borderColor: '#f97316' },
  ayChipYazi: { color: '#374151', fontWeight: '700' },
  ayChipYaziAktif: { color: '#fff' },
  rehberKart: { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#fde68a', marginBottom: 10 },
  rehberBaslikSatiri: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  rehberKartBaslik: { color: '#92400e', fontWeight: '800', marginBottom: 6 },
  favoriButon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  favoriButonYazi: { color: '#78350f', fontWeight: '700', fontSize: 12 },
  rehberKartMadde: { color: '#3f3f46', marginBottom: 6, lineHeight: 20 },
  emzirmeKart: { backgroundColor: '#ecfeff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#a5f3fc', marginBottom: 10 },
  emzirmeBaslik: { color: '#155e75', fontWeight: '800', marginBottom: 6 },
  emzirmeYazi: { color: '#164e63', marginBottom: 5 },
  kaynakKart: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 10 },
  kaynakBaslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  kaynakBaslik: { color: '#0f172a', fontWeight: '800' },
  kaynakAlt: { color: '#475569', marginBottom: 8, fontSize: 12 },
  kaynakSatir: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  kaynakSol: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  kaynakIkonKutu: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kaynakMetinKutu: { flex: 1, minWidth: 0 },
  kaynakLink: { color: '#1e3a8a', fontWeight: '700' },
  kaynakEtiket: { color: '#64748b', fontSize: 11, marginTop: 1 },
  babaHeroKart: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  babaHeroBaslik: { color: '#0c4a6e', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  babaHeroYazi: { color: '#075985' },
  babaDonemChipAktif: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  partnerDestekKart: {
    backgroundColor: '#f8fcff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 16,
    padding: 13,
    marginBottom: 12,
    shadowColor: '#0c4a6e',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  partnerHeroSatiri: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  partnerHeroIconKutu: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  partnerHeroMetinKutu: { flex: 1, minWidth: 0 },
  partnerDestekBaslik: { color: '#0c4a6e', fontWeight: '800' },
  partnerDestekAlt: { color: '#075985', fontSize: 12, marginTop: 2, lineHeight: 18 },
  partnerGostergeChip: {
    backgroundColor: '#0369a1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  partnerGostergeYazi: { color: '#fff', fontWeight: '800', fontSize: 12 },
  partnerGunSatiri: { gap: 8, paddingBottom: 8, marginBottom: 4 },
  partnerGunChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  partnerGunChipAktif: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  partnerGunYazi: { color: '#075985', fontWeight: '700', fontSize: 12 },
  partnerGunYaziAktif: { color: '#fff' },
  partnerOneriKutu: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', borderRadius: 12, padding: 10, gap: 7 },
  partnerOneriMadde: { color: '#334155', lineHeight: 20 },
  partnerOneriEtiket: { color: '#075985', fontWeight: '800' },
  partnerDilKart: { backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', borderRadius: 12, padding: 10, marginTop: 8 },
  partnerDilBaslik: { color: '#1e3a8a', fontWeight: '800', marginBottom: 6 },
  partnerDilEtiket: { color: '#334155', fontWeight: '700', marginTop: 2, marginBottom: 2 },
  partnerDilKacinKutu: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8, marginBottom: 8 },
  partnerDilKacin: { color: '#b91c1c', fontWeight: '700', marginTop: 3, marginBottom: 5 },
  partnerDilYerineKutu: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8 },
  partnerDilYerine: { color: '#15803d', fontWeight: '700', marginTop: 3 },
  babaDetayKart: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  babaDetayBaslik: { color: '#0369a1', fontWeight: '800', marginBottom: 6 },
  babaDetayMadde: { color: '#334155', marginBottom: 6, lineHeight: 20 },
  destekPlanKart: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  destekPlanBaslik: { color: '#0369a1', fontWeight: '800' },
  destekPlanAlt: { color: '#0369a1', marginBottom: 8, fontSize: 12 },
  destekSaatBaslik: { color: '#075985', fontWeight: '700', marginBottom: 6 },
  destekSaatSatiri: { gap: 7, paddingBottom: 8, marginBottom: 4 },
  destekSaatChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  destekSaatChipAktif: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  destekSaatYazi: { color: '#075985', fontWeight: '700', fontSize: 12 },
  destekSaatYaziAktif: { color: '#fff' },
  destekGorevSatir: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0f2fe',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  destekGorevSatirTamam: { borderColor: '#7dd3fc', backgroundColor: '#f0f9ff' },
  destekGorevMetinKutu: { flex: 1, minWidth: 0 },
  destekGorevBaslik: { color: '#0f172a', fontWeight: '700' },
  destekGorevBaslikTamam: { color: '#0c4a6e' },
  destekGorevNot: { color: '#475569', fontSize: 12, marginTop: 1 },
  babaBildirimButon: {
    marginTop: 6,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  babaBildirimButonYazi: { color: '#fff', fontWeight: '800' },
  tarihModalArka: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.25)' },
  tarihModalIcerik: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  tarihModalUst: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tarihModalBaslik: { color: '#0f172a', fontWeight: '800' },
  tarihModalButon: { color: '#2563eb', fontWeight: '700' },
  bilgi: { color: '#6b7280', marginTop: 4 },
});
