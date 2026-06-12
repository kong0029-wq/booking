import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

type Tab = 'dashboard' | 'users' | 'classes' | 'logs' | 'settings';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const fetchLogs = async () => {
      const q = query(collection(db, 'loginLogs'), orderBy('loginAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchLogs();
    return () => { unsubUsers(); unsubClasses(); };
  }, []);

  const handleLogout = async () => { await signOut(auth); navigate('/'); };

  const handleRoleChange = async (uid: string, newRole: string) => {
    if (!confirm(`정말 이 사용자의 권한을 ${newRole}(으)로 변경하시겠습니까?`)) return;
    await updateDoc(doc(db, 'users', uid), { role: newRole });
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('정말 이 사용자를 삭제하시겠습니까? 복구할 수 없습니다.')) return;
    await deleteDoc(doc(db, 'users', uid));
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('정말 이 수업을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'classes', classId));
  };

  const handleResetPassword = async (email: string, name: string) => {
    if (!confirm(`${name}(${email})님에게 비밀번호 재설정 메일을 보내시겠습니까?`)) return;
    try {
      await sendPasswordResetEmail(auth, email);
      setToast({ message: `${name}(${email})님에게 비밀번호 재설정 메일을 발송했습니다.`, type: 'success' });
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      console.error('Password reset error:', err);
      setToast({ message: `메일 발송 실패: ${err.message}`, type: 'error' });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = !searchTerm || u.email?.includes(searchTerm) || u.name?.includes(searchTerm);
    const matchFilter = userFilter === 'all' || u.role === userFilter;
    return matchSearch && matchFilter;
  });

  const filteredClasses = classes.filter(c => {
    if (!searchTerm) return true;
    return c.className?.includes(searchTerm) || c.businessName?.includes(searchTerm);
  });

  const stats = {
    totalUsers: users.length,
    businessUsers: users.filter(u => u.role === 'BUSINESS').length,
    normalUsers: users.filter(u => u.role === 'USER').length,
    totalClasses: classes.length,
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: '대시보드', icon: 'dashboard' },
    { id: 'users', label: '사용자 관리', icon: 'group' },
    { id: 'classes', label: '수업 관리', icon: 'school' },
    { id: 'logs', label: '시스템 로그', icon: 'receipt_long' },
    { id: 'settings', label: '설정', icon: 'settings' },
  ];

  const formatDate = (ts: any) => {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('ko-KR');
  };

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      SUPER_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
      ADMIN: 'bg-rose-100 text-rose-700 border-rose-200',
      BUSINESS: 'bg-blue-100 text-blue-700 border-blue-200',
      USER: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return map[role] || map.USER;
  };

  // ─── 대시보드 탭 ───
  const renderDashboard = () => (
    <div className="space-y-6">
      <div><h1 className="font-black text-2xl md:text-3xl tracking-tight">시스템 개요</h1><p className="text-slate-500 text-sm mt-1">실시간 시스템 현황 대시보드</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '총 사용자', value: stats.totalUsers, icon: 'groups', color: 'emerald' },
          { label: '일반 사용자', value: stats.normalUsers, icon: 'person', color: 'blue' },
          { label: '사업자', value: stats.businessUsers, icon: 'storefront', color: 'amber' },
          { label: '전체 수업', value: stats.totalClasses, icon: 'school', color: 'violet' },
        ].map((m, i) => (
          <div key={i} className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <span className="text-slate-500 font-semibold text-xs">{m.label}</span>
              <span className={`material-symbols-outlined text-${m.color}-600`}>{m.icon}</span>
            </div>
            <span className="text-2xl font-black text-slate-900">{m.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {/* 최근 로그인 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50"><h3 className="font-bold text-lg tracking-tight">최근 로그인 활동</h3></div>
        <div className="divide-y divide-slate-100">
          {logs.slice(0, 5).map((log, i) => {
            const user = users.find(u => u.uid === log.uid);
            return (
              <div key={i} className="px-6 py-3 flex items-center gap-4 text-sm">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">login</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{user?.name || log.uid?.slice(0, 8)}</p>
                  <p className="text-slate-400 text-xs">{user?.email || '-'}</p>
                </div>
                <span className="text-slate-400 text-xs whitespace-nowrap">{formatDate(log.loginAt)}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600">{log.loginMethod}</span>
              </div>
            );
          })}
          {logs.length === 0 && <p className="px-6 py-8 text-center text-slate-400">로그인 기록이 없습니다.</p>}
        </div>
      </div>
    </div>
  );

  // ─── 사용자 관리 탭 ───
  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h1 className="font-black text-2xl md:text-3xl tracking-tight">사용자 관리</h1><p className="text-slate-500 text-sm mt-1">전체 {users.length}명의 사용자</p></div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'USER', 'BUSINESS', 'ADMIN'].map(f => (
            <button key={f} onClick={() => setUserFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${userFilter === f ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {f === 'all' ? '전체' : f}
            </button>
          ))}
        </div>
      </div>
      <div className="relative"><span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <input className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="이름 또는 이메일로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr><th className="px-4 py-3 text-left">사용자</th><th className="px-4 py-3 text-left hidden md:table-cell">이메일</th><th className="px-4 py-3 text-center">권한</th><th className="px-4 py-3 text-center hidden sm:table-cell">로그인 횟수</th><th className="px-4 py-3 text-center hidden lg:table-cell">가입일</th><th className="px-4 py-3 text-center">관리</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3"><span className="font-semibold text-slate-900">{u.name || '-'}</span><span className="block md:hidden text-xs text-slate-400 truncate">{u.email}</span></td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell truncate max-w-[200px]">{u.email}</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${roleBadge(u.role)}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-center text-slate-600 hidden sm:table-cell">{u.loginCount || 0}</td>
                  <td className="px-4 py-3 text-center text-slate-400 text-xs hidden lg:table-cell">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <select className="text-xs border border-slate-200 rounded-lg px-1 py-1 outline-none" defaultValue={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}>
                        <option value="USER">USER</option><option value="BUSINESS">BUSINESS</option><option value="ADMIN">ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option>
                      </select>
                      <button onClick={() => handleResetPassword(u.email, u.name)} title="비밀번호 초기화" className="text-blue-400 hover:text-blue-600 transition-colors"><span className="material-symbols-outlined text-[18px]">lock_reset</span></button>
                      <button onClick={() => handleDeleteUser(u.id)} title="계정 삭제" className="text-rose-400 hover:text-rose-600 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">검색 결과가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── 수업 관리 탭 ───
  const renderClasses = () => (
    <div className="space-y-6">
      <div><h1 className="font-black text-2xl md:text-3xl tracking-tight">수업 관리</h1><p className="text-slate-500 text-sm mt-1">전체 {classes.length}개의 수업</p></div>
      <div className="relative"><span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <input className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-500" placeholder="수업명 또는 업체명으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr><th className="px-4 py-3 text-left">수업명</th><th className="px-4 py-3 text-left hidden md:table-cell">업체명</th><th className="px-4 py-3 text-center">날짜</th><th className="px-4 py-3 text-center hidden sm:table-cell">시간</th><th className="px-4 py-3 text-center hidden sm:table-cell">정원</th><th className="px-4 py-3 text-center">관리</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClasses.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{c.className || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.businessName || '-'}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{c.date || '-'}</td>
                  <td className="px-4 py-3 text-center text-slate-600 hidden sm:table-cell">{c.time || '-'}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell"><span className="text-emerald-600 font-bold">{c.currentCapacity || 0}</span><span className="text-slate-400">/{c.maxCapacity || 0}</span></td>
                  <td className="px-4 py-3 text-center"><button onClick={() => handleDeleteClass(c.id)} className="text-rose-400 hover:text-rose-600 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button></td>
                </tr>
              ))}
              {filteredClasses.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">수업이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── 시스템 로그 탭 ───
  const renderLogs = () => (
    <div className="space-y-6">
      <div><h1 className="font-black text-2xl md:text-3xl tracking-tight">시스템 로그</h1><p className="text-slate-500 text-sm mt-1">최근 로그인 기록 (최대 100건)</p></div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr><th className="px-4 py-3 text-left">사용자</th><th className="px-4 py-3 text-center">방법</th><th className="px-4 py-3 text-left hidden md:table-cell">플랫폼</th><th className="px-4 py-3 text-right">시간</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log, i) => {
                const user = users.find(u => u.uid === log.uid);
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-900">{user?.name || log.uid?.slice(0, 12)}</p><p className="text-xs text-slate-400">{user?.email || '-'}</p></td>
                    <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.loginMethod?.includes('google') ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{log.loginMethod}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell truncate max-w-[200px]">{log.platform || '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs whitespace-nowrap">{formatDate(log.loginAt)}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-400">로그 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ─── 설정 탭 ───
  const renderSettings = () => (
    <div className="space-y-6">
      <div><h1 className="font-black text-2xl md:text-3xl tracking-tight">설정</h1><p className="text-slate-500 text-sm mt-1">시스템 관리 설정</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100"><span className="material-symbols-outlined text-emerald-600">info</span><h3 className="font-bold text-lg">시스템 정보</h3></div>
          {[['앱 버전', 'v2.4.1'], ['프레임워크', 'React 19 + Vite'], ['데이터베이스', 'Firebase Firestore'], ['인증', 'Firebase Auth'], ['호스팅', 'Firebase Hosting']].map(([k, v], i) => (
            <div key={i} className="flex justify-between text-sm"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-900">{v}</span></div>
          ))}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100"><span className="material-symbols-outlined text-emerald-600">database</span><h3 className="font-bold text-lg">데이터 현황</h3></div>
          {[['사용자 수', `${stats.totalUsers}명`], ['수업 수', `${stats.totalClasses}개`], ['로그인 기록', `${logs.length}건`], ['사업자 수', `${stats.businessUsers}명`]].map(([k, v], i) => (
            <div key={i} className="flex justify-between text-sm"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-900">{v}</span></div>
          ))}
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4 md:col-span-2">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100"><span className="material-symbols-outlined text-emerald-600">shield</span><h3 className="font-bold text-lg">관리자 계정</h3></div>
          <p className="text-sm text-slate-500">현재 로그인: <span className="font-semibold text-slate-900">{auth.currentUser?.email}</span></p>
          <div className="flex gap-3 pt-2">
            <button onClick={handleLogout} className="bg-rose-600 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-rose-700 transition-colors">로그아웃</button>
          </div>
        </div>
      </div>
    </div>
  );

  const contentMap: Record<Tab, () => React.ReactNode> = { dashboard: renderDashboard, users: renderUsers, classes: renderClasses, logs: renderLogs, settings: renderSettings };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div></div>;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-display">
      {/* 데스크톱 사이드바 */}
      <aside className="w-64 bg-white border-r border-slate-100 flex-col hidden md:flex h-screen sticky top-0">
        <div className="p-6"><span className="text-xl font-black tracking-tight text-emerald-600">BookFast Admin</span></div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id); setSearchTerm(''); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${activeTab === t.id ? 'bg-emerald-100 text-emerald-900 font-bold' : 'text-slate-500 hover:bg-slate-100'}`}>
              <span className="material-symbols-outlined" style={activeTab === t.id ? { fontVariationSettings: "'FILL' 1" } : {}}>{t.icon}</span>
              <span className="font-semibold text-sm">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 truncate">{auth.currentUser?.email}</p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">슈퍼 관리자</p>
        </div>
      </aside>

      {/* 모바일 하단 탭 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex md:hidden z-50">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setSearchTerm(''); }} className={`flex-1 flex flex-col items-center py-2 ${activeTab === t.id ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className="material-symbols-outlined text-[20px]">{t.icon}</span>
            <span className="text-[10px] font-semibold mt-0.5">{t.label}</span>
          </button>
        ))}
      </div>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col overflow-y-auto h-screen">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-2 md:hidden"><span className="material-symbols-outlined text-emerald-600">admin_panel_settings</span><span className="font-bold">Admin</span></div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={handleLogout} className="hidden md:flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-semibold text-sm active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-sm">logout</span>로그아웃
            </button>
            <button onClick={handleLogout} className="md:hidden flex items-center justify-center rounded-full bg-slate-100 w-9 h-9 text-slate-600">
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        </header>
        <div className="p-4 md:p-8 max-w-[1280px] mx-auto w-full pb-24 md:pb-8">
          {contentMap[activeTab]()}
        </div>
      </main>

      {/* 토스트 알림 */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-md px-6 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          <span className="material-symbols-outlined text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
