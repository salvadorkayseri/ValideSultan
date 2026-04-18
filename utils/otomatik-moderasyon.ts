import { db } from '@/firebaseConfig';
import { sistemBildirimiGonder } from '@/utils/bildirim';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const CEZA_SAAT = 12;
const SPAM_CEZA_SAAT = 1;
const HIZLI_MESAJ_SINIRI = 4;
const AYNI_MESAJ_SINIRI = 3;
const HIZLI_PENCERE_MS = 60 * 1000;
const MAKSIMUM_IZINLI_TOPLAM_RAKAM = 7;

const KUFUR_HAKARET_KELIMELERI = [
  'amk',
  'aq',
  'amina',
  'amina koy',
  'aminakodum',
  'amnakodum',
  'aminakoyum',
  'aminakorum',
  'aminisikerim',
  'aminbasarim',
  'aminadalarim',
  'amucuk',
  'amcik',
  'orospu',
  'orosbu',
  'pic',
  'piç',
  'ibne',
  'siktir',
  'sikik',
  'sikerim',
  'got',
  'gavat',
  'malaka',
  'kasmer',
  'kasar',
  'fahise',
  'fuhus',
  'kahpe',
  'kahbe',
  'serefsiz',
  'serfsiz',
  'serefdiz',
  'gerizekali',
  'aptal',
  'salak',
  'mal',
  'fuck',
  'bitch',
  'hamas',
  'hizbullah',
  'pkk',
  'ypg',
  'pjak',
  'isid',
  'işid',
  'deaş',
  'deas',
  'teror',
  'terör',
  'terorist',
  'terörist',
  'mafya',
  'daltonlar',
  'kurdistan',
  'kürdistan',
  'heval',
  'ocalan',
  'öcalan',
  'zenci',
  'negro',
  'maymun',
  'essek',
  'eşşek',
  'kopek',
  'köpek',
];

// Sadece tek basina yazildiginda engellenecek kelimeler.
const TEK_BASINA_ENGEL_KELIMELERI = ['am', 'akp', 'gay'];

const CIPLALIK_IPUCLARI = ['ciplak', 'nude', 'naked', 'ifsa', 'mahrem'];
const KUFUR_NAZIK_UYARI_MESAJI = 'Küfür/aşağılayıcı/argo kelime tespit edildi. Lütfen daha nazik olun.';

type ModerasyonDurumu = {
  cezaBitis?: any;
  sonMetin?: string;
  sonMesajTs?: any;
  hizliMesajSayisi?: number;
  tekrarSayisi?: number;
  toplamIhlal?: number;
  kufurUyariSayisi?: number;
  spamUyariSayisi?: number;
  uygunsuzUyariSayisi?: number;
  hassasUyariSayisi?: number;
};

type KontrolSonucu = {
  izin: boolean;
  mesaj?: string;
  normalizeMetin?: string;
  hizliMesajSayisi?: number;
  tekrarSayisi?: number;
};

type IhlalTuru = 'kufur' | 'spam' | 'uygunsuz' | 'hassas';

const metniNormalizeEt = (metin: string) =>
  metin
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cezaMesaji = (bitisTarihi: Date) => {
  const kalanDakika = Math.max(1, Math.ceil((bitisTarihi.getTime() - Date.now()) / 60000));
  return `Bu hesap su an kisitli. Yaklasik ${kalanDakika} dakika sonra tekrar deneyebilirsin.`;
};

const girisEngeliMesaji = (bitisTarihi: Date | null, suresizBan: boolean) => {
  if (suresizBan) {
    return 'Hesabin suresiz olarak uygulamaya girise kapatildi. Destek ile iletisime gecebilirsin.';
  }
  if (!bitisTarihi) {
    return 'Hesabin uygulamaya girise kapatildi.';
  }
  const kalanSaat = Math.max(1, Math.ceil((bitisTarihi.getTime() - Date.now()) / (60 * 60 * 1000)));
  return `Hesabina gecici giris yasagi uygulandi. Yaklasik ${kalanSaat} saat sonra tekrar giris yapabilirsin.`;
};

