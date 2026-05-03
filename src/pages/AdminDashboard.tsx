import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ todayClasses: 0, totalReservations: 0, totalClasses: 0, todayLogins: 0 });

  // 수업 등록 폼 상태
  const [newClass, setNewClass] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    instructor: '',
    type: '6:1 그룹 레슨',
    maxCapacity: 6
  });

  useEffect(() => {
    let unsubscribeSnap: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        navigate('/');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && (userDoc.data().role === 'ADMIN' || userDoc.data().role === 'BUSINESS')) {
          setLoading(false);

          // 실시간 수업 목록 구독
          const q = query(collection(db, 'classes'), orderBy('date', 'desc'), orderBy('time', 'asc'));

          unsubscribeSnap = onSnapshot(q, (snapshot) => {
            const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setClasses(classList);

            // 통계 계산
            const today = new Date().toISOString().split('T')[0];
            const todayClasses = classList.filter((c: any) => c.date === today).length;
            const totalReservations = classList.reduce((acc: number, c: any) => acc + (c.currentCapacity || 0), 0);

            setStats({ todayClasses, totalReservations, totalClasses: classList.length, todayLogins: 0 });
          });

          // 로그인 로그 조회
          const logsQuery = query(
            collection(db, 'loginLogs'),
            where('uid', '==', user.uid),
            orderBy('loginAt', 'desc'),
            limit(10)
          );
          const logsSnap = await getDocs(logsQuery);
          const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setLoginLogs(logs);

          const today = new Date().toISOString().split('T')[0];
          const todayLoginCount = logs.filter((log: any) => {
            if (!log.loginAt?.toDate) return false;
            return log.loginAt.toDate().toISOString().split('T')[0] === today;
          }).length;
          setStats(prev => ({ ...prev, todayLogins: todayLoginCount }));
        } else {
          alert('관리자 또는 사업자 권한이 없습니다.');
          navigate('/home');
        }
      } catch (err) {
        console.error("Auth check error:", err);
        navigate('/');
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnap?.();
    };
  }, [navigate]);

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.instructor) { alert('강사명을 입력해주세요.'); return; }

    try {
      await addDoc(collection(db, 'classes'), {
        ...newClass,
        currentCapacity: 0,
        createdAt: serverTimestamp()
      });
      alert('수업이 등록되었습니다.');
      setNewClass({ ...newClass, instructor: '' });
    } catch (err) {
      alert('수업 등록에 실패했습니다.');
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (window.confirm('이 수업을 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'classes', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light">
        <p className="text-primary font-bold animate-pulse">관리자 권한 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">

      {/* 1. 사이드바 네비게이션 */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col fixed h-full">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary rounded-lg p-2 text-white">
            <span className="material-symbols-outlined text-2xl">calendar_today</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">부킹 시스템</h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <a className="flex items-center gap-3 px-4 py-3 bg-primary/10 text-primary rounded-xl font-medium" href="#">
            <span className="material-symbols-outlined">dashboard</span>
            <span>대시보드</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors" href="#">
            <span className="material-symbols-outlined">corporate_fare</span>
            <span>업체 관리</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors" href="#">
            <span className="material-symbols-outlined">group</span>
            <span>사용자 관리</span>
          </a>
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">A</div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold truncate">관리자님</span>
                <span className="text-xs text-slate-500 truncate">admin@system.com</span>
              </div>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 2. 메인 컨텐츠 영역 */}
      <main className="flex-1 ml-64 flex flex-col min-w-0">

        {/* 헤더 */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-lg font-bold">어드민 대시보드</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-xl">search</span>
              <input className="pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary w-64 text-slate-900" placeholder="수업 검색..." type="text" />
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8 overflow-y-auto">

          {/* 통계 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-blue-50 text-blue-600 dark:bg-blue-900/20 rounded-lg">
                  <span className="material-symbols-outlined">event_available</span>
                </div>
                <span className="text-emerald-500 text-sm font-medium flex items-center">실시간 업데이트</span>
              </div>
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">오늘 진행 수업</h3>
              <p className="text-2xl font-bold mt-1">{stats.todayClasses}개</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-orange-50 text-orange-600 dark:bg-orange-900/20 rounded-lg">
                  <span className="material-symbols-outlined">group</span>
                </div>
              </div>
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">총 예약 인원</h3>
              <p className="text-2xl font-bold mt-1">{stats.totalReservations}명</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-purple-50 text-purple-600 dark:bg-purple-900/20 rounded-lg">
                  <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <span className="text-emerald-500 text-sm font-medium">관리 중</span>
              </div>
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">등록된 총 수업</h3>
              <p className="text-2xl font-bold mt-1">{stats.totalClasses}개</p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-teal-50 text-teal-600 dark:bg-teal-900/20 rounded-lg">
                  <span className="material-symbols-outlined">login</span>
                </div>
                <span className="text-teal-500 text-sm font-medium">오늘</span>
              </div>
              <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium">오늘 접속 횟수</h3>
              <p className="text-2xl font-bold mt-1">{stats.todayLogins}회</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* 3. 새 수업 등록 폼 (왼쪽) */}
            <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold mb-6">새 수업 등록</h3>
              <form onSubmit={handleAddClass} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">날짜</label>
                  <input type="date" className="w-full rounded-xl border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-primary" value={newClass.date} onChange={e => setNewClass({ ...newClass, date: e.target.value })} required />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">시간</label>
                  <input type="time" className="w-full rounded-xl border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-primary" value={newClass.time} onChange={e => setNewClass({ ...newClass, time: e.target.value })} required />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">강사명</label>
                  <input type="text" placeholder="강사 성함" className="w-full rounded-xl border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-primary text-slate-900" value={newClass.instructor} onChange={e => setNewClass({ ...newClass, instructor: e.target.value })} required />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">레슨 종류</label>
                  <select className="w-full rounded-xl border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-primary text-slate-900" value={newClass.type} onChange={e => setNewClass({ ...newClass, type: e.target.value, maxCapacity: e.target.value.includes('1:1') ? 1 : 6 })}>
                    <option value="6:1 그룹 레슨">6:1 그룹 레슨 (6명)</option>
                    <option value="1:1 개인 레슨">1:1 개인 레슨 (1명)</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all active:scale-95">수업 등록하기</button>
              </form>
            </div>

            {/* 4. 최근 예약 활동 / 수업 목록 테이블 (오른쪽) */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden h-fit">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-lg font-bold">수업 관리 목록</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">날짜/시간</th>
                      <th className="px-6 py-4">강사</th>
                      <th className="px-6 py-4">레슨 타입</th>
                      <th className="px-6 py-4">예약 인원</th>
                      <th className="px-6 py-4 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {classes.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold">{c.date}</span>
                            <span className="text-xs text-slate-500">{c.time}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium">{c.instructor}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.type.includes('1:1') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {c.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium">{c.currentCapacity} / {c.maxCapacity}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDeleteClass(c.id)} className="material-symbols-outlined text-rose-500 hover:text-rose-700 transition-colors">delete</button>
                        </td>
                      </tr>
                    ))}
                    {classes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center text-slate-400">등록된 수업 일정이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 최근 접속 이력 */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-teal-500">history</span>
                최근 접속 이력
              </h3>
              <span className="text-xs text-slate-400">최근 10건</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-4">접속 시간</th>
                    <th className="px-6 py-4">로그인 방법</th>
                    <th className="px-6 py-4">플랫폼</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {loginLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4 font-medium">
                        {log.loginAt?.toDate?.()
                          ? new Date(log.loginAt.toDate()).toLocaleString('ko-KR', {
                              year: 'numeric', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })
                          : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          log.loginMethod?.includes('google')
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {log.loginMethod?.includes('google') ? 'Google' : '이메일'}
                          {log.loginMethod?.includes('signup') ? ' (가입)' : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{log.platform || '-'}</td>
                    </tr>
                  ))}
                  {loginLogs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">접속 기록이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;