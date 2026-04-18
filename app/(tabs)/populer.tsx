import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { auth, db } from '@/firebaseConfig';
import { useIsFocused } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import KonuDetay from './konu';
import InlineAd from '@/components/inline-ad';

const cinsiyetNormalizeEt = (cinsiyet: any): 'kadin' | 'erkek' => {
  const temiz = String(cinsiyet || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return temiz === 'erkek' ? 'erkek' : 'kadin';
};

const yazarRenk = (cinsiyet: any) => (cinsiyetNormalizeEt(cinsiyet) === 'erkek' ? '#2563EB' : '#ec4899');
const cinsiyetIconAdi = (cinsiyet: any) => (cinsiyetNormalizeEt(cinsiyet) === 'erkek' ? 'gender-male' : 'gender-female');
const KONU_OTOMATIK_SILME_GUN = 30;
const rozetBilgisi = (yildiz: number, proAktif?: boolean) => {
  if (proAktif) return { etiket: 'EFSANE', arkaPlan: '#f59e0b', yazi: '#fff' };
  if (yildiz >= 1500) return { etiket: 'EFSANE', arkaPlan: '#f59e0b', yazi: '#fff' };
  if (yildiz >= 900) return { etiket: 'ANNE', arkaPlan: '#7f1d1d', yazi: '#fff' };
  if (yildiz >= 500) return { etiket: 'ANNE YARISI', arkaPlan: '#78350f', yazi: '#fff' };
  if (yildiz >= 350) return { etiket: 'ABLA', arkaPlan: '#166534', yazi: '#fff' };
  return null;
};

export default function PopulerEkrani() {
  const ekranOdakta = useIsFocused();
  const [konular, setKonular] = useState<any[]>([]);
  const [seciliKonu, setSeciliKonu] = useState<any>(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [proAktif, setProAktif] = useState(false);

  const konulariGetir = async () => {
    const gecerlilikBaslangici = new Date(Date.now() - KONU_OTOMATIK_SILME_GUN * 24 * 60 * 60 * 1000);
    const konularSnap = await getDocs(
      query(collection(db, 'konular'), where('tarih', '>=', gecerlilikBaslangici), orderBy('tarih', 'desc'), limit(80))
    );

    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        const userSnap = await getDoc(doc(db, 'kullanicilar', uid));
        setProAktif(!!userSnap.data()?.proAktif);
      } catch {
        setProAktif(false);
      }
    } else {
      setProAktif(false);
    }

    const liste = konularSnap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          yazarKullaniciAdi: data.yazarKullaniciAdi || 'Gizli Üye',
          yazarCinsiyet: cinsiyetNormalizeEt(data.yazarCinsiyet),
          yazarYildiz: Number(data.yazarYildiz || 0),
          yazarProAktif: !!data.yazarProAktif,
        };
      })
      .filter((k) => !k.gizlendi)
      .sort((a, b) => {
        const y1 = Number(a.yanitSayisi || 0);
        const y2 = Number(b.yanitSayisi || 0);
        if (y2 !== y1) return y2 - y1;
        return (b?.tarih?.toDate?.()?.getTime?.() || 0) - (a?.tarih?.toDate?.()?.getTime?.() || 0);
      });

    setKonular(liste);
  };

  useEffect(() => {
    if (!ekranOdakta) return;
    konulariGetir().catch(() => {});
  }, [ekranOdakta]);

  useEffect(() => {
    if (!ekranOdakta) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setProAktif(false);
      return;
    }

    const ref = doc(db, 'kullanicilar', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProAktif(!!snap.data()?.proAktif);
      },
      () => {}
    );
    return () => unsub();
  }, [ekranOdakta]);

  const ilkUc = useMemo(() => new Set(konular.slice(0, 3).map((k) => k.id)), [konular]);
  const listeVerisi = useMemo(() => {
    const sonuc: any[] = [];
    konular.forEach((konu, index) => {
      sonuc.push({ ...konu, listeTipi: 'konu', konuSirasi: index + 1 });
      if (!proAktif && (index + 1) % 5 === 0) {
        sonuc.push({
          id: `reklam-${index + 1}`,
          listeTipi: 'reklam',
          baslik: 'Sponsorlu İçerik',
          aciklama: 'Reklam alanı',
        });
      }
    });
    return sonuc;
  }, [konular, proAktif]);

  const yenile = async () => {
    if (!ekranOdakta) return;
    setYenileniyor(true);
    await konulariGetir();
    setYenileniyor(false);
  };

  if (seciliKonu) {
    return (
      <KonuDetay
        konu={seciliKonu}
        geriDon={() => {
          setSeciliKonu(null);
          konulariGetir();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.arkaPlanKatman}>
        <View style={styles.arkaBalonBir} />
        <View style={styles.arkaBalonIki} />
      </View>

      <View style={styles.ustKart}>
        <View style={styles.baslikSatiri}>
          <View style={styles.baslikIkonKutu}>
            <MaterialCommunityIcons name="trophy-outline" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.baslik}>Popüler</Text>
            <Text style={styles.alt}>En popüler konular</Text>
          </View>
        </View>
        <View style={styles.ozetSatiri}>
          <View style={styles.ozetChip}>
            <MaterialCommunityIcons name="format-list-numbered" size={14} color="#7c3aed" />
            <Text style={styles.ozetYazi}>{konular.length} konu</Text>
          </View>
          <View style={styles.ozetChip}>
            <MaterialCommunityIcons name={proAktif ? 'shield-crown-outline' : 'shield-outline'} size={14} color="#4C1D95" />
            <Text style={styles.ozetYazi}>{proAktif ? 'Pro aktif' : 'Ücretsiz mod'}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={listeVerisi}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={yenileniyor} onRefresh={yenile} />}
        renderItem={({ item }) => {
          if (item.listeTipi === 'reklam') {
            return (
              <InlineAd />
            );
          }

          const yazarGorunumu = item.yazarId === auth.currentUser?.uid ? '@Sen' : `@${item.yazarKullaniciAdi || 'Gizli Üye'}`;
          const populerMi = ilkUc.has(item.id);
          const rozet = rozetBilgisi(Number(item.yazarYildiz || 0), !!item.yazarProAktif);

          return (
            <TouchableOpacity style={styles.konuKart} onPress={() => setSeciliKonu(item)}>
              <View style={styles.ustSatir}>
                <View style={styles.siraChip}>
                  <Text style={styles.sira}>#{item.konuSirasi || 0}</Text>
                </View>
                {populerMi ? (
                  <View style={styles.populerEtiketChip}>
                    <MaterialCommunityIcons name="fire" size={12} color="#fff" />
                    <Text style={styles.populerEtiket}>POPÜLER</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.konuBaslik}>{item.baslik}</Text>
              <Text style={styles.konuAciklama} numberOfLines={2}>{item.aciklama}</Text>

              <View style={styles.altSatir}>
                <View style={styles.yazarSatir}>
                  <MaterialCommunityIcons name={cinsiyetIconAdi(item.yazarCinsiyet)} size={15} color={yazarRenk(item.yazarCinsiyet)} />
                  <Text style={[styles.konuYazar, { color: yazarRenk(item.yazarCinsiyet) }]}>{yazarGorunumu}</Text>
                  {rozet ? (
                    <View style={[styles.rozetEtiket, { backgroundColor: rozet.arkaPlan }]}>
                      <Text style={[styles.rozetEtiketYazi, { color: rozet.yazi }]}>{rozet.etiket}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.yanitChip}>
                  <MaterialCommunityIcons name="comment-outline" size={13} color="#6b7280" />
                  <Text style={styles.yanit}>{Number(item.yanitSayisi || 0)} yanıt</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.bos}>Henüz popüler konu yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF', padding: 16, paddingTop: 56 },
  arkaPlanKatman: { position: 'absolute', top: 0, left: 0, right: 0, height: 230 },
  arkaBalonBir: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.1)',
    top: -90,
    right: -66,
  },
  arkaBalonIki: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.1)',
    top: 24,
    left: -76,
  },
  ustKart: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
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
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baslik: { fontSize: 27, fontWeight: '800', color: '#111827' },
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
  konuKart: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  reklamKart: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    minHeight: 120,
    justifyContent: 'center',
  },
  reklamEtiket: {
    alignSelf: 'flex-start',
    backgroundColor: '#f59e0b',
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  reklamAciklama: { color: '#78350f', fontWeight: '600' },
  ustSatir: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  siraChip: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sira: { color: '#111827', fontWeight: '700' },
  populerEtiketChip: {
    backgroundColor: '#f59e0b',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  populerEtiket: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  konuBaslik: { fontSize: 16, fontWeight: '700', color: '#111827' },
  konuAciklama: { marginTop: 4, color: '#4b5563' },
  altSatir: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yazarSatir: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rozetEtiket: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rozetEtiketYazi: { fontSize: 10, fontWeight: '800' },
  konuYazar: { fontWeight: '700' },
  yanitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  yanit: { color: '#4C1D95', fontWeight: '700', fontSize: 12 },
  bos: { marginTop: 40, textAlign: 'center', color: '#9ca3af' },
});