const LEET_HARF_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '0': 'o',
  '$': 's',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '2': 'z',
};

const normalizeForDetection = (metin: string) => {
  const ham = metniNormalizeEt(metin)
    .split('')
    .map((ch) => LEET_HARF_MAP[ch] || ch)
    .join('');

  const tekrarAzaltilmis = ham.replace(/(.)\1+/g, '$1');
  const bosluklu = tekrarAzaltilmis.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const bitisik = bosluklu.replace(/\s+/g, '');
  return { bosluklu, bitisik };
};

const tokenizeForDetection = (metin: string) => {
  const { bosluklu } = normalizeForDetection(metin);
  return bosluklu.split(' ').filter(Boolean);
};

const tokenDizisiIcerirMi = (tokenler: string[], ifadeTokenleri: string[]) => {
  if (!ifadeTokenleri.length || tokenler.length < ifadeTokenleri.length) return false;

  for (let i = 0; i <= tokenler.length - ifadeTokenleri.length; i += 1) {
    let eslesti = true;
    for (let j = 0; j < ifadeTokenleri.length; j += 1) {
      if (tokenler[i + j] !== ifadeTokenleri[j]) {
        eslesti = false;
        break;
      }
    }
    if (eslesti) return true;
  }

  return false;
};

const tekBasinaKelimeIhlaliVarMi = (metin: string) => {
  const tokenler = tokenizeForDetection(metin);
  return tokenler.some((token) => TEK_BASINA_ENGEL_KELIMELERI.includes(token));
};

const kelimeIhlaliVarMi = (metin: string) => {
  if (tekBasinaKelimeIhlaliVarMi(metin)) return true;

  const hedefTokenler = tokenizeForDetection(metin);

  return KUFUR_HAKARET_KELIMELERI.some((kelime) => {
    const anahtarTokenler = tokenizeForDetection(kelime);
    if (!anahtarTokenler.length) return false;

    if (anahtarTokenler.length === 1) {
      return hedefTokenler.includes(anahtarTokenler[0]);
    }

    return tokenDizisiIcerirMi(hedefTokenler, anahtarTokenler);
  });
};

const ciplaklikIpuclariVarMi = (metin: string) => {
  const norm = metniNormalizeEt(metin);
  return CIPLALIK_IPUCLARI.some((kelime) => norm.includes(kelime));
};

const uyariAlani = (tur: IhlalTuru) => {
  if (tur === 'kufur') return 'kufurUyariSayisi';
  if (tur === 'spam') return 'spamUyariSayisi';
  if (tur === 'hassas') return 'hassasUyariSayisi';
  return 'uygunsuzUyariSayisi';
};

