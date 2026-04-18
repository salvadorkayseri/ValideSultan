import { auth, db } from '@/firebaseConfig';
import { expoPushGonder } from '@/utils/push-bildirim';
import { addDoc, collection, doc, getDoc } from 'firebase/firestore';

type BildirimTipi = 'yanit' | 'yildiz' | 'sistem';

type BildirimInput = {
  aliciId: string;
  tip: BildirimTipi;
  mesaj: string;
  konuId?: string;
};

const bildirimBasligi = (tip: BildirimTipi) => {
  if (tip === 'yanit') return 'ValideSultan - Yeni Yanıt';
  if (tip === 'yildiz') return 'ValideSultan - Yeni Yıldız';
  return 'ValideSultan - Bildirim';
};

export async function bildirimGonder({ aliciId, tip, mesaj, konuId }: BildirimInput) {
  const gonderen = auth.currentUser;
  if (!gonderen?.uid || !aliciId) return;
  if (gonderen.uid === aliciId) return;

  try {
    await addDoc(collection(db, 'kullanicilar', aliciId, 'bildirimler'), {
      tip,
      mesaj,
      konuId: konuId || '',
      gonderenId: gonderen.uid,
      gonderenEmail: gonderen.email || '',
      okundu: false,
      tarih: new Date(),
    });

    const aliciSnap = await getDoc(doc(db, 'kullanicilar', aliciId));
    const token = String((aliciSnap.data() as any)?.expoPushToken || '').trim();
    if (token) {
      await expoPushGonder(token, bildirimBasligi(tip), mesaj, {
        tip,
        konuId: konuId || '',
      });
    }
  } catch (hata) {
    console.log('Bildirim gonderme hatasi:', hata);
  }
}

type SistemBildirimInput = {
  aliciId: string;
  mesaj: string;
  konuId?: string;
};

export async function sistemBildirimiGonder({ aliciId, mesaj, konuId }: SistemBildirimInput) {
  if (!aliciId) return;

  try {
    await addDoc(collection(db, 'kullanicilar', aliciId, 'bildirimler'), {
      tip: 'sistem',
      mesaj,
      konuId: konuId || '',
      gonderenId: 'sistem',
      gonderenEmail: 'sistem@forumapp',
      okundu: false,
      tarih: new Date(),
    });

    const aliciSnap = await getDoc(doc(db, 'kullanicilar', aliciId));
    const token = String((aliciSnap.data() as any)?.expoPushToken || '').trim();
    if (token) {
      await expoPushGonder(token, 'ValideSultan - Bildirim', mesaj, {
        tip: 'sistem',
        konuId: konuId || '',
      });
    }
  } catch (hata) {
    console.log('Sistem bildirimi gonderme hatasi:', hata);
  }
}
