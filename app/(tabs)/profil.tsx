import { auth, db } from '@/firebaseConfig';
import { signOut } from 'firebase/auth';
import { bildirimGonder } from '@/utils/bildirim';
import { odemeSistemiHazirMi, proBilgisiCikar, proSatinal, satinAlimlariGeriYukle } from '@/utils/pro-uyelik';
import {
  dogrudanYazmaKisitiUygula,
  metinPaylasimOnKontrol,
  paylasimBasariliKaydet,
} from '@/utils/otomatik-moderasyon';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const CLOUDINARY_CLOUD_NAME = 'dcgxpdqid';
const CLOUDINARY_UPLOAD_PRESET = 'forumapp';
const UCRETSIZ_ARKADAS_LIMITI = 10;
const GUNLUK_VIDEO_ODUL_LIMITI = 4;

type ArkadasIstek = {
  id: string;
  gonderenId: string;
  gonderenEmail?: string;
  gonderenKullaniciAdi?: string;
  durum: 'beklemede' | 'kabul' | 'red';
  tarih?: any;
};

const PRO_PAKETLER = [
  { id: '1ay', etiket: '1 Aylık Pro - 149,99 TL', ay: 1, fiyat: 149.99 },
  { id: '2ay', etiket: '2 Aylık Pro - 229,99 TL', ay: 2, fiyat: 229.99 },
  { id: '6ay', etiket: '6 Aylık Pro - 499,99 TL', ay: 6, fiyat: 499.99 },
] as const;
const PRO_AVANTAJLAR = ['+200 altın hoş geldin bonusu', 'Reklamsız kullanım', 'Sınırsız konu açma', 'Altın Efsane rozet', 'Efsane unvanı kazan', 'Sınırsız arkadaş ekleme'];
const expoGoMu = Constants.appOwnership === 'expo';

const rozetHesapla = (yildiz: number, proAktif?: boolean) => {
  if (proAktif) return 'Efsane';
  if (yildiz >= 1500) return 'Efsane';
  if (yildiz >= 900) return 'Anne';
  if (yildiz >= 500) return 'Anne Yarısı';
  if (yildiz >= 350) return 'Abla';
  return 'Yeni Üye';
};

const bugunAnahtar = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
};

const arkadasSayisiHesapla = (veri: any) => (Array.isArray(veri?.arkadaslar) ? veri.arkadaslar.length : 0);
const arkadasLimitiDoluMu = (veri: any) => !veri?.proAktif && arkadasSayisiHesapla(veri) >= UCRETSIZ_ARKADAS_LIMITI;

type ProfilSayfasiProps = {
  kullaniciId?: string;
  geriDon?: () => void;
};

