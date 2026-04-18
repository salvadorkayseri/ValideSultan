import { db } from '@/firebaseConfig';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

const expoProjeIdBul = () => {
  const easProjectId = (Constants as any)?.easConfig?.projectId;
  const expoExtraProjectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  return String(easProjectId || expoExtraProjectId || '').trim();
};

const androidKanalHazirla = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('genel-bildirimler', {
      name: 'Genel Bildirimler',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4f46e5',
    });
  } catch {}
};

export const pushTokenAl = async () => {
  try {
    await androidKanalHazirla();
    const izin = await Notifications.getPermissionsAsync();
    let durum = izin.status;
    if (durum !== 'granted') {
      const istek = await Notifications.requestPermissionsAsync();
      durum = istek.status;
    }
    if (durum !== 'granted') return null;

    const projeId = expoProjeIdBul();
    const tokenSonuc = projeId
      ? await Notifications.getExpoPushTokenAsync({ projectId: projeId })
      : await Notifications.getExpoPushTokenAsync();
    const token = String(tokenSonuc?.data || '').trim();
    return token || null;
  } catch {
    return null;
  }
};

export const pushTokenunuKaydet = async (uid: string) => {
  if (!uid) return null;
  const token = await pushTokenAl();
  if (!token) return null;
  try {
    await updateDoc(doc(db, 'kullanicilar', uid), {
      expoPushToken: token,
      pushTokenUpdatedAt: new Date(),
    });
  } catch {}
  return token;
};

export const expoPushGonder = async (token: string, baslik: string, mesaj: string, data?: Record<string, any>) => {
  if (!token) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: baslik,
        body: mesaj,
        channelId: 'genel-bildirimler',
        data: data || {},
      }),
    });
  } catch {}
};
