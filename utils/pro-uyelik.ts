import { Platform } from 'react-native';
import Constants from 'expo-constants';

type PaketId = '1ay' | '2ay' | '6ay';

const ortamUrunId = (anahtar: string, varsayilan: string) => {
  const deger = String(process.env?.[anahtar] || '').trim();
  return deger || varsayilan;
};

const URUN_IDLERI: Record<PaketId, string> = {
  '1ay': ortamUrunId('EXPO_PUBLIC_IAP_PRO_1AY', 'pro_1ay'),
  '2ay': ortamUrunId('EXPO_PUBLIC_IAP_PRO_2AY', 'pro_2ay'),
  '6ay': ortamUrunId('EXPO_PUBLIC_IAP_PRO_6AY', 'pro_6ay'),
};

let baglandi = false;
let iapModuluPromise: Promise<any> | null = null;

const tumProUrunleri = Object.values(URUN_IDLERI);

const expoGoMu = Constants.appOwnership === 'expo';

const iapModulunuGetir = async () => {
  if (expoGoMu) {
    throw new Error('In-App Purchase Expo Go içinde desteklenmez. Test için Development Build veya Play Internal Test kullan.');
  }
  if (!iapModuluPromise) {
    iapModuluPromise = import('react-native-iap');
  }
  return iapModuluPromise;
};

const iapBaglantisiniHazirla = async () => {
  if (baglandi) return;
  const iap = await iapModulunuGetir();
  await iap.initConnection();
  baglandi = true;
};

const aktifProAboneligiVarMi = async () => {
  const iap = await iapModulunuGetir();
  const aktifler = await iap.getActiveSubscriptions(tumProUrunleri);
  return Array.isArray(aktifler) && aktifler.length > 0;
};

const urunMagazadaVarMi = async (urunId: string) => {
  const iap = await iapModulunuGetir();
  const urunler = (await iap.fetchProducts({ skus: tumProUrunleri, type: 'subs' })) || [];
  const bulundu = urunler.some((urun: any) => String(urun.id || '') === urunId);
  if (bulundu) return;

  const magazaUrunleri = urunler.map((urun: any) => String(urun.id || '')).filter(Boolean);
  if (magazaUrunleri.length) {
    throw new Error(
      `SKU not found: ${urunId}. Magazada bulunan abonelikler: ${magazaUrunleri.join(', ')}. Play Console productId eslestirmesini kontrol et.`
    );
  }

  throw new Error(
    `SKU not found: ${urunId}. Bu surumde Play Console abonelik urunleri bulunamadi. Urun aktif/yayinli olmayabilir veya productId farkli olabilir.`
  );
};

export const odemeSistemiHazirMi = () => (Platform.OS === 'android' || Platform.OS === 'ios') && !expoGoMu;

export const proSatinal = async (_kullaniciId: string, paketId: PaketId) => {
  await iapBaglantisiniHazirla();
  const iap = await iapModulunuGetir();
  const urunId = URUN_IDLERI[paketId];
  await urunMagazadaVarMi(urunId);

  await new Promise<void>((resolve, reject) => {
    let tamamlandi = false;

    const temizle = () => {
      satinalmaOk?.remove();
      satinalmaHata?.remove();
    };

    const satinalmaOk = iap.purchaseUpdatedListener(async (purchase: any) => {
      const urun = String(purchase.productId || '');
      if (urun !== urunId) return;

      try {
        await iap.finishTransaction({ purchase, isConsumable: false });
        tamamlandi = true;
        temizle();
        resolve();
      } catch (hata) {
        temizle();
        reject(hata);
      }
    });

    const satinalmaHata = iap.purchaseErrorListener((hata: any) => {
      if (tamamlandi) return;
      temizle();
      reject(new Error(hata?.message || 'Satin alma basarisiz.'));
    });

    iap.requestPurchase({
      type: 'subs',
      request:
        Platform.OS === 'android'
          ? { google: { skus: [urunId] } }
          : { apple: { sku: urunId } },
    }).catch((hata: any) => {
      temizle();
      reject(hata);
    });
  });

  const proAktif = await aktifProAboneligiVarMi();
  return {
    proAktif,
    bitisTarihi: null as Date | null,
  };
};

export const satinAlimlariGeriYukle = async (_kullaniciId: string) => {
  await iapBaglantisiniHazirla();
  const iap = await iapModulunuGetir();
  await iap.restorePurchases();
  const proAktif = await aktifProAboneligiVarMi();
  return {
    proAktif,
    bitisTarihi: null as Date | null,
  };
};

export const aktifProDurumuGetir = async () => {
  await iapBaglantisiniHazirla();
  const proAktif = await aktifProAboneligiVarMi();
  return {
    proAktif,
    bitisTarihi: null as Date | null,
  };
};

export const proBilgisiCikar = (veri: { proAktif: boolean; bitisTarihi: Date | null }) => veri;

export const iapKapat = async () => {
  if (!baglandi) return;
  const iap = await iapModulunuGetir();
  await iap.endConnection();
  baglandi = false;
};
