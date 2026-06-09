import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, increment, serverTimestamp } from 'firebase/firestore';

type UserRole = 'USER' | 'BUSINESS';

// WebView(인앱 브라우저) 감지 - 카카오톡, 네이버, 인스타, 페이스북 등
// ⚠️ 일반 Chrome/Samsung Internet/Safari에서는 절대 감지되지 않도록 정밀하게 판별
const isInAppBrowser = (): boolean => {
  const ua = navigator.userAgent || navigator.vendor || '';

  // 1단계: 확실한 인앱 브라우저 키워드 (대소문자 정확하게 매칭)
  const exactInAppKeywords = [
    'KAKAOTALK',     // 카카오톡
    'DaumApps',      // 다음/카카오 앱
    'NAVER(inapp',   // 네이버 앱 (정확한 패턴)
    'Instagram',     // 인스타그램
    'FBAN',          // 페이스북 앱
    'FBAV',          // 페이스북 앱
    'FB_IAB',        // 페이스북 인앱 브라우저
    'Line/',         // 라인 앱 (슬래시 포함으로 정확히)
    'TwitterAndroid',// 트위터/X Android
    'Twitter for',   // 트위터/X iOS
    'Snapchat',      // 스냅챗
    'Whale/',        // 네이버 웨일 (앱 내장)
    'everytimeApp',  // 에브리타임
    'BandApp',       // 밴드 앱
  ];

  if (exactInAppKeywords.some(keyword => ua.includes(keyword))) {
    return true;
  }

  // 2단계: Android WebView 판별 ('; wv)' 패턴)
  // Android WebView는 UA에 '; wv)' 를 포함함. Chrome은 포함하지 않음.
  if (/; wv\)/.test(ua) && /Android/.test(ua)) {
    return true;
  }

  // 3단계: iOS에서 Safari가 아닌 WebView 감지
  // 일반 Safari/Chrome은 UA에 'Safari/'를 포함하지만, WebView는 포함하지 않음
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS && !ua.includes('Safari/') && !ua.includes('CriOS')) {
    return true;
  }

  return false;
};

