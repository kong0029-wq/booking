import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const SuperAdminDashboard = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="flex min-h-screen overflow-hidden bg-slate-50 text-slate-900 font-display">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-100 flex-shrink-0 flex flex-col hidden md:flex h-screen sticky top-0">
        <div className="p-8">
          <span className="text-2xl font-black tracking-tight text-emerald-600">BookFast Admin</span>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          <a className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-100 text-emerald-900 font-bold" href="#">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
            <span className="font-semibold text-sm">대시보드</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors" href="#">
            <span className="material-symbols-outlined">group</span>
            <span className="font-semibold text-sm">사용자 관리</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors" href="#">
            <span className="material-symbols-outlined">receipt_long</span>
            <span className="font-semibold text-sm">시스템 로그</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors" href="#">
            <span className="material-symbols-outlined">api</span>
            <span className="font-semibold text-sm">API 관리</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors" href="#">
            <span className="material-symbols-outlined">settings</span>
            <span className="font-semibold text-sm">설정</span>
          </a>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2">
            <img alt="관리자 아바타" className="w-10 h-10 rounded-full object-cover" src="https://lh3.googleusercontent.com/aida/ADBb0ug1AjAjCD9eCO8LyyEdwwB9J4fxhTsIsbuM4VtOVN2hBXFT0tXZkocbRf-HFp2xADLXKqx0lB6TPHWhfcrCgExajSPkxv32ODniVjxS27N2Vm8zLi6pFhpgLjK3oaihWhjV1ESqw61OTckPcFt7gN4WyxuySZ9YWkDqGfqM_SBBYkwtlqY2zhHBrfTzO1wqFt8lZMBd-CeiOASJc1Ov1UnxjFE3sj5FRhiVCv9N_3-H3i9-_lbnCUawFbhUTxUoJ3Str9ligZu86Ys" />
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-slate-900">알렉스 리베라</span>
              <span className="text-xs text-slate-400">슈퍼 관리자</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto h-screen">
        {/* Top Bar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 md:px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3 md:hidden">
            <span className="material-symbols-outlined text-emerald-600 text-xl">admin_panel_settings</span>
            <span className="font-bold text-lg">Admin</span>
          </div>
          <div className="relative w-full max-w-sm hidden md:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500 text-sm outline-none" placeholder="시스템 리소스 검색..." type="text" />
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors relative">
              <span className="material-symbols-outlined text-slate-600">notifications</span>
              <span className="absolute top-2 right-2 w-2 h-2 bg-rose-600 rounded-full"></span>
            </button>
            <button onClick={handleLogout} className="hidden md:flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-transform active:scale-95">
              <span className="material-symbols-outlined text-sm">logout</span>
              로그아웃
            </button>
            <button onClick={handleLogout} className="md:hidden flex items-center justify-center rounded-full bg-slate-100 w-10 h-10 text-slate-600">
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-[1280px] mx-auto w-full space-y-8">
          {/* Page Title */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <h1 className="font-black text-3xl text-slate-900 tracking-tight">시스템 개요</h1>
              <p className="text-slate-500 text-sm mt-1">BookFast 핵심 서비스를 위한 실시간 개발자 대시보드입니다.</p>
            </div>
            <div className="flex gap-2">
              <button className="bg-white border border-slate-200 px-4 py-2 rounded-xl font-semibold text-sm text-slate-900 hover:bg-slate-50 transition-colors shadow-sm">보고서 생성</button>
              <button className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm shadow-emerald-600/20">변경사항 배포</button>
            </div>
          </div>

          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="text-slate-500 font-semibold text-xs">총 사용자</span>
                <span className="material-symbols-outlined text-emerald-600">groups</span>
              </div>
              <span className="text-2xl font-black text-slate-900">128,432</span>
              <div className="flex items-center gap-1">
                <span className="text-emerald-600 font-semibold text-[10px] bg-emerald-50 px-1 rounded">+12%</span>
                <span className="text-slate-400 font-semibold text-[10px]">지난달 대비</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="text-slate-500 font-semibold text-xs">총 매출</span>
                <span className="material-symbols-outlined text-emerald-600">payments</span>
              </div>
              <span className="text-2xl font-black text-slate-900">$2.4M</span>
              <div className="flex items-center gap-1">
                <span className="text-emerald-600 font-semibold text-[10px] bg-emerald-50 px-1 rounded">+8.4%</span>
                <span className="text-slate-400 font-semibold text-[10px]">목표 대비</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm flex flex-col gap-2 border-l-4 border-l-emerald-500 border-t border-r border-b border-t-slate-100 border-r-slate-100 border-b-slate-100">
              <div className="flex justify-between items-start">
                <span className="text-slate-500 font-semibold text-xs">시스템 가동 시간</span>
                <span className="material-symbols-outlined text-emerald-600">verified</span>
              </div>
              <span className="text-2xl font-black text-slate-900">99.98%</span>
              <div className="flex items-center gap-1">
                <span className="text-emerald-600 font-semibold text-[10px] bg-emerald-50 px-1 rounded">정상</span>
                <span className="text-slate-400 font-semibold text-[10px]">모든 시스템 운영 중</span>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="text-slate-500 font-semibold text-xs">활성 인스턴스</span>
                <span className="material-symbols-outlined text-emerald-600">dns</span>
              </div>
              <span className="text-2xl font-black text-slate-900">14</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-semibold text-[10px] bg-slate-100 px-1 rounded">AWS us-east-1</span>
              </div>
            </div>
          </div>

          {/* Bento Grid for Charts and Health */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Main Chart Section */}
            <div className="lg:col-span-8 bg-white p-6 md:p-8 rounded-xl shadow-sm border border-slate-100 space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl text-slate-900 tracking-tight">트래픽 분석</h3>
                <div className="flex bg-slate-50 border border-slate-100 rounded-lg p-1">
                  <button className="px-3 py-1.5 bg-white rounded shadow-sm text-xs font-semibold text-slate-900">일간</button>
                  <button className="px-3 py-1.5 text-xs font-semibold text-slate-500">주간</button>
                </div>
              </div>
              {/* Visual representation of a line chart */}
              <div className="relative h-64 w-full">
                <img className="w-full h-full object-cover rounded-xl opacity-90 shadow-sm" src="https://lh3.googleusercontent.com/aida/ADBb0ujqiyjLdfJ0WluIua1W2OtZnVS3Z8J4uEiSNCV-ztlG4Z7PtxuHIyJ5mAPCwnFXvjZwNRXsZAMAkjACwSNLx0aR1UaybUqaK4VXldNIufEUeqID_iGp291cIlrQv3K-cWg14UA_lyUCifZqytCIkEAORwweepQIMsmIbvEFaXY6ln8SbRz6As1VkAbdy3FIFE5ne-4LqGkM4lpJ5plMG7t_HkMMg9dDnkmPT7hh95lGfToSznygHgaNwSOZd_AyamE2wIOf1yiZ3pE" alt="Chart" />
                <div className="absolute inset-0 flex items-end px-4 pb-4">
                  <div className="w-full flex justify-between text-slate-400 text-[10px] font-semibold tracking-wider">
                    <span>00:00</span><span className="hidden sm:inline">04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span className="hidden sm:inline">20:00</span><span>23:59</span>
                  </div>
                </div>
              </div>
            </div>
            {/* System Health Column */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                  <span className="material-symbols-outlined text-emerald-600">speed</span>
                  <h3 className="font-semibold text-sm uppercase tracking-widest text-slate-500">리소스 사용량</h3>
                </div>
                {/* CPU Usage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 font-medium">CPU 사용량</span>
                    <span className="font-bold text-slate-900">42%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 w-[42%] h-full rounded-full"></div>
                  </div>
                </div>
                {/* Memory Usage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 font-medium">메모리 할당</span>
                    <span className="font-bold text-slate-900">6.8GB / 16GB</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-400 w-[65%] h-full rounded-full"></div>
                  </div>
                </div>
                {/* DB Latency */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 font-medium">DB 지연 시간</span>
                    <span className="font-bold text-emerald-600">14ms</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 w-[15%] h-full rounded-full"></div>
                  </div>
                </div>
              </div>
              {/* Bar Chart Placeholder (User Growth) */}
              <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-slate-900/20 h-[190px] flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <span className="material-symbols-outlined text-6xl text-white">trending_up</span>
                </div>
                <span className="text-slate-400 font-semibold text-xs tracking-widest uppercase z-10">신규 사용자 성장</span>
                <div className="flex items-end gap-1.5 h-20 z-10 mt-2">
                  <div className="bg-emerald-500/50 hover:bg-emerald-400 transition-colors w-full h-[30%] rounded-t-sm"></div>
                  <div className="bg-emerald-500/60 hover:bg-emerald-400 transition-colors w-full h-[50%] rounded-t-sm"></div>
                  <div className="bg-emerald-500/70 hover:bg-emerald-400 transition-colors w-full h-[40%] rounded-t-sm"></div>
                  <div className="bg-emerald-500/80 hover:bg-emerald-400 transition-colors w-full h-[70%] rounded-t-sm"></div>
                  <div className="bg-emerald-500 hover:bg-emerald-400 transition-colors w-full h-[60%] rounded-t-sm"></div>
                  <div className="bg-emerald-400 hover:bg-emerald-300 transition-colors w-full h-[90%] rounded-t-sm"></div>
                  <div className="bg-emerald-400 hover:bg-emerald-300 transition-colors w-full h-[85%] rounded-t-sm"></div>
                  <div className="bg-emerald-300 hover:bg-emerald-200 transition-colors w-full h-[95%] rounded-t-sm shadow-[0_0_10px_rgba(110,231,183,0.5)]"></div>
                </div>
                <div className="flex justify-between items-center mt-3 z-10">
                  <span className="text-3xl font-black text-white">+1,240</span>
                  <span className="text-emerald-400 text-[10px] font-bold bg-emerald-900/50 px-2 py-1 rounded-full">오늘 활성</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activities Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 md:px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg md:text-xl text-slate-900 tracking-tight">시스템 이벤트 로그</h3>
              <button className="text-emerald-600 font-semibold text-xs md:text-sm flex items-center gap-1 hover:text-emerald-700 transition-colors bg-emerald-50 px-3 py-1.5 rounded-lg">
                전체 보기
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="px-6 md:px-8 py-4 flex items-start md:items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-semibold text-sm truncate">신규 사용자 등록됨: <span className="text-emerald-600">sarah.j@example.com</span></p>
                  <p className="text-slate-400 text-xs mt-0.5">2분 전 • IP: 192.168.1.45</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 px-2 py-1 rounded text-emerald-600 text-[10px] font-bold whitespace-nowrap">성공</div>
              </div>
              <div className="px-6 md:px-8 py-4 flex items-start md:items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[20px]">backup</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-semibold text-sm truncate">데이터베이스 백업이 성공적으로 완료되었습니다</p>
                  <p className="text-slate-400 text-xs mt-0.5">45분 전 • 크기: 2.4GB</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 px-2 py-1 rounded text-blue-600 text-[10px] font-bold whitespace-nowrap">정보</div>
              </div>
              <div className="px-6 md:px-8 py-4 flex items-start md:items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                <div className="w-10 h-10 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-semibold text-sm truncate">결제 게이트웨이 모듈에서 API 오류 감지됨</p>
                  <p className="text-slate-400 text-xs mt-0.5">1시간 전 • 상태: 503 서비스를 사용할 수 없음</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 px-2 py-1 rounded text-rose-600 text-[10px] font-bold whitespace-nowrap">오류</div>
              </div>
              <div className="px-6 md:px-8 py-4 flex items-start md:items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[20px]">update</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-semibold text-sm truncate">시스템 업데이트 예정 - 02:00 AM UTC</p>
                  <p className="text-slate-400 text-xs mt-0.5">2시간 전 • 버전 2.4.1-beta</p>
                </div>
                <div className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-600 text-[10px] font-bold whitespace-nowrap">대기 중</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-slate-50 border-t border-slate-200 mt-auto py-8 px-4 md:px-8">
          <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
              <span className="text-lg font-black text-slate-900 tracking-tight">BookFast Admin</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">© 2026 BookFast Inc. All rights reserved.</span>
            </div>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a className="text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors" href="#">개인정보 처리방침</a>
              <a className="text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors" href="#">이용약관</a>
              <a className="text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors" href="#">고객 지원</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
