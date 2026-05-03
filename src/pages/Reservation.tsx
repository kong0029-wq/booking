import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  runTransaction,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { getHolidayName } from '../utils/holidays';

const Reservation = () => {
  const navigate = useNavigate();
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const businessId = searchParams.get('businessId');
  
  const [selectedDate, setSelectedDate] = useState(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()));
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [isMembershipConfirmed, setIsMembershipConfirmed] = useState<boolean | null>(null);
  const [businessData, setBusinessData] = useState<any>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [allClassNames, setAllClassNames] = useState<string>('');
  const [viewMonth, setViewMonth] = useState(new Date());

  const [monthClasses, setMonthClasses] = useState<any[]>([]); // 한 달치 수업 데이터

  // 1. 현재 달력 데이터 생성 (동적 생성)
  const { calendarDays, currentMonthText } = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= lastDate; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const holidayName = getHolidayName(dateStr);
      const isSunday = new Date(year, month, i).getDay() === 0;
      const isToday = dateStr === today;
      
      // 해당 날짜에 수업이 있는지 확인
      const hasClasses = monthClasses.some(c => c.date === dateStr);
      
      days.push({ day: i, date: dateStr, holidayName, isSunday, isToday, hasClasses });
    }
    return {
      calendarDays: days,
      currentMonthText: `${year}.${month + 1}`
    };
  }, [viewMonth, monthClasses]);

  const handlePrevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  const handleGoToday = () => setViewMonth(new Date());

  // 2. 데이터 로드 및 실시간 구독
  useEffect(() => {
    let unsubUser: (() => void) | undefined;
    let unsubClasses: (() => void) | undefined;
    let unsubMonthClasses: (() => void) | undefined;
    let unsubBiz: (() => void) | undefined;
    let unsubMember: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // [사용자 정보]
        unsubUser = onSnapshot(doc(db, 'users', user.uid), (s) => {
          if (s.exists()) setUserData(s.data());
        });

        if (businessId) {
          // [업체 정보 실시간 구독]
          unsubBiz = onSnapshot(doc(db, 'users', businessId), (s) => {
            if (s.exists()) setBusinessData(s.data());
          });

          // [멤버십 승인 여부 실시간 구독]
          const qMembership = query(
            collection(db, 'reservations'),
            where('userEmail', '==', user.email),
            where('businessId', '==', businessId),
            where('className', '==', '센터 멤버십 신청'),
            where('status', '==', 'CONFIRMED')
          );
          unsubMember = onSnapshot(qMembership, (snap) => {
            setIsMembershipConfirmed(!snap.empty);
          });
          
          // [업체 수업 명칭]
          const qAll = query(collection(db, 'classes'), where('businessId', '==', businessId));
          onSnapshot(qAll, (snap) => {
            const names = Array.from(new Set(snap.docs.map(d => d.data().className))).filter(Boolean);
            setAllClassNames(names.join(', '));
          });

          // [한 달치 수업 데이터 실시간 구독 - 달력 표시용]
          const firstDate = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-01`;
          const lastDate = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-31`;
          const qMonth = query(
            collection(db, 'classes'), 
            where('businessId', '==', businessId),
            where('date', '>=', firstDate),
            where('date', '<=', lastDate)
          );
          unsubMonthClasses = onSnapshot(qMonth, (snap) => {
            setMonthClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          });
        }
      } else {
        navigate('/');
      }
    });

    // [선택된 날짜의 수업 실시간 구독]
    let q;
    if (businessId) {
      q = query(collection(db, 'classes'), where('date', '==', selectedDate), where('businessId', '==', businessId));
    } else {
      q = query(collection(db, 'classes'), where('date', '==', selectedDate));
    }

    unsubClasses = onSnapshot(q, (snapshot) => {
      const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      classList.sort((a: any, b: any) => a.time.localeCompare(b.time));
      setClasses(classList);

      const targetClassId = searchParams.get('classId');
      if (targetClassId) {
        const target = classList.find(c => c.id === targetClassId);
        if (target) setSelectedClass(target);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubUser?.();
      unsubClasses?.();
      unsubMonthClasses?.();
      unsubBiz?.();
      unsubMember?.();
    };
  }, [selectedDate, businessId, navigate, searchParams, viewMonth]);

  // 오전/오후 수업 분류 로직
  const morningClasses = classes.filter(c => parseInt(c.time.split(':')[0]) < 12);
  const afternoonClasses = classes.filter(c => parseInt(c.time.split(':')[0]) >= 12);

  // 예약 확정 처리 (Transaction)
  const handleBooking = async () => {
    if (!selectedClass) return;
    const user = auth.currentUser;
    if (!user) { alert('로그인이 필요합니다.'); navigate('/'); return; }

    const currentTickets = userData?.ticketsByBusiness?.[businessId || ''] || 0;
    if (!userData || currentTickets <= 0) {
      alert('보유하신 수강권이 없습니다. 센터에 문의하거나 수강권을 충전해 주세요! 😊');
      return;
    }

    if (!isMembershipConfirmed) {
      alert('사업자의 수강 승인이 완료된 후 수업 예약이 가능합니다. 잠시만 기다려주세요! 🔒');
      return;
    }

    setBookingLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', user.uid);
        const classRef = doc(db, 'classes', selectedClass.id);

        const userSnap = await transaction.get(userRef);
        const classSnap = await transaction.get(classRef);

        if (!userSnap.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
        
        if (!classSnap.exists()) throw new Error("수업 정보를 찾을 수 없습니다.");
        
        const tickets = userSnap.data()?.ticketsByBusiness?.[businessId || ''] || 0;
        const currentCap = classSnap.data()?.currentCapacity || 0;
        const maxCap = classSnap.data()?.maxCapacity || 6;

        if (tickets <= 0) throw new Error("남은 수강권이 없습니다.");
        if (currentCap >= maxCap) throw new Error("이미 정원이 초과된 수업입니다.");

        // 해당 센터의 티켓 차감
        transaction.update(userRef, { 
          [`ticketsByBusiness.${businessId}`]: increment(-1) 
        });

        // 수업 인원수 증가
        transaction.update(classRef, {
          currentCapacity: increment(1)
        });

        // 예약 데이터 생성
        const resRef = doc(collection(db, 'reservations'));
        transaction.set(resRef, {
          uid: user.uid,
          userName: userData.name || '회원',
          userEmail: user.email,
          classId: selectedClass.id,
          className: selectedClass.className || '수업',
          businessId: selectedClass.businessId,
          businessName: selectedClass.businessName || '',
          classDate: selectedClass.date,
          classTime: selectedClass.time,
          classEndTime: selectedClass.endTime || '',
          classDuration: selectedClass.duration || 60,
          status: 'CONFIRMED',
          createdAt: serverTimestamp()
        });
      });

      // 메일 발송 요청 추가 (Trigger Email 익스텐션 연동)
      try {
        await addDoc(collection(db, 'mail'), {
          to: user.email,
          message: {
            subject: `[예약 확정] ${selectedClass.className} 수업 예약이 완료되었습니다.`,
            html: `
              <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 24px; overflow: hidden; color: #333;">
                <div style="background-color: #00c896; padding: 40px 20px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">예약 확정 알림 🎉</h1>
                  <p style="color: rgba(255,255,255,0.9); margin-top: 8px; font-size: 14px;">기다리시던 수업 예약이 완료되었습니다!</p>
                </div>
                <div style="padding: 30px; background-color: white;">
                  <p style="font-size: 16px; margin-bottom: 24px;">안녕하세요, <strong>${userData?.name || '회원'}님</strong>!<br/>신청하신 수업의 상세 일정을 안내해 드립니다.</p>
                  
                  <div style="background-color: #f8f9fa; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #edf2f7;">
                    <p style="margin: 0 0 12px 0; display: flex; align-items: center;">
                      <span style="color: #718096; width: 70px; display: inline-block; font-size: 13px;">수업명</span>
                      <strong style="color: #2d3748; font-size: 15px;">${selectedClass.className}</strong>
                    </p>
                    <p style="margin: 0 0 12px 0; display: flex; align-items: center;">
                      <span style="color: #718096; width: 70px; display: inline-block; font-size: 13px;">일시</span>
                      <strong style="color: #2d3748; font-size: 15px;">${selectedClass.date} / ${selectedClass.time} ~ ${selectedClass.endTime}</strong>
                    </p>
                    <p style="margin: 0; display: flex; align-items: center;">
                      <span style="color: #718096; width: 70px; display: inline-block; font-size: 13px;">장소</span>
                      <strong style="color: #2d3748; font-size: 15px;">${selectedClass.businessName}</strong>
                    </p>
                  </div>
                  
                  <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">
                    수업 시간에 맞춰 늦지 않게 도착해 주시기 바랍니다.<br/>
                    변경 사항이나 취소 문의는 센터로 직접 연락 부탁드립니다.
                  </p>
                  
                  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f0f0f0; text-align: center;">
                    <p style="color: #a0aec0; font-size: 12px; margin: 0;">본 메일은 발신 전용입니다.</p>
                  </div>
                </div>
              </div>
            `
          }
        });

        // 2. 사업자에게 알림 메일 발송
        if (businessData?.email) {
          await addDoc(collection(db, 'mail'), {
            to: businessData.email,
            message: {
              subject: `[신규 예약 알림] ${userData?.name || '회원'}님이 ${selectedClass.className} 수업을 예약했습니다.`,
              html: `
                <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 24px; overflow: hidden; color: #333;">
                  <div style="background-color: #4a5568; padding: 40px 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">새로운 예약 발생 📥</h1>
                    <p style="color: rgba(255,255,255,0.9); margin-top: 8px; font-size: 14px;">방금 새로운 수강 신청이 완료되었습니다.</p>
                  </div>
                  <div style="padding: 30px; background-color: white;">
                    <p style="font-size: 16px; margin-bottom: 24px;"><strong>${businessData.businessName || '사업자'}님</strong>, 새로운 예약 정보를 확인해 주세요.</p>
                    
                    <div style="background-color: #f8f9fa; padding: 24px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #edf2f7;">
                      <p style="margin: 0 0 12px 0;">
                        <span style="color: #718096; width: 80px; display: inline-block; font-size: 13px;">예약자명</span>
                        <strong style="color: #2d3748; font-size: 15px;">${userData?.name || '회원'} (${userData?.phoneNumber || '연락처 미등록'})</strong>
                      </p>
                      <p style="margin: 0 0 12px 0;">
                        <span style="color: #718096; width: 80px; display: inline-block; font-size: 13px;">수업명</span>
                        <strong style="color: #2d3748; font-size: 15px;">${selectedClass.className}</strong>
                      </p>
                      <p style="margin: 0;">
                        <span style="color: #718096; width: 80px; display: inline-block; font-size: 13px;">예약 시간</span>
                        <strong style="color: #2d3748; font-size: 15px;">${selectedClass.date} / ${selectedClass.time} ~ ${selectedClass.endTime}</strong>
                      </p>
                    </div>
                    
                    <p style="font-size: 14px; color: #4a5568; line-height: 1.6;">
                      현재 수업의 예약 현황은 <strong>사업자 대시보드</strong>에서 실시간으로 확인하실 수 있습니다.
                    </p>
                    
                    <div style="margin-top: 40px; text-align: center;">
                      <a href="${window.location.origin}/business-dashboard" style="display: inline-block; padding: 14px 30px; background-color: #4a5568; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 14px;">대시보드 바로가기</a>
                    </div>
                  </div>
                </div>
              `
            }
          });
        }
      } catch (e) {
        console.error("Mail queue error:", e);
        // 메일 발송 실패가 예약 실패로 이어지지는 않도록 처리
      }

      setSuccess(true);
      setTimeout(() => navigate('/my-reservations'), 2000);
    } catch (err: any) {
      console.error("Booking error:", err);
      alert(err.message || "예약 중 오류가 발생했습니다. 다시 시도해주세요.");
      setBookingLoading(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="text-primary size-8 flex items-center justify-center cursor-pointer" onClick={() => navigate('/home')}>
              <span className="material-symbols-outlined text-3xl">calendar_month</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {businessData?.businessName ? `${businessData.businessName} 예약` : '전체 수업 예약'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {businessData?.businessName 
                  ? `${businessData.businessName}의 ${allClassNames ? `[${allClassNames}] ` : ''}수업을 예약해보세요` 
                  : '원하시는 날짜와 시간을 선택해 주세요'}
              </p>
              <div className="mt-2 px-3 py-1 bg-primary/10 rounded-full inline-block">
                <p className="text-xs font-bold text-primary">
                  잔여 수강권: {userData?.ticketsByBusiness?.[businessId || ''] || 0}회 
                  <span className="ml-1 opacity-80">
                    {(() => {
                      const policy = businessData?.ticketPolicy;
                      const policyMap: any = { week: '주', month: '월', year: '년' };
                      if (policy) {
                        return `(매${policyMap[policy.period] || '월'} ${policy.amount}회 정책)`;
                      }
                      return "(설정된 수강권 정책에 따라 표시됩니다)";
                    })()}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <span className="hover:text-primary cursor-pointer" onClick={() => navigate('/home')}>홈</span>
              <span className="hover:text-primary cursor-pointer" onClick={() => navigate('/my-reservations')}>내 예약</span>
            </nav>
            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden border-2 border-white dark:border-slate-800 shadow-sm">
              <img className="w-full h-full object-cover" src={userData?.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png"} alt="Profile" />
            </div>
          </div>
        </header>

        {/* Content (Conditional) */}
        {!isMembershipConfirmed && isMembershipConfirmed !== null ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4 block">lock</span>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">승인 대기 중</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto px-6">
              사업자의 수강 승인이 완료된 회원만 수업 목록을 확인할 수 있습니다. 승인이 완료될 때까지 잠시만 기다려주세요! 😊
            </p>
            <button 
              onClick={() => navigate('/home')}
              className="mt-6 px-8 py-2 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
            >
              홈으로 이동
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Calendar Section */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 h-fit">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">{currentMonthText}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleGoToday} className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white rounded">오늘</button>
                  <div className="flex gap-1">
                    <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded-full"><span className="material-symbols-outlined text-sm">chevron_left</span></button>
                    <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded-full"><span className="material-symbols-outlined text-sm">chevron_right</span></button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-2">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                  <div key={d} className="text-center text-xs font-bold text-slate-400 py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((item, idx) => (
                  <button
                    key={idx}
                    disabled={!item}
                    onClick={() => item && setSelectedDate(item.date)}
                    className={`h-12 w-full flex flex-col items-center justify-center text-sm rounded-lg transition-all relative border
                      ${!item ? 'text-transparent border-transparent' : 'hover:bg-slate-50'}
                      ${item?.isToday ? 'border-primary/40 bg-primary/5' : 'border-transparent'}
                      ${item?.date === selectedDate ? 'bg-primary border-primary shadow-lg shadow-primary/20' : ''}
                    `}
                  >
                    <span className={`
                      ${item?.date === selectedDate ? 'text-white' : (item?.isToday ? 'text-primary' : (item?.holidayName || item?.isSunday ? 'text-rose-500' : 'text-slate-700'))}
                      ${item?.hasClasses ? 'font-black' : 'font-medium'}
                    `}>
                      {item?.day}
                    </span>
                    
                    {/* 예약 가능 표시 (Dot) */}
                    {item?.hasClasses && (
                      <div className={`absolute bottom-1.5 w-1 h-1 rounded-full ${item?.date === selectedDate ? 'bg-white/80' : 'bg-primary animate-pulse'}`} />
                    )}

                    {item?.holidayName && (
                      <span className={`text-[8px] mt-0.5 truncate w-full text-center px-1 ${item?.date === selectedDate ? 'text-white/90' : 'text-rose-500'}`}>
                        {item.holidayName}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Slots Section */}
            <div className="lg:col-span-7">
              {/* Morning */}
              <div className="mb-8">
                <h3 className="text-base font-bold mb-4 flex items-center gap-2">오전</h3>
                <div className="flex flex-wrap gap-3">
                  {morningClasses.length > 0 ? morningClasses.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClass(c)}
                      className={`px-5 py-2.5 rounded-lg text-sm font-medium border ${selectedClass?.id === c.id ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200'}`}
                    >
                      {c.time}
                    </button>
                  )) : <p className="text-slate-400 text-sm italic">수업이 없습니다.</p>}
                </div>
              </div>

              {/* Afternoon */}
              <div className="mb-10">
                <h3 className="text-base font-bold mb-4 flex items-center gap-2">오후</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {afternoonClasses.length > 0 ? afternoonClasses.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClass(c)}
                      className={`px-5 py-2.5 rounded-lg text-sm font-medium border ${selectedClass?.id === c.id ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200'}`}
                    >
                      {c.time}
                    </button>
                  )) : <p className="text-slate-400 text-sm italic col-span-full">수업이 없습니다.</p>}
                </div>
              </div>

              {/* Confirm Button */}
              <div className="flex flex-col gap-4">
                {selectedClass && (
                  <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-primary/10">
                      {selectedClass.classPhotoURL || businessData?.businessPhotoURL ? (
                        <img src={selectedClass.classPhotoURL || businessData.businessPhotoURL} alt="Class" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10">
                          <span className="material-symbols-outlined text-primary/30">exercise</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">선택된 수업 일정</p>
                      <span className="font-bold text-primary">{selectedClass.date} {selectedClass.time}</span>
                      <p className="text-slate-500 text-xs mt-0.5">{selectedClass.className}</p>
                    </div>
                  </div>
                )}
                <button
                  disabled={!selectedClass || bookingLoading}
                  onClick={handleBooking}
                  className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg disabled:opacity-50"
                >
                  {bookingLoading ? '처리 중...' : '수강 신청하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Success Animation */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-white/95 z-[100] flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-white text-5xl">check_circle</span>
              </div>
              <h2 className="text-3xl font-black mb-2">예약 완료!</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reservation;