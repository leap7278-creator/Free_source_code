import { initializeApp } from 'firebase/app';
/**
 * PRODUCTION NOTE:
 * For GitHub/Vercel deployment, you must set these environment variables in your Vercel Dashboard:
 * VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, etc.
 * This ensures the app works even if firebase-applet-config.json is not pushed to your repo.
 */
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import firebaseLocalConfig from '../firebase-applet-config.json';

// Environment detection
const isVercel = window.location.hostname.includes('vercel.app') || window.location.hostname === 'api-game-baser.vercel.app';

// Base configurations for the two environments requested
const AI_STUDIO_CONFIG = {
  projectId: "massive-gantry-zghtt",
  authDomain: "massive-gantry-zghtt.firebaseapp.com",
  storageBucket: "massive-gantry-zghtt.firebasestorage.app",
};

const VERCEL_PROD_CONFIG = {
  projectId: "baser-id-game",
  authDomain: "baser-id-game.firebaseapp.com",
  storageBucket: "baser-id-game.firebasestorage.app",
};

const baseEnvConfig = isVercel ? VERCEL_PROD_CONFIG : AI_STUDIO_CONFIG;

// Use environment variables for Vercel/Production, fallback to environment-specific hardcoded values
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseLocalConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || baseEnvConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || baseEnvConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || baseEnvConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseLocalConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseLocalConfig.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseLocalConfig.firestoreDatabaseId
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };
