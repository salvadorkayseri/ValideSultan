import { auth, db } from '@/firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useIsFocused } from '@react-navigation/native';
import InlineAd from '@/components/inline-ad';
import { cloudinaryGorselUrlOptimizasyonu } from '@/utils/gorsel';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type RevactaIcerik = {
  id: string;
  baslik: string;
  aciklama: string;
  kategori?: string;
  gorselUrl?: string;
  kaynakUrl?: string;
  ekleyenKullaniciAdi?: string;
  begeniSayisi?: number;
  yanitSayisi?: number;
  tarih?: any;
};
type RevactaYorum = {
  id: string;
  metin: string;
  yazarAdi?: string;
  tarih?: any;
};

const KOLEKSIYONLAR = ['Tümü', 'Hamilelik', 'Oyuncak', 'Yenidoğan', 'Ergenlik', 'Çocuk', 'Okul Çağı'] as const;
type Koleksiyon = (typeof KOLEKSIYONLAR)[number];

const metinNorm = (v: any) =>
  String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const koleksiyonEslesiyorMu = (icerik: RevactaIcerik, secili: Koleksiyon) => {
  if (secili === 'Tümü') return true;
  const birlesik = `${metinNorm(icerik.kategori)} ${metinNorm(icerik.baslik)} ${metinNorm(icerik.aciklama)}`;
  if (secili === 'Hamilelik') return birlesik.includes('hamile');
  if (secili === 'Oyuncak') return birlesik.includes('oyuncak');
  if (secili === 'Yenidoğan') return birlesik.includes('yenidogan') || birlesik.includes('yenid');
  if (secili === 'Ergenlik') return birlesik.includes('ergen');
  if (secili === 'Çocuk') return birlesik.includes('cocuk');
  if (secili === 'Okul Çağı') return birlesik.includes('okul') || birlesik.includes('sinif');
  return true;
};

const ADMIN_EMAILLER = ['admin@forumapp.com'];
const CLOUDINARY_CLOUD_NAME = 'dcgxpdqid';
const CLOUDINARY_UPLOAD_PRESET = 'forumapp';
const YORUM_SAYFA_LIMITI = 20;


