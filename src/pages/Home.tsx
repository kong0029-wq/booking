import { useEffect, useState, useRef } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  doc, onSnapshot, updateDoc, query, collection, where
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'framer-motion';

const Home = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userData, setUserData] = useState<any>(null);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [myResStatus, setMyResStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 프로필 편집 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [editExtra1, setEditExtra1] = useState('');
  const [editExtra2, setEditExtra2] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/');
        return;
      }

      // 실시간 사용자 데이터 구독
      const unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setUserData(data);
          // 모달이 닫혀있을 때만 초기값 설정 (수정 중 덮어쓰기 방지)
          setIsEditModalOpen(open => {
            if (!open) {
              setEditName(data.name || '');
              setEditPhone(data.phoneNumber || '');
              setEditEmail(data.email || user.email || '');
              setEditPhotoURL(data.photoURL || '');
              setEditExtra1(data.extra1 || '');
              setEditExtra2(data.extra2 || '');
            }
            return open;
          });
        }
        setLoading(false);
      });

      // 업체 목록 가져오기
      const bQuery = query(collection(db, 'users'), where('role', '==', 'BUSINESS'));
      const unsubscribeB = onSnapshot(bQuery, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBusinesses(list);
      });

      // 내 신청 현황 구독 (사업자 승인 대기)
      const resQuery = query(collection(db, 'reservations'), where('uid', '==', user.uid));
      const unsubRes = onSnapshot(resQuery, (snap) => {
        const list = snap.docs.map(d => ({ 
          id: d.id,
          businessId: d.data().businessId, 
          status: d.data().status,
          className: d.data().className
        }));
        setMyResStatus(list);
      });

      // 수업 목록 가져오기 (필터링용)
      const qClasses = query(collection(db, 'classes'));
      const unsubClasses = onSnapshot(qClasses, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setClasses(list);
      });

      return () => {
        unsubscribeUser();
        unsubscribeB();
        unsubRes();
        unsubClasses();
      };
    });

    return () => unsubscribeAuth();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 로컬 미리보기 즉시 적용
    const localPreviewUrl = URL.createObjectURL(file);
    setEditPhotoURL(localPreviewUrl);

    const user = auth.currentUser;
    if (!user) return;

    setUploadingImage(true);
    
    // 업로드 타임아웃 설정 (15초 후 강제 종료)
    const timeoutId = setTimeout(() => {
      if (uploadingImage) {
        setUploadingImage(false);
        alert('업로드 시간이 초과되었습니다. 네트워크 상태나 파이어베이스 설정을 확인해주세요.');
      }
    }, 15000);

    try {
      // 파일명을 안전하게 생성 (타임스탬프 + 확장자)
      const fileExt = file.name.split('.').pop();
      const safeFileName = `profile_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `profiles/${user.uid}/${safeFileName}`);
      
      // 파일 업로드 수행
      await uploadBytes(storageRef, file);
      
      const url = await getDownloadURL(storageRef);
      setEditPhotoURL(url);
      clearTimeout(timeoutId);
    } catch (err) {
      console.error('Image upload error', err);
      alert('이미지 업로드 중 오류가 발생했습니다. 파이어베이스 스토리지 설정을 확인해주세요.');
      // 실패 시 원래 이미지로 복구
      setEditPhotoURL(userData?.photoURL || '');
    } finally {
      setUploadingImage(false);
      clearTimeout(timeoutId);
      // input 초기화
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: editName,
        phoneNumber: editPhone,
        email: editEmail,
        photoURL: editPhotoURL,
        extra1: editExtra1,
        extra2: editExtra2
      });
      setIsEditModalOpen(false);
      alert('프로필이 업데이트되었습니다.');
    } catch (err) {
      console.error('Update profile error', err);
      alert('업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light">
        <div className="animate-pulse text-primary font-bold text-xl">예약시스템...</div>
      </div>
    );
  }

  const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      <div className="layout-container flex h-full grow flex-col">

        {/* 상단 네비게이션 바 */}
        <header className="flex items-center justify-between border-b border-solid border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 md:px-10 py-3 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <div className="text-primary size-8 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">calendar_month</span>
            </div>
            <h2 className="text-slate-900 dark:text-slate-100 text-xl font-bold leading-tight tracking-tight">예약시스템</h2>
          </div>
          <div className="flex flex-1 justify-end gap-8 items-center">
            <nav className="hidden md:flex items-center gap-9">
              <a className="text-primary text-sm font-bold transition-colors border-b-2 border-primary" href="#">홈</a>
              <a className="text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary text-sm font-medium transition-colors cursor-pointer" onClick={() => navigate('/my-reservations')}>내 예약</a>
              <a className="text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary text-sm font-medium transition-colors" href="#">고객지원</a>
            </nav>
            <div className="flex items-center gap-4">
              <button onClick={handleLogout} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400" title="로그아웃">
                <span className="material-symbols-outlined">logout</span>
              </button>
              <div
                className="bg-primary/20 rounded-full p-0.5 border-2 border-primary cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setIsEditModalOpen(true)}
              >
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-9"
                  style={{ backgroundImage: `url("${userData?.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}")` }}
                ></div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 justify-center py-8">
          <div className="layout-content-container flex flex-col w-full max-w-[1200px] px-6 lg:px-10">

            {/* 페이지 타이틀 및 상단 정보 */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div className="flex flex-col gap-2">
                <nav className="flex text-xs text-slate-500 gap-2 mb-1">
                  <span>사용자</span>
                  <span>&gt;</span>
                  <span className="text-primary font-medium">대시보드</span>
                </nav>
                <h1 className="text-slate-900 dark:text-slate-100 text-3xl font-black leading-tight tracking-tight">
                  {userData?.name || '회원'}님, 환영합니다!
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  가입하신 센터별로 남은 수강권을 확인하고 예약해보세요.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-xl h-12 px-6 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="material-symbols-outlined">edit</span>
                  <span className="truncate">정보 수정</span>
                </button>
                <button
                  onClick={() => navigate('/reservation')}
                  className="flex min-w-[140px] items-center justify-center gap-2 overflow-hidden rounded-xl h-12 px-6 bg-primary text-white text-base font-bold transition-transform active:scale-95 shadow-lg shadow-primary/20"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  <span className="truncate">새 수업 예약</span>
                </button>
              </div>
            </div>

            {/* 메인 그리드 섹션 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

              {/* 예약 확인 카드 */}
              <div onClick={() => navigate('/my-reservations')} className="flex flex-col gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-primary/40 group-hover:scale-110 transition-transform">event_upcoming</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-slate-900 dark:text-slate-100 text-lg font-bold">내 예약 내역</h3>
                  <p className="text-slate-500 text-sm">진행 예정인 수업을 확인하세요.</p>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-primary text-sm font-bold flex items-center gap-1">자세히 보기 <span className="material-symbols-outlined text-sm">arrow_forward</span></span>
                </div>
              </div>

              {/* 수강권 관리 카드 */}
              <div 
                onClick={() => navigate('/tickets')}
                className="flex flex-col gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="relative w-full aspect-video overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-primary/40 group-hover:scale-110 transition-transform">payments</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-slate-900 dark:text-slate-100 text-lg font-bold">수강 신청</h3>
                  <p className="text-slate-500 text-sm">새로운 센터를 찾아 신청하세요.</p>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-primary text-sm font-bold flex items-center gap-1">이동하기 <span className="material-symbols-outlined text-sm">arrow_forward</span></span>
                </div>
              </div>

              {/* 수강 신청 가능 업체 찾기 (Dashed Slot) */}
              <div
                onClick={() => navigate('/tickets')}
                className="flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary dark:hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group min-h-[250px]"
              >
                <div className="size-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary">search</span>
                </div>
                <div className="text-center">
                  <p className="text-slate-900 dark:text-slate-100 font-bold">센터 찾기 및 수강 신청</p>
                  <p className="text-slate-500 text-sm mt-1">수강 신청이 가능한 업체 리스트를 확인하세요</p>
                </div>
              </div>

            </div>

            {/* 수업 신청 섹션 (가입된 센터별 수업 목록) */}
            <div className="mt-16">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black">수업 신청</h2>
                  <p className="text-slate-500 text-sm mt-1">내가 가입한 센터의 수업들을 확인하고 예약해보세요.</p>
                </div>
                <button 
                  onClick={() => navigate('/tickets')}
                  className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
                >
                  센터 추가하기 <span className="material-symbols-outlined text-sm">add_circle</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(() => {
                  const confirmedBizIds = Array.from(new Set(
                    myResStatus
                      .filter(r => r.className === '센터 멤버십 신청' && r.status === 'CONFIRMED')
                      .map(r => r.businessId)
                  )).filter(Boolean);
                  
                  const joinedBusinesses = businesses.filter(b => confirmedBizIds.includes(b.id));

                  return joinedBusinesses.length > 0 ? joinedBusinesses.flatMap((biz) => {
                    const bizClasses = classes.filter(c => c.businessId === biz.id && c.date >= todayStr);
                    const classNames = Array.from(new Set(bizClasses.map(c => c.className))).filter(Boolean);
                    
                    if (classNames.length === 0) {
                      return [(
                        <motion.div
                          key={`${biz.id}-empty`}
                          whileHover={{ y: -5 }}
                          onClick={() => navigate(`/reservation?businessId=${biz.id}`)}
                          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                        >
                          <div className="h-40 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                            {biz.businessPhotoURL ? (
                              <img src={biz.businessPhotoURL} alt={biz.businessName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
                                <span className="material-symbols-outlined text-6xl text-primary/30">storefront</span>
                              </div>
                            )}
                            <div className="absolute top-4 right-4 px-3 py-1 bg-emerald-500 rounded-full text-[10px] font-bold text-white shadow-lg shadow-emerald-500/30 animate-pulse">
                              수업 준비 중
                            </div>
                          </div>
                          <div className="p-6">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="text-xl font-bold group-hover:text-primary transition-colors truncate">
                                등록된 수업 없음
                              </h3>
                            </div>
                            <p className="text-slate-500 text-sm mb-4 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">location_on</span>
                              {biz.businessName || '이름 없는 센터'}
                            </p>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                              <div className="flex flex-col gap-1">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">보유 수강권</p>
                                <p className="text-sm font-black text-primary">
                                  {(() => {
                                    const tickets = userData?.ticketsByBusiness?.[biz.id] || 0;
                                    const policy = biz.ticketPolicy;
                                    const policyMap: any = { week: '주', month: '월', year: '년' };
                                    const policyText = policy ? ` (매${policyMap[policy.period] || '월'} ${policy.amount}회)` : '';
                                    return `${tickets}회${policyText}`;
                                  })()}
                                </p>
                              </div>
                              <button className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1">
                                캘린더 보기 <span className="material-symbols-outlined text-xs">calendar_month</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )];
                    }

                    return classNames.map((className: unknown) => {
                      const classNameStr = String(className);
                      return (
                        <motion.div
                          key={`${biz.id}-${classNameStr}`}
                          whileHover={{ y: -5 }}
                          onClick={() => navigate(`/reservation?businessId=${biz.id}`)}
                          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                        >
                          <div className="h-40 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                            {biz.businessPhotoURL ? (
                              <img src={biz.businessPhotoURL} alt={biz.businessName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
                                <span className="material-symbols-outlined text-6xl text-primary/30">storefront</span>
                              </div>
                            )}
                            <div className="absolute top-4 right-4 px-3 py-1 bg-emerald-500 rounded-full text-[10px] font-bold text-white shadow-lg shadow-emerald-500/30 animate-pulse">
                              수업 예약 가능
                            </div>
                          </div>
                          <div className="p-6">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="text-xl font-bold group-hover:text-primary transition-colors truncate">
                                {classNameStr}
                              </h3>
                            </div>
                            <p className="text-slate-500 text-sm mb-4 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">location_on</span>
                              {biz.businessName || '이름 없는 센터'}
                            </p>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                              <div className="flex flex-col gap-1">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">보유 수강권</p>
                                <p className="text-sm font-black text-primary">
                                  {(() => {
                                    const tickets = userData?.ticketsByBusiness?.[biz.id] || 0;
                                    const policy = biz.ticketPolicy;
                                    const policyMap: any = { week: '주', month: '월', year: '년' };
                                    const policyText = policy ? ` (매${policyMap[policy.period] || '월'} ${policy.amount}회)` : '';
                                    return `${tickets}회${policyText}`;
                                  })()}
                                </p>
                              </div>
                              <button className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1">
                                캘린더 보기 <span className="material-symbols-outlined text-xs">calendar_month</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    });
                  }) : (
                    <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                      <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">domain_disabled</span>
                      <p className="text-slate-500 dark:text-slate-400 font-medium">아직 승인된 수강 센터가 없습니다.</p>
                      <button 
                        onClick={() => navigate('/tickets')}
                        className="mt-4 px-6 py-2 bg-primary text-white rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                      >
                        센터 신청하러 가기
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </main>

        {/* 푸터 */}
        <footer className="mt-20 border-t border-slate-200 dark:border-slate-800 py-10 px-10">
          <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3 grayscale opacity-70">
              <span className="material-symbols-outlined text-xl">calendar_month</span>
              <span className="font-bold text-sm">예약시스템</span>
            </div>
            <div className="flex gap-8 text-xs text-slate-500 dark:text-slate-400">
              <span>© 2026 예약시스템 Inc. All rights reserved.</span>
            </div>
          </div>
        </footer>

        {/* 프로필 수정 모달 */}
        <AnimatePresence>
          {isEditModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsEditModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black">프로필 수정</h2>
                    <button
                      onClick={() => setIsEditModalOpen(false)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  <div className="space-y-5">
                    {/* 이미지 섹션 */}
                    <div className="flex flex-col items-center gap-4 mb-4">
                      <div className="relative group cursor-pointer" onClick={handleImageClick}>
                        <div
                          className="size-28 rounded-full bg-primary/10 border-4 border-white dark:border-slate-800 shadow-xl bg-center bg-cover flex items-center justify-center overflow-hidden"
                          style={{ backgroundImage: editPhotoURL ? `url("${editPhotoURL}")` : 'none' }}
                        >
                          {!editPhotoURL && <span className="material-symbols-outlined text-4xl text-primary/40">person</span>}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="material-symbols-outlined text-white">photo_camera</span>
                          </div>
                        </div>
                        {uploadingImage && (
                          <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 rounded-full flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent animate-spin rounded-full"></div>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">이미지 클릭하여 변경</p>
                    </div>

                    {/* 날짜 정보 (읽기 전용) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">최초 가입일</p>
                        <p className="text-xs font-bold">
                          {userData?.createdAt?.toDate?.() ? new Date(userData.createdAt.toDate()).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">최근 접속일</p>
                        <p className="text-xs font-bold">
                          {userData?.lastLoginAt?.toDate?.() ? new Date(userData.lastLoginAt.toDate()).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">이름</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                          placeholder="성함 입력"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">전화번호</label>
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                          placeholder="010-0000-0000"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">이메일 주소</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                        placeholder="example@email.com"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">기타 정보 1</label>
                        <input
                          type="text"
                          value={editExtra1}
                          onChange={(e) => setEditExtra1(e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                          placeholder="메모 또는 추가 정보"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">기타 정보 2</label>
                        <input
                          type="text"
                          value={editExtra2}
                          onChange={(e) => setEditExtra2(e.target.value)}
                          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                          placeholder="기타 참고 사항"
                        />
                      </div>
                    </div>
                    <div className="pt-4">
                      <button
                        type="button"
                        onClick={handleUpdateProfile}
                        disabled={isUpdating || uploadingImage}
                        className="w-full h-14 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isUpdating ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full"></div>
                            <span>저장 중...</span>
                          </>
                        ) : '변경사항 저장하기'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default Home;