export default function ProfilSayfasi({ kullaniciId, geriDon }: ProfilSayfasiProps = {}) {
  const [kullanici, setKullanici] = useState<any>(null);
  const [yildizModal, setYildizModal] = useState(false);
  const [fotografYukleniyor, setFotografYukleniyor] = useState(false);
  const [fotografOnayModalAcik, setFotografOnayModalAcik] = useState(false);
  const [seciliProfilFotograf, setSeciliProfilFotograf] = useState<any>(null);
  const [biyografiMetni, setBiyografiMetni] = useState('');
  const [biyografiKaydediliyor, setBiyografiKaydediliyor] = useState(false);
  const [gelenIstekler, setGelenIstekler] = useState<ArkadasIstek[]>([]);
  const [arkadasDurumu, setArkadasDurumu] = useState<'yok' | 'beklemede' | 'arkadas'>('yok');
  const [istekIsleniyor, setIstekIsleniyor] = useState(false);
  const [proIslemde, setProIslemde] = useState(false);
  const [arkadaslarDetay, setArkadaslarDetay] = useState<Array<{ id: string; kullaniciAdi: string }>>([]);
  const [ayarModalAcik, setAyarModalAcik] = useState(false);
  const [proModalAcik, setProModalAcik] = useState(false);
  const [proKutlamaGoster, setProKutlamaGoster] = useState(false);
  const [videoOdulYukleniyor, setVideoOdulYukleniyor] = useState(false);
  const [odulKutlamaGoster, setOdulKutlamaGoster] = useState(false);
  const proCanliAnim = useRef(new Animated.Value(1)).current;
  const proParlakAnim = useRef(new Animated.Value(-180)).current;
  const avatarHaloAnim = useRef(new Animated.Value(1)).current;
  const proPatlamaAnim = useRef(new Animated.Value(0)).current;
  const odulAnim = useRef(new Animated.Value(0)).current;
  const oncekiProAktifRef = useRef<boolean | null>(null);

  const aktifKullaniciId = kullaniciId || auth.currentUser?.uid || '';
  const benimProfil = auth.currentUser?.uid === aktifKullaniciId;
  const kayitliBiyografi = String(kullanici?.biyografi || '');
  const biyografiDegisti = biyografiMetni.trim() !== kayitliBiyografi.trim();

  const arkadaslarDetayGetir = async (arkadasIds: string[]) => {
    if (!arkadasIds.length) {
      setArkadaslarDetay([]);
      return;
    }

    const detaylar = await Promise.all(
      arkadasIds.map(async (id) => {
        const snap = await getDoc(doc(db, 'kullanicilar', id));
        if (!snap.exists()) return null;
        return { id, kullaniciAdi: String(snap.data().kullaniciAdi || 'Gizli Üye') };
      })
    );

    setArkadaslarDetay(detaylar.filter(Boolean) as Array<{ id: string; kullaniciAdi: string }>);
  };

  const arkadaslikVerileriniGetir = async (profilData: any) => {
    const benId = auth.currentUser?.uid;
    if (!benId || !aktifKullaniciId) return;

    if (benimProfil) {
      const isteklerSnap = await getDocs(collection(db, 'kullanicilar', aktifKullaniciId, 'arkadasIstekleri'));
      const liste = isteklerSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ArkadasIstek))
        .filter((i) => i.durum === 'beklemede');
      setGelenIstekler(liste);

      const arkadasIds = Array.isArray(profilData?.arkadaslar) ? profilData.arkadaslar : [];
      await arkadaslarDetayGetir(arkadasIds);
      setArkadasDurumu('yok');
      return;
    }

    const profilArkadaslar = Array.isArray(profilData?.arkadaslar) ? profilData.arkadaslar : [];
    if (profilArkadaslar.includes(benId)) {
      setArkadasDurumu('arkadas');
      return;
    }

    const hedefIsteklerSnap = await getDocs(collection(db, 'kullanicilar', aktifKullaniciId, 'arkadasIstekleri'));
    const bekleyenIstekVar = hedefIsteklerSnap.docs.some((d) => {
      const data = d.data() as any;
      return data.gonderenId === benId && data.durum === 'beklemede';
    });

    setArkadasDurumu(bekleyenIstekVar ? 'beklemede' : 'yok');
  };

  const profilGetir = async () => {
    if (!aktifKullaniciId) return;

    const ref = doc(db, 'kullanicilar', aktifKullaniciId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() } as any;
      setKullanici(data);
      setBiyografiMetni(String(data.biyografi || ''));
      await arkadaslikVerileriniGetir(data);
    }
  };

  useEffect(() => {
    profilGetir();
  }, [aktifKullaniciId]);

  useEffect(() => {
    if (!kullanici?.proAktif) {
      proCanliAnim.setValue(1);
      proParlakAnim.setValue(-180);
      return;
    }

    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(proCanliAnim, { toValue: 1.05, duration: 700, useNativeDriver: true }),
        Animated.timing(proCanliAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    dongu.start();
    const parlaklik = Animated.loop(
      Animated.timing(proParlakAnim, { toValue: 320, duration: 2200, useNativeDriver: true })
    );
    parlaklik.start();
    return () => {
      dongu.stop();
      parlaklik.stop();
    };
  }, [kullanici?.proAktif, proCanliAnim, proParlakAnim]);

  useEffect(() => {
    const halo = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarHaloAnim, { toValue: 1.1, duration: 1100, useNativeDriver: true }),
        Animated.timing(avatarHaloAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    );
    halo.start();
    return () => halo.stop();
  }, [avatarHaloAnim]);

  useEffect(() => {
    const simdikiPro = !!kullanici?.proAktif;
    if (oncekiProAktifRef.current === null) {
      oncekiProAktifRef.current = simdikiPro;
      return;
    }

    if (!oncekiProAktifRef.current && simdikiPro) {
      setProKutlamaGoster(true);
      proPatlamaAnim.setValue(0);
      Animated.sequence([
        Animated.timing(proPatlamaAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.delay(1000),
        Animated.timing(proPatlamaAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]).start(() => setProKutlamaGoster(false));
    }

    oncekiProAktifRef.current = simdikiPro;
  }, [kullanici?.proAktif, proPatlamaAnim]);

  const zatenYildizVerdi = kullanici?.yildizVerenler?.includes(auth.currentUser?.uid) ?? false;

  const arkadaslikIstegiGonder = async () => {
    if (!auth.currentUser?.uid || benimProfil) return;
    if (arkadasDurumu !== 'yok') return;

    try {
      setIstekIsleniyor(true);
      const benSnap = await getDoc(doc(db, 'kullanicilar', auth.currentUser.uid));
      const hedefSnap = await getDoc(doc(db, 'kullanicilar', aktifKullaniciId));
      const benData = benSnap.data() as any;
      const hedefData = hedefSnap.data() as any;

      if (arkadasLimitiDoluMu(benData)) {
        Alert.alert('Limit', 'En fazla 10 arkadaş ekleyebilirsin. Sınırsız arkadaş için Pro üyelik gerekli.');
        return;
      }
      if (arkadasLimitiDoluMu(hedefData)) {
        Alert.alert('Bilgi', 'Bu kullanıcının arkadaş listesi dolu görünüyor.');
        return;
      }

      const benAdi = String(benSnap.data()?.kullaniciAdi || '').trim() || 'Gizli Üye';

      await addDoc(collection(db, 'kullanicilar', aktifKullaniciId, 'arkadasIstekleri'), {
        gonderenId: auth.currentUser.uid,
        gonderenEmail: auth.currentUser.email || '',
        gonderenKullaniciAdi: benAdi,
        durum: 'beklemede',
        tarih: new Date(),
      });

      await bildirimGonder({
        aliciId: aktifKullaniciId,
        tip: 'sistem',
        mesaj: `${benAdi} sana arkadaşlık isteği gönderdi.`,
      });

      setArkadasDurumu('beklemede');
      Alert.alert('Başarılı', 'Arkadaşlık isteği gönderildi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message || 'Arkadaşlık isteği gönderilemedi.');
    } finally {
      setIstekIsleniyor(false);
    }
  };

  const istegiKabulEt = async (istek: ArkadasIstek) => {
    if (!auth.currentUser?.uid) return;

    try {
      setIstekIsleniyor(true);
      const benimRef = doc(db, 'kullanicilar', auth.currentUser.uid);
      const digerRef = doc(db, 'kullanicilar', istek.gonderenId);
      const istekRef = doc(db, 'kullanicilar', auth.currentUser.uid, 'arkadasIstekleri', istek.id);
      const [benSnap, digerSnap] = await Promise.all([getDoc(benimRef), getDoc(digerRef)]);
      const benData = benSnap.data() as any;
      const digerData = digerSnap.data() as any;

      if (arkadasLimitiDoluMu(benData)) {
        Alert.alert('Limit', 'En fazla 10 arkadaş ekleyebilirsin. Sınırsız arkadaş için Pro üyelik gerekli.');
        return;
      }
      if (arkadasLimitiDoluMu(digerData)) {
        Alert.alert('Bilgi', 'İstek gönderen kullanıcının arkadaş listesi dolu görünüyor.');
        return;
      }

      const batch = writeBatch(db);
      batch.update(benimRef, { arkadaslar: arrayUnion(istek.gonderenId) });
      batch.update(digerRef, { arkadaslar: arrayUnion(auth.currentUser.uid) });
      batch.delete(istekRef);
      await batch.commit();

      await bildirimGonder({
        aliciId: istek.gonderenId,
        tip: 'sistem',
        mesaj: `@${kullanici?.kullaniciAdi || 'Bir kullanıcı'} arkadaşlık isteğini kabul etti.`,
      });

      await profilGetir();
      Alert.alert('Başarılı', 'Arkadaşlık isteği kabul edildi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message || 'İstek kabul edilemedi.');
    } finally {
      setIstekIsleniyor(false);
    }
  };

  const istegiReddet = async (istek: ArkadasIstek) => {
    if (!auth.currentUser?.uid) return;

    try {
      setIstekIsleniyor(true);
      await deleteDoc(doc(db, 'kullanicilar', auth.currentUser.uid, 'arkadasIstekleri', istek.id));
      await profilGetir();
      Alert.alert('Bilgi', 'İstek reddedildi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message || 'İstek reddedilemedi.');
    } finally {
      setIstekIsleniyor(false);
    }
  };

  const fotografSec = async () => {
    const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!izin.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraf seçmek için galeri izni gerekli.');
      return;
    }

    const sonuc = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });

    if (!sonuc.canceled && sonuc.assets[0]) {
      setSeciliProfilFotograf(sonuc.assets[0]);
      setFotografOnayModalAcik(true);
    }
  };

  const fotografYukle = async (asset: any) => {
    try {
      setFotografYukleniyor(true);
      const uri = String(asset?.uri || '');
      if (!uri) {
        Alert.alert('Hata', 'Seçilen görsel bulunamadı.');
        return;
      }

      const dosyaAdi = String(asset?.fileName || uri.split('/').pop() || `profil-${Date.now()}.jpg`);
      const uzanti = dosyaAdi.split('.').pop()?.toLowerCase();
      const mimeTipi =
        asset?.mimeType ||
        (uzanti === 'png' ? 'image/png' : uzanti === 'webp' ? 'image/webp' : 'image/jpeg');

      const formData = new FormData();
      formData.append('file', {
        uri,
        type: mimeTipi,
        name: dosyaAdi,
      } as any);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.secure_url) {
        Alert.alert('Hata', data?.error?.message || 'Fotoğraf yüklenemedi.');
        return;
      }

      const moderationDurumu = Array.isArray(data?.moderation) ? data.moderation[0]?.status : '';
      if (moderationDurumu === 'rejected' || moderationDurumu === 'pending') {
        const sonuc = await dogrudanYazmaKisitiUygula(
          aktifKullaniciId,
          'Profil fotoğrafında uygunsuz/cinsel içerik tespit edildi.',
          24
        );
        Alert.alert('Uyarı', sonuc.mesaj);
        return;
      }

      await updateDoc(doc(db, 'kullanicilar', aktifKullaniciId), {
        profilFoto: data.secure_url,
      });
      await profilGetir();
      Alert.alert('Başarılı', 'Profil fotoğrafın güncellendi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message);
    } finally {
      setFotografYukleniyor(false);
    }
  };

  const biyografiKaydet = async () => {
    if (!benimProfil || !auth.currentUser?.uid) return;

    try {
      setBiyografiKaydediliyor(true);
      const temizBiyografi = biyografiMetni.trim();

      if (!temizBiyografi) {
        await updateDoc(doc(db, 'kullanicilar', aktifKullaniciId), { biyografi: '' });
        await profilGetir();
        Alert.alert('Başarılı', 'Biyografin temizlendi.');
        return;
      }

      const metinKontrol = await metinPaylasimOnKontrol(auth.currentUser.uid, temizBiyografi, false);
      if (!metinKontrol.izin) {
        Alert.alert('Uyarı', metinKontrol.mesaj || 'Biyografi engellendi.');
        return;
      }

      await updateDoc(doc(db, 'kullanicilar', aktifKullaniciId), {
        biyografi: temizBiyografi,
      });

      await paylasimBasariliKaydet(
        auth.currentUser.uid,
        metinKontrol.normalizeMetin || '',
        metinKontrol.hizliMesajSayisi || 1,
        metinKontrol.tekrarSayisi || 1
      );

      await profilGetir();
      Alert.alert('Başarılı', 'Biyografin güncellendi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message || 'Biyografi güncellenemedi.');
    } finally {
      setBiyografiKaydediliyor(false);
    }
  };

  const yildizVer = async (yildiz: number) => {
    try {
      const kullaniciRef = doc(db, 'kullanicilar', aktifKullaniciId);
      const snap = await getDoc(kullaniciRef);
      const mevcutVerenler = snap.data()?.yildizVerenler || [];
      const mevcutYildiz = Number(snap.data()?.yildiz || 0);

      if (mevcutVerenler.includes(auth.currentUser?.uid)) {
        Alert.alert('Uyarı', 'Bu kullanıcıya zaten yıldız verdin!');
        setYildizModal(false);
        await profilGetir();
        return;
      }

      const yeniToplamYildiz = mevcutYildiz + yildiz;
      const yeniRozet = rozetHesapla(yeniToplamYildiz);

      await updateDoc(kullaniciRef, {
        yildiz: yeniToplamYildiz,
        rozet: yeniRozet,
        yildizVerenler: arrayUnion(auth.currentUser?.uid),
      });

      await bildirimGonder({
        aliciId: aktifKullaniciId,
        tip: 'yildiz',
        mesaj: `Bir kullanıcı sana ${yildiz} yıldız verdi.`,
      });

      setYildizModal(false);
      Alert.alert('Teşekkürler!', `${yildiz} yıldız verdin!`);
      await profilGetir();
    } catch (hata: any) {
      Alert.alert('Hata', hata.message);
    }
  };

  const videoIzleyipYildizKazan = async () => {
    if (!benimProfil || !auth.currentUser?.uid) return;
    if (expoGoMu) {
      Alert.alert('Bilgi', 'Expo Go modunda ödüllü video devre dışı. Bu özellik development/release buildde çalışır.');
      return;
    }

    let ads: any;
    try {
      ads = require('react-native-google-mobile-ads');
    } catch {
      Alert.alert('Bilgi', 'Reklam modülü bu ortamda kullanılamıyor.');
      return;
    }

    try {
      const ref = doc(db, 'kullanicilar', auth.currentUser.uid);
      const snap = await getDoc(ref);
      const odulData = (snap.data() as any)?.gunlukVideoYildizOdulu || {};
      const bugunkuSayi = odulData.tarih === bugunAnahtar() ? Number(odulData.sayi || 0) : 0;
      if (bugunkuSayi >= GUNLUK_VIDEO_ODUL_LIMITI) {
        Alert.alert('Günlük Limit', `Video izleyerek yıldız kazanma limiti bugün doldu (${GUNLUK_VIDEO_ODUL_LIMITI}/${GUNLUK_VIDEO_ODUL_LIMITI}).`);
        return;
      }
    } catch {
      Alert.alert('Hata', 'Günlük video ödül limiti kontrol edilemedi. Lütfen tekrar dene.');
      return;
    }

    setVideoOdulYukleniyor(true);
    const rewarded = ads.RewardedAd.createForAdRequest(ads.TestIds.REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });

    return new Promise<void>((resolve) => {
      let odulVerildi = false;
      const unsubEarned = rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, async () => {
        odulVerildi = true;
        try {
          const ref = doc(db, 'kullanicilar', auth.currentUser!.uid);
          const snap = await getDoc(ref);
          const data = snap.data() as any;
          const mevcutYildiz = Number(data?.yildiz || 0);
          const yeniYildiz = mevcutYildiz + 25;
          const odulData = data?.gunlukVideoYildizOdulu || {};
          const bugunkuSayi = odulData.tarih === bugunAnahtar() ? Number(odulData.sayi || 0) : 0;
          await updateDoc(ref, {
            yildiz: yeniYildiz,
            rozet: rozetHesapla(yeniYildiz, !!data?.proAktif),
            gunlukVideoYildizOdulu: {
              tarih: bugunAnahtar(),
              sayi: bugunkuSayi + 1,
            },
          });
          setOdulKutlamaGoster(true);
          odulAnim.setValue(0);
          Animated.sequence([
            Animated.timing(odulAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.delay(920),
            Animated.timing(odulAnim, { toValue: 0, duration: 360, useNativeDriver: true }),
          ]).start(() => setOdulKutlamaGoster(false));
          await profilGetir();
        } catch (hata: any) {
          Alert.alert('Hata', hata?.message || 'Yıldız ödülü eklenemedi.');
        } finally {
          setVideoOdulYukleniyor(false);
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          resolve();
        }
      });

      const unsubLoaded = rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => rewarded.show());
      const unsubClosed = rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
        if (!odulVerildi) {
          setVideoOdulYukleniyor(false);
          Alert.alert('Bilgi', 'Video tamamlanmadığı için ödül verilmedi.');
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          resolve();
        }
      });
      const unsubError = rewarded.addAdEventListener(ads.AdEventType.ERROR, () => {
        setVideoOdulYukleniyor(false);
        Alert.alert('Hata', 'Video yüklenemedi. Biraz sonra tekrar dene.');
        unsubLoaded();
        unsubEarned();
        unsubClosed();
        unsubError();
        resolve();
      });

      rewarded.load();
    });
  };

  const proAktifEt = async (paket: (typeof PRO_PAKETLER)[number]) => {
    try {
      setProIslemde(true);
      const ref = doc(db, 'kullanicilar', aktifKullaniciId);
      const snap = await getDoc(ref);
      const data = snap.data() as any;
      const bonusVerildi = !!data?.proBonusVerildi;
      const info = await proSatinal(auth.currentUser!.uid, paket.id);
      const proDurumu = proBilgisiCikar(info);
      if (!proDurumu.proAktif) {
        Alert.alert('Uyarı', 'Satın alma tamamlandı ama aktif Pro abonelik bulunamadı. Mağaza ürünlerini kontrol et.');
        return;
      }
      const baslangic = new Date();
      const bitis = proDurumu.bitisTarihi || new Date(new Date().setMonth(new Date().getMonth() + paket.ay));

      await updateDoc(ref, {
        proAktif: proDurumu.proAktif,
        proBonusVerildi: true,
        rozet: 'Efsane',
        proPaketId: paket.id,
        proPaketEtiket: paket.etiket,
        proPaketAy: paket.ay,
        proPaketFiyat: paket.fiyat,
        proBaslangic: baslangic,
        proBitis: bitis,
        ...(bonusVerildi ? {} : { yildiz: increment(200) }),
      });

      setProModalAcik(false);
      await profilGetir();
        Alert.alert(
          'Başarılı',
          bonusVerildi
            ? `${paket.etiket} aktif edildi.`
            : `${paket.etiket} aktif edildi. +200 altın eklendi.`
        );
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'Pro üyelik etkinleştirilemedi.');
    } finally {
      setProIslemde(false);
    }
  };

  const proyaGec = () => {
    if (!benimProfil || !auth.currentUser?.uid) return;
    if (!odemeSistemiHazirMi()) {
      Alert.alert('Eksik Ayar', 'Ödeme sistemi bu cihazda desteklenmiyor.');
      return;
    }
    setProModalAcik(true);
  };

  const satinAlimlariGeriYukleVeEsitle = async () => {
    if (!benimProfil || !auth.currentUser?.uid) return;
    if (!odemeSistemiHazirMi()) {
      Alert.alert('Eksik Ayar', 'Ödeme sistemi bu cihazda desteklenmiyor.');
      return;
    }

    try {
      setProIslemde(true);
      const info = await satinAlimlariGeriYukle(auth.currentUser.uid);
      const proDurumu = proBilgisiCikar(info);
      const ref = doc(db, 'kullanicilar', aktifKullaniciId);
      const mevcutSnap = await getDoc(ref);
      const mevcutYildiz = Number((mevcutSnap.data() as any)?.yildiz || 0);
      await updateDoc(ref, {
        proAktif: proDurumu.proAktif,
        ...(proDurumu.proAktif
          ? { rozet: 'Efsane', proBitis: proDurumu.bitisTarihi || null }
          : {
              rozet: rozetHesapla(mevcutYildiz, false),
              proPaketId: null,
              proPaketEtiket: null,
              proPaketAy: null,
              proPaketFiyat: null,
              proBaslangic: null,
              proBitis: null,
            }),
      });
      await profilGetir();
      Alert.alert('Başarılı', proDurumu.proAktif ? 'Satın almalar geri yüklendi ve Pro aktif edildi.' : 'Aktif Pro abonelik bulunamadı.');
    } catch (hata: any) {
      Alert.alert('Hata', hata?.message || 'Satın almalar geri yüklenemedi.');
    } finally {
      setProIslemde(false);
    }
  };

  const cikisYap = () => {
    Alert.alert('Çıkış Yap', 'Hesabından çıkmak istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          try {
            setAyarModalAcik(false);
            setProModalAcik(false);
            await signOut(auth);
          } catch (hata: any) {
            Alert.alert('Hata', hata?.message || 'Çıkış yapılamadı.');
          }
        },
      },
    ]);
  };

  if (!aktifKullaniciId) {
    return (
      <View style={styles.yukleniyor}>
        <Text style={styles.iptalYazi}>Profili görmek için giriş yapmalısın.</Text>
      </View>
    );
  }

  if (!kullanici) {
    return (
      <View style={styles.yukleniyor}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  const arkadasSayisi = Array.isArray(kullanici.arkadaslar) ? kullanici.arkadaslar.length : 0;

  return (
    <View style={styles.container}>
      <View style={styles.arkaPlanKatman}>
        <View style={styles.arkaBalonBir} />
        <View style={styles.arkaBalonIki} />
      </View>
      {geriDon ? (
        <TouchableOpacity onPress={geriDon} style={styles.geriButon}>
          <Text style={styles.geriYazi}>Geri</Text>
        </TouchableOpacity>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollIcerik} showsVerticalScrollIndicator={false}>
      <View style={styles.profilKart}>
        <View style={styles.profilKartParlama} />
        {benimProfil ? (
          <TouchableOpacity style={styles.ayarIkonButon} onPress={() => setAyarModalAcik(true)}>
            <MaterialCommunityIcons name="cog-outline" size={22} color="#374151" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={benimProfil ? fotografSec : undefined} style={styles.avatarKutu}>
          <Animated.View style={[styles.avatarHalo, { transform: [{ scale: avatarHaloAnim }] }]} />
          {fotografYukleniyor ? (
            <View style={styles.avatar}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : kullanici.profilFoto ? (
            <Image source={{ uri: kullanici.profilFoto }} style={styles.avatarFoto} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarYazi}>{kullanici.kullaniciAdi?.[0]?.toUpperCase() || '?'}</Text>
            </View>
          )}
          {benimProfil ? (
            <View style={styles.kameraIkon}>
              <Text style={styles.kameraYazi}>Kamera</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        {benimProfil ? (
          <TouchableOpacity style={styles.fotografDegistirButon} onPress={fotografSec} disabled={fotografYukleniyor}>
            <Text style={styles.fotografDegistirYazi}>{fotografYukleniyor ? 'Yükleniyor...' : 'Fotoğrafı Değiştir'}</Text>
          </TouchableOpacity>
        ) : null}

        {kullanici.proAktif ? (
          <Animated.Text
            style={[
              styles.proIsimYaziSade,
              {
                transform: [{ scale: proCanliAnim.interpolate({ inputRange: [1, 1.05], outputRange: [1, 1.02] }) }],
                opacity: proCanliAnim.interpolate({ inputRange: [1, 1.05], outputRange: [0.88, 1] }),
              },
            ]}>
            @{kullanici.kullaniciAdi}
          </Animated.Text>
        ) : (
          <Text style={styles.kullaniciAdi}>@{kullanici.kullaniciAdi}</Text>
        )}
        <Text style={styles.rozet}>{rozetHesapla(kullanici.yildiz || 0, !!kullanici.proAktif)} Seviyesi</Text>
        <View style={styles.istatistikSatiri}>
          <View style={styles.istatistikChip}>
            <MaterialCommunityIcons name="star" size={15} color="#f59e0b" />
            <Text style={styles.istatistikYazi}>{kullanici.yildiz || 0} altın</Text>
          </View>
          <View style={styles.istatistikChip}>
            <MaterialCommunityIcons name="account-group-outline" size={15} color="#0ea5e9" />
            <Text style={styles.istatistikYazi}>{arkadasSayisi} arkadaş</Text>
          </View>
        </View>

        {kullanici.biyografi ? <Text style={styles.biyografiMetni}>{kullanici.biyografi}</Text> : null}
        {benimProfil ? <Text style={styles.benimProfilYazi}>Bu senin profilin</Text> : null}

        {benimProfil ? (
          <View style={styles.biyografiKutu}>
            <TextInput
              style={styles.biyografiInput}
              placeholder="Biyografin"
              value={biyografiMetni}
              onChangeText={setBiyografiMetni}
              multiline
              maxLength={220}
            />
            <TouchableOpacity
              style={[styles.biyografiKaydetButon, (!biyografiDegisti || biyografiKaydediliyor) && styles.biyografiKaydetButonPasif]}
              onPress={biyografiKaydet}
              disabled={!biyografiDegisti || biyografiKaydediliyor}>
              <Text style={styles.biyografiKaydetYazi}>
                {biyografiKaydediliyor ? 'Kaydediliyor...' : biyografiDegisti ? 'Biyografiyi Kaydet' : 'Biyografiyi Düzenle'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {benimProfil && gelenIstekler.length > 0 ? (
          <View style={styles.istekKutu}>
            <Text style={styles.istekBaslik}>Gelen Arkadaşlık İstekleri</Text>
            {gelenIstekler.map((istek) => (
              <View key={istek.id} style={styles.istekSatir}>
                <Text style={styles.istekYazi}>@{istek.gonderenKullaniciAdi || 'Gizli Üye'}</Text>
                <View style={styles.istekButonSatir}>
                  <TouchableOpacity style={styles.kabulButon} onPress={() => istegiKabulEt(istek)} disabled={istekIsleniyor}>
                    <Text style={styles.istekButonYazi}>Kabul</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.redButon} onPress={() => istegiReddet(istek)} disabled={istekIsleniyor}>
                    <Text style={styles.istekButonYazi}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {benimProfil && arkadaslarDetay.length > 0 ? (
          <View style={styles.arkadaslarKutu}>
            <Text style={styles.istekBaslik}>Arkadaşların</Text>
            {arkadaslarDetay.map((a) => (
              <Text key={a.id} style={styles.arkadasYazi}>• @{a.kullaniciAdi}</Text>
            ))}
          </View>
        ) : null}

        {benimProfil ? (
          <>
            <View style={styles.videoOdulKart}>
              {odulKutlamaGoster ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.videoOdulKutlama,
                    {
                      opacity: odulAnim,
                      transform: [
                        { translateY: odulAnim.interpolate({ inputRange: [0, 1], outputRange: [10, -6] }) },
                        { scale: odulAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.02] }) },
                      ],
                    },
                  ]}>
                  <MaterialCommunityIcons name="star-four-points" size={15} color="#ca8a04" />
                  <Text style={styles.videoOdulKutlamaYazi}>+25 altın eklendi</Text>
                </Animated.View>
              ) : null}
              <View style={styles.kaynakBaslikSatiri}>
                <MaterialCommunityIcons name="play-circle-outline" size={17} color="#7c3aed" />
                <Text style={styles.videoOdulBaslik}>Video İzle, 25 Yıldız Kazan</Text>
              </View>
              <Text style={styles.videoOdulAlt}>Ödül sadece video tamamlandığında verilir.</Text>
              <TouchableOpacity style={[styles.videoOdulButon, videoOdulYukleniyor && styles.butonPasif]} onPress={videoIzleyipYildizKazan} disabled={videoOdulYukleniyor}>
                <Text style={styles.videoOdulButonYazi}>{videoOdulYukleniyor ? 'Video yükleniyor...' : 'Video İzle +25 Yıldız'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.proFirsatKutu}>
            {proKutlamaGoster ? (
              <Animated.View pointerEvents="none" style={[styles.proPatlamaKatman, { opacity: proPatlamaAnim }]}>
                <Animated.View
                  style={[
                    styles.proPatlamaParca,
                    styles.proPatlamaBir,
                    {
                      transform: [
                        { translateX: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -52] }) },
                        { translateY: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -44] }) },
                        { scale: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) },
                      ],
                    },
                  ]}>
                  <MaterialCommunityIcons name="star-four-points" size={20} color="#facc15" />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.proPatlamaParca,
                    styles.proPatlamaIki,
                    {
                      transform: [
                        { translateX: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 56] }) },
                        { translateY: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
                        { scale: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) },
                      ],
                    },
                  ]}>
                  <MaterialCommunityIcons name="star-four-points" size={16} color="#fde68a" />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.proPatlamaParca,
                    styles.proPatlamaUc,
                    {
                      transform: [
                        { translateX: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -42] }) },
                        { translateY: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) },
                        { scale: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] }) },
                      ],
                    },
                  ]}>
                  <MaterialCommunityIcons name="star-four-points" size={14} color="#fbbf24" />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.proPatlamaParca,
                    styles.proPatlamaDort,
                    {
                      transform: [
                        { translateX: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 44] }) },
                        { translateY: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
                        { scale: proPatlamaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] }) },
                      ],
                    },
                  ]}>
                  <MaterialCommunityIcons name="star-four-points" size={18} color="#fde047" />
                </Animated.View>
              </Animated.View>
            ) : null}
            <View style={styles.proKartArkaEfekt} />
            <Animated.View style={[styles.proParlakSerit, { transform: [{ translateX: proParlakAnim }, { rotate: '-18deg' }] }]} />
            <View style={styles.proFirsatUst}>
              <MaterialCommunityIcons name="crown" size={20} color="#ca8a04" />
              <Text style={styles.proFirsatBaslik}>Tüm Fırsatlar</Text>
            </View>
            {PRO_AVANTAJLAR.map((avantaj) => (
              <View key={avantaj} style={styles.proAvantajSatiri}>
                <View style={styles.proAvantajIkonKutu}>
                  <MaterialCommunityIcons name="check-decagram" size={14} color="#166534" />
                </View>
                <Text style={styles.proAvantajYazi}>{avantaj}</Text>
              </View>
            ))}
            {!kullanici.proAktif ? (
              <TouchableOpacity style={[styles.proButon, proIslemde && styles.butonPasif]} onPress={proyaGec} disabled={proIslemde}>
                <Text style={styles.proButonYazi}>{proIslemde ? 'İşleniyor...' : 'Pro Üyeliğe Geç'}</Text>
              </TouchableOpacity>
            ) : (
              <Animated.View style={[styles.proAktifKutu, { transform: [{ scale: proCanliAnim }] }]}>
                <View style={styles.proCanliSatir}>
                  <View style={styles.proCanliNokta} />
                  <Text style={styles.proCanliYazi}>Canlı</Text>
                </View>
                <Text style={styles.proAktifYazi}>Altın Rozetli PRO Aktif</Text>
                {kullanici.proPaketEtiket ? <Text style={styles.proPaketYazi}>{kullanici.proPaketEtiket}</Text> : null}
              </Animated.View>
            )}
            </View>
          </>
        ) : null}

        {!benimProfil ? (
          <>
            {arkadasDurumu === 'yok' ? (
              <TouchableOpacity style={styles.arkadasEkleButon} onPress={arkadaslikIstegiGonder} disabled={istekIsleniyor}>
                <Text style={styles.arkadasEkleYazi}>{istekIsleniyor ? 'Gönderiliyor...' : 'Arkadaş Ekle'}</Text>
              </TouchableOpacity>
            ) : arkadasDurumu === 'beklemede' ? (
              <View style={styles.beklemedeKutu}>
                <Text style={styles.beklemedeYazi}>Arkadaşlık isteği gönderildi</Text>
              </View>
            ) : (
              <View style={styles.arkadasKutu}>
                <Text style={styles.arkadasYazi}>Bu kullanıcıyla arkadaşsınız</Text>
              </View>
            )}

            {zatenYildizVerdi ? (
              <View style={styles.verildiKutu}>
                <Text style={styles.verildiYazi}>Bu kullanıcıya zaten yıldız verdin</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.yildizButon} onPress={() => setYildizModal(true)}>
                <Text style={styles.yildizButonYazi}>Yıldız Ver</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </View>
      </ScrollView>

      <Modal visible={yildizModal} transparent animationType="slide">
        <View style={styles.modalArka}>
          <View style={styles.modal}>
            <Text style={styles.modalBaslik}>@{kullanici.kullaniciAdi} için yıldız seç</Text>
            <Text style={styles.modalAlt}>Bu kullanıcı ne kadar yardımcı oldu?</Text>
            {[1, 2, 3, 4, 5].map((y) => (
              <TouchableOpacity key={y} style={styles.yildizSatir} onPress={() => yildizVer(y)}>
                <Text style={styles.yildizEmoji}>{'★'.repeat(y)}</Text>
                <Text style={styles.yildizLabel}>{y} yıldız</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.iptalButon} onPress={() => setYildizModal(false)}>
              <Text style={styles.iptalYazi}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={fotografOnayModalAcik} transparent animationType="fade" onRequestClose={() => setFotografOnayModalAcik(false)}>
        <View style={styles.modalArka}>
          <View style={styles.modal}>
            <Text style={styles.modalBaslik}>Profil Fotoğrafı Önizleme</Text>
            <Text style={styles.modalAlt}>Fotoğrafı kontrol et, sonra kaydet.</Text>
            {seciliProfilFotograf?.uri ? (
              <Image source={{ uri: String(seciliProfilFotograf.uri) }} style={styles.fotoOnizleme} />
            ) : null}
            <View style={styles.fotoOnizlemeButonSatiri}>
              <TouchableOpacity style={styles.fotoOnizlemeIptal} onPress={() => setFotografOnayModalAcik(false)}>
                <Text style={styles.fotoOnizlemeIptalYazi}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fotoOnizlemeKaydet, fotografYukleniyor && styles.butonPasif]}
                disabled={fotografYukleniyor}
                onPress={async () => {
                  if (!seciliProfilFotograf) return;
                  setFotografOnayModalAcik(false);
                  await fotografYukle(seciliProfilFotograf);
                  setSeciliProfilFotograf(null);
                }}>
                <Text style={styles.fotoOnizlemeKaydetYazi}>{fotografYukleniyor ? 'Yükleniyor...' : 'Fotoğrafı Kullan'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={ayarModalAcik} transparent animationType="fade" onRequestClose={() => setAyarModalAcik(false)}>
        <TouchableOpacity style={styles.modalArka} activeOpacity={1} onPress={() => setAyarModalAcik(false)}>
          <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.modalBaslik}>Ayarlar</Text>
            <TouchableOpacity
              style={[styles.geriYukleButon, proIslemde && styles.butonPasif]}
              onPress={satinAlimlariGeriYukleVeEsitle}
              disabled={proIslemde}>
              <Text style={styles.geriYukleYazi}>Satın Alımları Geri Yükle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cikisButon} onPress={cikisYap}>
              <Text style={styles.cikisButonYazi}>Hesaptan Çık</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iptalButon} onPress={() => setAyarModalAcik(false)}>
              <Text style={styles.iptalYazi}>Kapat</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={proModalAcik} transparent animationType="slide" onRequestClose={() => setProModalAcik(false)}>
        <View style={styles.modalArka}>
          <View style={styles.modal}>
            <Text style={styles.modalBaslik}>Pro Üyelik Paketleri</Text>
            <Text style={styles.modalAlt}>Reklamsız kullanım, +200 altın, sınırsız konu açma, sınırsız arkadaş, Altın Efsane rozet ve Efsane unvanı kazan.</Text>
            {PRO_PAKETLER.map((paket) => (
              <TouchableOpacity
                key={paket.id}
                style={[styles.proPaketButon, proIslemde && styles.butonPasif]}
                onPress={() => proAktifEt(paket)}
                disabled={proIslemde}>
                <Text style={styles.proPaketButonYazi}>{paket.etiket}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.iptalButon} onPress={() => setProModalAcik(false)}>
              <Text style={styles.iptalYazi}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  yukleniyor: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  arkaPlanKatman: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  arkaBalonBir: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(244,114,182,0.12)',
    top: -90,
    right: -80,
  },
  arkaBalonIki: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(14,165,233,0.12)',
    bottom: -80,
    left: -70,
  },
  scrollIcerik: { paddingBottom: 24 },
  geriButon: { padding: 16, marginTop: 40 },
  geriYazi: { fontSize: 16, color: '#1d4ed8', fontWeight: '700' },
  profilKart: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  profilKartParlama: {
    position: 'absolute',
    top: -70,
    width: 220,
    height: 130,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.18)',
  },
  ayarIkonButon: { position: 'absolute', right: 14, top: 14, zIndex: 5, padding: 8, borderRadius: 999, backgroundColor: '#eef2ff' },
  avatarKutu: { position: 'relative', marginBottom: 12 },
  avatarHalo: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(79,70,229,0.15)',
    alignSelf: 'center',
    top: -9,
    left: -9,
  },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  avatarFoto: { width: 90, height: 90, borderRadius: 45 },
  avatarYazi: { fontSize: 36, color: '#fff', fontWeight: 'bold' },
  kameraIkon: { position: 'absolute', bottom: -2, right: -4, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4, borderWidth: 1, borderColor: '#dbeafe' },
  kameraYazi: { fontSize: 11, color: '#1d4ed8', fontWeight: '700' },
  fotografDegistirButon: { marginBottom: 10, backgroundColor: '#e0e7ff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  fotografDegistirYazi: { color: '#3730a3', fontWeight: '800' },
  kullaniciAdi: { fontSize: 24, fontWeight: '900', marginBottom: 6, color: '#0f172a' },
  proIsimCerceve: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: '#3a2207',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
    shadowColor: '#92400e',
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  proIsimSolIsik: {
    position: 'absolute',
    left: -20,
    top: -10,
    width: 72,
    height: 34,
    borderRadius: 30,
    backgroundColor: 'rgba(251,191,36,0.22)',
  },
  proIsimSagIsik: {
    position: 'absolute',
    right: -26,
    bottom: -10,
    width: 80,
    height: 34,
    borderRadius: 30,
    backgroundColor: 'rgba(245,158,11,0.22)',
  },
  proIsimParlakSerit: {
    position: 'absolute',
    top: -14,
    width: 32,
    height: 70,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  proIsimYazi: { fontSize: 20, fontWeight: '900', color: '#fde68a' },
  proIsimYaziSade: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
    color: '#fbbf24',
    textShadowColor: '#fef3c7',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  fotoOnizleme: { width: '100%', height: 220, borderRadius: 12, marginBottom: 12 },
  fotoOnizlemeButonSatiri: { flexDirection: 'row', gap: 8 },
  fotoOnizlemeIptal: { flex: 1, backgroundColor: '#e5e7eb', paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  fotoOnizlemeIptalYazi: { color: '#374151', fontWeight: '800' },
  fotoOnizlemeKaydet: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  fotoOnizlemeKaydetYazi: { color: '#fff', fontWeight: '800' },
  rozet: { fontSize: 13, marginBottom: 10, color: '#7c2d12', fontWeight: '800', backgroundColor: '#ffedd5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  istatistikSatiri: { width: '100%', flexDirection: 'row', gap: 8, marginBottom: 8 },
  istatistikChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 10,
  },
  istatistikYazi: { color: '#334155', fontWeight: '700', fontSize: 13 },
  biyografiMetni: { color: '#4b5563', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 8, lineHeight: 20 },
  benimProfilYazi: { color: '#1d4ed8', fontWeight: '700', marginBottom: 8 },
  biyografiKutu: { width: '100%', marginTop: 4, marginBottom: 10 },
  biyografiInput: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#e5e7eb' },
  biyografiKaydetButon: { marginTop: 8, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  biyografiKaydetButonPasif: { opacity: 0.7 },
  biyografiKaydetYazi: { color: '#fff', fontWeight: '800' },
  arkadasEkleButon: { marginTop: 12, backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 11, borderRadius: 12 },
  arkadasEkleYazi: { color: '#fff', fontWeight: '700' },
  beklemedeKutu: { marginTop: 12, backgroundColor: '#fef3c7', padding: 12, borderRadius: 12 },
  beklemedeYazi: { color: '#92400e', fontWeight: '700' },
  arkadasKutu: { marginTop: 12, backgroundColor: '#ecfdf5', padding: 12, borderRadius: 12 },
  arkadasYazi: { color: '#047857', fontWeight: '600' },
  istekKutu: { width: '100%', marginTop: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10 },
  arkadaslarKutu: { width: '100%', marginTop: 10, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 10 },
  kaynakBaslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  videoOdulKart: {
    width: '100%',
    marginTop: 10,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
  },
  videoOdulKutlama: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  videoOdulKutlamaYazi: { color: '#92400e', fontWeight: '800', fontSize: 12 },
  videoOdulBaslik: { color: '#5b21b6', fontWeight: '800' },
  videoOdulAlt: { color: '#6d28d9', fontSize: 12, marginTop: 3, marginBottom: 8 },
  videoOdulButon: { backgroundColor: '#7c3aed', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  videoOdulButonYazi: { color: '#fff', fontWeight: '800' },
  proFirsatKutu: {
    width: '100%',
    marginTop: 12,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 18,
    padding: 14,
    overflow: 'hidden',
  },
  proPatlamaKatman: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
  },
  proPatlamaParca: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -8,
    marginTop: -8,
  },
  proPatlamaBir: {},
  proPatlamaIki: {},
  proPatlamaUc: {},
  proPatlamaDort: {},
  proKartArkaEfekt: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(234,179,8,0.15)',
  },
  proParlakSerit: {
    position: 'absolute',
    top: -12,
    width: 56,
    height: 220,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  proFirsatUst: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  proFirsatBaslik: { fontSize: 18, fontWeight: '900', color: '#fef3c7' },
  proAvantajSatiri: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  proAvantajIkonKutu: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proAvantajYazi: { color: '#e5e7eb', fontWeight: '700' },
  istekBaslik: { fontWeight: '700', color: '#111827', marginBottom: 8 },
  istekSatir: { borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, marginTop: 8 },
  istekYazi: { color: '#111827', marginBottom: 8, fontWeight: '600' },
  istekButonSatir: { flexDirection: 'row', gap: 8 },
  kabulButon: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  redButon: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  istekButonYazi: { color: '#fff', fontWeight: '700' },
  proButon: { backgroundColor: '#f59e0b', paddingVertical: 11, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 6 },
  proButonYazi: { color: '#111827', fontWeight: '900' },
  butonPasif: { opacity: 0.65 },
  proAktifKutu: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#f59e0b', paddingVertical: 11, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 6 },
  proCanliSatir: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  proCanliNokta: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#22c55e' },
  proCanliYazi: { color: '#86efac', fontSize: 12, fontWeight: '800' },
  proAktifYazi: { color: '#fef3c7', fontWeight: '800' },
  proPaketYazi: { color: '#fde68a', marginTop: 4, fontWeight: '700' },
  proPaketButon: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8, alignItems: 'center' },
  proPaketButonYazi: { color: '#1e293b', fontWeight: '800' },
  geriYukleButon: { backgroundColor: '#111827', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  geriYukleYazi: { color: '#fff', fontWeight: '700' },
  cikisButon: { backgroundColor: '#dc2626', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  cikisButonYazi: { color: '#fff', fontWeight: '700' },
  yildizButon: { marginTop: 16, backgroundColor: '#4f46e5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  yildizButonYazi: { color: '#fff', fontWeight: '600', fontSize: 15 },
  verildiKutu: { marginTop: 16, backgroundColor: '#f0fdf4', padding: 12, borderRadius: 12 },
  verildiYazi: { color: '#16a34a', fontWeight: '600', fontSize: 14 },
  modalArka: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalBaslik: { fontSize: 18, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  modalAlt: { fontSize: 13, color: '#888', marginBottom: 16, textAlign: 'center' },
  yildizSatir: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f5f5f5', borderRadius: 12, marginBottom: 8 },
  yildizEmoji: { fontSize: 18, marginRight: 10 },
  yildizLabel: { fontSize: 14, color: '#555' },
  iptalButon: { padding: 14, alignItems: 'center', marginTop: 4 },
  iptalYazi: { color: '#888', fontSize: 15 },
});

