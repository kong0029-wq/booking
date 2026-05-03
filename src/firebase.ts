import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: 파이어베이스 프로젝트 설정값으로 교체해주세요.
// Firebase 콘솔 -> 프로젝트 설정 -> 내 앱 -> SDK 설정 및 구성에서 확인 가능합니다.
const firebaseConfig = {
  apiKey: "AIzaSyDBuqtD-izhq6-jZw6fYu6o9o-1ym9nVao",
  authDomain: "booking-system-20260309.firebaseapp.com",
  projectId: "booking-system-20260309",
  storageBucket: "booking-system-20260309.firebasestorage.app",
  messagingSenderId: "652134628967",
  appId: "1:652134628967:web:76c02aa24ebc9936b09ec2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