// 모바일 환경 감지
const isMobileDevice = (): boolean => {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

// 현재 페이지 URL을 외부 브라우저에서 여는 함수
const openInExternalBrowser = () => {
  const currentUrl = window.location.href;
  
  // Android Intent 방식 (Chrome으로 열기)
  if (/Android/i.test(navigator.userAgent)) {
    const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
    window.location.href = intentUrl;
    // Intent 실패 시 폴백
    setTimeout(() => {
      window.open(currentUrl, '_system');
    }, 500);
  } else {
    // iOS: 외부 브라우저 열기 시도
    window.open(currentUrl, '_system');
  }
};

const Login = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('USER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); // 초기 로딩 true로 시작 (리다이렉트 체크 중)
  const [googleUserToRegister, setGoogleUserToRegister] = useState<any>(null);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [showWebViewWarning, setShowWebViewWarning] = useState(false);
  const [redirectChecked, setRedirectChecked] = useState(false); // 리다이렉트 처리 완료 여부
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // 1단계: 구글 리다이렉트 결과를 먼저 처리 (최우선)
  useEffect(() => {
    // 저장된 이메일 불러오기
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }

    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log("Redirect result found:", result.user.email);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential && credential.accessToken) {
            sessionStorage.setItem('gcal_access_token', credential.accessToken);
          }
          await processGoogleUser(result.user);
          
          // 사용 후 정리
          localStorage.removeItem('login_isLogin');
          localStorage.removeItem('login_selectedRole');
          return; // processGoogleUser가 이미 navigate 또는 모달을 띄웠으므로 여기서 끝
        }
      } catch (err: any) {
        console.error("Redirect error:", err);
        if (err.code === 'auth/account-exists-with-different-credential') {
          setError('이미 다른 방식으로 가입된 이메일입니다.');
        } else {
          setError('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
      } finally {
        setRedirectChecked(true); // 리다이렉트 처리 완료 표시
        setLoading(false);
      }
    };
    
    checkRedirect();
  }, []);

  // 2단계: 리다이렉트 처리가 끝난 후에만 onAuthStateChanged로 기존 세션 확인
  useEffect(() => {
    // 리다이렉트 체크가 아직 안 끝났으면 대기
    if (!redirectChecked) return;
    // 역할 선택 모달이 떠 있으면 자동 이동하지 않음
    if (googleUserToRegister) return;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Firestore에 문서가 있는 기존 사용자만 자동 이동
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          // 기존 사용자 → 역할에 따라 자동 이동
          console.log("Existing user detected, auto-routing...");
          await routeUserBasedOnRole(user.uid);
        } else {
          // 신규 사용자 → 역할 선택 모달 표시 (자동 이동 안 함!)
          console.log("New Google user detected, showing role modal...");
          setGoogleUserToRegister(user);
        }
      }
    });

    return () => unsubscribeAuth();
  }, [redirectChecked, googleUserToRegister]);

  const processGoogleUser = async (user: any) => {
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      // 구글로 최초 로그인하는 모든 신규 사용자에게 역할 선택 모달을 띄웁니다.
      setGoogleUserToRegister(user);
      return;
    } else {
      await recordLoginActivity(user.uid, 'google');
      await routeUserBasedOnRole(user.uid);
    }
  };

  // 모달에서 역할 선택 시 가입 처리
  const handleGoogleRegisterSelectRole = async (role: UserRole) => {
    if (!googleUserToRegister) return;
    setLoading(true);
    try {
      const user = googleUserToRegister;
      const userDocRef = doc(db, 'users', user.uid);
      const userData: any = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || '회원',
        role: role,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        loginCount: 1,
        tickets: 0
      };

      if (role === 'BUSINESS') {
        userData.businessName = '';
        userData.businessVerified = false;
      }

      await setDoc(userDocRef, userData);

      await addDoc(collection(db, 'loginLogs'), {
        uid: user.uid,
        loginMethod: 'google_signup',
        loginAt: serverTimestamp(),
        userAgent: navigator.userAgent,
        platform: navigator.platform
      });

      setGoogleUserToRegister(null);
      if (role === 'BUSINESS') {
        navigate('/business');
      } else {
        navigate('/home');
      }
    } catch (err) {
      console.error(err);
      setError('가입 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 로그인 활동 기록 함수
  const recordLoginActivity = async (uid: string, loginMethod: string) => {
    try {
      const uDocRef = doc(db, 'users', uid);
      const uSnap = await getDoc(uDocRef);
      
      let prevCount = 0;
      let prevAvgMinutes = 0;
      
      if (uSnap.exists()) {
        const d = uSnap.data();
        prevCount = d.loginCount || 0;
        prevAvgMinutes = d.avgLoginTimeMinutes || 0;
      }
      
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const newAvgMinutes = Math.round((prevAvgMinutes * prevCount + currentMinutes) / (prevCount + 1));

      // 1. lastLoginAt 업데이트 + loginCount 증가 + avgLoginTimeMinutes 갱신
      await setDoc(uDocRef, {
        lastLoginAt: serverTimestamp(),
        loginCount: increment(1),
        avgLoginTimeMinutes: newAvgMinutes
      }, { merge: true });

      // 2. loginLogs 컬렉션에 접속 기록 저장
      await addDoc(collection(db, 'loginLogs'), {
        uid,
        loginMethod,
        loginAt: serverTimestamp(),
        userAgent: navigator.userAgent,
        platform: navigator.platform
      });
    } catch (err) {
      console.error('Login activity recording error:', err);
    }
  };

  // 역할(ADMIN/BUSINESS/USER)에 따른 페이지 이동 로직
  // Login.tsx 파일 내 해당 함수를 아래와 같이 수정하세요.
  const routeUserBasedOnRole = async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const role = userDoc.data().role;

        if (role === 'SUPER_ADMIN') {
          navigate('/super-admin');
        } else if (role === 'ADMIN') {
          navigate('/admin');
        } else if (role === 'BUSINESS') {
          // ✅ 사업자 전용 대시보드로 이동
          navigate('/business');
        } else {
          navigate('/home');
        }
      } else {
        navigate('/home');
      }
    } catch (err) {
      console.error('Role check error', err);
      navigate('/home');
    }
  };

  // 이메일 로그인 및 회원가입 처리
  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        // 이메일 저장 처리
        if (rememberEmail) {
          localStorage.setItem('remembered_email', email);
        } else {
          localStorage.removeItem('remembered_email');
        }

        // 로그인
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await recordLoginActivity(userCredential.user.uid, 'email');
        await routeUserBasedOnRole(userCredential.user.uid);
      } else {
        // 회원가입
        if (!name.trim()) { setError('이름을 입력해주세요.'); setLoading(false); return; }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const userData: any = {
          uid: user.uid,
          email: user.email,
          name: name,
          role: selectedRole,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          loginCount: 1,
          tickets: 0,
          ticketsByBusiness: {}
        };

        // 사업자인 경우 추가 정보 저장 (업체명은 Home에서 등록)
        if (selectedRole === 'BUSINESS') {
          userData.businessName = '';
          userData.businessVerified = false;
        }

        await setDoc(doc(db, 'users', user.uid), userData);

        // 신규 가입도 로그인 로그 기록
        await addDoc(collection(db, 'loginLogs'), {
          uid: user.uid,
          loginMethod: 'email_signup',
          loginAt: serverTimestamp(),
          userAgent: navigator.userAgent,
          platform: navigator.platform
        });

        if (selectedRole === 'BUSINESS') {
          navigate('/business');
        } else {
          navigate('/home');
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다.');
      } else if (err.code === 'auth/weak-password') {
        setError('비밀번호는 6자리 이상이어야 합니다.');
      } else {
        setError('인증 중 오류가 발생했습니다. 정보를 다시 확인해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 구글 로그인 처리
  const handleGoogleLogin = async () => {
    setError('');

    // 🛡️ WebView(인앱 브라우저) 감지 - Google이 차단하는 환경
    if (isInAppBrowser()) {
      setShowWebViewWarning(true);
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('https://www.googleapis.com/auth/calendar.events');

      if (isMobileDevice()) {
        // 모바일은 항상 리다이렉트 방식 사용 (팝업 차단 + WebView 이슈 회피)
        localStorage.setItem('login_isLogin', isLogin.toString());
        localStorage.setItem('login_selectedRole', selectedRole);
        await signInWithRedirect(auth, provider);
      } else {
        // 데스크톱: 팝업 시도 → 실패하면 리다이렉트로 폴백
        try {
          const result = await signInWithPopup(auth, provider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential && credential.accessToken) {
            sessionStorage.setItem('gcal_access_token', credential.accessToken);
          }
          await processGoogleUser(result.user);
        } catch (popupErr: any) {
          console.warn('Popup failed, falling back to redirect:', popupErr.code);
          // 팝업 차단 또는 disallowed_useragent 시 리다이렉트로 전환
          if (
            popupErr.code === 'auth/popup-blocked' ||
            popupErr.code === 'auth/popup-closed-by-user' ||
            popupErr.code === 'auth/cancelled-popup-request' ||
            popupErr.code === 'auth/unauthorized-domain' ||
            popupErr.message?.includes('disallowed_useragent')
          ) {
            localStorage.setItem('login_isLogin', isLogin.toString());
            localStorage.setItem('login_selectedRole', selectedRole);
            await signInWithRedirect(auth, provider);
          } else {
            throw popupErr;
          }
        }
      }
    } catch (err: any) {
      console.error("Google login error:", err);
      if (err.message?.includes('disallowed_useragent')) {
        setShowWebViewWarning(true);
      } else {
        setError('구글 로그인에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 비밀번호 재설정 이메일 발송
  const handleResetPassword = async () => {
    if (!resetEmail.trim()) {
      setError('비밀번호를 재설정할 이메일을 입력해주세요.');
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSuccess(true);
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('등록되지 않은 이메일입니다.');
      } else if (err.code === 'auth/invalid-email') {
        setError('올바른 이메일 형식이 아닙니다.');
      } else {
        setError('비밀번호 재설정 메일 발송에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="layout-container flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100">

      {/* 상단 네비게이션 */}
      <header className="flex items-center justify-between border-b border-solid border-primary/10 px-6 py-4 md:px-40 bg-white dark:bg-slate-900/50">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/')}>
          <div className="text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">calendar_month</span>
          </div>
          <h2 className="text-lg font-bold leading-tight tracking-tight">예약 시스템</h2>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center justify-center rounded-xl h-10 w-10 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[480px] bg-white dark:bg-slate-900/50 p-8 rounded-3xl shadow-sm border border-primary/5"
        >
          <div className="flex flex-col gap-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-black tracking-tight">
                {isLogin ? '로그인' : '회원가입'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {isLogin ? '서비스 이용을 위해 로그인 해주세요' : '새로운 계정을 만들어보세요'}
              </p>
            </div>

            {/* 회원가입 시: 역할 선택 토글 */}
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 mb-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-1">가입 유형 선택</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('USER')}
                        className={`relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all ${selectedRole === 'USER'
                          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                      >
                        {selectedRole === 'USER' && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-sm">check</span>
                          </div>
                        )}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedRole === 'USER' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}>
                          <span className="material-symbols-outlined text-2xl">person</span>
                        </div>
                        <div className="text-center">
                          <p className={`font-bold text-sm ${selectedRole === 'USER' ? 'text-primary' : ''}`}>일반 사용자</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">예약 서비스 이용</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRole('BUSINESS')}
                        className={`relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all ${selectedRole === 'BUSINESS'
                          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                      >
                        {selectedRole === 'BUSINESS' && (
                          <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-sm">check</span>
                          </div>
                        )}
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedRole === 'BUSINESS' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                          }`}>
                          <span className="material-symbols-outlined text-2xl">storefront</span>
                        </div>
                        <div className="text-center">
                          <p className={`font-bold text-sm ${selectedRole === 'BUSINESS' ? 'text-primary' : ''}`}>사업자</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">업체 등록 및 관리</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <AnimatePresence mode="wait">
                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col gap-4 overflow-hidden"
                  >
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-1">이름</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">person</span>
                        <input
                          className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          placeholder="이름을 입력하세요"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-1">이메일 주소</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">mail</span>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="example@email.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-1">비밀번호</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="비밀번호를 입력하세요"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {isLogin && (
                <div className="flex items-center justify-between px-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={rememberEmail}
                        onChange={(e) => setRememberEmail(e.target.checked)}
                      />
                      <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-700 rounded-md peer-checked:bg-primary peer-checked:border-primary transition-all"></div>
                      <span className="material-symbols-outlined absolute inset-0 text-white text-[16px] flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity">check</span>
                    </div>
                    <span className="text-sm font-medium text-slate-500 group-hover:text-slate-700 transition-colors">로그인 정보 저장</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setShowResetPassword(true); setResetEmail(email); setResetSuccess(false); setError(''); }}
                    className="text-sm text-slate-400 hover:text-primary font-medium transition-colors"
                  >
                    비밀번호 찾기
                  </button>
                </div>
              )}

              {error && <p className="text-rose-500 text-xs text-center font-medium">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-green-600 hover:brightness-110 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-brand-green/20 active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? '처리 중...' : (isLogin ? '로그인' : (selectedRole === 'BUSINESS' ? '사업자 가입하기' : '가입하기'))}
              </button>

              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
                <span className="text-xs text-slate-400 font-medium">또는</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
              </div>

              {/* 구글 로그인 버튼 */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-[0.98]"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Google로 시작하기
              </button>
            </form>

            <div className="flex items-center justify-center gap-4 text-sm font-medium pt-2">
              <span className="text-slate-500">
                {isLogin ? '계정이 없으신가요?' : '이미 회원이신가요?'}
              </span>
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); setSelectedRole('USER'); }}
                className="text-primary hover:underline underline-offset-4 font-bold"
              >
                {isLogin ? '회원가입' : '로그인'}
              </button>
            </div>
          </div>
        </motion.div>
      </main>

      {/* 비밀번호 찾기 모달 */}
      <AnimatePresence>
        {showResetPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              {resetSuccess ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-3xl text-emerald-500">mark_email_read</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight mb-2">메일을 확인해주세요!</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-2">
                    <strong className="text-primary">{resetEmail}</strong>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                    위 주소로 비밀번호 재설정 링크를 발송했습니다.<br/>메일함을 확인하시고, 링크를 클릭하여 새 비밀번호를 설정해주세요.
                  </p>
                  <p className="text-xs text-slate-400 mb-6">* 메일이 보이지 않으면 스팸함도 확인해주세요.</p>
                  <button
                    onClick={() => { setShowResetPassword(false); setResetSuccess(false); }}
                    className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold text-sm hover:brightness-110 transition-all active:scale-[0.98]"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined text-3xl text-primary">lock_reset</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">비밀번호 찾기</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-relaxed">
                      가입하신 이메일을 입력하시면<br/>비밀번호 재설정 링크를 보내드립니다.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-1">이메일 주소</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">mail</span>
                        <input
                          className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                          placeholder="example@email.com"
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                        />
                      </div>
                    </div>

                    {error && <p className="text-rose-500 text-xs text-center font-medium">{error}</p>}

                    <button
                      onClick={handleResetPassword}
                      disabled={resetLoading}
                      className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold text-sm hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      {resetLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                          발송 중...
                        </span>
                      ) : '재설정 메일 보내기'}
                    </button>
                    <button
                      onClick={() => { setShowResetPassword(false); setError(''); }}
                      className="w-full py-3 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
                    >
                      돌아가기
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 푸터 */}
      <footer className="py-8 text-center text-slate-400 dark:text-slate-600 text-xs">
        © 2026 예약 시스템. All rights reserved.
      </footer>

      {/* WebView(인앱 브라우저) 경고 모달 */}
      <AnimatePresence>
        {showWebViewWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-3xl text-amber-500">open_in_browser</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">외부 브라우저에서 열어주세요</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 leading-relaxed">
                  현재 인앱 브라우저에서는 Google 로그인이<br/>지원되지 않습니다.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg mt-0.5">info</span>
                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">이렇게 해보세요:</p>
                    <p>• 우측 상단 <strong>⋮</strong> 메뉴 → "다른 브라우저로 열기"</p>
                    <p>• 또는 Chrome/Safari에서 직접 접속</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={openInExternalBrowser}
                  className="w-full py-3.5 bg-primary text-white rounded-2xl font-bold text-sm hover:brightness-110 transition-all active:scale-[0.98]"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-lg">open_in_new</span>
                    외부 브라우저로 열기
                  </span>
                </button>
                <button
                  onClick={() => {
                    // URL 복사 기능
                    navigator.clipboard.writeText(window.location.href).then(() => {
                      setError('');
                      alert('URL이 복사되었습니다! 브라우저에 붙여넣기 해주세요.');
                    }).catch(() => {
                      // clipboard API 실패 시 폴백
                      const textArea = document.createElement('textarea');
                      textArea.value = window.location.href;
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textArea);
                      alert('URL이 복사되었습니다! 브라우저에 붙여넣기 해주세요.');
                    });
                  }}
                  className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-lg">content_copy</span>
                    URL 복사하기
                  </span>
                </button>
                <button
                  onClick={() => setShowWebViewWarning(false)}
                  className="w-full mt-2 py-3 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 구글 신규 가입자 역할 선택 모달 */}
      <AnimatePresence>
        {googleUserToRegister && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-3xl text-primary">waving_hand</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">환영합니다!</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-relaxed">구글 계정으로 처음 오셨군요.<br/>어떤 용도로 서비스를 이용하실 건가요?</p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleGoogleRegisterSelectRole('USER')}
                  className="flex items-center gap-4 w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-primary/5 hover:border-primary border-2 border-transparent transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-xl">person</span>
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">일반 사용자</p>
                    <p className="text-xs text-slate-500">클래스 예약 및 수강</p>
                  </div>
                </button>
                <button
                  onClick={() => handleGoogleRegisterSelectRole('BUSINESS')}
                  className="flex items-center gap-4 w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-primary/5 hover:border-primary border-2 border-transparent transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-xl">storefront</span>
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">사업자</p>
                    <p className="text-xs text-slate-500">클래스 개설 및 회원 관리</p>
                  </div>
                </button>
              </div>
              <button
                onClick={() => { setGoogleUserToRegister(null); auth.signOut(); }}
                className="w-full mt-6 py-3 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
              >
                취소 (로그아웃)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Login;