import { auth, db } from '@/firebaseConfig';
import { bildirimGonder } from '@/utils/bildirim';
import { metinPaylasimOnKontrol, paylasimBasariliKaydet } from '@/utils/otomatik-moderasyon';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import ProfilSayfasi from './profil';
import { cloudinaryGorselUrlOptimizasyonu } from '@/utils/gorsel';

type RaporModal = {
  tur: 'konu' | 'yanit';
  hedefId: string;
  konuId: string;
  hedefSahibiId?: string;
  hedefMetin: string;
  hedefFoto?: string;
};

const RAPOR_NEDENLER = ['Spam', 'Hakaret', 'Yanlış bilgi', 'Uygunsuz içerik'];
const GUNLUK_RAPOR_LIMITI = 5;
const bugunAnahtar = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
};
const cinsiyetNormalizeEt = (cinsiyet: any): 'kadin' | 'erkek' | 'belirtmek_istemiyorum' => {
  const temiz = String(cinsiyet || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (temiz === 'erkek') return 'erkek';
  if (temiz === 'kadin' || temiz === 'kadın') return 'kadin';
  return 'belirtmek_istemiyorum';
};
const yazarRenk = (cinsiyet: any) => {
  const norm = cinsiyetNormalizeEt(cinsiyet);
  if (norm === 'erkek') return '#2563EB';
  if (norm === 'kadin') return '#ec4899';
  return '#6b7280';
};
const cinsiyetIconAdi = (cinsiyet: any) => (cinsiyetNormalizeEt(cinsiyet) === 'erkek' ? 'gender-male' : 'gender-female');
const rozetBilgisi = (yildiz: number, proAktif?: boolean) => {
  if (proAktif) return { etiket: '5', unvan: 'Efsane', dis: '#facc15', orta: '#ca8a04', ic: '#854d0e', yazi: '#fff8e1', golge: '#78350f' };
  if (yildiz >= 1500) return { etiket: '5', unvan: 'Efsane', dis: '#facc15', orta: '#ca8a04', ic: '#854d0e', yazi: '#fff8e1', golge: '#78350f' };
  if (yildiz >= 900) return { etiket: '4', unvan: 'Anne', dis: '#ef4444', orta: '#b91c1c', ic: '#7f1d1d', yazi: '#ffe4e6', golge: '#7f1d1d' };
  if (yildiz >= 500) return { etiket: '3', unvan: 'Anne Yarısı', dis: '#f59e0b', orta: '#b45309', ic: '#78350f', yazi: '#fff7ed', golge: '#78350f' };
  if (yildiz >= 350) return { etiket: '2', unvan: 'Abla', dis: '#22c55e', orta: '#15803d', ic: '#166534', yazi: '#ecfdf5', golge: '#14532d' };
  return null;
};

const firebaseHataMesaji = (hata: any) => {
  const kod = hata?.code || '';
  if (kod === 'permission-denied') {
    return 'Bu işlem izin nedeniyle engellendi. Hesabında aktif kısıt olabilir.';
  }
  if (kod === 'unauthenticated') return 'Oturum bulunamadı. Lütfen tekrar giriş yap.';
  if (kod === 'unavailable') return 'Ağ bağlantısı sorunu var. İnterneti kontrol et.';
  return hata?.message || 'Bilinmeyen bir hata oluştu.';
};

export default function KonuDetay({
  konu,
  geriDon,
}: {
  konu: any;
  geriDon: () => void;
}) {
  const [yanitlar, setYanitlar] = useState<any[]>([]);
  const [yanitMetni, setYanitMetni] = useState('');
  const [seciliProfil, setSeciliProfil] = useState<string | null>(null);
  const [yildizModal, setYildizModal] = useState<any>(null);
  const [raporModal, setRaporModal] = useState<RaporModal | null>(null);
  const [konuYazarId, setKonuYazarId] = useState<string>(String(konu.yazarId || ''));
  const [konuYazarCinsiyet, setKonuYazarCinsiyet] = useState(cinsiyetNormalizeEt(konu.yazarCinsiyet));
  const [konuYazarYildiz, setKonuYazarYildiz] = useState(Number(konu.yazarYildiz || 0));
  const [konuYazarProAktif, setKonuYazarProAktif] = useState(!!konu.yazarProAktif);
  const [konuBegeniSayisi, setKonuBegeniSayisi] = useState(0);
  const [konuBegendim, setKonuBegendim] = useState(false);
  const [yanitBegeniSayilari, setYanitBegeniSayilari] = useState<Record<string, number>>({});
  const [yanitBegendim, setYanitBegendim] = useState<Record<string, boolean>>({});
  const rozetAnim = useRef(new Animated.Value(0)).current;
  const moderatorIcerik = !!konu.modDuyurusu;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(rozetAnim, { toValue: 1, duration: 950, useNativeDriver: true }),
        Animated.timing(rozetAnim, { toValue: 0, duration: 950, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [rozetAnim]);

  const benKonuSahibiyim = auth.currentUser?.email === konu.yazar;
  const konuGizli = !!konu.gizlendi;
  const konuYazarGorunumu =
    konu.yazarKullaniciAdi
      ? `@${konu.yazarKullaniciAdi}`
      : konuYazarId === auth.currentUser?.uid
        ? '@Sen'
        : '@Gizli Üye';

  const yanitleriGetir = async () => {
    const q = query(collection(db, 'konular', konu.id, 'yanitlar'), orderBy('tarih', 'asc'), limit(120));
    const snapshot = await getDocs(q);
    const kullaniciById = new Map<string, any>();
    const yazarIdleri = Array.from(
      new Set(
        snapshot.docs
          .map((d) => String(((d.data() as any).yazarId || '')).trim())
          .filter(Boolean)
      )
    );
    const yazarDoclari = await Promise.all(yazarIdleri.map((id) => getDoc(doc(db, 'kullanicilar', id))));
    yazarDoclari.forEach((k) => {
      if (!k.exists()) return;
      kullaniciById.set(k.id, { id: k.id, ...(k.data() as any) });
    });

    const liste = snapshot.docs.map((d) => {
      const data = { id: d.id, ...d.data() } as any;
      const iddenKullanici = data.yazarId ? kullaniciById.get(String(data.yazarId)) : null;
      const kullanici = iddenKullanici || null;
      data.yazarId = data.yazarId || kullanici?.id || null;
      const kendiYorumuMu = !!data.yazarId && data.yazarId === auth.currentUser?.uid;
      data.yazarAdi = kullanici?.kullaniciAdi || data.yazarAdi || (kendiYorumuMu ? 'Sen' : 'Gizli Üye');
      data.yazarCinsiyet = cinsiyetNormalizeEt(kullanici?.cinsiyet || data.yazarCinsiyet);
      data.yazarYildiz = Number(kullanici?.yildiz || data.yazarYildiz || 0);
      data.yazarProAktif = !!(kullanici?.proAktif || data.yazarProAktif);
      const verenler = kullanici?.yildizVerenler || [];
      data.zatenYildizVerdi = verenler.includes(auth.currentUser?.uid);
      return data;
    });

    const konuYazarBulunanId = String(konu.yazarId || '').trim();
    if (konuYazarBulunanId) {
      setKonuYazarId(konuYazarBulunanId);
      const konuYazar = kullaniciById.get(konuYazarBulunanId);
      if (konuYazar) {
        setKonuYazarCinsiyet(cinsiyetNormalizeEt(konuYazar.cinsiyet));
        setKonuYazarYildiz(Number(konuYazar.yildiz || 0));
        setKonuYazarProAktif(!!konuYazar.proAktif);
      }
    }

    setYanitlar(liste);
    await etkilesimBilgileriniGetir(liste);
  };

  const etkilesimBilgileriniGetir = async (liste: any[]) => {
    const uid = auth.currentUser?.uid || '';
    setKonuBegeniSayisi(Number(konu.begeniSayisi || 0));
    if (uid) {
      const konuBegeniDoc = await getDoc(doc(db, 'konular', konu.id, 'begeniler', uid));
      setKonuBegendim(!!konuBegeniDoc.exists());
    } else {
      setKonuBegendim(false);
    }

    const sayilar: Record<string, number> = {};
    const begeniler: Record<string, boolean> = {};
    liste.forEach((yanit) => {
      const yanitId = String(yanit.id || '');
      if (!yanitId) return;
      sayilar[yanitId] = Number(yanit.begeniSayisi || 0);
      begeniler[yanitId] = false;
    });

    if (uid) {
    await Promise.all(
      liste.map(async (yanit) => {
        const yanitId = String(yanit.id || '');
        if (!yanitId) return;
        const uidDoc = await getDoc(doc(db, 'konular', konu.id, 'yanitlar', yanitId, 'begeniler', uid));
        begeniler[yanitId] = !!uidDoc.exists();
      })
    );
    }
    setYanitBegeniSayilari(sayilar);
    setYanitBegendim(begeniler);
  };

  const konuBegeniToggle = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const onceBegendim = konuBegendim;
    const onceSayi = konuBegeniSayisi;
    const hedefBegendim = !onceBegendim;
    const hedefSayi = hedefBegendim ? onceSayi + 1 : Math.max(0, onceSayi - 1);
    setKonuBegendim(hedefBegendim);
    setKonuBegeniSayisi(hedefSayi);

    const begeniRef = doc(db, 'konular', konu.id, 'begeniler', uid);
    const konuRef = doc(db, 'konular', konu.id);
    try {
      const batch = writeBatch(db);
      if (hedefBegendim) {
        batch.set(begeniRef, { uid, tarih: new Date() });
        batch.update(konuRef, { begeniSayisi: increment(1) });
      } else {
        batch.delete(begeniRef);
        batch.update(konuRef, { begeniSayisi: increment(-1) });
      }
      await batch.commit();
    } catch (hata: any) {
      setKonuBegendim(onceBegendim);
      setKonuBegeniSayisi(onceSayi);
      if (hata?.code === 'permission-denied') {
        Alert.alert('Uyarı', 'Beğeni izni şu an kapalı.');
      }
    }
  };

  const yanitBegeniToggle = async (yanitId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const onceBegendim = !!yanitBegendim[yanitId];
    const onceSayi = Number(yanitBegeniSayilari[yanitId] || 0);
    const hedefBegendim = !onceBegendim;
    const hedefSayi = hedefBegendim ? onceSayi + 1 : Math.max(0, onceSayi - 1);
    setYanitBegendim((s) => ({ ...s, [yanitId]: hedefBegendim }));
    setYanitBegeniSayilari((s) => ({ ...s, [yanitId]: hedefSayi }));

    const begeniRef = doc(db, 'konular', konu.id, 'yanitlar', yanitId, 'begeniler', uid);
    const yanitRef = doc(db, 'konular', konu.id, 'yanitlar', yanitId);
    try {
      const batch = writeBatch(db);
      if (hedefBegendim) {
        batch.set(begeniRef, { uid, tarih: new Date() });
        batch.update(yanitRef, { begeniSayisi: increment(1) });
      } else {
        batch.delete(begeniRef);
        batch.update(yanitRef, { begeniSayisi: increment(-1) });
      }
      await batch.commit();
    } catch (hata: any) {
      setYanitBegendim((s) => ({ ...s, [yanitId]: onceBegendim }));
      setYanitBegeniSayilari((s) => ({ ...s, [yanitId]: onceSayi }));
      if (hata?.code === 'permission-denied') {
        Alert.alert('Uyarı', 'Beğeni izni şu an kapalı.');
      }
    }
  };

  useEffect(() => {
    yanitleriGetir();
  }, []);

  const geriEylemi = useCallback(() => {
    if (raporModal) {
      setRaporModal(null);
      return true;
    }
    if (yildizModal) {
      setYildizModal(null);
      return true;
    }
    if (seciliProfil) {
      setSeciliProfil(null);
      yanitleriGetir().catch(() => {});
      return true;
    }
    geriDon();
    return true;
  }, [geriDon, raporModal, seciliProfil, yildizModal]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const abonelik = BackHandler.addEventListener('hardwareBackPress', geriEylemi);
    return () => abonelik.remove();
  }, [geriEylemi]);

  const geriKaydirma = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.moveX < 28 && gesture.dx > 16 && Math.abs(gesture.dy) < 18,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.moveX < 42 && gesture.dx > 82 && Math.abs(gesture.dy) < 90) {
            geriEylemi();
          }
        },
      }),
    [geriEylemi]
  );

  const raporla = async (neden: string) => {
    if (!raporModal || !auth.currentUser?.uid) return;

    try {
      const uid = auth.currentUser.uid;
      const kullaniciRef = doc(db, 'kullanicilar', uid);
      const hedefAnahtar = `${raporModal.tur}_${raporModal.konuId}_${raporModal.hedefId}`;
      const raporRef = doc(db, 'raporlar', hedefAnahtar);
      const bugun = bugunAnahtar();

      await runTransaction(db, async (tx) => {
        const varOlanRapor = await tx.get(raporRef);
        if (varOlanRapor.exists()) {
          const e = new Error('ICERIK_ZATEN_RAPORLU');
          (e as any).code = 'already-reported';
          throw e;
        }

        const kullaniciSnap = await tx.get(kullaniciRef);
        const data = (kullaniciSnap.data() || {}) as any;
        const raporLimit = data.raporLimit || {};
        const bugunkuSayi = raporLimit.tarih === bugun ? Number(raporLimit.sayi || 0) : 0;

        if (bugunkuSayi >= GUNLUK_RAPOR_LIMITI) {
          const e = new Error('GUNLUK_RAPOR_LIMITI_DOLDU');
          (e as any).code = 'report-limit';
          throw e;
        }

        tx.set(raporRef, {
          tur: raporModal.tur,
          hedefId: raporModal.hedefId,
          konuId: raporModal.konuId,
          hedefSahibiId: raporModal.hedefSahibiId || '',
          hedefMetin: raporModal.hedefMetin,
          hedefFoto: raporModal.hedefFoto || '',
          neden,
          raporlayanId: uid,
          raporlayanEmail: auth.currentUser?.email || '',
          durum: 'acik',
          tarih: new Date(),
        });

        tx.set(
          kullaniciRef,
          {
            raporLimit: {
              tarih: bugun,
              sayi: bugunkuSayi + 1,
              updatedAt: new Date(),
            },
          },
          { merge: true }
        );
      });

      setRaporModal(null);
      Alert.alert('Teşekkürler', 'Raporun alındı. Moderasyon inceleyecek.');
    } catch (hata: any) {
      if (hata?.code === 'already-reported' || hata?.message === 'ICERIK_ZATEN_RAPORLU') {
        Alert.alert('Bilgi', 'Bu içerik zaten raporlandı.');
        setRaporModal(null);
        return;
      }
      if (hata?.code === 'report-limit' || hata?.message === 'GUNLUK_RAPOR_LIMITI_DOLDU') {
        Alert.alert('Uyarı', `Günlük rapor limitine ulaştın (${GUNLUK_RAPOR_LIMITI}). Yarın tekrar rapor gönderebilirsin.`);
        return;
      }
      if (hata?.code === 'permission-denied') {
        Alert.alert('Hata', 'Rapor gönderme izni şu an kapalı görünüyor. Oturumu yenileyip tekrar dene.');
      } else {
        Alert.alert('Hata', hata.message || 'Rapor gönderilemedi.');
      }
    }
  };

  const yanitYaz = async () => {
    if (konuGizli) {
      Alert.alert('Uyarı', 'Bu konu moderasyon nedeniyle gizlendi.');
      return;
    }

    if (!yanitMetni.trim()) {
      Alert.alert('Hata', 'Yanıt boş olamaz!');
      return;
    }

    const kullanici = auth.currentUser;
    if (!kullanici?.uid) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }

    const metinKontrol = await metinPaylasimOnKontrol(kullanici.uid, yanitMetni, false);
    if (!metinKontrol.izin) {
      Alert.alert('Uyarı', metinKontrol.mesaj || 'Yanıt engellendi.');
      return;
    }

    try {
      const profilSnap = await getDoc(doc(db, 'kullanicilar', kullanici.uid));
      const profil = profilSnap.data() || {};
      const yeniYanit = {
        metin: yanitMetni,
        yazar: auth.currentUser?.email,
        yazarId: kullanici.uid,
        yazarAdi: String((profil as any).kullaniciAdi || ''),
        yazarCinsiyet: cinsiyetNormalizeEt((profil as any).cinsiyet),
        yazarYildiz: Number((profil as any).yildiz || 0),
        yazarProAktif: !!(profil as any).proAktif,
        tarih: new Date(),
        begeniSayisi: 0,
        gizlendi: false,
      };

      const docRef = await addDoc(collection(db, 'konular', konu.id, 'yanitlar'), yeniYanit);

      // Kullanıcı deneyimi: yanıt başarıyla yazıldıysa hemen listede göster.
      setYanitlar((onceki) => [...onceki, { id: docRef.id, ...yeniYanit }]);
      setYanitMetni('');
      Keyboard.dismiss();

      // Aşağıdaki işlemler kritik değil; biri hata verse bile yanıt gönderimi başarılı kabul edilir.
      try {
        await updateDoc(doc(db, 'konular', konu.id), {
          yanitSayisi: increment(1),
        });
      } catch (hata) {
        console.log('yanitSayisi guncellenemedi:', hata);
      }

      try {
        const hedefYazarId = String(konu.yazarId || konuYazarId || '');
        if (hedefYazarId) {
          await bildirimGonder({
            aliciId: hedefYazarId,
            tip: 'yanit',
            mesaj: 'Bir kullanıcı konuna yanıt yazdı.',
            konuId: konu.id,
          });
        }
      } catch (hata) {
        console.log('yanit bildirimi gonderilemedi:', hata);
      }

      try {
        await paylasimBasariliKaydet(
          kullanici.uid,
          metinKontrol.normalizeMetin || '',
          metinKontrol.hizliMesajSayisi || 1,
          metinKontrol.tekrarSayisi || 1
        );
      } catch (hata) {
        console.log('paylasim kaydi basarisiz:', hata);
      }

      yanitleriGetir();
    } catch (hata: any) {
      Alert.alert('Hata', firebaseHataMesaji(hata));
    }
  };

  const yildizVer = async (yildiz: number) => {
    if (!yildizModal) return;

    try {
      const kullaniciRef = doc(db, 'kullanicilar', yildizModal.yazarId);
      const kullaniciSnap = await getDoc(kullaniciRef);
      const mevcutVerenler = kullaniciSnap.data()?.yildizVerenler || [];

      if (mevcutVerenler.includes(auth.currentUser?.uid)) {
        Alert.alert('Uyarı', 'Bu kullanıcıya zaten yıldız verdin!');
        setYildizModal(null);
        yanitleriGetir();
        return;
      }

      await updateDoc(kullaniciRef, {
        yildiz: increment(yildiz),
        yildizVerenler: arrayUnion(auth.currentUser?.uid),
      });

      if (yildizModal.yazarId) {
        await bildirimGonder({
          aliciId: yildizModal.yazarId,
          tip: 'yildiz',
          mesaj: `Bir kullanıcı sana ${yildiz} yıldız verdi.`,
          konuId: konu.id,
        });
      }

      setYildizModal(null);
      Alert.alert('Teşekkürler!', `${yildiz} yıldız verdin!`);
      yanitleriGetir();
    } catch (hata: any) {
      Alert.alert('Hata', hata.message);
    }
  };

  if (seciliProfil) {
    return (
      <View style={styles.container} {...geriKaydirma.panHandlers}>
        <ProfilSayfasi
          kullaniciId={seciliProfil}
          geriDon={() => {
            setSeciliProfil(null);
            yanitleriGetir();
          }}
        />
      </View>
    );
  }
  const konuRozet = rozetBilgisi(Number(konuYazarYildiz || 0), !!konuYazarProAktif);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} {...geriKaydirma.panHandlers}>
      <TouchableOpacity onPress={geriDon} style={styles.geriButon}>
        <Text style={styles.geriYazi}>Geri</Text>
      </TouchableOpacity>

      <FlatList
        data={yanitlar}
        keyExtractor={(item) => item.id}
        removeClippedSubviews
        windowSize={6}
        maxToRenderPerBatch={8}
        initialNumToRender={6}
        updateCellsBatchingPeriod={60}
        ListHeaderComponent={
          <View style={[styles.konuKart, moderatorIcerik && styles.modKonuKart]}>
            {!benKonuSahibiyim && !konuGizli ? (
              <TouchableOpacity
                style={styles.raporKoseButon}
                onPress={() =>
                  setRaporModal({
                    tur: 'konu',
                    hedefId: konu.id,
                    konuId: konu.id,
                    hedefSahibiId: konu.yazarId,
                    hedefMetin: konu.baslik || '',
                    hedefFoto: konu.konuFoto || '',
                  })
                }>
                <Text style={styles.raporlaYazi} numberOfLines={1}>Raporla</Text>
              </TouchableOpacity>
            ) : null}
            {konu.konuFoto ? (
              <Image
                source={{ uri: cloudinaryGorselUrlOptimizasyonu(String(konu.konuFoto || ''), { width: 1280, height: 720 }) }}
                style={styles.konuFoto}
                resizeMethod="resize"
              />
            ) : null}
            {moderatorIcerik ? <Text style={styles.modEtiket}>Sistem Uyarısı</Text> : null}
              <Text style={styles.konuBaslik}>{konu.baslik}</Text>
              <Text style={styles.konuAciklama}>{konuGizli ? 'Bu konu moderasyon nedeniyle gizlendi.' : konu.aciklama}</Text>
              <View style={styles.konuAltSatir}>
              {!moderatorIcerik ? (
                <TouchableOpacity
                  style={styles.konuYazarDokun}
                  disabled={!konuYazarId}
                  onPress={() => {
                    if (konuYazarId) setSeciliProfil(konuYazarId);
                  }}>
                  <View style={styles.konuYazarSatir}>
                    <MaterialCommunityIcons
                      name={cinsiyetIconAdi(konuYazarCinsiyet)}
                      size={15}
                      color={yazarRenk(konuYazarCinsiyet)}
                    />
                    <Text style={[styles.konuAlt, { color: yazarRenk(konuYazarCinsiyet) }, moderatorIcerik && styles.modKonuAlt]}>
                      {konuYazarGorunumu}
                    </Text>
                    {konuRozet ? (
                      <Animated.View
                        style={[
                          styles.rozetEtiket,
                          {
                            shadowColor: konuRozet.golge,
                            transform: [
                              { scale: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                              { translateY: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -1.2] }) },
                            ],
                          },
                        ]}>
                        <MaterialCommunityIcons name="seal" size={31} color={konuRozet.dis} style={styles.rozetFormDis} />
                        <View style={[styles.rozetFormIcDolgu, { backgroundColor: konuRozet.ic }]} />
                        <View style={[styles.rozetFormIcHalka, { borderColor: konuRozet.yazi }]} />
                        <Animated.View
                          style={[
                            styles.rozetParlak,
                            {
                              opacity: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.78] }),
                              transform: [
                                { translateY: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
                                { translateX: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [-1, 1] }) },
                              ],
                            },
                          ]}
                        />
                        <Text style={[styles.rozetEtiketYazi, { color: konuRozet.yazi }]}>{konuRozet.etiket}</Text>
                      </Animated.View>
                    ) : null}
                    {konuRozet ? (
                      <View
                        style={[
                          styles.unvanChip,
                          konuRozet.unvan === 'Efsane'
                            ? { backgroundColor: '#d4a017', borderColor: '#eab308' }
                            : { backgroundColor: konuRozet.ic, borderColor: konuRozet.orta },
                        ]}>
                        <Text style={[styles.unvanYazi, { color: konuRozet.unvan === 'Efsane' ? '#fff8dc' : konuRozet.yazi }]}>
                          {konuRozet.unvan}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ) : null}
              <View style={styles.sagButonlar}>
                <TouchableOpacity style={styles.begeniButon} onPress={konuBegeniToggle}>
                  <MaterialCommunityIcons
                    name={konuBegendim ? 'heart' : 'heart-outline'}
                    size={14}
                    color={konuBegendim ? '#dc2626' : '#6b7280'}
                  />
                  <Text style={styles.begeniMetni}>{konuBegeniSayisi}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.yanitKart}>
            {!item.gizlendi && item.yazar !== auth.currentUser?.email ? (
              <TouchableOpacity
                style={styles.raporKoseButon}
                onPress={() =>
                  setRaporModal({
                    tur: 'yanit',
                    hedefId: item.id,
                    konuId: konu.id,
                    hedefSahibiId: item.yazarId,
                    hedefMetin: item.metin || '',
                    hedefFoto: '',
                  })
                }>
                <Text style={styles.raporlaYazi} numberOfLines={1}>Raporla</Text>
              </TouchableOpacity>
            ) : null}
            {(() => {
              const rozet = rozetBilgisi(Number(item.yazarYildiz || 0), !!item.yazarProAktif);
              return (
            <View style={styles.yanitUst}>
              <TouchableOpacity style={styles.konuYazarDokun} onPress={() => item.yazarId && setSeciliProfil(item.yazarId)}>
                <View style={styles.yanitYazarSatir}>
                  <Text style={[styles.yanitYazar, { color: yazarRenk(item.yazarCinsiyet) }]}>@{item.yazarAdi}</Text>
                  {rozet ? (
                    <Animated.View
                      style={[
                        styles.rozetEtiket,
                        {
                          shadowColor: rozet.golge,
                          transform: [
                            { scale: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
                            { translateY: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -1.2] }) },
                          ],
                        },
                      ]}>
                      <MaterialCommunityIcons name="seal" size={31} color={rozet.dis} style={styles.rozetFormDis} />
                      <View style={[styles.rozetFormIcDolgu, { backgroundColor: rozet.ic }]} />
                      <View style={[styles.rozetFormIcHalka, { borderColor: rozet.yazi }]} />
                      <Animated.View
                        style={[
                          styles.rozetParlak,
                          {
                            opacity: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.78] }),
                            transform: [
                              { translateY: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
                              { translateX: rozetAnim.interpolate({ inputRange: [0, 1], outputRange: [-1, 1] }) },
                            ],
                          },
                        ]}
                      />
                      <Text style={[styles.rozetEtiketYazi, { color: rozet.yazi }]}>{rozet.etiket}</Text>
                    </Animated.View>
                  ) : null}
                  {rozet ? (
                    <View
                      style={[
                        styles.unvanChip,
                        rozet.unvan === 'Efsane'
                          ? { backgroundColor: '#d4a017', borderColor: '#eab308' }
                          : { backgroundColor: rozet.ic, borderColor: rozet.orta },
                      ]}>
                      <Text style={[styles.unvanYazi, { color: rozet.unvan === 'Efsane' ? '#fff8dc' : rozet.yazi }]}>
                        {rozet.unvan}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={styles.sagButonlar}>
                <TouchableOpacity style={styles.begeniButon} onPress={() => yanitBegeniToggle(String(item.id))}>
                  <MaterialCommunityIcons
                    name={yanitBegendim[String(item.id)] ? 'heart' : 'heart-outline'}
                    size={14}
                    color={yanitBegendim[String(item.id)] ? '#dc2626' : '#6b7280'}
                  />
                  <Text style={styles.begeniMetni}>{yanitBegeniSayilari[String(item.id)] || 0}</Text>
                </TouchableOpacity>

                {benKonuSahibiyim &&
                  !item.gizlendi &&
                  item.yazar !== auth.currentUser?.email &&
                  (item.zatenYildizVerdi ? (
                    <Text style={styles.yildizVerildi}>Yıldız verildi</Text>
                  ) : (
                    <TouchableOpacity style={styles.yildizButon} onPress={() => setYildizModal(item)}>
                      <Text style={styles.yildizButonYazi}>Yıldız ver</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
              );
            })()}
            <Text style={styles.yanitMetni}>{item.gizlendi ? 'Bu yanıt moderasyon nedeniyle gizlendi.' : item.metin}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.bos}>Henüz yanıt yok. İlk yanıtı sen yaz!</Text>}
      />

      <View style={styles.yanitKutusu}>
        <TextInput
          style={[styles.input, konuGizli && styles.inputPasif]}
          placeholder={konuGizli ? 'Bu konu gizlendi' : 'Yanıtını yaz...'}
          value={yanitMetni}
          onChangeText={setYanitMetni}
          multiline
          returnKeyType="done"
          blurOnSubmit
          editable={!konuGizli}
        />
        <TouchableOpacity style={[styles.gonderButon, konuGizli && styles.gonderPasif]} onPress={yanitYaz} disabled={konuGizli}>
          <Text style={styles.gonderYazi}>Gönder</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!yildizModal} transparent animationType="slide">
        <View style={styles.modalArka}>
          <View style={styles.modal}>
            <Text style={styles.modalBaslik}>@{yildizModal?.yazarAdi} için yıldız seç</Text>
            <Text style={styles.modalAlt}>Bu yanıt ne kadar yardımcı oldu?</Text>
            {[1, 2, 3, 4, 5].map((y) => (
              <TouchableOpacity key={y} style={styles.yildizSatir} onPress={() => yildizVer(y)}>
                <Text style={styles.yildizEmoji}>{'★'.repeat(y)}</Text>
                <Text style={styles.yildizLabel}>{y} yıldız</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.iptalButon} onPress={() => setYildizModal(null)}>
              <Text style={styles.iptalYazi}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!raporModal} transparent animationType="slide">
        <View style={styles.modalArka}>
          <View style={styles.modal}>
            <Text style={styles.modalBaslik}>Rapor nedeni seç</Text>
            <Text style={styles.modalAlt}>İçerik incelemeye gönderilecek.</Text>

            {RAPOR_NEDENLER.map((neden) => (
              <TouchableOpacity key={neden} style={styles.raporSecenek} onPress={() => raporla(neden)}>
                <Text style={styles.raporSecenekYazi}>{neden}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.iptalButon} onPress={() => setRaporModal(null)}>
              <Text style={styles.iptalYazi}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  geriButon: { padding: 16, marginTop: 40 },
  geriYazi: { fontSize: 16, color: '#6D28D9', fontWeight: '600' },
  konuKart: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDD6FE', padding: 16, borderRadius: 12, margin: 16, marginBottom: 8 },
  modKonuKart: {
    backgroundColor: '#fff',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  konuFoto: { width: '100%', height: 220, borderRadius: 10, marginBottom: 10 },
  modEtiket: {
    alignSelf: 'flex-start',
    backgroundColor: '#dc2626',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  konuBaslik: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  konuAciklama: { fontSize: 15, color: '#444', marginBottom: 8 },
  konuAltSatir: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  konuYazarDokun: { flex: 1, minWidth: 0, marginRight: 8 },
  konuYazarSatir: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proIsimMiniCerceve: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#422006',
    borderWidth: 1,
    borderColor: '#ca8a04',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  proIsimMiniParlak: {
    position: 'absolute',
    top: 0,
    left: -8,
    right: -8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(250,204,21,0.25)',
  },
  proIsimMiniYazi: { color: '#fde68a', fontWeight: '900', fontSize: 11 },
  konuAlt: { fontSize: 12, color: '#aaa' },
  modKonuAlt: { color: '#b91c1c', fontWeight: '700' },
  raporlaYazi: { color: '#dc2626', fontSize: 12, fontWeight: '700', flexShrink: 0 },
  raporKoseButon: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  yanitKart: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDD6FE', padding: 14, borderRadius: 12, marginHorizontal: 16, marginBottom: 8 },
  yanitUst: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  yanitYazar: { fontSize: 13, fontWeight: '600', color: '#6D28D9' },
  yanitYazarSatir: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rozetEtiket: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  rozetFormDis: { position: 'absolute', top: 0, opacity: 0.98 },
  rozetFormIcDolgu: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    opacity: 0.95,
  },
  rozetFormIcHalka: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    opacity: 0.95,
  },
  rozetParlak: {
    position: 'absolute',
    top: 4,
    width: 13,
    height: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  rozetEtiketYazi: { fontSize: 11, fontWeight: '900', marginTop: 1, zIndex: 3, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 2 },
  unvanChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unvanYazi: { fontSize: 10, fontWeight: '800' },
  yanitMetni: { fontSize: 14, color: '#333' },
  sagButonlar: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  begeniButon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  begeniMetni: { fontSize: 12, color: '#3B0764', fontWeight: '700' },
  yildizButon: { backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  yildizButonYazi: { fontSize: 12, color: '#4C1D95', fontWeight: '600' },
  yildizVerildi: { fontSize: 12, color: '#16a34a' },
  bos: { textAlign: 'center', color: '#aaa', marginTop: 20, fontSize: 14 },
  yanitKutusu: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#DDD6FE' },
  input: { backgroundColor: '#EDE9FE', borderWidth: 1, borderColor: '#DDD6FE', padding: 12, borderRadius: 12, fontSize: 15, marginBottom: 8, maxHeight: 100 },
  inputPasif: { backgroundColor: '#e5e7eb', color: '#6b7280' },
  gonderButon: { backgroundColor: '#6D28D9', padding: 14, borderRadius: 12, alignItems: 'center' },
  gonderPasif: { backgroundColor: '#9ca3af' },
  gonderYazi: { color: '#fff', fontSize: 15, fontWeight: '600' },
  modalArka: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalBaslik: { fontSize: 18, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  modalAlt: { fontSize: 13, color: '#3B0764', marginBottom: 16, textAlign: 'center' },
  yildizSatir: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#EDE9FE', borderRadius: 12, marginBottom: 8 },
  yildizEmoji: { fontSize: 18, marginRight: 10 },
  yildizLabel: { fontSize: 14, color: '#3B0764' },
  raporSecenek: { padding: 12, backgroundColor: '#fee2e2', borderRadius: 12, marginBottom: 8 },
  raporSecenekYazi: { color: '#991b1b', fontWeight: '700', textAlign: 'center' },
  iptalButon: { padding: 14, alignItems: 'center', marginTop: 4 },
  iptalYazi: { color: '#4C1D95', fontSize: 15 },
});