export default function RevactaEkrani() {
  const ekranOdakta = useIsFocused();
  const [moderatorMu, setModeratorMu] = useState(false);
  const [proAktif, setProAktif] = useState(false);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [icerikler, setIcerikler] = useState<RevactaIcerik[]>([]);
  const [seciliKoleksiyon, setSeciliKoleksiyon] = useState<Koleksiyon>('Tümü');

  const [modalAcik, setModalAcik] = useState(false);
  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [kategori, setKategori] = useState('Genel');
  const [gorselUrl, setGorselUrl] = useState('');
  const [kaynakUrl, setKaynakUrl] = useState('');
  const [seciliFotoUri, setSeciliFotoUri] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const [begeniSayilari, setBegeniSayilari] = useState<Record<string, number>>({});
  const [yanitSayilari, setYanitSayilari] = useState<Record<string, number>>({});
  const [begendim, setBegendim] = useState<Record<string, boolean>>({});
  const [yorumMetinleri, setYorumMetinleri] = useState<Record<string, string>>({});
  const [yorumYukleniyorId, setYorumYukleniyorId] = useState('');
  const [yorumModalAcik, setYorumModalAcik] = useState(false);
  const [yorumModalIcerikId, setYorumModalIcerikId] = useState('');
  const [yorumlarByIcerik, setYorumlarByIcerik] = useState<Record<string, RevactaYorum[]>>({});
  const [yorumSonDocByIcerik, setYorumSonDocByIcerik] = useState<Record<string, any>>({});
  const [yorumdaDahaFazlaVarByIcerik, setYorumdaDahaFazlaVarByIcerik] = useState<Record<string, boolean>>({});
  const [yorumListeYukleniyorByIcerik, setYorumListeYukleniyorByIcerik] = useState<Record<string, boolean>>({});

  const filtrelenmisIcerikler = useMemo(
    () => icerikler.filter((icerik) => koleksiyonEslesiyorMu(icerik, seciliKoleksiyon)),
    [icerikler, seciliKoleksiyon]
  );

  const listeVerisi = useMemo(() => {
    const sonuc: Array<any> = [];
    filtrelenmisIcerikler.forEach((icerik, index) => {
      sonuc.push({ ...icerik, listeTipi: 'icerik' });
      if (!proAktif && (index + 1) % 3 === 0) {
        sonuc.push({
          id: `reklam-${index + 1}`,
          listeTipi: 'reklam',
          baslik: 'Sponsorlu İçerik',
          aciklama: 'Revaçta reklam alanı',
        });
      }
    });
    return sonuc;
  }, [filtrelenmisIcerikler, proAktif]);

  const firebaseHataMesaji = (hata: any) => {
    const kod = String(hata?.code || '');
    if (kod === 'permission-denied') {
      return 'Revaçta içerik ekleme izni yok. Firestore rules deploy edildi mi kontrol et.';
    }
    if (kod === 'unavailable') return 'Ağ bağlantısı sorunu var. İnterneti kontrol et.';
    return hata?.message || 'Bilinmeyen bir hata oluştu.';
  };

  const moderatorKontrol = async () => {
    const kullanici = auth.currentUser;
    if (!kullanici?.uid) {
      setModeratorMu(false);
      setProAktif(false);
      return;
    }

    if (ADMIN_EMAILLER.includes((kullanici.email || '').toLowerCase())) {
      setModeratorMu(true);
      setProAktif(true);
      return;
    }

    try {
      const snap = await getDoc(doc(db, 'kullanicilar', kullanici.uid));
      const rol = String(snap.data()?.rol || '').toLowerCase();
      setModeratorMu(rol === 'admin' || rol === 'moderator');
      setProAktif(!!snap.data()?.proAktif);
    } catch {
      setModeratorMu(false);
      setProAktif(false);
    }
  };

  const icerikleriGetir = async () => {
    const q = query(collection(db, 'revactaIcerikler'), orderBy('tarih', 'desc'), limit(40));
    const snap = await getDocs(q);
    const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RevactaIcerik[];
    setIcerikler(liste);
    await etkilesimleriGetir(liste);
  };

  const etkilesimleriGetir = async (liste: RevactaIcerik[]) => {
    const uid = auth.currentUser?.uid || '';
    const begeniSayilariYeni: Record<string, number> = {};
    const yanitSayilariYeni: Record<string, number> = {};
    const begendimYeni: Record<string, boolean> = {};

    liste.forEach((icerik) => {
      begeniSayilariYeni[icerik.id] = Number(icerik.begeniSayisi || 0);
      yanitSayilariYeni[icerik.id] = Number(icerik.yanitSayisi || 0);
      begendimYeni[icerik.id] = false;
    });

    if (uid) {
      await Promise.all(
        liste.map(async (icerik) => {
          const uidBegeniDoc = await getDoc(doc(db, 'revactaIcerikler', icerik.id, 'begeniler', uid));
          begendimYeni[icerik.id] = !!uidBegeniDoc.exists();
        })
      );
    }

    setBegeniSayilari(begeniSayilariYeni);
    setYanitSayilari(yanitSayilariYeni);
    setBegendim(begendimYeni);
  };

  const baslat = async () => {
    await Promise.all([moderatorKontrol(), icerikleriGetir()]);
  };

  useEffect(() => {
    if (!ekranOdakta) return;
    baslat().catch(() => {});
  }, [ekranOdakta]);

  useEffect(() => {
    if (!ekranOdakta) return;
    const kullanici = auth.currentUser;
    if (!kullanici?.uid) {
      setModeratorMu(false);
      setProAktif(false);
      return;
    }

    if (ADMIN_EMAILLER.includes((kullanici.email || '').toLowerCase())) {
      setModeratorMu(true);
      setProAktif(true);
      return;
    }

    const ref = doc(db, 'kullanicilar', kullanici.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as any;
        const rol = String(data?.rol || '').toLowerCase();
        setModeratorMu(rol === 'admin' || rol === 'moderator');
        setProAktif(!!data?.proAktif);
      },
      () => {}
    );
    return () => unsub();
  }, [ekranOdakta]);

  const yenile = async () => {
    if (!ekranOdakta) return;
    setYenileniyor(true);
    await baslat();
    setYenileniyor(false);
  };

  const fotografSec = async () => {
    const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!izin.granted) {
      Alert.alert('İzin gerekli', 'Fotoğraf seçmek için galeri izni gerekli.');
      return;
    }

    const sonuc = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.75,
    });

    if (!sonuc.canceled && sonuc.assets[0]) {
      setSeciliFotoUri(String(sonuc.assets[0].uri || ''));
    }
  };

  const cloudinaryYukle = async (uri: string) => {
    const dosyaAdi = uri.split('/').pop() || `revacta-${Date.now()}.jpg`;
    const uzanti = dosyaAdi.split('.').pop()?.toLowerCase();
    const mimeTipi = uzanti === 'png' ? 'image/png' : uzanti === 'webp' ? 'image/webp' : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', { uri, type: mimeTipi, name: dosyaAdi } as any);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!data.secure_url) {
      throw new Error(data?.error?.message || 'Fotoğraf yüklenemedi.');
    }
    return String(data.secure_url);
  };

  const icerikKaydet = async () => {
    const kullanici = auth.currentUser;
    if (!kullanici?.uid || !moderatorMu) {
      Alert.alert('Uyarı', 'Bu alana sadece moderatör içerik ekleyebilir.');
      return;
    }

    const baslikTemiz = baslik.trim();
    const aciklamaTemiz = aciklama.trim();
    const gorselUrlTemiz = gorselUrl.trim();
    const kaynakUrlTemiz = kaynakUrl.trim();
    const enAzBirIcerikVar =
      !!baslikTemiz ||
      !!aciklamaTemiz ||
      !!seciliFotoUri ||
      !!gorselUrlTemiz ||
      !!kaynakUrlTemiz;

    if (!enAzBirIcerikVar) {
      Alert.alert('Hata', 'En az bir alan doldurmalısın (başlık, açıklama, fotoğraf veya link).');
      return;
    }

    try {
      setKaydediliyor(true);

      const kullaniciSnap = await getDoc(doc(db, 'kullanicilar', kullanici.uid));
      const kullaniciAdi = String(kullaniciSnap.data()?.kullaniciAdi || '').trim() || 'Moderatör';

      let yuklenenGorselUrl = gorselUrlTemiz;
      if (seciliFotoUri) {
        setFotoYukleniyor(true);
        yuklenenGorselUrl = await cloudinaryYukle(seciliFotoUri);
      }

      await addDoc(collection(db, 'revactaIcerikler'), {
        baslik: baslikTemiz,
        aciklama: aciklamaTemiz,
        kategori: kategori.trim() || 'Genel',
        gorselUrl: yuklenenGorselUrl,
        kaynakUrl: kaynakUrlTemiz,
        ekleyenId: kullanici.uid,
        ekleyenKullaniciAdi: kullaniciAdi,
        begeniSayisi: 0,
        yanitSayisi: 0,
        tarih: new Date(),
      });

      setBaslik('');
      setAciklama('');
      setKategori('Genel');
      setGorselUrl('');
      setKaynakUrl('');
      setSeciliFotoUri('');
      setModalAcik(false);
      await icerikleriGetir();
      Alert.alert('Başarılı', 'Revaçta içeriği eklendi.');
    } catch (hata: any) {
      Alert.alert('Hata', firebaseHataMesaji(hata));
    } finally {
      setFotoYukleniyor(false);
      setKaydediliyor(false);
    }
  };

  const linkAc = async (url: string) => {
    const hedef = String(url || '').trim();
    if (!hedef) return;

    const tamUrl = hedef.startsWith('http://') || hedef.startsWith('https://') ? hedef : `https://${hedef}`;
    const destekleniyor = await Linking.canOpenURL(tamUrl);
    if (!destekleniyor) {
      Alert.alert('Uyarı', 'Bu link açılamadı.');
      return;
    }
    await Linking.openURL(tamUrl);
  };
  const begeniToggle = async (icerikId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Uyarı', 'Beğenmek için giriş yapmalısın.');
      return;
    }

    try {
      const begeniRef = doc(db, 'revactaIcerikler', icerikId, 'begeniler', uid);
      const icerikRef = doc(db, 'revactaIcerikler', icerikId);
      if (begendim[icerikId]) {
        const batch = writeBatch(db);
        batch.delete(begeniRef);
        batch.update(icerikRef, { begeniSayisi: increment(-1) });
        await batch.commit();
        setBegendim((s) => ({ ...s, [icerikId]: false }));
        setBegeniSayilari((s) => ({ ...s, [icerikId]: Math.max(0, (s[icerikId] || 1) - 1) }));
      } else {
        const batch = writeBatch(db);
        batch.set(begeniRef, { uid, tarih: new Date() });
        batch.update(icerikRef, { begeniSayisi: increment(1) });
        await batch.commit();
        setBegendim((s) => ({ ...s, [icerikId]: true }));
        setBegeniSayilari((s) => ({ ...s, [icerikId]: (s[icerikId] || 0) + 1 }));
      }
    } catch (hata: any) {
      Alert.alert('Hata', firebaseHataMesaji(hata));
    }
  };

  const yanitYaz = async (icerikId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Uyarı', 'Yanıt yazmak için giriş yapmalısın.');
      return;
    }

    const metin = String(yorumMetinleri[icerikId] || '').trim();
    if (!metin) {
      Alert.alert('Uyarı', 'Yorum boş olamaz.');
      return;
    }

    try {
      setYorumYukleniyorId(icerikId);
      const userSnap = await getDoc(doc(db, 'kullanicilar', uid));
      const yazarAdi = String(userSnap.data()?.kullaniciAdi || '').trim() || 'Gizli Üye';

      await addDoc(collection(db, 'revactaIcerikler', icerikId, 'yanitlar'), {
        metin,
        yazarId: uid,
        yazarAdi,
        tarih: new Date(),
      });
      await updateDoc(doc(db, 'revactaIcerikler', icerikId), {
        yanitSayisi: increment(1),
      });

      setYorumMetinleri((s) => ({ ...s, [icerikId]: '' }));
      setYanitSayilari((s) => ({ ...s, [icerikId]: (s[icerikId] || 0) + 1 }));
      setYorumlarByIcerik((s) => ({
        ...s,
        [icerikId]: [{ id: `yerel-${Date.now()}`, metin, yazarAdi, tarih: new Date() }, ...(s[icerikId] || [])],
      }));
    } catch (hata: any) {
      Alert.alert('Hata', firebaseHataMesaji(hata));
    } finally {
      setYorumYukleniyorId('');
    }
  };

  const yorumlariGetir = async (icerikId: string, secenek?: { dahaFazla?: boolean }) => {
    const dahaFazla = !!secenek?.dahaFazla;
    if (!icerikId) return;
    if (yorumListeYukleniyorByIcerik[icerikId]) return;
    if (dahaFazla && !yorumdaDahaFazlaVarByIcerik[icerikId]) return;

    setYorumListeYukleniyorByIcerik((s) => ({ ...s, [icerikId]: true }));
    try {
      const q = query(
        collection(db, 'revactaIcerikler', icerikId, 'yanitlar'),
        orderBy('tarih', 'desc'),
        ...(dahaFazla && yorumSonDocByIcerik[icerikId] ? [startAfter(yorumSonDocByIcerik[icerikId])] : []),
        limit(YORUM_SAYFA_LIMITI)
      );
      const snap = await getDocs(q);
      const liste = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RevactaYorum[];
      setYorumlarByIcerik((s) => {
        if (!dahaFazla) return { ...s, [icerikId]: liste };
        const onceki = s[icerikId] || [];
        const birlesik = [...onceki, ...liste].filter(
          (item, index, arr) => arr.findIndex((k) => String(k.id) === String(item.id)) === index
        );
        return { ...s, [icerikId]: birlesik };
      });
      setYorumSonDocByIcerik((s) => ({ ...s, [icerikId]: snap.docs.length ? snap.docs[snap.docs.length - 1] : null }));
      setYorumdaDahaFazlaVarByIcerik((s) => ({ ...s, [icerikId]: snap.docs.length === YORUM_SAYFA_LIMITI }));
    } catch (hata: any) {
      Alert.alert('Hata', firebaseHataMesaji(hata));
    } finally {
      setYorumListeYukleniyorByIcerik((s) => ({ ...s, [icerikId]: false }));
    }
  };

  const yorumModalAc = async (icerikId: string) => {
    setYorumModalIcerikId(icerikId);
    setYorumModalAcik(true);
    await yorumlariGetir(icerikId);
  };

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.arkaPlanKatman}>
        <View style={styles.arkaBalonBir} />
        <View style={styles.arkaBalonIki} />
      </View>
      <View style={styles.ustKart}>
        <View style={styles.baslikSatiri}>
          <View style={styles.baslikIkonKutu}>
            <MaterialCommunityIcons name="trending-up" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.baslik}>Revaçta</Text>
            <Text style={styles.alt}>Popüler çocuk, bebek ve hamilelik içerikleri</Text>
          </View>
        </View>
        <View style={styles.ozetSatiri}>
          <View style={styles.ozetChip}>
            <MaterialCommunityIcons name="post-outline" size={14} color="#6D28D9" />
            <Text style={styles.ozetYazi}>{icerikler.length} içerik</Text>
          </View>
          <View style={styles.ozetChip}>
            <MaterialCommunityIcons name={proAktif ? 'shield-crown-outline' : 'shield-outline'} size={14} color="#4C1D95" />
            <Text style={styles.ozetYazi}>{proAktif ? 'Pro aktif' : 'Ücretsiz mod'}</Text>
          </View>
          <View style={styles.ozetChip}>
            <MaterialCommunityIcons name="filter-variant" size={14} color="#6D28D9" />
            <Text style={styles.ozetYazi}>{seciliKoleksiyon}</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.koleksiyonSatiri}>
        {KOLEKSIYONLAR.map((koleksiyon) => (
          <TouchableOpacity
            key={koleksiyon}
            style={[styles.koleksiyonChip, seciliKoleksiyon === koleksiyon && styles.koleksiyonChipAktif]}
            onPress={() => setSeciliKoleksiyon(koleksiyon)}>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              style={[styles.koleksiyonYazi, seciliKoleksiyon === koleksiyon && styles.koleksiyonYaziAktif]}>
              {koleksiyon}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {moderatorMu ? (
        <TouchableOpacity style={styles.ekleButon} onPress={() => setModalAcik(true)}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
          <Text style={styles.ekleButonYazi}>Revaçta İçeriği Ekle</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={listeVerisi}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={yenileniyor} onRefresh={yenile} />}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={5}
        initialNumToRender={4}
        renderItem={({ item }) => {
          if (item.listeTipi === 'reklam') {
            return <InlineAd large />;
          }
          return (
          <View style={styles.kart}>
            <View style={styles.kartUst}>
              <Text style={styles.kategori}>{item.kategori || 'Genel'}</Text>
              <View style={styles.ekleyenSatiri}>
                <MaterialCommunityIcons name="account-circle-outline" size={14} color="#6b7280" />
                <Text style={styles.ekleyen}>@{item.ekleyenKullaniciAdi || 'moderatör'}</Text>
              </View>
            </View>

            {item.baslik ? <Text style={styles.konuBaslik}>{item.baslik}</Text> : null}
            {item.aciklama ? <Text style={styles.aciklama}>{item.aciklama}</Text> : null}

            {item.gorselUrl ? (
              <Image
                source={{ uri: cloudinaryGorselUrlOptimizasyonu(String(item.gorselUrl || ''), { width: 720, height: 405, kalite: 'eco' }) }}
                style={styles.gorsel}
                resizeMethod="resize"
              />
            ) : null}

            <View style={styles.linkSatiri}>
              {item.kaynakUrl ? (
                <TouchableOpacity style={styles.linkButon} onPress={() => linkAc(item.kaynakUrl || '')}>
                  <MaterialCommunityIcons name="open-in-new" size={14} color="#4C1D95" />
                  <Text style={styles.linkButonYazi}>Kaynağı Aç</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.etkilesimSatiri}>
              <TouchableOpacity style={styles.etkiButon} onPress={() => begeniToggle(item.id)}>
                <MaterialCommunityIcons
                  name={begendim[item.id] ? 'heart' : 'heart-outline'}
                  size={20}
                  color={begendim[item.id] ? '#dc2626' : '#9ca3af'}
                />
              </TouchableOpacity>
              <View style={styles.etkiSayilari}>
                <MaterialCommunityIcons name="heart" size={14} color="#ef4444" />
                <Text style={styles.sayacMetin}>{begeniSayilari[item.id] || 0}</Text>
                <TouchableOpacity style={styles.yorumlarAcButon} onPress={() => yorumModalAc(item.id)}>
                  <MaterialCommunityIcons name="comment-outline" size={14} color="#6b7280" />
                  <Text style={styles.sayacMetin}>{yanitSayilari[item.id] || 0}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.yorumSatiri}>
              <TextInput
                style={styles.yorumInput}
                placeholder="Yorum yaz..."
                value={yorumMetinleri[item.id] || ''}
                onChangeText={(v) => setYorumMetinleri((s) => ({ ...s, [item.id]: v }))}
              />
              <TouchableOpacity
                style={[styles.yorumButon, yorumYukleniyorId === item.id && styles.pasif]}
                onPress={() => yanitYaz(item.id)}
                disabled={yorumYukleniyorId === item.id}>
                <Text style={styles.yorumButonYazi}>{yorumYukleniyorId === item.id ? '...' : 'Gönder'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
        }}
        ListEmptyComponent={<Text style={styles.bos}>Henüz revaçta içerik yok.</Text>}
      />

      <Modal visible={modalAcik} transparent animationType="slide" onRequestClose={() => setModalAcik(false)}>
        <KeyboardAvoidingView style={styles.modalArka} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalArka} activeOpacity={1} onPress={Keyboard.dismiss}>
            <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalBaslik}>Revaçta İçeriği Ekle</Text>

                <TextInput style={styles.input} placeholder="Başlık (opsiyonel)" value={baslik} onChangeText={setBaslik} returnKeyType="next" />
                <TextInput
                  style={[styles.input, styles.inputBuyuk]}
                  placeholder="Açıklama (opsiyonel)"
                  value={aciklama}
                  onChangeText={setAciklama}
                  multiline
                  returnKeyType="default"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Kategori (örn: En Çok Satanlar)"
                  value={kategori}
                  onChangeText={setKategori}
                  returnKeyType="next"
                />

                <TouchableOpacity style={styles.fotoSecButon} onPress={fotografSec} disabled={fotoYukleniyor}>
                  <Text style={styles.fotoSecYazi}>{seciliFotoUri ? 'Fotoğrafı Değiştir' : 'Galeriden Fotoğraf Seç'}</Text>
                </TouchableOpacity>
                {seciliFotoUri ? <Image source={{ uri: seciliFotoUri }} style={styles.onizleme} /> : null}

                <TextInput
                  style={styles.input}
                  placeholder="veya Fotoğraf URL (opsiyonel)"
                  value={gorselUrl}
                  onChangeText={setGorselUrl}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Dış Link URL (opsiyonel)"
                  value={kaynakUrl}
                  onChangeText={setKaynakUrl}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />

                <TouchableOpacity
                  style={[styles.kaydetButon, (kaydediliyor || fotoYukleniyor) && styles.pasif]}
                  onPress={() => {
                    Keyboard.dismiss();
                    icerikKaydet();
                  }}
                  disabled={kaydediliyor || fotoYukleniyor}>
                  <Text style={styles.kaydetYazi}>{kaydediliyor || fotoYukleniyor ? 'Kaydediliyor...' : 'Kaydet'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iptalButon} onPress={() => setModalAcik(false)}>
                  <Text style={styles.iptalYazi}>İptal</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={yorumModalAcik} transparent animationType="slide" onRequestClose={() => setYorumModalAcik(false)}>
        <View style={styles.modalArka}>
          <View style={styles.yorumModal}>
            <Text style={styles.modalBaslik}>Yorumlar</Text>
            <FlatList
              data={yorumlarByIcerik[yorumModalIcerikId] || []}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <View style={styles.yorumSatirKart}>
                  <Text style={styles.yorumYazar}>@{item.yazarAdi || 'Gizli Üye'}</Text>
                  <Text style={styles.yorumIcerik}>{item.metin || ''}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.bos}>Henüz yorum yok.</Text>}
              ListFooterComponent={
                yorumListeYukleniyorByIcerik[yorumModalIcerikId] ? (
                  <Text style={styles.konuListeAltBilgi}>Yorumlar yükleniyor...</Text>
                ) : yorumdaDahaFazlaVarByIcerik[yorumModalIcerikId] ? (
                  <TouchableOpacity style={styles.dahaFazlaYorumButon} onPress={() => yorumlariGetir(yorumModalIcerikId, { dahaFazla: true })}>
                    <Text style={styles.dahaFazlaYorumYazi}>Daha fazla yorum yükle</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
            <TouchableOpacity style={styles.iptalButon} onPress={() => setYorumModalAcik(false)}>
              <Text style={styles.iptalYazi}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF', padding: 16, paddingTop: 56 },
  arkaPlanKatman: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  arkaBalonBir: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(109,40,217,0.12)',
    top: -86,
    right: -64,
  },
  arkaBalonIki: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(76,29,149,0.1)',
    top: 22,
    left: -74,
  },
  ustKart: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  baslikSatiri: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  baslikIkonKutu: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baslik: { fontSize: 27, fontWeight: '800', color: '#3B0764' },
  alt: { color: '#475569', marginTop: 2, fontWeight: '500' },
  ozetSatiri: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  ozetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ozetYazi: { color: '#3B0764', fontWeight: '700', fontSize: 12 },
  koleksiyonSatiri: { gap: 8, paddingBottom: 6, marginBottom: 8 },
  koleksiyonChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 999,
    width: 116,
    minWidth: 116,
    maxWidth: 116,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
    maxHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  koleksiyonChipAktif: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  koleksiyonYazi: { color: '#4C1D95', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  koleksiyonYaziAktif: { color: '#fff' },
  ekleButon: {
    backgroundColor: '#6D28D9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ekleButonYazi: { color: '#fff', fontWeight: '700' },
  kart: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  reklamKart: {
    minHeight: 180,
    justifyContent: 'center',
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    paddingVertical: 18,
  },
  reklamEtiket: {
    alignSelf: 'flex-start',
    backgroundColor: '#f59e0b',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
  },
  reklamAciklama: { color: '#78350f', fontWeight: '600', marginTop: 4 },
  kartUst: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  kategori: { backgroundColor: '#EDE9FE', color: '#4C1D95', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: '800' },
  ekleyenSatiri: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ekleyen: { color: '#6b7280', fontWeight: '600', fontSize: 12 },
  konuBaslik: { fontSize: 17, fontWeight: '800', color: '#3B0764' },
  aciklama: { marginTop: 6, color: '#3B0764', lineHeight: 20 },
  gorsel: { width: '100%', height: 190, borderRadius: 12, marginTop: 10 },
  linkSatiri: { marginTop: 10, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  linkButon: { backgroundColor: '#EDE9FE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkButonYazi: { color: '#4C1D95', fontWeight: '700' },
  etkilesimSatiri: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  etkiButon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etkiSayilari: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  yorumlarAcButon: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sayacMetin: { color: '#6b7280', fontWeight: '700', fontSize: 12, minWidth: 18 },
  yorumSatiri: { marginTop: 9, flexDirection: 'row', gap: 8, alignItems: 'center' },
  yorumInput: {
    flex: 1,
    backgroundColor: '#EDE9FE',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  yorumButon: { backgroundColor: '#6D28D9', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  yorumButonYazi: { color: '#fff', fontWeight: '700', fontSize: 12 },
  bos: { marginTop: 40, textAlign: 'center', color: '#9ca3af' },
  modalArka: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalBaslik: { fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  input: { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, marginBottom: 10 },
  inputBuyuk: { minHeight: 90, textAlignVertical: 'top' },
  fotoSecButon: { backgroundColor: '#EDE9FE', paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  fotoSecYazi: { color: '#4C1D95', fontWeight: '700' },
  onizleme: { width: '100%', height: 170, borderRadius: 10, marginBottom: 10 },
  kaydetButon: { backgroundColor: '#6D28D9', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  kaydetYazi: { color: '#fff', fontWeight: '700' },
  pasif: { opacity: 0.7 },
  iptalButon: { alignItems: 'center', paddingVertical: 12 },
  iptalYazi: { color: '#6b7280', fontWeight: '600' },
  yorumModal: {
    backgroundColor: '#fff',
    maxHeight: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  yorumSatirKart: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  yorumYazar: { color: '#3B0764', fontWeight: '700', marginBottom: 4 },
  yorumIcerik: { color: '#3B0764', lineHeight: 19 },
  dahaFazlaYorumButon: {
    alignSelf: 'center',
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
  },
  dahaFazlaYorumYazi: { color: '#4C1D95', fontWeight: '700' },
  konuListeAltBilgi: { textAlign: 'center', color: '#6b7280', paddingVertical: 10, fontWeight: '600' },
});






