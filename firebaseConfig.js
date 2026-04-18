import { getApp, getApps, initializeApp } from 'firebase/app';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
apiKey: "AIzaSyA3NsY04wqiQL5nta7XAogZvhCKvanEGkc",
  authDomain: "forumapp-275f9.firebaseapp.com",
  projectId: "forumapp-275f9",
  storageBucket: "forumapp-275f9.firebasestorage.app",
  messagingSenderId: "325691550581",
  appId: "1:325691550581:web:0be7e38f37f5e8f2b8c13c"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);
