import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-white text-slate-900">
      <div className="layout-container flex h-full grow flex-col">
        {/* 헤더 섹션 */}
        <header className="flex items-center justify-between border-b border-solid border-slate-200 px-4 md:px-10 py-4 bg-white sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <div className="text-primary size-8 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">calendar_month</span>
            </div>
            <h2 className="text-slate-900 text-xl font-bold leading-tight">예약시스템</h2>
          </div>
          <div className="flex flex-1 justify-end gap-8 items-center">
            <nav className="hidden md:flex items-center gap-8">
              <button
                onClick={() => navigate('/login')}
                className="text-slate-600 text-sm font-medium hover:text-primary transition-colors"
              >
                로그인
              </button>
            </nav>
            <button
              onClick={() => navigate('/login')}
              className="md:hidden flex items-center justify-center rounded-lg bg-primary/10 text-primary px-4 py-2 text-sm font-bold"
            >
              로그인
            </button>

          </div>
        </header>

        <main className="flex-1">
          {/* 히어로 섹션 */}
          <section className="max-w-[1200px] mx-auto px-6 py-12 md:py-24">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <span className="text-primary font-bold tracking-wider text-sm uppercase font-display">Smart Booking Solution</span>
                  <h1 className="text-slate-900 text-4xl md:text-6xl font-black leading-tight tracking-tight">
                    간편한 <br /> 예약 서비스
                  </h1>
                  <p className="text-slate-600 text-lg md:text-xl leading-relaxed max-w-md">
                    언제 어디서나 빠르고 편리하게 원하는 서비스를 예약하세요. 복잡한 절차 없이 클릭 몇 번으로 일정을 관리할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={() => navigate('/login')}
                    className="flex min-w-[160px] cursor-pointer items-center justify-center rounded-xl h-14 px-8 bg-primary text-white text-lg font-bold hover:bg-green-600 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                  >
                    예약하기
                  </button>
                  <button className="flex min-w-[160px] cursor-pointer items-center justify-center rounded-xl h-14 px-8 border-2 border-slate-200 text-slate-700 text-lg font-bold hover:bg-slate-50 transition-all active:scale-95">
                    더 알아보기
                  </button>
                </div>
              </div>

              {/* 🚀 [수정 완료] 그래픽 히어로 비주얼 영역 */}
              <div className="relative group w-full max-w-[500px] mx-auto">
                {/* 메인 배경 카드: 그라데이션 + 강력한 그림자 */}
                <div className="relative w-full aspect-square bg-gradient-to-br from-green-400 via-primary to-emerald-700 rounded-[3rem] shadow-2xl shadow-green-500/30 overflow-hidden flex items-center justify-center">

                  {/* 배경 빛 효과 (Blur 레이어) */}
                  <div className="absolute -top-20 -left-20 w-64 h-64 bg-white/20 rounded-full blur-[80px]"></div>
                  <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-black/30 rounded-full blur-[100px]"></div>

                  {/* 중앙 메인 아이콘 및 뱃지 */}
                  <div className="relative z-10 flex flex-col items-center gap-6">
                    <span className="material-symbols-outlined text-[120px] text-white leading-none drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)]">
                      event_available
                    </span>
                  </div>


                  {/* 격자 패턴 오버레이 */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}>
                  </div>
                </div>

                {/* 하단 플로팅 상태 카드 (우측 하단에 떠 있는 효과) */}

              </div>
            </div>
          </section>

          {/* 이용 방법 섹션 */}
          <section className="bg-slate-50 py-20">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="text-center mb-16">
                <h2 className="text-slate-900 text-3xl font-bold mb-4 tracking-tight">이용 방법</h2>
                <p className="text-slate-600">간단한 3단계로 원하시는 서비스를 예약해보세요</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* 단계별 카드 */}
                <div className="flex flex-col items-center text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center text-primary mb-6">
                    <span className="material-symbols-outlined text-4xl">confirmation_number</span>
                  </div>
                  <h3 className="text-slate-900 text-xl font-bold mb-3 tracking-tight">수강권 선택</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">원하시는 센터를 선택하고 수강권을 신청하여 승인을 받으세요.</p>
                </div>
                <div className="flex flex-col items-center text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center text-primary mb-6">
                    <span className="material-symbols-outlined text-4xl">calendar_month</span>
                  </div>
                  <h3 className="text-slate-900 text-xl font-bold mb-3 tracking-tight">날짜 선택</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">승인된 센터의 수업 일정을 확인하고 원하는 날짜를 선택하세요.</p>
                </div>
                <div className="flex flex-col items-center text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center text-primary mb-6">
                    <span className="material-symbols-outlined text-4xl">check_circle</span>
                  </div>
                  <h3 className="text-slate-900 text-xl font-bold mb-3 tracking-tight">예약 확정</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">선택한 내용을 확인하고 예약을 완료하면 즉시 확정됩니다.</p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
          <div className="max-w-[1200px] mx-auto px-6 text-center">
            <p className="text-slate-400 text-sm tracking-tight">© 2026 예약시스템 Inc. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Landing;