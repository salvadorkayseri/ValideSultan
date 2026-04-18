import { auth, db } from '@/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import KonuDetay from './konu';

type Bildirim = {
  id: string;
  mesaj: string;
  tip: 'yanit' | 'yildiz' | 'sistem';
  okundu: boolean;
  tarih?: any;
  konuId?: string;
};

const tarihMetni = (tarih: any) => {
  const d = tarih?.toDate ? tarih.toDate() : new Date();
  return d.toLocaleString('tr-TR');
};

const tipEtiketi = (tip: Bildirim['tip']) => (tip === 'yanit' ? 'Yeni Yanıt' : tip === 'yildiz' ? 'Yeni Yıldız' : 'Sistem');
const tipIkonu = (tip: Bildirim['tip']) =>
  tip === 'yanit' ? 'message-reply-text-outline' : tip === 'yildiz' ? 'star-four-points-outline' : 'shield-alert-outline';
const tipRengi = (tip: Bildirim['tip']) => (tip === 'yanit' ? '#2563eb' : tip === 'yildiz' ? '#d97706' : '#dc2626');

export default function BildirimlerEkrani() {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const [kullaniciVar, setKullaniciVar] = useState(false);
  const [izinHatasi, setIzinHatasi] = useState('');
  const [seciliKonu, setSeciliKonu] = useState<any>(null);
  const temizlemeSuruyorRef = useRef(false);

  const bildirimlerTemizle = async (uid: string, tumu: Bildirim[]) => {
    if (temizlemeSuruyorRef.current) return;
    const sinir = Date.now() - 24 * 60 * 60 * 1000;
    const eski = tumu.filter((b) => {
      const ms = b?.tarih?.toDate ? b.tarih.toDate().getTime() : 0;
      return ms > 0 && ms < sinir;
    });
    if (eski.length === 0) return;

    temizlemeSuruyorRef.current = true;
    try {
      const batch = writeBatch(db);
      eski.forEach((b) => {
        batch.delete(doc(db, 'kullanicilar', uid, 'bildirimler', b.id));
      });
      await batch.commit();
    } catch {
      // Temizleme başarısız olsa da ekran çalışmaya devam etsin.
    } finally {
      temizlemeSuruyorRef.current = false;
    }
  };

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (kullanici) => {
      unsubSnapshot?.();
      unsubSnapshot = null;

      const uid = kullanici?.uid;
      if (!uid) {
        setKullaniciVar(false);
        setIzinHatasi('');
        setBildirimler([]);
        return;
      }

      setKullaniciVar(true);
      setIzinHatasi('');

      const q = query(collection(db, 'kullanicilar', uid, 'bildirimler'), orderBy('tarih', 'desc'));
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          const tumListe = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Bildirim[];
          const sinir = Date.now() - 24 * 60 * 60 * 1000;
          const liste = tumListe.filter((b) => {
            const ms = b?.tarih?.toDate ? b.tarih.toDate().getTime() : Date.now();
            return ms >= sinir;
          });
          setBildirimler(liste);
          bildirimlerTemizle(uid, tumListe).catch(() => {});
        },
        (hata) => {
          const kod = String((hata as any)?.code || '');
          setIzinHatasi(kod === 'permission-denied' ? 'Bildirimleri görüntüleme izni bulunamadı.' : 'Bildirimler yüklenirken bir hata oluştu.');
          setBildirimler([]);
        }
      );
    });

    return () => {
      unsubSnapshot?.();
      unsubAuth();
    };
  }, []);

  const okunmamisSayi = useMemo(() => bildirimler.filter((b) => !b.okundu).length, [bildirimler]);
  const toplamSayi = bildirimler.length;

  const tekiniOkunduYap = async (id: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'kullanicilar', uid, 'bildirimler', id), { okundu: true });
  };

  const bildirimeGit = async (bildirim: Bildirim) => {
    await tekiniOkunduYap(bildirim.id);
    const konuId = String(bildirim.konuId || '').trim();
    if (!konuId) return;
    try {
      const konuSnap = await getDoc(doc(db, 'konular', konuId));
      if (!konuSnap.exists()) return;
      setSeciliKonu({ id: konuSnap.id, ...konuSnap.data() });
    } catch {}
  };

  const tumunuOkunduYap = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const okunmamis = bildirimler.filter((b) => !b.okundu);
    if (okunmamis.length === 0) return;

    const batch = writeBatch(db);
    okunmamis.forEach((b) => {
      batch.update(doc(db, 'kullanicilar', uid, 'bildirimler', b.id), { okundu: true });
    });
    await batch.commit();
  };

  if (!kullaniciVar) {
    return (
      <View style={styles.container}>
        <View pointerEvents="none" style={styles.arkaPlanKatman}>
          <View style={styles.arkaBalonBir} />
          <View style={styles.arkaBalonIki} />
        </View>
        <View style={styles.heroKart}>
          <View style={styles.heroBaslikSatiri}>
            <View style={styles.heroIkonKutu}>
              <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#fff" />
            </View>
            <View>
              <Text style={styles.baslik}>Bildirimler</Text>
              <Text style={styles.alt}>Giriş yapınca bildirimlerini burada görürsün.</Text>
            </View>
          </View>
        </View>
        <Text style={styles.bos}>Bildirimleri görmek için giriş yapmalısın.</Text>
      </View>
    );
  }

  if (izinHatasi) {
    return (
      <View style={styles.container}>
        <View pointerEvents="none" style={styles.arkaPlanKatman}>
          <View style={styles.arkaBalonBir} />
          <View style={styles.arkaBalonIki} />
        </View>
        <View style={styles.heroKart}>
          <View style={styles.heroBaslikSatiri}>
            <View style={styles.heroIkonKutu}>
              <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#fff" />
            </View>
            <View>
              <Text style={styles.baslik}>Bildirimler</Text>
              <Text style={styles.alt}>Bildirim erişim durumun kontrol ediliyor.</Text>
            </View>
          </View>
        </View>
        <Text style={styles.bos}>{izinHatasi}</Text>
      </View>
    );
  }

  if (seciliKonu) {
    return <KonuDetay konu={seciliKonu} geriDon={() => setSeciliKonu(null)} />;
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.arkaPlanKatman}>
        <View style={styles.arkaBalonBir} />
        <View style={styles.arkaBalonIki} />
      </View>

      <View style={styles.heroKart}>
        <View style={styles.heroBaslikSatiri}>
          <View style={styles.heroIkonKutu}>
            <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.baslik}>Bildirimler</Text>
            <Text style={styles.alt}>Son 24 saat içindeki bildirimlerin burada.</Text>
          </View>
        </View>

        <View style={styles.sayacSatiri}>
          <View style={styles.sayacChip}>
            <MaterialCommunityIcons name="bell-badge-outline" size={14} color="#4f46e5" />
            <Text style={styles.sayacChipYazi}>{okunmamisSayi} okunmamış</Text>
          </View>
          <View style={styles.sayacChip}>
            <MaterialCommunityIcons name="format-list-bulleted" size={14} color="#0f766e" />
            <Text style={styles.sayacChipYazi}>{toplamSayi} toplam</Text>
          </View>
        </View>
      </View>

      <View style={styles.aksiyonSatiri}>
        <TouchableOpacity style={styles.temizleButon} onPress={tumunuOkunduYap}>
          <MaterialCommunityIcons name="check-all" size={15} color="#312e81" />
          <Text style={styles.temizleYazi}>Tümünü okundu yap</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={bildirimler}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => bildirimeGit(item)} style={[styles.kart, !item.okundu && styles.kartOkunmamis]}>
            <View style={styles.kartUst}>
              <View style={[styles.tipIkonKutu, { backgroundColor: `${tipRengi(item.tip)}20` }]}> 
                <MaterialCommunityIcons name={tipIkonu(item.tip)} size={14} color={tipRengi(item.tip)} />
              </View>
              <View style={styles.kartBaslikKutu}>
                <Text style={[styles.tip, { color: tipRengi(item.tip) }]}>{tipEtiketi(item.tip)}</Text>
                <Text style={styles.mesaj}>{item.mesaj}</Text>
              </View>
              {!item.okundu ? <View style={styles.okunmamisNokta} /> : null}
            </View>
            <View style={styles.kartAlt}>
              <Text style={styles.tarih}>{tarihMetni(item.tarih)}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#94a3b8" />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.bosKutu}>
            <MaterialCommunityIcons name="bell-sleep-outline" size={28} color="#94a3b8" />
            <Text style={styles.bos}>Henüz bildirimin yok.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16, paddingTop: 56 },
  arkaPlanKatman: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  arkaBalonBir: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: 'rgba(79,70,229,0.09)',
    top: -78,
    right: -58,
  },
  arkaBalonIki: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(14,165,233,0.09)',
    top: 28,
    left: -72,
  },
  heroKart: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
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
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baslik: { fontSize: 27, fontWeight: '800', color: '#111827' },
  alt: { marginTop: 2, marginBottom: 0, color: '#475569', fontWeight: '500' },
  sayacSatiri: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sayacChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sayacChipYazi: { color: '#334155', fontWeight: '700', fontSize: 12 },
  aksiyonSatiri: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  temizleButon: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  temizleYazi: { color: '#312e81', fontWeight: '700' },
  kart: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  kartOkunmamis: { borderColor: '#818cf8', backgroundColor: '#eef2ff' },
  kartUst: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  tipIkonKutu: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kartBaslikKutu: { flex: 1, minWidth: 0 },
  tip: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  mesaj: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  okunmamisNokta: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#4f46e5', marginTop: 6 },
  kartAlt: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tarih: { fontSize: 12, color: '#64748b' },
  bosKutu: {
    marginTop: 34,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    alignItems: 'center',
    padding: 18,
    gap: 6,
  },
  bos: { textAlign: 'center', color: '#94a3b8', fontWeight: '600' },
});