const hassasSayiIcerigiVarMi = (metin: string) => {
  // Kullanici istegine gore: tek mesajda 7'den fazla (8+) rakam paylasimi engellenir.
  const toplamRakamSayisi = (metin.match(/\d/g) || []).length;
  if (toplamRakamSayisi > MAKSIMUM_IZINLI_TOPLAM_RAKAM) {
    return true;
  }

  const adaylar = metin.match(/(?:\+?\d[\d\s().-]{5,}\d)/g) || [];

  for (const aday of adaylar) {
    const sadeceRakam = aday.replace(/\D/g, '');

    // 11 hane -> TC benzeri; 10-12 hane -> telefon benzeri; 8+ hane -> riskli sayı paylaşımı.
    if (
      sadeceRakam.length === 11 ||
      (sadeceRakam.length >= 10 && sadeceRakam.length <= 12) ||
      sadeceRakam.length > MAKSIMUM_IZINLI_TOPLAM_RAKAM
    ) {
      return true;
    }
  }

  // Harf/karakter araya girse bile (ör: 123aaa465aaa6464) kısa aralıkları birleştir.
  let birlesikRakam = '';
  let aradakiKarakter = 0;
  const maxAraKarakter = 3;

  const metinAlt = metin.toLowerCase();
  for (const ch of metinAlt) {
    if (/\d/.test(ch)) {
      if (aradakiKarakter > maxAraKarakter) {
        // Önceki blok bitti, yeni blok başlat.
        birlesikRakam = ch;
      } else {
        birlesikRakam += ch;
      }
      aradakiKarakter = 0;
      continue;
    }

    if (birlesikRakam.length > 0) {
      aradakiKarakter += 1;

      if (aradakiKarakter > maxAraKarakter) {
        if (
          birlesikRakam.length === 11 ||
          (birlesikRakam.length >= 10 && birlesikRakam.length <= 12) ||
          birlesikRakam.length > MAKSIMUM_IZINLI_TOPLAM_RAKAM
        ) {
          return true;
        }
        birlesikRakam = '';
        aradakiKarakter = 0;
      }
    }
  }

  if (
    birlesikRakam.length === 11 ||
    (birlesikRakam.length >= 10 && birlesikRakam.length <= 12) ||
    birlesikRakam.length > MAKSIMUM_IZINLI_TOPLAM_RAKAM
  ) {
    return true;
  }

  return false;
};

async function ihlalIsle(kullaniciId: string, tur: IhlalTuru, ihlalMesaji: string) {
  if (tur === 'kufur') {
    await sistemBildirimiGonder({
      aliciId: kullaniciId,
      mesaj: KUFUR_NAZIK_UYARI_MESAJI,
    });
    return {
      cezaUygulandi: false,
      mesaj: KUFUR_NAZIK_UYARI_MESAJI,
    };
  }

  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const snap = await getDoc(kullaniciRef);
  const mevcut = (snap.data()?.otoModerasyon || {}) as ModerasyonDurumu;
  const alan = uyariAlani(tur);
  const uyariSayisi = Number((mevcut as any)[alan] || 0);
  const cezaSaat = tur === 'spam' ? SPAM_CEZA_SAAT : CEZA_SAAT;

  if (uyariSayisi < 1) {
    await setDoc(
      kullaniciRef,
      {
        otoModerasyon: {
          ...mevcut,
          [alan]: 1,
          sonUyariTarihi: new Date(),
        },
      },
      { merge: true }
    );

    await sistemBildirimiGonder({
      aliciId: kullaniciId,
      mesaj: `${ihlalMesaji} Bu bir uyarıdır. Tekrarı halinde ${cezaSaat} saat yazma kısıtı uygulanacak.`,
    });

    return {
      cezaUygulandi: false,
      mesaj: `${ihlalMesaji} Bu bir uyarıdır. Bir daha tekrar edersen ${cezaSaat} saat ceza alacaksın.`,
    };
  }

  const cezaBitis = new Date(Date.now() + cezaSaat * 60 * 60 * 1000);
  await setDoc(
    kullaniciRef,
    {
      otoModerasyon: {
        ...mevcut,
        cezaBitis,
        toplamIhlal: (mevcut.toplamIhlal || 0) + 1,
        [alan]: 0,
      },
    },
    { merge: true }
  );

  await sistemBildirimiGonder({
    aliciId: kullaniciId,
    mesaj: `${ihlalMesaji} Tekrarlandığı için ${cezaSaat} saat yazma kısıtı uygulandı.`,
  });

  return {
    cezaUygulandi: true,
    mesaj: `${ihlalMesaji} Tekrarı nedeniyle ${cezaSaat} saat yazma kısıtı uygulandı.`,
  };
}

