import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: 파이어베이스 프로젝트 설정값으로 교체해주세요.
// Firebase 콘솔 -> 프로젝트 설정 -> 내 앱 -> SDK 설정 및 구성에서 확인 가능합니다.
// const firebaseConfig = {
// apiKey: "AIzaSyDBuqtD-izhq6-jZw6fYu6o9o-1ym9nVao",
// authDomain: "booking-system-20260309.firebaseapp.com",
// projectId: "booking-system-20260309",
// storageBucket: "booking-system-20260309.firebasestorage.app",
//  messagingSenderId: "652134628967",
//  appId: "1:652134628967:web:76c02aa24ebc9936b09ec2"
// };


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
