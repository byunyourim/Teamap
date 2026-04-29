import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBf0KhGFpJhjlR3dBUoNXJbK91Tf9lXCdA",
  authDomain: "teamap-103a7.firebaseapp.com",
  projectId: "teamap-103a7",
  storageBucket: "teamap-103a7.firebasestorage.app",
  messagingSenderId: "29094405088",
  appId: "1:29094405088:web:fd0548490bc101c2a80185",
  measurementId: "G-MF79GTY68R",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
