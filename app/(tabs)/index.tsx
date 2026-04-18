import { auth, db } from '@/firebaseConfig';
import InlineAd from '@/components/inline-ad';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import KonuDetay from './konu';

const KONU_OTOMATIK_SILME_GUN = 30;
const GUNLUK_UCRETSIZ_KONU_LIMITI = 3;
const TEMEL_KATEGORILER = ['Genel', 'Aile', 'İlişki', 'Sağlık', 'Eğitim', 'Kariyer'];
const expoGoMu = Constants.appOwnership === 'expo';
WebBrowser.maybeCompleteAuthSession();

const bugunAnahtar = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const temizMetin = (v: any) =>
  String(v || '')
    .trim()
    .replace(/\s+/g, ' ');
const metinNorm = (v: any) =>
  temizMetin(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const cinsiyetNormalizeEt = (cinsiyet: any): 'kadin' | 'erkek' => (metinNorm(cinsiyet).includes('erkek') ? 'erkek' : 'kadin');
const yazarRenk = (cinsiyet: any) => (cinsiyetNormalizeEt(cinsiyet) === 'erkek' ? '#2563EB' : '#ec4899');
const cinsiyetIconAdi = (cinsiyet: any) => (cinsiyetNormalizeEt(cinsiyet) === 'erkek' ? 'gender-male' : 'gender-female');
const rozetBilgisi = (yildiz: number, proAktif?: boolean) => {
  if (proAktif || yildiz >= 1500) return { seviye: '5', unvan: 'Efsane', renk: '#f59e0b' };
  if (yildiz >= 900) return { seviye: '4', unvan: 'Anne', renk: '#ef4444' };
  if (yildiz >= 500) return { seviye: '3', unvan: 'Anne Yarısı', renk: '#b45309' };
  if (yildiz >= 350) return { seviye: '2', unvan: 'Abla', renk: '#15803d' };
  return null;
};

function GirisFormu({ onGirisBasarili }: { onGirisBasarili?: () => void }) {
  const [ekran, setEkran] = useState<'giris' | 'kayit'>('giris');
  const [email, setEmail] = useState('');
  const [sifre, setSifre] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [googleYukleniyor, setGoogleYukleniyor] = useState(false);

  const googleAuthConfig = (Constants.expoConfig?.extra as any)?.googleAuth || {};
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    clientId: googleAuthConfig.clientId,
    androidClientId: googleAuthConfig.androidClientId,
    iosClientId: googleAuthConfig.iosClientId,
    webClientId: googleAuthConfig.webClientId,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (!googleResponse || googleResponse.type !== 'success') return;
    (async () => {
      try {
        setGoogleYukleniyor(true);
        const idToken = googleResponse.authentication?.idToken || (googleResponse.params as any)?.id_token;
        const accessToken = googleResponse.authentication?.accessToken;
        if (!idToken && !accessToken) return Alert.alert('Hata', 'Google kimlik bilgisi alınamadı.');
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken || null, accessToken || null));
        onGirisBasarili?.();
      } catch (e: any) {
        Alert.alert('Google Giriş Hatası', e?.message || 'Google ile giriş başarısız.');
      } finally {
        setGoogleYukleniyor(false);
      }
    })();
  }, [googleResponse, onGirisBasarili]);

  const girisYap = async () => {
    if (!email.trim() || !sifre) return Alert.alert('Uyarı', 'E-posta ve şifre gir.');
    setYukleniyor(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), sifre);
      onGirisBasarili?.();
    } catch (e: any) {
      Alert.alert('Giriş Hatası', e?.message || 'Giriş başarısız.');
    } finally {
      setYukleniyor(false);
    }
  };

  const kayitOl = async () => {
    if (!email.trim() || !sifre) return Alert.alert('Uyarı', 'E-posta ve şifre gir.');
    setYukleniyor(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), sifre);
      Alert.alert('Başarılı', 'Hesap oluşturuldu.');
      setEkran('giris');
    } catch (e: any) {
      Alert.alert('Kayıt Hatası', e?.message || 'Kayıt başarısız.');
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.baslik}>ValideSultan</Text>
      <Text style={styles.altBaslik}>Topluluğa giriş yap</Text>

      <View style={styles.tablar}>
        <TouchableOpacity style={[styles.tab, ekran === 'giris' && styles.tabAktif]} onPress={() => setEkran('giris')}>
          <Text style={[styles.tabYazi, ekran === 'giris' && styles.tabYaziAktif]}>Giriş</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, ekran === 'kayit' && styles.tabAktif]} onPress={() => setEkran('kayit')}>
          <Text style={[styles.tabYazi, ekran === 'kayit' && styles.tabYaziAktif]}>Kayıt Ol</Text>
        </TouchableOpacity>
      </View>

      <TextInput style={styles.input} placeholder="E-posta" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Şifre" secureTextEntry autoCapitalize="none" value={sifre} onChangeText={setSifre} />

      <TouchableOpacity style={[styles.buton, yukleniyor && styles.pasif]} disabled={yukleniyor} onPress={ekran === 'giris' ? girisYap : kayitOl}>
        <Text style={styles.butonYazi}>{yukleniyor ? 'Bekle...' : ekran === 'giris' ? 'Giriş Yap' : 'Hesap Oluştur'}</Text>
      </TouchableOpacity>

      {ekran === 'giris' ? (
        <TouchableOpacity
          style={[styles.googleButon, (googleYukleniyor || !googleRequest) && styles.pasif]}
          disabled={googleYukleniyor || !googleRequest}
          onPress={() => googlePromptAsync()}>
          <Text style={styles.googleG}>
            <Text style={{ color: '#4285F4' }}>G</Text>
            <Text style={{ color: '#EA4335' }}>o</Text>
            <Text style={{ color: '#FBBC05' }}>o</Text>
            <Text style={{ color: '#4285F4' }}>g</Text>
            <Text style={{ color: '#34A853' }}>l</Text>
            <Text style={{ color: '#EA4335' }}>e</Text>
          </Text>
          <Text style={styles.googleButonYazi}>{googleYukleniyor ? 'Google bağlanıyor...' : 'Google ile giriş yap'}</Text>
        </TouchableOpacity>
      ) : null}

      {ekran === 'giris' ? (
        <TouchableOpacity
          onPress={() =>
            sendPasswordResetEmail(auth, email.trim())
              .then(() => Alert.alert('Başarılı', 'Şifre sıfırlama maili gönderildi.'))
              .catch((e) => Alert.alert('Hata', e?.message || 'Mail gönderilemedi.'))
          }>
          <Text style={styles.link}>Şifremi Unuttum</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ForumAkisi() {
  const [konular, setKonular] = useState<any[]>([]);
  const [seciliKonu, setSeciliKonu] = useState<any>(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [proAktif, setProAktif] = useState(false);
  const [modalAcik, setModalAcik] = useState(false);
  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [kategori, setKategori] = useState('Genel');
  const [yeniKategori, setYeniKategori] = useState('');
  const [filtre, setFiltre] = useState('Tümü');
  const [gunlukKonuSayisi, setGunlukKonuSayisi] = useState(0);
  const [videoHakKalan, setVideoHakKalan] = useState(0);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [videoYukleniyor, setVideoYukleniyor] = useState(false);
  const [ozelKategoriler, setOzelKategoriler] = useState<string[]>([]);

  const modalKapat = useCallback(() => {
    setModalAcik(false);
  }, []);

  useEffect(() => {
    if (!modalAcik) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      modalKapat();
      return true;
    });
    return () => sub.remove();
  }, [modalAcik, modalKapat]);

  const kullaniciDurumu = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const snap = await getDoc(doc(db, 'kullanicilar', uid));
    const data = (snap.data() || {}) as any;
    const bugun = bugunAnahtar();

    setProAktif(!!data.proAktif);
    const konuData = data.gunlukKonuAcma || {};
    setGunlukKonuSayisi(konuData.tarih === bugun ? Number(konuData.sayi || 0) : 0);

    const video = data.gunlukVideoKonuHakki || {};
    const kazanilan = video.tarih === bugun ? Number(video.kazanilan || 0) : 0;
    const kullanilan = video.tarih === bugun ? Number(video.kullanilan || 0) : 0;
    setVideoHakKalan(Math.max(0, kazanilan - kullanilan));
  }, []);

  const konulariGetir = useCallback(async () => {
    const baslangic = new Date(Date.now() - KONU_OTOMATIK_SILME_GUN * 24 * 60 * 60 * 1000);
    const snap = await getDocs(query(collection(db, 'konular'), where('tarih', '>=', baslangic), orderBy('tarih', 'desc'), limit(80)));
    await kullaniciDurumu();

    const liste = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any), kategori: temizMetin((d.data() as any).kategori || 'Genel') || 'Genel' }))
      .filter((k) => !k.gizlendi);
    setKonular(liste);

    const bulunan = new Set<string>();
    liste.forEach((k) => {
      const kat = temizMetin(k.kategori || '');
      if (!kat) return;
      if (!TEMEL_KATEGORILER.includes(kat)) bulunan.add(kat);
    });
    setOzelKategoriler((onceki) => Array.from(new Set([...onceki, ...Array.from(bulunan)])));
  }, [kullaniciDurumu]);

  useEffect(() => {
    konulariGetir().catch(() => {});
  }, [konulariGetir]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(doc(db, 'kullanicilar', uid), (s) => setProAktif(!!s.data()?.proAktif));
  }, []);

  const tumKategoriler = useMemo(
    () => Array.from(new Set([...TEMEL_KATEGORILER, ...ozelKategoriler.filter(Boolean)])),
    [ozelKategoriler]
  );

  const liste = useMemo(() => {
    const konuListe = filtre === 'Tümü' ? konular : konular.filter((k) => temizMetin(k.kategori || 'Genel') === filtre);
    const out: any[] = [];
    konuListe.forEach((k, i) => {
      out.push({ ...k, tip: 'konu' });
      if (!proAktif && (i + 1) % 3 === 0) out.push({ id: `reklam-${i}`, tip: 'reklam' });
    });
    return out;
  }, [filtre, konular, proAktif]);

  const kategoriEkle = () => {
    const temiz = temizMetin(yeniKategori);
    if (!temiz) return;
    if (temiz.length < 2) return Alert.alert('Uyarı', 'Kategori adı en az 2 karakter olmalı.');
    if (temiz.length > 22) return Alert.alert('Uyarı', 'Kategori adı en fazla 22 karakter olmalı.');
    const varMi = tumKategoriler.some((k) => metinNorm(k) === metinNorm(temiz));
    if (varMi) {
      setKategori(tumKategoriler.find((k) => metinNorm(k) === metinNorm(temiz)) || temiz);
      setYeniKategori('');
      return;
    }
    setOzelKategoriler((s) => [...s, temiz]);
    setKategori(temiz);
    setYeniKategori('');
  };

  const videoIzleHakkiAl = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || proAktif) return;
    if (expoGoMu) return Alert.alert('Bilgi', 'Expo Go modunda ödüllü video devre dışı.');

    let ads: any;
    try {
      ads = await import('react-native-google-mobile-ads');
    } catch {
      return Alert.alert('Bilgi', 'Reklam modülü yok.');
    }

    setVideoYukleniyor(true);
    const rewarded = ads.RewardedAd.createForAdRequest(ads.TestIds.REWARDED, { requestNonPersonalizedAdsOnly: true });
    return new Promise<void>((resolve) => {
      let odul = false;
      const a = rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, async () => {
        odul = true;
        try {
          const ref = doc(db, 'kullanicilar', uid);
          const snap = await getDoc(ref);
          const data = (snap.data() || {}) as any;
          const bugun = bugunAnahtar();
          const v = data.gunlukVideoKonuHakki || {};
          const kaz = v.tarih === bugun ? Number(v.kazanilan || 0) : 0;
          const kul = v.tarih === bugun ? Number(v.kullanilan || 0) : 0;
          await updateDoc(ref, { gunlukVideoKonuHakki: { tarih: bugun, kazanilan: kaz + 1, kullanilan: kul } });
          await kullaniciDurumu();
          Alert.alert('Başarılı', '1 ek konu açma hakkı kazandın.');
        } finally {
          setVideoYukleniyor(false);
          a();
          b();
          c();
          d();
          resolve();
        }
      });
      const b = rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => rewarded.show());
      const c = rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
        if (!odul) {
          setVideoYukleniyor(false);
          a();
          b();
          c();
          d();
          resolve();
        }
      });
      const d = rewarded.addAdEventListener(ads.AdEventType.ERROR, () => {
        setVideoYukleniyor(false);
        Alert.alert('Hata', 'Video yüklenemedi.');
        a();
        b();
        c();
        d();
        resolve();
      });
      rewarded.load();
    });
  };

  const konuOlustur = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return Alert.alert('Uyarı', 'Konu açmak için giriş yapmalısın.');
    if (!baslik.trim() || !aciklama.trim()) return Alert.alert('Uyarı', 'Başlık ve açıklama zorunlu.');
    setKaydediliyor(true);
    try {
      const ref = doc(db, 'kullanicilar', uid);
      const snap = await getDoc(ref);
      const u = (snap.data() || {}) as any;
      const bugun = bugunAnahtar();
      const pro = !!u.proAktif;
      const konuData = u.gunlukKonuAcma || {};
      const bugunku = konuData.tarih === bugun ? Number(konuData.sayi || 0) : 0;
      const v = u.gunlukVideoKonuHakki || {};
      const kaz = v.tarih === bugun ? Number(v.kazanilan || 0) : 0;
      const kul = v.tarih === bugun ? Number(v.kullanilan || 0) : 0;

      if (!pro && bugunku >= GUNLUK_UCRETSIZ_KONU_LIMITI && kaz - kul <= 0) {
        return Alert.alert('Günlük Limit', 'Limit doldu. Video izleyerek +1 hak alabilirsin.');
      }

      if (!pro) {
        if (bugunku < GUNLUK_UCRETSIZ_KONU_LIMITI) await updateDoc(ref, { gunlukKonuAcma: { tarih: bugun, sayi: bugunku + 1 } });
        else await updateDoc(ref, { gunlukVideoKonuHakki: { tarih: bugun, kazanilan: kaz, kullanilan: kul + 1 } });
      }

      const seciliKategori = temizMetin(kategori) || 'Genel';
      await addDoc(collection(db, 'konular'), {
        baslik: baslik.trim(),
        aciklama: aciklama.trim(),
        kategori: seciliKategori,
        yazar: auth.currentUser?.email || '',
        yazarId: uid,
        yazarKullaniciAdi: temizMetin(u.kullaniciAdi),
        yazarCinsiyet: cinsiyetNormalizeEt(u.cinsiyet),
        yazarYildiz: Number(u.yildiz || 0),
        yazarProAktif: !!u.proAktif,
        tarih: new Date(),
        yanitSayisi: 0,
        begeniSayisi: 0,
        gizlendi: false,
      });

      setBaslik('');
      setAciklama('');
      setKategori('Genel');
      setYeniKategori('');
      setModalAcik(false);
      await konulariGetir();
      Alert.alert('Başarılı', 'Konu paylaşıldı.');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Konu paylaşılamadı.');
    } finally {
      setKaydediliyor(false);
    }
  };

  if (seciliKonu) return <KonuDetay konu={seciliKonu} geriDon={() => { setSeciliKonu(null); konulariGetir(); }} />;

  const kalanNormal = Math.max(0, GUNLUK_UCRETSIZ_KONU_LIMITI - gunlukKonuSayisi);
  const toplamKalan = kalanNormal + videoHakKalan;
  const limitDoldu = !proAktif && toplamKalan <= 0;

  return (
    <View style={styles.forum}>
      <View pointerEvents="none" style={styles.arkaPlanKatman}>
        <View style={styles.arkaBalonBir} />
        <View style={styles.arkaBalonIki} />
      </View>

      <View style={styles.forumKart}>
        <View style={styles.forumKartUst}>
          <View style={styles.forumIkonKutu}>
            <MaterialCommunityIcons name="forum-outline" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.forumBaslik}>Forum</Text>
            <Text style={styles.forumAlt}>Canlı başlıklar, kategoriler ve topluluk sohbetleri</Text>
          </View>
        </View>
        <View style={styles.forumChipSatiri}>
          <View style={styles.forumChip}>
            <MaterialCommunityIcons name="post-outline" size={13} color="#6D28D9" />
            <Text style={styles.forumChipYazi}>{konular.length} konu</Text>
          </View>
          <View style={styles.forumChip}>
            <MaterialCommunityIcons name="shape-outline" size={13} color="#6D28D9" />
            <Text style={styles.forumChipYazi}>{tumKategoriler.length} kategori</Text>
          </View>
          <View style={styles.forumChip}>
            <MaterialCommunityIcons name={proAktif ? 'crown-outline' : 'clock-outline'} size={13} color="#6D28D9" />
            <Text style={styles.forumChipYazi}>{proAktif ? 'Pro sınırsız' : `${toplamKalan} hak`}</Text>
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtreSatiri}>
        {['Tümü', ...tumKategoriler].map((k) => (
          <TouchableOpacity key={k} style={[styles.filtre, filtre === k && styles.filtreAktif]} onPress={() => setFiltre(k)}>
            <Text style={[styles.filtreYazi, filtre === k && styles.filtreYaziAktif]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={styles.konuAcButon}
        onPress={async () => {
          await kullaniciDurumu();
          setModalAcik(true);
        }}>
        <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
        <Text style={styles.konuAcYazi}>Konu Aç</Text>
      </TouchableOpacity>

      {limitDoldu ? (
        <View style={styles.limitKart}>
          <Text style={styles.limitKartBaslik}>Günlük limit doldu</Text>
          <Text style={styles.limitKartAciklama}>Video izleyerek 1 ek konu açma hakkı alabilirsin. Her video = 1 hak.</Text>
          <TouchableOpacity style={[styles.videoButon, videoYukleniyor && styles.pasif]} disabled={videoYukleniyor} onPress={videoIzleHakkiAl}>
            <Text style={styles.videoButonYazi}>{videoYukleniyor ? 'Video yükleniyor...' : 'Video İzle +1 Hak'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={liste}
        keyExtractor={(i) => String(i.id)}
        refreshControl={
          <RefreshControl
            refreshing={yenileniyor}
            onRefresh={async () => {
              setYenileniyor(true);
              await konulariGetir();
              setYenileniyor(false);
            }}
          />
        }
        renderItem={({ item }) => {
          if (item.tip === 'reklam') return <InlineAd large />;
          const rozet = rozetBilgisi(Number(item.yazarYildiz || 0), !!item.yazarProAktif);
          const yazar = item.yazarId === auth.currentUser?.uid ? '@Sen' : `@${item.yazarKullaniciAdi || 'Gizli Üye'}`;
          return (
            <TouchableOpacity style={styles.kart} onPress={() => setSeciliKonu(item)}>
              <View style={styles.kartUst}>
                <Text style={styles.kartBaslik}>{item.baslik}</Text>
                <Text style={styles.kategoriChip}>{item.kategori || 'Genel'}</Text>
              </View>
              <Text style={styles.kartAciklama} numberOfLines={2}>
                {item.aciklama}
              </Text>
              <View style={styles.kartAlt}>
                <View style={styles.yazarSatir}>
                  <MaterialCommunityIcons name={cinsiyetIconAdi(item.yazarCinsiyet)} size={14} color={yazarRenk(item.yazarCinsiyet)} />
                  <Text style={[styles.yazar, { color: yazarRenk(item.yazarCinsiyet) }]}>{yazar}</Text>
                  {rozet ? <Text style={[styles.rozet, { backgroundColor: rozet.renk }]}>{`Lv.${rozet.seviye} ${rozet.unvan}`}</Text> : null}
                </View>
                <Text style={styles.yanit}>{Number(item.yanitSayisi || 0)} yanıt</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={modalAcik} transparent animationType="slide" statusBarTranslucent onRequestClose={modalKapat}>
        <KeyboardAvoidingView style={styles.modalDis} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalArka} activeOpacity={1} onPress={modalKapat}>
            <TouchableOpacity style={styles.modalKutu} activeOpacity={1} onPress={() => {}}>
              <View style={styles.modalTutacak} />
              <Text style={styles.modalBaslik}>Yeni Konu</Text>

              <TextInput style={styles.input} placeholder="Başlık" value={baslik} onChangeText={setBaslik} />
              <TextInput style={[styles.input, styles.buyukInput]} placeholder="Açıklama" value={aciklama} onChangeText={setAciklama} multiline />

              <View style={styles.kategoriEkleSatir}>
                <TextInput
                  style={[styles.input, styles.kategoriInput]}
                  placeholder="Yeni kategori ekle"
                  value={yeniKategori}
                  onChangeText={setYeniKategori}
                  returnKeyType="done"
                  onSubmitEditing={kategoriEkle}
                />
                <TouchableOpacity style={styles.kategoriEkleButon} onPress={kategoriEkle}>
                  <Text style={styles.kategoriEkleYazi}>Ekle</Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtreSatiri}>
                {tumKategoriler.map((k) => (
                  <TouchableOpacity key={k} style={[styles.filtre, kategori === k && styles.filtreAktif]} onPress={() => setKategori(k)}>
                    <Text style={[styles.filtreYazi, kategori === k && styles.filtreYaziAktif]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.limit}>
                {proAktif ? 'Pro: sınırsız konu açma + reklamsız kullanım.' : `Kalan hak: ${toplamKalan} (normal ${kalanNormal}, video ${videoHakKalan})`}
              </Text>

              {!proAktif && toplamKalan <= 0 ? (
                <TouchableOpacity style={[styles.videoButon, videoYukleniyor && styles.pasif]} disabled={videoYukleniyor} onPress={videoIzleHakkiAl}>
                  <Text style={styles.videoButonYazi}>{videoYukleniyor ? 'Video yükleniyor...' : 'Video İzle +1 Hak'}</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={[styles.kaydet, kaydediliyor && styles.pasif]} disabled={kaydediliyor} onPress={konuOlustur}>
                <Text style={styles.kaydetYazi}>{kaydediliyor ? 'Kaydediliyor...' : 'Paylaş'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default function IndexScreen() {
  const [kullanici, setKullanici] = useState<User | null>(auth.currentUser);
  const [kontrolEdiliyor, setKontrolEdiliyor] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setKullanici(u);
      setKontrolEdiliyor(false);
    });
    return () => unsub();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setKullanici(auth.currentUser);
      setKontrolEdiliyor(false);
    }, [])
  );

  if (kontrolEdiliyor) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6D28D9" />
      </View>
    );
  }

  if (!kullanici) return <GirisFormu onGirisBasarili={() => setKullanici(auth.currentUser)} />;
  return <ForumAkisi />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  container: { flex: 1, backgroundColor: '#EEF2FF', padding: 20, justifyContent: 'center' },
  baslik: { fontSize: 34, fontWeight: '900', textAlign: 'center', color: '#1e1b4b' },
  altBaslik: { textAlign: 'center', color: '#334155', marginTop: 6, marginBottom: 22, fontWeight: '600' },
  tablar: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  tabAktif: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  tabYazi: { color: '#4B5563', fontWeight: '700' },
  tabYaziAktif: { color: '#fff' },
  input: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  buton: { backgroundColor: '#1D4ED8', borderRadius: 12, paddingVertical: 14, marginTop: 4, alignItems: 'center' },
  butonYazi: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pasif: { opacity: 0.65 },
  googleButon: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  googleG: { fontWeight: '900', fontSize: 18 },
  googleButonYazi: { color: '#1F1F1F', fontWeight: '700', fontSize: 15 },
  link: { textAlign: 'center', marginTop: 16, color: '#1D4ED8', fontWeight: '700' },

  forum: { flex: 1, backgroundColor: '#ECF3FF', padding: 16, paddingTop: 56 },
  arkaPlanKatman: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  arkaBalonBir: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(37,99,235,0.14)',
    top: -90,
    right: -70,
  },
  arkaBalonIki: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: 'rgba(14,165,233,0.12)',
    top: 26,
    left: -82,
  },
  forumKart: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  forumKartUst: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  forumIkonKutu: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forumBaslik: { fontSize: 28, fontWeight: '900', color: '#0f172a' },
  forumAlt: { color: '#475569', marginTop: 2, fontWeight: '500' },
  forumChipSatiri: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  forumChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  forumChipYazi: { color: '#1e3a8a', fontWeight: '700', fontSize: 12 },

  filtreSatiri: { gap: 8, paddingBottom: 10 },
  filtre: { borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  filtreAktif: { borderColor: '#1D4ED8', backgroundColor: '#1D4ED8' },
  filtreYazi: { color: '#1E3A8A', fontWeight: '700', fontSize: 12 },
  filtreYaziAktif: { color: '#fff' },
  konuAcButon: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  konuAcYazi: { color: '#fff', fontWeight: '700' },

  limitKart: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  limitKartBaslik: { color: '#1E3A8A', fontWeight: '800', fontSize: 14 },
  limitKartAciklama: { color: '#334155', marginTop: 4, marginBottom: 8 },

  kart: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  kartUst: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  kartBaslik: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  kategoriChip: {
    backgroundColor: '#EFF6FF',
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 11,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  kartAciklama: { marginTop: 6, color: '#4b5563' },
  kartAlt: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yazarSatir: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  yazar: { fontWeight: '700' },
  rozet: { color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  yanit: { color: '#1E3A8A', fontWeight: '700', fontSize: 12 },

  modalDis: { flex: 1 },
  modalArka: { flex: 1, backgroundColor: 'rgba(2,6,23,0.52)', justifyContent: 'flex-end' },
  modalKutu: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalTutacak: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalBaslik: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  buyukInput: { minHeight: 100, textAlignVertical: 'top' },
  kategoriEkleSatir: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  kategoriInput: { flex: 1, marginBottom: 0 },
  kategoriEkleButon: { backgroundColor: '#DBEAFE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  kategoriEkleYazi: { color: '#1D4ED8', fontWeight: '800' },
  limit: { color: '#1E3A8A', fontWeight: '700', marginTop: 8, marginBottom: 6 },
  videoButon: { backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  videoButonYazi: { color: '#fff', fontWeight: '800' },
  kaydet: { backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  kaydetYazi: { color: '#fff', fontWeight: '700' },
});