export async function kullaniciCezaKontrolu(kullaniciId: string): Promise<KontrolSonucu> {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const snap = await getDoc(kullaniciRef);
  const mod = (snap.data()?.otoModerasyon || {}) as ModerasyonDurumu;
  const cezaBitis = mod.cezaBitis?.toDate?.() || (mod.cezaBitis ? new Date(mod.cezaBitis) : null);

  if (cezaBitis && cezaBitis.getTime() > Date.now()) {
    return { izin: false, mesaj: cezaMesaji(cezaBitis) };
  }

  return { izin: true };
}

export async function kullaniciGirisEngeliKontrolu(kullaniciId: string): Promise<KontrolSonucu> {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const snap = await getDoc(kullaniciRef);
  const moderasyon = (snap.data()?.moderasyon || {}) as {
    girisYasagiBitis?: any;
    suresizBan?: boolean;
  };
  const bitis = moderasyon.girisYasagiBitis?.toDate?.()
    || (moderasyon.girisYasagiBitis ? new Date(moderasyon.girisYasagiBitis) : null);
  const suresizBan = !!moderasyon.suresizBan;

  if (suresizBan) {
    return { izin: false, mesaj: girisEngeliMesaji(null, true) };
  }

  if (bitis && bitis.getTime() > Date.now()) {
    return { izin: false, mesaj: girisEngeliMesaji(bitis, false) };
  }

  return { izin: true };
}

export async function metinPaylasimOnKontrol(
  kullaniciId: string,
  metin: string,
  spamKontrolAktif: boolean = false
): Promise<KontrolSonucu> {
  const norm = metniNormalizeEt(metin);
  if (!norm) return { izin: false, mesaj: 'Boş metin gönderemezsin.' };

  const girisEngeli = await kullaniciGirisEngeliKontrolu(kullaniciId);
  if (!girisEngeli.izin) return girisEngeli;

  const ceza = await kullaniciCezaKontrolu(kullaniciId);
  if (!ceza.izin) return ceza;

  if (kelimeIhlaliVarMi(norm)) {
    return { izin: false, mesaj: KUFUR_NAZIK_UYARI_MESAJI };
  }

  if (hassasSayiIcerigiVarMi(metin)) {
    const sonuc = await ihlalIsle(
      kullaniciId,
      'hassas',
      'Telefon/kimlik gibi hassas sayı paylaşımı tespit edildi.'
    );
    return { izin: false, mesaj: sonuc.mesaj };
  }

  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const snap = await getDoc(kullaniciRef);
  const mod = (snap.data()?.otoModerasyon || {}) as ModerasyonDurumu;

  const sonTs = mod.sonMesajTs?.toDate?.() || (mod.sonMesajTs ? new Date(mod.sonMesajTs) : null);
  const sonMetin = mod.sonMetin || '';
  const hizliSayac =
    sonTs && Date.now() - sonTs.getTime() < HIZLI_PENCERE_MS ? (mod.hizliMesajSayisi || 0) + 1 : 1;
  const tekrarSayac = sonMetin === norm ? (mod.tekrarSayisi || 0) + 1 : 1;

  if (spamKontrolAktif && (hizliSayac >= HIZLI_MESAJ_SINIRI || tekrarSayac >= AYNI_MESAJ_SINIRI)) {
    const sonuc = await ihlalIsle(kullaniciId, 'spam', 'Spam/flood davranışı tespit edildi.');
    return { izin: false, mesaj: sonuc.mesaj };
  }

  return {
    izin: true,
    normalizeMetin: norm,
    hizliMesajSayisi: hizliSayac,
    tekrarSayisi: tekrarSayac,
  };
}

export async function paylasimBasariliKaydet(
  kullaniciId: string,
  normalizeMetin: string,
  hizliMesajSayisi: number,
  tekrarSayisi: number
) {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  await setDoc(
    kullaniciRef,
    {
      otoModerasyon: {
        sonMetin: normalizeMetin,
        sonMesajTs: new Date(),
        hizliMesajSayisi,
        tekrarSayisi,
      },
    },
    { merge: true }
  );
}

