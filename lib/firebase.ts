import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBI96knKxhWXcxTDBdkbwL-I-lag626GHg",
  authDomain: "rise-dde1d.firebaseapp.com",
  projectId: "rise-dde1d",
  storageBucket: "rise-dde1d.firebasestorage.app",
  messagingSenderId: "541934669804",
  appId: "1:541934669804:web:b698818ed8fcbe49d23ac9"
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
