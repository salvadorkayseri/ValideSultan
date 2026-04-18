import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { auth, db } from '@/firebaseConfig';
import { aktifProDurumuGetir, odemeSistemiHazirMi } from '@/utils/pro-uyelik';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const kadinMiKontrol = (cinsiyet: any) => {
  const norm = String(cinsiyet || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!norm) return true;
  return norm === 'kadin' || norm.includes('kadin') || norm === 'female' || norm === 'woman';
};
const yildizaGoreRozet = (yildiz: number) => {
  if (yildiz >= 1500) return 'Efsane';
  if (yildiz >= 900) return 'Anne';
  if (yildiz >= 500) return 'Anne Yarısı';
  if (yildiz >= 350) return 'Abla';
  return 'Yeni Üye';
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [oturumAcik, setOturumAcik] = useState(!!auth.currentUser);
  const [oturumKontrolEdiliyor, setOturumKontrolEdiliyor] = useState(true);
  const [moderatorMu, setModeratorMu] = useState(false);
  const [kadinMi, setKadinMi] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (kullanici) => {
      setOturumKontrolEdiliyor(true);
      setOturumAcik(!!kullanici);

      if (!kullanici?.uid) {
        setModeratorMu(false);
        setKadinMi(false);
        setOturumKontrolEdiliyor(false);
        return;
      }

      const mailAdmin = (kullanici.email || '').toLowerCase() === 'admin@forumapp.com';
      if (mailAdmin) {
        setModeratorMu(true);
        setKadinMi(true);
        setOturumKontrolEdiliyor(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'kullanicilar', kullanici.uid));
        const data = snap.data() as any;
        const rol = String(data?.rol || '').toLowerCase();
        const cinsiyet = data?.cinsiyet;
        setModeratorMu(rol === 'admin' || rol === 'moderator');
        setKadinMi(kadinMiKontrol(cinsiyet));

        // Abonelik süresi bitince Pro'nun otomatik kapanması için mağaza senkronu.
        if (odemeSistemiHazirMi()) {
          try {
            const proDurumu = await aktifProDurumuGetir();
            const mevcutPro = !!data?.proAktif;
            if (mevcutPro !== proDurumu.proAktif) {
              const yildiz = Number(data?.yildiz || 0);
              await updateDoc(doc(db, 'kullanicilar', kullanici.uid), {
                proAktif: proDurumu.proAktif,
                ...(proDurumu.proAktif
                  ? { rozet: 'Efsane' }
                  : {
                      rozet: yildizaGoreRozet(yildiz),
                      proPaketId: null,
                      proPaketEtiket: null,
                      proPaketAy: null,
                      proPaketFiyat: null,
                      proBaslangic: null,
                      proBitis: null,
                    }),
              });
            }
          } catch {
            // Mağaza sorgusu anlık başarısızsa mevcut değer korunur.
          }
        }
      } catch {
        setModeratorMu(false);
        setKadinMi(true);
      } finally {
        setOturumKontrolEdiliyor(false);
      }
    });
    return () => unsub();
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: oturumAcik && !oturumKontrolEdiliyor
          ? {
              height: 68,
              paddingTop: 6,
              paddingBottom: 8,
              borderTopWidth: 0,
              elevation: 10,
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: -4 },
            }
          : { display: 'none' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Forum',
          href: oturumKontrolEdiliyor ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Reva\u00e7ta',
          href: oturumAcik && !oturumKontrolEdiliyor ? undefined : null,
          unmountOnBlur: true,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sparkles" color={color} />,
        }}
      />
      <Tabs.Screen
        name="populer"
        options={{
          title: 'Pop\u00fcler',
          href: oturumAcik && !oturumKontrolEdiliyor ? undefined : null,
          unmountOnBlur: true,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="adet"
        options={{
          title: kadinMi ? 'Takip' : 'Baba Rehberi',
          href: oturumAcik && !oturumKontrolEdiliyor ? undefined : null,
          unmountOnBlur: true,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bildirimler"
        options={{
          title: 'Bildirimler',
          href: oturumAcik && !oturumKontrolEdiliyor ? undefined : null,
          unmountOnBlur: true,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          href: oturumAcik && !oturumKontrolEdiliyor ? undefined : null,
          unmountOnBlur: true,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="moderasyon"
        options={{
          title: 'Moderasyon',
          href: oturumAcik && moderatorMu && !oturumKontrolEdiliyor ? undefined : null,
          unmountOnBlur: true,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="shield.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="konu"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}





