import { auth, db } from '@/firebaseConfig';
import {
  dogrudanYazmaKisitiUygula,
  geciciGirisYasagiUygula,
  girisYasagiKaldir,
  suresizGirisYasagiUygula,
  yazmaKisitiKaldir,
} from '@/utils/otomatik-moderasyon';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Rapor = {
  id: string;
  tur: 'konu' | 'yanit';
  hedefId: string;
  konuId: string;
  hedefSahibiId?: string;
  hedefMetin: string;
  hedefFoto?: string;
  neden: string;
  raporlayanEmail: string;
  durum: 'acik' | 'cozuldu';
  sonucTip?: 'cozuldu' | 'ceza_verildi';
  yaptirimTuru?: '12saat' | '3gun' | '7gun' | 'suresiz' | '';
  tarih?: any;
  guncelBaslik?: string;
  guncelMetin?: string;
  guncelFoto?: string;
  hedefKullaniciAdi?: string;
};

const ADMIN_EMAILLER = ['admin@forumapp.com'];

const tarihYaz = (tarih: any) => {
  const d = tarih?.toDate ? tarih.toDate() : new Date();
  return d.toLocaleString('tr-TR');
};

export default function ModerasyonEkrani() {
  const [adminMi, setAdminMi] = useState(false);
  const [raporlar, setRaporlar] = useState<Rapor[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sekme, setSekme] = useState<'bekleyen' | 'ceza'>('bekleyen');

  const kullanici = auth.currentUser;

  const adminKontrol = async () => {
    if (!kullanici?.uid) {
      setAdminMi(false);
      return;
    }

    const mailAdmin = ADMIN_EMAILLER.includes((kullanici.email || '').toLowerCase());
    if (mailAdmin) {
      setAdminMi(true);
      return;
    }

    const snap = await getDoc(doc(db, 'kullanicilar', kullanici.uid));
    const rol = String(snap.data()?.rol || '').toLowerCase();
    setAdminMi(rol === 'admin' || rol === 'moderator');
  };

  const raporuZenginlestir = async (rapor: Rapor): Promise<Rapor> => {
    const sonuc: Rapor = { ...rapor };

    try {
      if (rapor.tur === 'konu') {
        const konuSnap = await getDoc(doc(db, 'konular', rapor.hedefId));
        if (konuSnap.exists()) {
          const konuData = konuSnap.data() as any;
          sonuc.guncelBaslik = String(konuData.baslik || '');
          sonuc.guncelMetin = String(konuData.aciklama || '');
          sonuc.guncelFoto = String(konuData.konuFoto || rapor.hedefFoto || '');
          sonuc.hedefSahibiId = sonuc.hedefSahibiId || String(konuData.yazarId || '');
        }
      } else {
        const yanitSnap = await getDoc(doc(db, 'konular', rapor.konuId, 'yanitlar', rapor.hedefId));
        if (yanitSnap.exists()) {
          const yanitData = yanitSnap.data() as any;
          sonuc.guncelMetin = String(yanitData.metin || rapor.hedefMetin || '');
          sonuc.hedefSahibiId = sonuc.hedefSahibiId || String(yanitData.yazarId || '');
        }
      }

      if (sonuc.hedefSahibiId) {
        const kullaniciSnap = await getDoc(doc(db, 'kullanicilar', sonuc.hedefSahibiId));
        if (kullaniciSnap.exists()) {
          sonuc.hedefKullaniciAdi = String(kullaniciSnap.data().kullaniciAdi || '');
        }
      }
    } catch {
      // Rapor kartı yine de render edilsin.
    }

    return sonuc;
  };

  const raporlariGetir = async () => {
    const q = query(collection(db, 'raporlar'), orderBy('tarih', 'desc'));
    const snap = await getDocs(q);
    const liste = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Rapor[];
    const zenginListe = await Promise.all(liste.map((r) => raporuZenginlestir(r)));
    setRaporlar(zenginListe.filter((r) => r.durum === 'acik' || (r.durum === 'cozuldu' && r.sonucTip === 'ceza_verildi')));
  };

  useEffect(() => {
    const baslat = async () => {
      setYukleniyor(true);
      await adminKontrol();
      await raporlariGetir();
      setYukleniyor(false);
    };
    baslat();
  }, []);

  const raporuKapat = async (
    raporId: string,
    sonucTip: 'cozuldu' | 'ceza_verildi' = 'cozuldu',
    yaptirimTuru: '12saat' | '3gun' | '7gun' | 'suresiz' | '' = ''
  ) => {
    await updateDoc(doc(db, 'raporlar', raporId), {
      durum: 'cozuldu',
      sonucTip,
      yaptirimTuru,
      cozulmeTarihi: new Date(),
      cozulenEmail: kullanici?.email || '',
    });

    if (sonucTip === 'cozuldu') {
      setRaporlar((onceki) => onceki.filter((r) => r.id !== raporId));
    } else {
      setRaporlar((onceki) =>
        onceki.map((r) =>
          r.id === raporId
            ? { ...r, durum: 'cozuldu', sonucTip: 'ceza_verildi', yaptirimTuru }
            : r
        )
      );
    }
  };

  const konuGizleAc = async (rapor: Rapor, gizle: boolean) => {
    try {
      await updateDoc(doc(db, 'konular', rapor.hedefId), { gizlendi: gizle });
      if (!gizle) {
        await raporuKapat(rapor.id);
      }
      Alert.alert('Başarılı', gizle ? 'Konu gizlendi.' : 'Konu tekrar açıldı.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message);
    }
  };

  const yanitGizleAc = async (rapor: Rapor, gizle: boolean) => {
    try {
      await updateDoc(doc(db, 'konular', rapor.konuId, 'yanitlar', rapor.hedefId), { gizlendi: gizle });
      if (!gizle) {
        await raporuKapat(rapor.id);
      }
      Alert.alert('Başarılı', gizle ? 'Yanıt gizlendi.' : 'Yanıt tekrar açıldı.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message);
    }
  };

  const kullaniciyaYaptirimUygula = async (rapor: Rapor, yaptirim: '12saat' | '3gun' | '7gun' | 'suresiz') => {
    if (!rapor.hedefSahibiId) {
      Alert.alert('Uyarı', 'Raporlanan içerik sahibinin kullanıcı kimliği bulunamadı.');
      return;
    }

    try {
      if (yaptirim === '12saat') {
        await dogrudanYazmaKisitiUygula(rapor.hedefSahibiId, 'Moderasyon karari:', 12);
      } else if (yaptirim === '3gun') {
        await geciciGirisYasagiUygula(rapor.hedefSahibiId, 'Moderasyon karari:', 3);
      } else if (yaptirim === '7gun') {
        await geciciGirisYasagiUygula(rapor.hedefSahibiId, 'Moderasyon karari:', 7);
      } else {
        await suresizGirisYasagiUygula(rapor.hedefSahibiId, 'Moderasyon karari:');
      }

      await raporuKapat(rapor.id, 'ceza_verildi', yaptirim);
      Alert.alert('Başarılı', 'Yaptırım uygulandı ve rapor çözüldü olarak işaretlendi.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message || 'Yaptırım uygulanamadı.');
    }
  };

  const yaptirimiKaldir = async (rapor: Rapor, tur: 'yazma' | 'giris') => {
    if (!rapor.hedefSahibiId) {
      Alert.alert('Uyarı', 'Raporlanan içerik sahibinin kullanıcı kimliği bulunamadı.');
      return;
    }

    try {
      if (tur === 'yazma') {
        await yazmaKisitiKaldir(rapor.hedefSahibiId, 'Moderasyon karari:');
      } else {
        await girisYasagiKaldir(rapor.hedefSahibiId, 'Moderasyon karari:');
      }

      await raporlariGetir();
      Alert.alert('Başarılı', tur === 'yazma' ? 'Yazma engeli kaldırıldı.' : 'Giriş yasağı kaldırıldı.');
    } catch (hata: any) {
      Alert.alert('Hata', hata.message || 'Yaptırım kaldırılamadı.');
    }
  };

  const bekleyenRaporlar = useMemo(() => raporlar.filter((r) => r.durum === 'acik'), [raporlar]);
  const cezaVerilenRaporlar = useMemo(
    () => raporlar.filter((r) => r.durum === 'cozuldu' && r.sonucTip === 'ceza_verildi'),
    [raporlar]
  );
  const gosterilecekRaporlar = sekme === 'bekleyen' ? bekleyenRaporlar : cezaVerilenRaporlar;

  if (yukleniyor) {
    return (
      <View style={styles.container}>
        <Text style={styles.baslik}>Moderasyon</Text>
        <Text style={styles.alt}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!adminMi) {
    return (
      <View style={styles.container}>
        <Text style={styles.baslik}>Moderasyon</Text>
        <Text style={styles.alt}>Bu ekrana sadece admin/moderatör erişebilir.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.baslik}>Moderasyon</Text>
      <View style={styles.sekmeSatiri}>
        <TouchableOpacity
          style={[styles.sekmeButon, sekme === 'bekleyen' && styles.sekmeButonAktif]}
          onPress={() => setSekme('bekleyen')}>
          <Text style={[styles.sekmeYazi, sekme === 'bekleyen' && styles.sekmeYaziAktif]}>
            Bekleyenler ({bekleyenRaporlar.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sekmeButon, sekme === 'ceza' && styles.sekmeButonAktif]}
          onPress={() => setSekme('ceza')}>
          <Text style={[styles.sekmeYazi, sekme === 'ceza' && styles.sekmeYaziAktif]}>
            Ceza Verilenler ({cezaVerilenRaporlar.length})
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={gosterilecekRaporlar}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.kart, item.durum === 'cozuldu' && styles.kartCozuldu]}>
            <Text style={styles.etiket}>{item.tur === 'konu' ? 'Konu Raporu' : 'Yanıt Raporu'}</Text>
            <Text style={styles.metin}>Neden: {item.neden}</Text>
            <Text style={styles.metin}>Raporlayan: {item.raporlayanEmail || '-'}</Text>
            <Text style={styles.metin}>Hedef kullanıcı: {item.hedefKullaniciAdi ? `@${item.hedefKullaniciAdi}` : '-'}</Text>
            {item.guncelBaslik ? <Text style={styles.baslikSatiri}>Başlık: {item.guncelBaslik}</Text> : null}
            <Text style={styles.icerik}>İçerik: {item.guncelMetin || item.hedefMetin || '-'}</Text>

            {(item.guncelFoto || item.hedefFoto) ? (
              <Image source={{ uri: item.guncelFoto || item.hedefFoto || '' }} style={styles.raporFoto} />
            ) : null}

            <Text style={styles.tarih}>{tarihYaz(item.tarih)}</Text>
            <Text style={styles.durum}>Durum: {item.durum}</Text>

            <View style={styles.butonsatir}>
              {item.tur === 'konu' ? (
                <>
                  <TouchableOpacity style={styles.kirmiziButon} onPress={() => konuGizleAc(item, true)}>
                    <Text style={styles.butonyazi}>Konuyu Gizle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.griButon} onPress={() => konuGizleAc(item, false)}>
                    <Text style={styles.butonyazi}>Konuyu Aç</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.kirmiziButon} onPress={() => yanitGizleAc(item, true)}>
                    <Text style={styles.butonyazi}>Yanıt Gizle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.griButon} onPress={() => yanitGizleAc(item, false)}>
                    <Text style={styles.butonyazi}>Yanıt Aç</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {item.durum !== 'cozuldu' ? (
              <>
                <Text style={styles.yaptirimBaslik}>Yaptırım uygula</Text>
                <View style={styles.yaptirimSatiri}>
                  <TouchableOpacity style={styles.turuncuButon} onPress={() => kullaniciyaYaptirimUygula(item, '12saat')}>
                    <Text style={styles.butonyazi}>12 Saat Katılım Engeli</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.yaptirimSatiri}>
                  <TouchableOpacity style={styles.sariButon} onPress={() => kullaniciyaYaptirimUygula(item, '3gun')}>
                    <Text style={styles.butonyazi}>3 Gün Ban</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sariKoyuButon} onPress={() => kullaniciyaYaptirimUygula(item, '7gun')}>
                    <Text style={styles.butonyazi}>7 Gün Ban</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.siyahButon} onPress={() => kullaniciyaYaptirimUygula(item, 'suresiz')}>
                  <Text style={styles.butonyazi}>Süresiz Ban</Text>
                </TouchableOpacity>

                <Text style={styles.yaptirimBaslik}>Yaptırım kaldır</Text>
                <View style={styles.yaptirimSatiri}>
                  <TouchableOpacity style={styles.maviButon} onPress={() => yaptirimiKaldir(item, 'yazma')}>
                    <Text style={styles.butonyazi}>12 Saat Engeli Kaldır</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.yaptirimSatiri}>
                  <TouchableOpacity style={styles.maviKoyuButon} onPress={() => yaptirimiKaldir(item, 'giris')}>
                    <Text style={styles.butonyazi}>Giriş Banını Kaldır</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.cozButon} onPress={() => raporuKapat(item.id)}>
                  <Text style={styles.cozYazi}>Sadece Çözüldü Olarak İşaretle</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.yaptirimBaslik}>Uygulanan Ceza: {item.yaptirimTuru || '-'}</Text>
                <Text style={styles.yaptirimBaslik}>Yaptırım kaldır</Text>
                <View style={styles.yaptirimSatiri}>
                  <TouchableOpacity style={styles.maviButon} onPress={() => yaptirimiKaldir(item, 'yazma')}>
                    <Text style={styles.butonyazi}>12 Saat Engeli Kaldır</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.yaptirimSatiri}>
                  <TouchableOpacity style={styles.maviKoyuButon} onPress={() => yaptirimiKaldir(item, 'giris')}>
                    <Text style={styles.butonyazi}>Giriş Banını Kaldır</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.alt}>
            {sekme === 'bekleyen' ? 'Bekleyen rapor yok.' : 'Henüz ceza verilen rapor yok.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16, paddingTop: 56 },
  baslik: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  alt: { color: '#6b7280' },
  sekmeSatiri: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  sekmeButon: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 10, alignItems: 'center' },
  sekmeButonAktif: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  sekmeYazi: { color: '#374151', fontWeight: '700', fontSize: 12 },
  sekmeYaziAktif: { color: '#fff' },
  kart: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  kartCozuldu: { opacity: 0.7 },
  etiket: { fontWeight: '700', color: '#1d4ed8', marginBottom: 6 },
  metin: { color: '#374151', marginBottom: 3 },
  baslikSatiri: { color: '#111827', marginTop: 4, fontWeight: '700' },
  icerik: { color: '#111827', marginVertical: 6 },
  raporFoto: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8 },
  tarih: { color: '#6b7280', fontSize: 12 },
  durum: { marginTop: 4, fontWeight: '600' },
  butonsatir: { flexDirection: 'row', gap: 8, marginTop: 10 },
  kirmiziButon: { flex: 1, backgroundColor: '#dc2626', padding: 10, borderRadius: 10, alignItems: 'center' },
  griButon: { flex: 1, backgroundColor: '#4b5563', padding: 10, borderRadius: 10, alignItems: 'center' },
  turuncuButon: { flex: 1, backgroundColor: '#ea580c', padding: 10, borderRadius: 10, alignItems: 'center' },
  sariButon: { flex: 1, backgroundColor: '#d97706', padding: 10, borderRadius: 10, alignItems: 'center' },
  sariKoyuButon: { flex: 1, backgroundColor: '#b45309', padding: 10, borderRadius: 10, alignItems: 'center' },
  siyahButon: { marginTop: 8, backgroundColor: '#111827', padding: 10, borderRadius: 10, alignItems: 'center' },
  maviButon: { flex: 1, backgroundColor: '#2563eb', padding: 10, borderRadius: 10, alignItems: 'center' },
  maviKoyuButon: { flex: 1, backgroundColor: '#1d4ed8', padding: 10, borderRadius: 10, alignItems: 'center' },
  butonyazi: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  yaptirimBaslik: { marginTop: 12, marginBottom: 6, color: '#6b7280', fontWeight: '700' },
  yaptirimSatiri: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cozButon: { marginTop: 10, backgroundColor: '#16a34a', padding: 10, borderRadius: 10, alignItems: 'center' },
  cozYazi: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