export async function uygunsuzIcerikCezasiUygula(kullaniciId: string, sebep: string) {
  return ihlalIsle(kullaniciId, 'uygunsuz', sebep);
}

export function metindenCiplaklikIpuclariKontrol(metin: string) {
  return ciplaklikIpuclariVarMi(metin);
}

export async function dogrudanYazmaKisitiUygula(
  kullaniciId: string,
  sebep: string,
  saat: number = 24
) {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const snap = await getDoc(kullaniciRef);
  const mevcut = (snap.data()?.otoModerasyon || {}) as ModerasyonDurumu;
  const cezaBitis = new Date(Date.now() + saat * 60 * 60 * 1000);

  await setDoc(
    kullaniciRef,
    {
      otoModerasyon: {
        ...mevcut,
        cezaBitis,
        toplamIhlal: (mevcut.toplamIhlal || 0) + 1,
      },
    },
    { merge: true }
  );

  await sistemBildirimiGonder({
    aliciId: kullaniciId,
    mesaj: `${sebep} Hesabina ${saat} saat yazma kisiti uygulandi.`,
  });

  return {
    cezaUygulandi: true,
    mesaj: `${sebep} Hesabina ${saat} saat yazma kisiti uygulandi.`,
  };
}

export async function geciciGirisYasagiUygula(
  kullaniciId: string,
  sebep: string,
  gun: number
) {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const bitis = new Date(Date.now() + gun * 24 * 60 * 60 * 1000);

  await setDoc(
    kullaniciRef,
    {
      moderasyon: {
        girisYasagiBitis: bitis,
        suresizBan: false,
        sonYaptirimSebebi: sebep,
        sonYaptirimTarihi: new Date(),
      },
    },
    { merge: true }
  );

  await sistemBildirimiGonder({
    aliciId: kullaniciId,
    mesaj: `${sebep} Hesabina ${gun} gun giris yasagi uygulandi.`,
  });

  return {
    mesaj: `${sebep} Hesabina ${gun} gun giris yasagi uygulandi.`,
  };
}

export async function suresizGirisYasagiUygula(kullaniciId: string, sebep: string) {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  await setDoc(
    kullaniciRef,
    {
      moderasyon: {
        girisYasagiBitis: null,
        suresizBan: true,
        sonYaptirimSebebi: sebep,
        sonYaptirimTarihi: new Date(),
      },
    },
    { merge: true }
  );

  await sistemBildirimiGonder({
    aliciId: kullaniciId,
    mesaj: `${sebep} Hesabina suresiz giris yasagi uygulandi.`,
  });

  return {
    mesaj: `${sebep} Hesabina suresiz giris yasagi uygulandi.`,
  };
}

export async function yazmaKisitiKaldir(kullaniciId: string, sebep: string = 'Moderasyon karari:') {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);
  const snap = await getDoc(kullaniciRef);
  const mevcut = (snap.data()?.otoModerasyon || {}) as ModerasyonDurumu;

  await setDoc(
    kullaniciRef,
    {
      otoModerasyon: {
        ...mevcut,
        cezaBitis: null,
      },
    },
    { merge: true }
  );

  await sistemBildirimiGonder({
    aliciId: kullaniciId,
    mesaj: `${sebep} Hesabindaki yazma kisiti kaldirildi.`,
  });
}

export async function girisYasagiKaldir(kullaniciId: string, sebep: string = 'Moderasyon karari:') {
  const kullaniciRef = doc(db, 'kullanicilar', kullaniciId);

  await setDoc(
    kullaniciRef,
    {
      moderasyon: {
        girisYasagiBitis: null,
        suresizBan: false,
        sonYaptirimSebebi: `${sebep} giris yasagi kaldirildi`,
        sonYaptirimTarihi: new Date(),
      },
    },
    { merge: true }
  );

  await sistemBildirimiGonder({
    aliciId: kullaniciId,
    mesaj: `${sebep} Hesabindaki giris yasagi kaldirildi.`,
  });
}
