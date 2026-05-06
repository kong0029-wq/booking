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
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, increment, serverTimestamp } from 'firebase/firestore';

type UserRole = 'USER' | 'BUSINESS';

const Login = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('USER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleUserToRegister, setGoogleUserToRegister] = useState<any>(null);

  // 리다이렉트 결과 처리
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          setLoading(true);
          const user = result.user;
          // 리다이렉트 전 저장했던 상태 복구
          const savedIsLogin = localStorage.getItem('login_isLogin') === 'true';
          const savedRole = (localStorage.getItem('login_selectedRole') || 'USER') as UserRole;
          
          await processGoogleUser(user, savedIsLogin, savedRole);
          
          // 사용 후 정리
          localStorage.removeItem('login_isLogin');
          localStorage.removeItem('login_selectedRole');
        }
      } catch (err) {
        console.error("Redirect error:", err);
        setError('리다이렉트 로그인 처리 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };
    checkRedirect();
  }, []);

  const processGoogleUser = async (user: any, isLoginMode: boolean, roleForNew: UserRole) => {
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
      // 1. lastLoginAt 업데이트 + loginCount 증가 (setDoc merge로 존재하지 않아도 생성 가능하게)
      await setDoc(doc(db, 'users', uid), {
        lastLoginAt: serverTimestamp(),
        loginCount: increment(1)
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
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // 모바일 환경 체크
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        // 모바일은 리다이렉트 방식 권장 (팝업 차단 회피)
        // 리다이렉트 후 복구할 수 있도록 현재 상태 저장
        localStorage.setItem('login_isLogin', isLogin.toString());
        localStorage.setItem('login_selectedRole', selectedRole);
        await signInWithRedirect(auth, provider);
      } else {
        // 데스크톱은 기존 팝업 방식 사용
        const result = await signInWithPopup(auth, provider);
        await processGoogleUser(result.user, isLogin, selectedRole);
      }
    } catch (err: any) {
      console.error("Google login error:", err);
      setError('구글 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
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

      {/* 푸터 */}
      <footer className="py-8 text-center text-slate-400 dark:text-slate-600 text-xs">
        © 2026 예약 시스템. All rights reserved.
      </footer>

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