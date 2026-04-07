import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCUugnOzYmII6OUrJNlkjrUA2nxNjS_lpU",
  authDomain: "spinfactor-a7e07.firebaseapp.com",
  projectId: "spinfactor-a7e07",
  storageBucket: "spinfactor-a7e07.firebasestorage.app",
  messagingSenderId: "53675672947",
  appId: "1:53675672947:web:cc9552022c155fe5653106",
  measurementId: "G-Z0K2TV1RZK",
};

const app = initializeApp(firebaseConfig);

export const firebaseProjectInfo = {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
};

export const auth = getAuth(app);
export const db = getFirestore(app);
