import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2, Clock, MapPin, List } from 'lucide-react';
import { auth, db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  doc,
  runTransaction
} from 'firebase/firestore';
import { getHolidayName } from '../utils/holidays';

const MyReservations = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDayRes, setSelectedDayRes] = useState<any[] | null>(null);
  const [selectedDayText, setSelectedDayText] = useState<string>('');

  useEffect(() => {
    let unsubscribeSnap: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/');
        return;
      }

      const q = query(
        collection(db, 'reservations'),
        where('uid', '==', user.uid)
      );

      unsubscribeSnap = onSnapshot(q, async (snapshot) => {
        let resList: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 메모리 상에서 정렬 (classDate 내림차순, classTime 오름차순)
        resList.sort((a: any, b: any) => {
          if (a.classDate !== b.classDate) {
            return (b.classDate || '').localeCompare(a.classDate || '');
          }
          return (a.classTime || '').localeCompare(b.classTime || '');
        });

        setReservations(resList);
        setLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnap?.();
    };
  }, [navigate]);

  // 캘린더 생성 로직
  const calendarData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= lastDate; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayReservations = reservations.filter(r => r.classDate === dateStr && r.status === 'CONFIRMED');
      const holidayName = getHolidayName(dateStr);
      const isSunday = new Date(year, month, i).getDay() === 0;
      const isToday = dateStr === today;
      days.push({ day: i, date: dateStr, count: dayReservations.length, resItems: dayReservations, holidayName, isSunday, isToday });
    }
    return days;
  }, [currentMonth, reservations]);

  const handlePrevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const handleCancel = async (res: any) => {
    // [취소 제한 로직] 수업 시작 24시간 전까지만 취소 가능 (KST 기준)
    const classDateTime = new Date(`${res.classDate}T${res.classTime || res.time || '00:00'}`);
    // 한국 시간 기준 현재 시간 생성
    const nowKST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const diffMs = classDateTime.getTime() - nowKST.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24) {
      alert('수업 진행 전 24시간 이전에만 취소 가능합니다.');
      return;
    }

    if (window.confirm('예약을 취소하시겠습니까? 취소 시 이용권 1회가 복구됩니다.')) {
      setCancellingId(res.id);
      try {
        await runTransaction(db, async (transaction: any) => {
          const userRef = doc(db, 'users', res.uid);
          const classRef = doc(db, 'classes', res.classId);
          const resRef = doc(db, 'reservations', res.id);

          const userDoc = await transaction.get(userRef);
          const classDoc = await transaction.get(classRef);

          if (!userDoc.exists()) throw "User record not found";
          
          // 1. 유저 티켓 복구 (+1)
          transaction.update(userRef, { tickets: (userDoc.data().tickets || 0) + 1 });

          // 2. 클래스 인원 감소 (-1) - 확정된 예약인 경우에만
          if (classDoc.exists() && res.status === 'CONFIRMED') {
            const currentCap = classDoc.data().currentCapacity || 0;
            transaction.update(classRef, { currentCapacity: Math.max(0, currentCap - 1) });
          }

          // 3. 예약 기록 삭제
          transaction.delete(resRef);
        });
        alert('예약이 취소되었습니다.');
      } catch (err) {
        console.error('Cancellation error', err);
        alert('취소 중 오류가 발생했습니다.');
      } finally {
        setCancellingId(null);
      }
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen font-sans text-slate-900 dark:text-slate-100 pb-10 transition-colors">
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <ChevronLeft size={24} onClick={() => navigate('/home')} className="cursor-pointer text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors" />
          <h1 className="text-xl font-bold">내 예약 현황</h1>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
          <button 
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary' : 'text-slate-500'}`}
          >
            <CalendarIcon size={14} /> 캘린더
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm text-primary' : 'text-slate-500'}`}
          >
            <List size={14} /> 리스트
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent animate-spin rounded-full"></div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === 'calendar' ? (
              <motion.div 
                key="calendar"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* 캘린더 헤더 */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black">{currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월</h2>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentMonth(new Date())}
                        className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white rounded-lg transition-all"
                      >
                        오늘
                      </button>
                      <div className="flex gap-1">
                        <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                          <ChevronLeft size={20} />
                        </button>
                        <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                      <div key={d} className={`text-center text-[10px] font-bold uppercase tracking-widest mb-4 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
                        {d}
                      </div>
                    ))}
                    {calendarData.map((d, i) => (
                      <div
                        key={i} 
                        onClick={() => {
                          if (d && d.count > 0) {
                            setSelectedDayRes(d.resItems);
                            setSelectedDayText(d.date);
                          }
                        }}
                        className={`aspect-square relative flex flex-col items-center justify-start pt-2 rounded-2xl transition-all border
                          ${d?.isToday ? 'bg-primary/10 border-primary/40 shadow-sm' : d?.count > 0 ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md' : 'border-transparent hover:border-primary/20'}
                        `}
                      >
                        {d && (
                          <>
                            <span className={`text-sm font-bold mb-1 ${d.isToday ? 'text-primary' : (d.holidayName || d.isSunday ? 'text-rose-500' : d.count > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600')}`}>
                              {d.day}
                            </span>
                            {d.isToday && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full"></div>}
                            {d.holidayName && (
                              <span className="text-[7px] text-rose-500 mb-1 truncate w-full text-center px-1 font-medium">
                                {d.holidayName}
                              </span>
                            )}
                            {d.count > 0 && (
                              <div className="w-full px-1 flex flex-col gap-0.5 items-center mt-auto pb-1.5">
                                {d.resItems.slice(0, 2).map((r: any, idx: number) => (
                                  <div key={idx} className="bg-primary text-white text-[7px] font-black py-0.5 px-1 rounded-md w-full truncate text-center leading-tight shadow-sm shadow-primary/20">
                                    {r.classTime || r.time}
                                  </div>
                                ))}
                                {d.count > 2 && <div className="text-[8px] text-primary font-black leading-none mt-0.5">+{d.count - 2}</div>}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 선택 월의 예약 요약 리스트 */}
                <div className="space-y-4 mt-8">
                  <h3 className="text-sm font-bold text-slate-500 px-2 uppercase tracking-wider">이달의 수업 일정</h3>
                  {reservations
                    .filter(r => {
                      const d = new Date(r.classDate);
                      return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
                    })
                    .sort((a, b) => a.classDate.localeCompare(b.classDate) || a.classTime.localeCompare(b.classTime))
                    .map((res) => (
                      <ReservationCard key={res.id} res={res} onCancel={handleCancel} cancellingId={cancellingId} />
                    ))
                  }
                  {reservations.filter(r => {
                    const d = new Date(r.classDate);
                    return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
                  }).length === 0 && (
                    <p className="text-center py-10 text-slate-400 text-sm">해당 월에 예약된 수업이 없습니다.</p>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="list"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {reservations.length > 0 ? (
                  reservations.map((res) => (
                    <ReservationCard key={res.id} res={res} onCancel={handleCancel} cancellingId={cancellingId} />
                  ))
                ) : (
                  <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                    <CalendarIcon size={48} className="mx-auto text-slate-300 mb-4" />
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">예약된 내역이 없습니다.</h2>
                    <p className="text-slate-500 text-sm mb-6">새로운 수업을 예약하고 일정을 관리해 보세요.</p>
                    <button onClick={() => navigate('/home')} className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:brightness-110 transition-all">
                      예약하러 가기
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* 예약 상세 정보 모달 */}
      <AnimatePresence>
        {selectedDayRes && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDayRes(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-black flex items-center gap-2">
                    <CalendarIcon size={20} className="text-primary" />
                    {selectedDayText} 예약 상세
                  </h2>
                  <button
                    onClick={() => setSelectedDayRes(null)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedDayRes.map((res) => (
                    <div key={res.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${res.status === 'CONFIRMED' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                              {res.status === 'CONFIRMED' ? '확정' : '대기'}
                            </span>
                            <span className="text-sm font-bold">{res.classTime || res.time}</span>
                          </div>
                          <h4 className="font-bold text-slate-800 dark:text-white">{res.className}</h4>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                            <MapPin size={10} /> {res.businessName}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            handleCancel(res);
                            setSelectedDayRes(null);
                          }}
                          disabled={cancellingId === res.id}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="예약 취소"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <button
                    onClick={() => setSelectedDayRes(null)}
                    className="w-full py-4 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-bold rounded-2xl hover:brightness-110 transition-all"
                  >
                    확인
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ReservationCard = ({ res, onCancel, cancellingId }: { res: any, onCancel: any, cancellingId: string | null }) => (
  <motion.div
    layout
    className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
  >
    <div className="flex gap-4 items-start md:items-center">
      <div className="bg-primary/10 text-primary w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0">
        <span className="text-[10px] font-bold">{res.classDate?.split('-')[1]}월</span>
        <span className="text-lg font-black leading-none">{res.classDate?.split('-')[2]}</span>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${res.status === 'CONFIRMED' ? 'bg-emerald-500' : res.status === 'PENDING' ? 'bg-amber-500' : 'bg-rose-500'}`}>
            {res.status === 'CONFIRMED' ? '예약 확정' : res.status === 'PENDING' ? '승인 대기' : '거절됨'}
          </span>
          <span className="text-sm font-bold text-slate-500">{res.time || res.classTime}</span>
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">{res.className || '수업'}</h3>
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-1"><MapPin size={12} /> {res.businessName || '예약 센터'}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {res.classDuration || 60}분</span>
        </div>
      </div>
    </div>
    
    <div className="flex justify-end">
      <button
        onClick={() => onCancel(res)}
        disabled={cancellingId === res.id}
        className="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
      >
        <Trash2 size={16} />
        {cancellingId === res.id ? '취소 중...' : '예약 취소'}
      </button>
    </div>
  </motion.div>
);

export default MyReservations;