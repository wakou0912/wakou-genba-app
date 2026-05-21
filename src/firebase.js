import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBxoL_tKL9pQoawDCnhSKx3U0s4buRFSx0",
  authDomain: "wakou-genba.firebaseapp.com",
  projectId: "wakou-genba",
  storageBucket: "wakou-genba.firebasestorage.app",
  messagingSenderId: "957287226499",
  appId: "1:957287226499:web:3b74fdcaa6797357b90fb6"
};

const app = initializeApp(firebaseConfig);
export const firestore = getFirestore(app);
export const auth = getAuth(app);
