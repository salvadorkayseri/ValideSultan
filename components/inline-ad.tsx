import Constants from 'expo-constants';
import { Platform, StyleSheet, Text, View } from 'react-native';

type InlineAdProps = {
  large?: boolean;
};

const ANDROID_BANNER_ID = 'ca-app-pub-1775086697553761/7609135156';
const IOS_BANNER_ID = 'ca-app-pub-1775086697553761/5342064468';
const expoGoMu = Constants.appOwnership === 'expo';

const unitFromPlatform = Platform.select({
  android: ANDROID_BANNER_ID,
  ios: IOS_BANNER_ID,
  default: 'test-banner',
});

const validUnitId = (id: string) => id.includes('/');
const resolvedUnitId = validUnitId(String(unitFromPlatform || '')) ? String(unitFromPlatform) : 'test-banner';
const testMode = resolvedUnitId === 'test-banner';

export default function InlineAd({ large }: InlineAdProps) {
  if (expoGoMu) {
    return (
      <View style={[styles.box, large && styles.boxLarge]}>
        <Text style={styles.badge}>Reklam</Text>
        <Text style={styles.note}>Expo Go modunda reklam gizlenir.</Text>
      </View>
    );
  }

  let BannerAdComp: any = null;
  let BannerAdSizeValue: any = null;
  let testBannerId = 'test-banner';

  try {
    const mod = require('react-native-google-mobile-ads');
    BannerAdComp = mod.BannerAd;
    BannerAdSizeValue = mod.BannerAdSize;
    testBannerId = mod.TestIds?.BANNER || 'test-banner';
  } catch {
    return null;
  }

  const unitId = resolvedUnitId === 'test-banner' ? testBannerId : resolvedUnitId;

  return (
    <View style={[styles.box, large && styles.boxLarge]}>
      <Text style={styles.badge}>Reklam</Text>
      <BannerAdComp
        unitId={unitId}
        size={BannerAdSizeValue?.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
      {testMode ? <Text style={styles.note}>Test reklam (gercek banner ID bekleniyor)</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    minHeight: 120,
    justifyContent: 'center',
    marginBottom: 10,
  },
  boxLarge: {
    minHeight: 180,
    paddingVertical: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f59e0b',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  note: { color: '#78350f', fontSize: 12, marginTop: 6 },
});
