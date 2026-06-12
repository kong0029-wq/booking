import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { signOut, deleteUser, GoogleAuthProvider, signInWithPopup, linkWithPopup } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs,
  query, where, onSnapshot, orderBy, limit, updateDoc, setDoc,
  serverTimestamp, increment, runTransaction
} from 'firebase/firestore';
// @ts-ignore
import { getHolidays } from 'korean-holidays';
import { createGoogleEvent, deleteGoogleEvent, formatDateTime } from '../utils/googleCalendar';
import { ClassCalendar } from '../components/ClassCalendar';

export type RecurringRule = {
  frequency: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  endType: 'infinite' | 'count' | 'until';
  endCount: number;
  endDate: string;
  weeklyDays: number[];
  infiniteDuration?: 'day' | 'week' | 'month' | 'year';
};

const BusinessDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [classListViewFormat, setClassListViewFormat] = useState<'calendar' | 'list'>('calendar');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'classes' | 'class-list' | 'members' | 'logs' | 'settings' | 'approvals'>('dashboard');
  const [stats, setStats] = useState({ todayClasses: 0, totalReservations: 0, totalClasses: 0, todayLogins: 0, pendingRequests: 0, totalApplicants: 0, totalMembers: 0 });
  const [pendingReservations, setPendingReservations] = useState<any[]>([]);
  const [membersList, setMembersList] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberModalTab, setMemberModalTab] = useState<'info' | 'reservations' | 'logs'>('info');
  const [memberLogs, setMemberLogs] = useState<any[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  // 수업 그룹화 (시리즈별 목록)
  const groupedClassesList = Array.from(classes.reduce((acc, curr) => {
    const key = curr.groupId || `legacy-${curr.className}`;
    if (!acc.has(key)) {
      acc.set(key, {
        groupId: curr.groupId || 'legacy',
        className: curr.className,
        startDate: curr.date,
        endDate: curr.date,
        times: new Set([curr.time]),
        duration: curr.duration,
        maxCapacity: curr.maxCapacity,
        totalInstances: 1,
        totalCapacity: curr.currentCapacity || 0,
        sampleDoc: curr, // 수정/삭제 시 참조용
        classIds: [curr.id]
      });
    } else {
      const existing = acc.get(key);
      if (curr.date < existing.startDate) existing.startDate = curr.date;
      if (curr.date > existing.endDate) existing.endDate = curr.date;
      existing.times.add(curr.time);
      existing.totalInstances += 1;
      existing.totalCapacity += (curr.currentCapacity || 0);
      existing.classIds.push(curr.id);
    }
    return acc;
  }, new Map()).values());

  // 수업 등록 폼
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultSchedule = { slots: [] as { time: string, duration: number }[] };
  const [newClass, setNewClass] = useState({
    className: '',
    startDate: todayStr,
    endDate: todayStr,
    selectedDates: [] as string[],
    duration: 60 as number,
    maxCapacity: 6,
    ticketPolicy: { period: 'month' as 'week' | 'month' | 'year', amount: 10 },
    selectedDays: [1, 2, 3, 4, 5] as number[],
    daySchedules: {
      0: { ...defaultSchedule }, 1: { ...defaultSchedule }, 2: { ...defaultSchedule },
      3: { ...defaultSchedule }, 4: { ...defaultSchedule }, 5: { ...defaultSchedule }, 6: { ...defaultSchedule }
    } as Record<number, { slots: { time: string, duration: number }[] }>,
    classPhotoURL: ''
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);

  // 주간 캘린더 상태
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // 일요일 시작
    return d;
  });

  const koreanHolidaysMap = useMemo(() => {
    const year = currentWeekStart.getFullYear();
    const prevHols = getHolidays(year - 1) || [];
    const currHols = getHolidays(year) || [];
    const nextHols = getHolidays(year + 1) || [];
    const all = [...prevHols, ...currHols, ...nextHols];
    
    const map = new Map<string, string>();
    all.forEach((h: any) => {
      const d = new Date(h.date);
      const kstFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric', month: '2-digit', day: '2-digit'
      });
      // en-CA format gives YYYY-MM-DD directly
      const formatted = kstFormatter.format(d);
      map.set(formatted, h.nameKo);
    });
    return map;
  }, [currentWeekStart]);
  
  const [draftEvent, setDraftEvent] = useState<{
    date: string;
    time: string;
    duration: number;
    totalSelectedDuration: number;
    className: string;
    maxCapacity: number;
    recurringRule?: RecurringRule;
    excludeHolidays?: boolean;
  } | null>(null);

  const [dragSelection, setDragSelection] = useState<{ date: string; startIdx: number; currentIdx: number } | null>(null);

  // List View & Batch Edit States
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [batchEditData, setBatchEditData] = useState<{
    className: string;
    duration: number;
    maxCapacity: number;
  }>({
    className: '',
    duration: 60,
    maxCapacity: 6
  });

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];



  const handleResetForm = () => {
    setEditingClassId(null);
    setNewClass({
      className: '',
      startDate: todayStr,
      endDate: todayStr,
      selectedDates: [],
      duration: 60 as number,
      maxCapacity: 6,
      ticketPolicy: userData?.ticketPolicy || { period: 'month' as 'week' | 'month' | 'year', amount: 10 },
      selectedDays: [1, 2, 3, 4, 5] as number[],
      daySchedules: {
        0: { ...defaultSchedule }, 1: { ...defaultSchedule }, 2: { ...defaultSchedule },
        3: { ...defaultSchedule }, 4: { ...defaultSchedule }, 5: { ...defaultSchedule }, 6: { ...defaultSchedule }
      },
      classPhotoURL: ''
    });
  };

  // 업체 설정 폼
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editGoogleCalendarId, setEditGoogleCalendarId] = useState('');
  const [businessLogoURL, setBusinessLogoURL] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let unsubClasses: (() => void) | undefined;
    let unsubUser: (() => void) | undefined;
    let unsubRes: (() => void) | undefined;

    const init = async (user: any) => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'BUSINESS') {
          alert('사업자 권한이 없습니다.');
          navigate('/home');
          return;
        }

        setLoading(false);

        // 1. 실시간 사용자 데이터 구독
        unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
          try {
            if (snap.exists()) {
              setUserData(snap.data());
              setEditBusinessName(snap.data().businessName || '');
              setEditPhoneNumber(snap.data().phoneNumber || '');
              setEditGoogleCalendarId(snap.data().googleCalendarId || '');
              setBusinessLogoURL(snap.data().businessLogoURL || '');
            }
          } catch (e) { console.error("User snap error:", e); }
        });

        // 2. 수업 목록 실시간 구독
        const qClasses = query(collection(db, 'classes'), where('businessId', '==', user.uid));
        unsubClasses = onSnapshot(qClasses, (snapshot) => {
          try {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => {
              const dateA = a.date || '';
              const dateB = b.date || '';
              if (dateA !== dateB) return dateB.localeCompare(dateA);
              return (a.time || '').localeCompare(b.time || '');
            });

            setClasses(list);
            const today = new Date().toLocaleDateString('sv-SE'); 
            const todayC = list.filter((c: any) => c.date === today).length;
            const totalR = list.reduce((a: number, c: any) => a + (c.currentCapacity || 0), 0);
            setStats(prev => ({ ...prev, todayClasses: todayC, totalReservations: totalR, totalClasses: list.length }));
          } catch (e) { console.error("Classes snap error:", e); }
        }, (error) => console.error("수업 목록 로딩 에러:", error));

        // 3. 예약 목록 실시간 구독
        const resQ = query(collection(db, 'reservations'), where('businessId', '==', user.uid));
        unsubRes = onSnapshot(resQ, (snapshot) => {
          try {
            const allRes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            allRes.sort((a: any, b: any) => {
              const dateA = a.createdAt?.toDate?.() || new Date(0);
              const dateB = b.createdAt?.toDate?.() || new Date(0);
              return dateB - dateA;
            });
            setAllReservations(allRes);
            
            const pending = allRes.filter((r: any) => r.status === 'PENDING');
            setPendingReservations(pending);
            
            const confirmed = allRes.filter((r: any) => r.status === 'CONFIRMED');
            const uniqueUids = Array.from(new Set(confirmed.map((r: any) => r.uid)));
            
            setStats(prev => ({ 
              ...prev, 
              pendingRequests: pending.length,
              totalApplicants: new Set(allRes.map((r: any) => r.uid)).size,
              totalReservations: confirmed.length,
              totalMembers: uniqueUids.length
            }));
            
            // 회원 목록 업데이트 호출
            triggerFetchMembers(uniqueUids, confirmed, user.uid);

            // 구글 캘린더 자동 동기화: 새 확정 예약 중 아직 사업자 캘린더에 등록 안 된 건 등록
            const gcalToken = sessionStorage.getItem('gcal_access_token');
            if (gcalToken) {
              const unsyncedRes = confirmed.filter((r: any) => !r.businessGoogleEventId && r.classDate && r.classTime);
              if (unsyncedRes.length > 0) {
                (async () => {
                  for (const res of unsyncedRes as any[]) {
                    try {
                      const eventId = await createGoogleEvent(gcalToken, {
                        title: `[예약] ${res.userName} - ${res.className}`,
                        startDateTime: formatDateTime(res.classDate, res.classTime),
                        endDateTime: formatDateTime(res.classDate, res.classEndTime || res.classTime),
                        description: `예약자: ${res.userName}\n수업: ${res.className}\n시간: ${res.classDuration || 60}분`
                      });
                      await updateDoc(doc(db, 'reservations', res.id), { businessGoogleEventId: eventId });
                    } catch (e: any) {
                      if (e.message === 'EXPIRED_TOKEN') {
                        console.warn('사업자 Google Calendar 토큰 만료');
                        break;
                      }
                    }
                  }
                })();
              }
            }
          } catch (e) { console.error("Res snap error:", e); }
        });

        // 4. 로그인 로그 (1회성)
        const logsQ = query(collection(db, 'loginLogs'), where('uid', '==', user.uid), limit(20));
        const logsSnap = await getDocs(logsQ);
        const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        logs.sort((a: any, b: any) => (b.loginAt?.toDate?.() || 0) - (a.loginAt?.toDate?.() || 0));
        setLoginLogs(logs);

      } catch (err) {
        console.error(err);
        navigate('/');
      }
    };

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/');
      } else {
        init(user);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubClasses?.();
      unsubUser?.();
      unsubRes?.();
    };
  }, [navigate]);

  const formatAverageLoginTime = (minutes: number | undefined) => {
    if (minutes === undefined || minutes === 0) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? '오후' : '오전';
    const h12 = h % 12 || 12;
    return `${ampm} ${h12}:${m.toString().padStart(2, '0')}`;
  };

  const triggerFetchMembers = async (uids: string[], confirmedRes: any[], businessId: string) => {
    try {
      const list = [];
      for (const uid of uids) {
        const lastRes = confirmedRes.find((r: any) => r.uid === uid);
        if (!lastRes) continue;
        try {
          const uDoc = await getDoc(doc(db, 'users', uid));
          const uData = uDoc.exists() ? uDoc.data() : null;
          list.push({
            ...lastRes,
            tickets: uData ? (uData.ticketsByBusiness?.[businessId] || 0) : 0,
            loginCount: uData?.loginCount || 0,
            avgLoginTimeMinutes: uData?.avgLoginTimeMinutes || 0
          });
        } catch { list.push({ ...lastRes, tickets: 0, loginCount: 0, avgLoginTimeMinutes: 0 }); }
      }
      setMembersList(list);
    } catch (e) { console.error("fetchMembers error:", e); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };


  const handleSaveDraftEvent = async () => {
    if (!draftEvent) return;
    if (!draftEvent.className.trim()) { alert('수업 이름을 입력해주세요.'); return; }

    setIsRegistering(true);
    try {
      const user = auth.currentUser;
      if (!user) return;


      if (editingClassId) {
        // [단일 수정]
        const [h, m] = draftEvent.time.split(':').map(Number);
        const endMin = h * 60 + m + draftEvent.duration;
        const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
        
        await updateDoc(doc(db, 'classes', editingClassId), {
          className: draftEvent.className,
          date: draftEvent.date,
          time: draftEvent.time,
          endTime,
          duration: draftEvent.duration,
          maxCapacity: draftEvent.maxCapacity,
        });
        alert('수업 정보가 수정되었습니다! ✨');
      } else {
        // [신규 등록 - 연속 분할 생성 및 반복 일정 지원]
        const countPerDay = Math.max(1, Math.floor(draftEvent.totalSelectedDuration / draftEvent.duration));
        const groupId = Date.now().toString();
        
        const promises = [];
        
        const rule = draftEvent.recurringRule;
        const [y, m, d] = draftEvent.date.split('-').map(Number);
        const baseDateObj = new Date(y, m - 1, d);
        const maxDateObj = new Date(baseDateObj);
        
        const infiniteDuration = rule?.infiniteDuration || 'year';
        if (infiniteDuration === 'year') maxDateObj.setFullYear(maxDateObj.getFullYear() + 1);
        else if (infiniteDuration === 'month') maxDateObj.setMonth(maxDateObj.getMonth() + 1);
        else if (infiniteDuration === 'week') maxDateObj.setDate(maxDateObj.getDate() + 7);
        else if (infiniteDuration === 'day') maxDateObj.setDate(maxDateObj.getDate() + 1);

        const targetDates: string[] = [];

        if (!rule || rule.frequency === 'none') {
          targetDates.push(draftEvent.date);
        } else {
          let currentEventDate = new Date(baseDateObj);
          let occurrencesCount = 0;
          let endConditionMet = false;

          while (!endConditionMet && currentEventDate <= maxDateObj) {
            // 주간 반복일 경우, 요일 필터링 적용
            if (rule.frequency !== 'weekly' || rule.weeklyDays.includes(currentEventDate.getDay())) {
              const cy = currentEventDate.getFullYear();
              const cm = String(currentEventDate.getMonth() + 1).padStart(2, '0');
              const cd = String(currentEventDate.getDate()).padStart(2, '0');
              const currentStr = `${cy}-${cm}-${cd}`;
              
              // until 조건 확인 (날짜 지정 종료)
              if (rule.endType === 'until' && rule.endDate && currentStr > rule.endDate) {
                endConditionMet = true;
                break;
              }

              let isHoliday = false;
              if (draftEvent.excludeHolidays !== false) {
                const holidaysForYear = getHolidays(cy) || [];
                isHoliday = holidaysForYear.some((h: any) => {
                  const hd = new Date(h.date);
                  const hcy = hd.getFullYear();
                  const hcm = String(hd.getMonth() + 1).padStart(2, '0');
                  const hcd = String(hd.getDate()).padStart(2, '0');
                  return `${hcy}-${hcm}-${hcd}` === currentStr;
                });
              }

              if (!isHoliday) {
                targetDates.push(currentStr);
                occurrencesCount++;

                // count 조건 확인
                if (rule.endType === 'count' && occurrencesCount >= rule.endCount) {
                  endConditionMet = true;
                  break;
                }
              }
            }

            // 다음 날짜 계산 (weekly일 경우는 매일 이동하면서 요일을 체크하는 방식이 편함)
            if (rule.frequency === 'daily' || rule.frequency === 'weekly') {
              currentEventDate.setDate(currentEventDate.getDate() + 1);
            } else if (rule.frequency === 'monthly') {
              const nextMonth = new Date(currentEventDate);
              nextMonth.setMonth(nextMonth.getMonth() + 1);
              // 말일 보정 (ex: 1/31 -> 2/28)
              if (nextMonth.getDate() !== currentEventDate.getDate() && currentEventDate.getDate() > 28) {
                nextMonth.setDate(0); 
              }
              currentEventDate = nextMonth;
            } else if (rule.frequency === 'yearly') {
              currentEventDate.setFullYear(currentEventDate.getFullYear() + 1);
            }
          }
        }

        // targetDates 배열을 기반으로 문서 생성
        for (const targetDateStr of targetDates) {
          for (let i = 0; i < countPerDay; i++) {
            const [startH, startM] = draftEvent.time.split(':').map(Number);
            const startMinTotal = startH * 60 + startM + (i * draftEvent.duration);
            const endMinTotal = startMinTotal + draftEvent.duration;

            const classTime = `${String(Math.floor(startMinTotal / 60)).padStart(2, '0')}:${String(startMinTotal % 60).padStart(2, '0')}`;
            const classEndTime = `${String(Math.floor(endMinTotal / 60)).padStart(2, '0')}:${String(endMinTotal % 60).padStart(2, '0')}`;

            const classData: any = {
              className: draftEvent.className,
              date: targetDateStr,
              time: classTime,
              endTime: classEndTime,
              duration: draftEvent.duration,
              maxCapacity: draftEvent.maxCapacity,
              businessId: user.uid,
              businessName: userData?.businessName || '내 업체',
              currentCapacity: 0,
              groupId,
              classPhotoURL: '',
              createdAt: serverTimestamp()
            };

            promises.push(addDoc(collection(db, 'classes'), classData));
          }
        }
        await Promise.all(promises);
        const totalCreated = promises.length;
        alert(totalCreated > 1 ? `총 ${totalCreated}개의 수업이 성공적으로 등록되었습니다! 🎉` : '수업이 성공적으로 등록되었습니다! 🎉');
      }

      setDraftEvent(null);
      setEditingClassId(null);
    } catch (err) {
      console.error(err);
      alert('저장 실패');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleApproveReservation = async (res: any) => {
    if (!window.confirm(`${res.userName}님의 수강 신청을 승인하시겠습니까?`)) return;
    
    try {
      const user = auth.currentUser;
      if (!user) return;

      await runTransaction(db, async (transaction) => {
        const resRef = doc(db, 'reservations', res.id);
        const userRef = doc(db, 'users', res.uid);
        
        // 1. 읽기 작업 (트랜잭션 내에서는 반드시 읽기가 먼저 와야 함)
        const resSnap = await transaction.get(resRef);
        if (!resSnap.exists()) throw new Error("신청 내역을 찾을 수 없습니다.");
        if (resSnap.data().status === 'CONFIRMED') throw new Error("이미 승인된 내역입니다.");

        // 2. 쓰기 작업
        // 상태 변경 (CONFIRMED)
        transaction.update(resRef, { 
          status: 'CONFIRMED',
          approvedAt: serverTimestamp()
        });

        // 수강권 지급 (사업자의 현재 정책 기준)
        const policy = userData?.ticketPolicy || { period: 'month', amount: 10 };
        
        // 점 표기법을 사용하여 특정 사업자의 티켓 수만 안전하게 증가
        transaction.set(userRef, { 
          ticketsByBusiness: {
            [user.uid]: increment(policy.amount)
          }
        }, { merge: true });
      });

      const policy = userData?.ticketPolicy || { period: 'month', amount: 10 };
      const periodLabel: any = { week: '주', month: '월', year: '년' };
      alert(`승인되었습니다! 🎉\n${res.userName}님께 ${periodLabel[policy.period]} ${policy.amount}회 수강권이 지급되었습니다.`);
    } catch (err: any) {
      console.error("Approval error:", err);
      const errorMsg = err.message || '승인 처리 중 오류가 발생했습니다.';
      alert(`${errorMsg} 다시 시도해주세요.`);
    }
  };

  const startEditing = (data: any, isSeries: boolean = false) => {
    if (isSeries) {
      setSelectedClassIds(data.classIds);
      setBatchEditData({
        className: data.className,
        duration: data.duration,
        maxCapacity: data.maxCapacity
      });
      setIsBatchEditModalOpen(true);
      return;
    }


    setEditingClassId(data.id);

    // 해당 클래스의 날짜가 포함된 주로 캘린더 뷰 이동
    const classDate = new Date(data.date + 'T00:00:00');
    const d = new Date(classDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // 해당 주의 일요일
    setCurrentWeekStart(d);

    setDraftEvent({
      date: data.date,
      time: data.time,
      duration: data.duration || 60,
      totalSelectedDuration: data.duration || 60,
      className: data.className,
      maxCapacity: data.maxCapacity
    });

    setActiveTab('classes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };




  const handleBatchEdit = async () => {
    if (selectedClassIds.length === 0) return;
    if (!batchEditData.className.trim()) { alert('수업 이름을 입력해주세요.'); return; }
    if (!window.confirm(`선택한 ${selectedClassIds.length}개의 수업을 일괄 수정하시겠습니까?`)) return;

    try {
      const promises = selectedClassIds.map(async (id) => {
        const classDoc = classes.find(c => c.id === id);
        if (!classDoc) return;
        
        const [h, m] = classDoc.time.split(':').map(Number);
        const endMin = h * 60 + m + batchEditData.duration;
        const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

        return updateDoc(doc(db, 'classes', id), {
          className: batchEditData.className,
          duration: batchEditData.duration,
          maxCapacity: batchEditData.maxCapacity,
          endTime
        });
      });
      await Promise.all(promises);
      alert('일괄 수정이 완료되었습니다.');
      setSelectedClassIds([]);
      setIsBatchEditModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('일괄 수정 중 오류가 발생했습니다.');
    }
  };

  const handleRejectReservation = async (res: any) => {
    if (!window.confirm(`${res.userName}님의 예약을 거절하시겠습니까?`)) return;
    
    try {
      await updateDoc(doc(db, 'reservations', res.id), { status: 'REJECTED' });
      
      // 사업자 구글 캘린더 이벤트 삭제
      const gcalToken = sessionStorage.getItem('gcal_access_token');
      if (gcalToken && res.businessGoogleEventId) {
        try { await deleteGoogleEvent(gcalToken, res.businessGoogleEventId); } catch (e) { console.warn(e); }
      }

      // [수정] 특정 수업 예약 건(classId 존재)일 때만 티켓 환불 처리
      if (res.classId) {
        const userRef = doc(db, 'users', res.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, { tickets: (userSnap.data().tickets || 0) + 1 });
        }
        alert('거절되었습니다. 이용권이 환불되었습니다.');
      } else {
        alert('거절 처리되었습니다.');
      }
    } catch (err) {
      console.error("거절 에러:", err);
      alert('거절 처리 실패');
    }
  };

  const handleAddTickets = async (uid: string, userName: string) => {
    const user = auth.currentUser;
    if (!user) return;
    const policy = userData?.ticketPolicy || { period: 'month', amount: 10 };
    const periodLabel = policy.period === 'week' ? '주' : policy.period === 'month' ? '월' : '년';
    if (!window.confirm(`${userName}님에게 ${periodLabel} ${policy.amount}회 수강권을 지급하시겠습니까?`)) return;
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { 
        ticketsByBusiness: {
          [user.uid]: increment(policy.amount)
        }
      }, { merge: true });
      alert(`${userName}님에게 ${periodLabel} ${policy.amount}회가 지급되었습니다.`);
      
      // UI 갱신: 현재 필터링된 예약 목록을 기준으로 멤버 정보 다시 로드
      const confirmed = allReservations.filter((r: any) => r.status === 'CONFIRMED');
      const uniqueUids = Array.from(new Set(confirmed.map((r: any) => r.uid)));
      triggerFetchMembers(uniqueUids, confirmed, user.uid);
    } catch (err) {
      console.error(err);
      alert('지급 실패');
    }
  };

  const handleDeleteClass = async (id: string) => {
    const user = auth.currentUser;
    if (!user) return;

    const classDoc = classes.find(c => c.id === id);
    if (!classDoc) return;

    if (classDoc.currentCapacity > 0) {
      if (!window.confirm('이미 예약자가 있는 수업입니다. 삭제 시 모든 예약이 자동 취소되고 이용권이 환불됩니다. 계속하시겠습니까?')) return;
    } else {
      if (!window.confirm('이 수업을 삭제하시겠습니까?')) return;
    }

    try {
      // 해당 수업의 예약들 처리
      const qRes = query(collection(db, 'reservations'), where('classId', '==', id), where('status', '==', 'CONFIRMED'));
      const snapRes = await getDocs(qRes);
      
      for (const resDoc of snapRes.docs) {
        const resData = resDoc.data();
        // 예약 취소 상태로 변경
        await updateDoc(resDoc.ref, { status: 'CANCELLED_BY_BUSINESS' });
        // 티켓 환불
        const requiredTickets = Math.ceil((resData.classDuration || classDoc.duration || 60) / 30);
        const userRef = doc(db, 'users', resData.uid);
        await updateDoc(userRef, { 
          [`ticketsByBusiness.${user.uid}`]: increment(requiredTickets) 
        });
      }

      await deleteDoc(doc(db, 'classes', id));

      const gcalToken = sessionStorage.getItem('gcal_access_token');
      if (gcalToken && classDoc.googleEventId) {
        try {
          await deleteGoogleEvent(gcalToken, classDoc.googleEventId);
        } catch (e) {
          console.warn('Failed to delete google event', e);
        }
      }
    } catch (err) {
      console.error(err);
      alert('삭제 처리 중 오류 발생');
    }
  };

  const handleDeleteSeries = async (groupId: string, className: string) => {
    const user = auth.currentUser;
    if (!user) return;

    if (!window.confirm(`"${className}" 연관된 모든 수업 일정을 삭제하시겠습니까?\n모든 예약이 자동 취소되고 이용권이 환불됩니다.`)) return;

    try {
      const q = query(
        collection(db, 'classes'),
        where('businessId', '==', user.uid),
        groupId !== 'legacy' 
          ? where('groupId', '==', groupId)
          : where('className', '==', className)
      );
      const snap = await getDocs(q);
      
      for (const d of snap.docs) {
        // 개별 수업의 예약들 처리
        const qRes = query(collection(db, 'reservations'), where('classId', '==', d.id), where('status', '==', 'CONFIRMED'));
        const snapRes = await getDocs(qRes);
        for (const resDoc of snapRes.docs) {
          const resData = resDoc.data();
          await updateDoc(resDoc.ref, { status: 'CANCELLED_BY_BUSINESS' });
          const requiredTickets = Math.ceil((resData.classDuration || d.data().duration || 60) / 30);
          const userRef = doc(db, 'users', resData.uid);
          await updateDoc(userRef, { 
            [`ticketsByBusiness.${user.uid}`]: increment(requiredTickets) 
          });
        }
        await deleteDoc(d.ref);
        const gcalToken = sessionStorage.getItem('gcal_access_token');
        if (gcalToken && d.data().googleEventId) {
          try {
            await deleteGoogleEvent(gcalToken, d.data().googleEventId);
          } catch (e) { console.warn(e); }
        }
      }
      
      alert(`총 ${snap.docs.length}개의 수업 일정이 삭제되었습니다.`);
      setEditingClassId(null);
      setNewClass({ ...newClass, className: '' });
    } catch (err) {
      console.error(err);
      alert('일괄 삭제 실패');
    }
  };

  const handleDeleteAllClasses = async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (classes.length === 0) {
      alert('초기화할 수업이 없습니다.');
      return;
    }

    const firstConfirm = window.confirm(`정말 모든 수업을 초기화(삭제)하시겠습니까?\n현재 등록된 총 ${classes.length}개의 수업이 모두 삭제되며, 이 작업은 되돌릴 수 없습니다.`);
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(`[최종 확인]\n다시 한 번 확인합니다. 진짜로 전체 수업을 삭제하시겠습니까?\n진행 중인 예약이 있다면 모두 취소 및 이용권 환불 처리됩니다.`);
    if (!secondConfirm) return;

    try {
      // 모든 수업 삭제 및 관련 예약 환불 처리
      for (const cls of classes) {
        // 예약들 환불 처리
        const qRes = query(collection(db, 'reservations'), where('classId', '==', cls.id), where('status', '==', 'CONFIRMED'));
        const snapRes = await getDocs(qRes);
        for (const resDoc of snapRes.docs) {
          const resData = resDoc.data();
          await updateDoc(resDoc.ref, { status: 'CANCELLED_BY_BUSINESS' });
          const requiredTickets = Math.ceil((resData.classDuration || cls.duration || 60) / 30);
          const userRef = doc(db, 'users', resData.uid);
          await updateDoc(userRef, { 
            [`ticketsByBusiness.${user.uid}`]: increment(requiredTickets) 
          });
        }
        // 수업 삭제
        await deleteDoc(doc(db, 'classes', cls.id));
        const gcalToken = sessionStorage.getItem('gcal_access_token');
        if (gcalToken && cls.googleEventId) {
          try {
            await deleteGoogleEvent(gcalToken, cls.googleEventId);
          } catch (e) { console.warn(e); }
        }
      }
      alert('모든 수업이 완전히 초기화되었습니다.');
    } catch (err) {
      console.error(err);
      alert('전체 수업 초기화 중 오류가 발생했습니다.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedClassIds.length === 0) {
      alert('삭제할 수업을 선택해주세요.');
      return;
    }

    if (!window.confirm(`선택한 ${selectedClassIds.length}개의 수업을 삭제하시겠습니까?\n예약자가 있는 경우 자동으로 취소 및 환불 처리됩니다.`)) return;

    setLoading(true);
    try {
      for (const id of selectedClassIds) {
        // 기존 handleDeleteClass 로직을 루프 돌며 수행 (트랜잭션으로 묶으면 더 좋지만 우선 단순 구현)
        const qRes = query(collection(db, 'reservations'), where('classId', '==', id), where('status', '==', 'CONFIRMED'));
        const snapRes = await getDocs(qRes);
        const user = auth.currentUser;
        
        for (const resDoc of snapRes.docs) {
          const resData = resDoc.data();
          await updateDoc(resDoc.ref, { status: 'CANCELLED_BY_BUSINESS' });
          if (user) {
            const requiredTickets = Math.ceil((resData.classDuration || 60) / 30);
            const userRef = doc(db, 'users', resData.uid);
            await updateDoc(userRef, { 
              [`ticketsByBusiness.${user.uid}`]: increment(requiredTickets) 
            });
          }
        }
        await deleteDoc(doc(db, 'classes', id));
        const classDoc = classes.find(c => c.id === id);
        const gcalToken = sessionStorage.getItem('gcal_access_token');
        if (gcalToken && classDoc?.googleEventId) {
          try {
            await deleteGoogleEvent(gcalToken, classDoc.googleEventId);
          } catch (e) { console.warn(e); }
        }
      }
      alert('선택한 수업들이 삭제되었습니다.');
      setSelectedClassIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
      alert('일부 수업 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('이미지 크기는 10MB 이하여야 합니다.');
      return;
    }

    setUploadingLogo(true);
    try {
      const fileRef = ref(storage, `business_logos/${auth.currentUser.uid}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setBusinessLogoURL(url);
    } catch (err) {
      console.error('Logo upload error:', err);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleGoogleCalendarLink = async () => {
    try {
      if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      
      // signInWithPopup 대신 기존 로그인된 계정에 구글 계정을 연결(link)합니다.
      const result = await linkWithPopup(auth.currentUser, provider).catch(async (err) => {
        // 이미 연동되어 있는 경우, 토큰만 갱신하기 위해 재인증 시도
        if (err.code === 'auth/credential-already-in-use') {
           throw new Error('선택하신 구글 계정은 이미 시스템에 가입된 계정이어서 연동할 수 없습니다. 가입되지 않은 다른 구글 계정을 선택해주세요.');
        } else if (err.code === 'auth/provider-already-linked') {
           // 이미 링크된 구글 계정이면 다시 로그인(signIn)해서 토큰만 가져옵니다.
           return await signInWithPopup(auth, provider);
        }
        throw err;
      });

      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (credential && credential.accessToken) {
        sessionStorage.setItem('gcal_access_token', credential.accessToken);
        setEditGoogleCalendarId(result.user.email || '');
        alert('구글 캘린더 연동이 완료되었습니다! (현재 세션 동안 유효)\n변경사항을 저장하려면 하단의 [업체 정보 저장]을 눌러주세요.');
      }
    } catch (err: any) {
      console.error('Google Calendar Link Error:', err);
      if (err.message && err.message.includes('가입된 계정')) {
        alert(err.message);
      } else {
        alert(`구글 캘린더 연동 중 오류가 발생했습니다.\n상세: ${err.code || err.message}`);
      }
    }
  };

  const handleGoogleCalendarUnlink = () => {
    if (confirm('구글 캘린더 연동을 취소하시겠습니까?')) {
      sessionStorage.removeItem('gcal_access_token');
      setEditGoogleCalendarId('');
      alert('연동이 취소되었습니다.\n변경사항을 완전히 적용하려면 하단의 [업체 정보 저장]을 눌러주세요.');
    }
  };

  const handleSaveBusinessInfo = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        businessName: editBusinessName,
        phoneNumber: editPhoneNumber,
        googleCalendarId: editGoogleCalendarId,
        businessLogoURL: businessLogoURL
      });
      alert('업체 정보가 저장되었습니다.');
    } catch { alert('저장 실패'); }
    finally { setIsSaving(false); }
  };

  // 사업자 회원 탈퇴 처리 (2번 확인 후 삭제)
  const handleDeleteAccount = async () => {
    // 1차 확인
    const firstConfirm = window.confirm(
      '⚠️ 정말로 탈퇴하시겠습니까?\n\n탈퇴 시 모든 업체 정보, 수업 일정, 회원 예약 내역이 삭제되며,\n이 작업은 되돌릴 수 없습니다.'
    );
    if (!firstConfirm) return;

    // 2차 확인
    const secondConfirm = window.confirm(
      '🚨 최종 확인\n\n정말 탈퇴하시겠습니까?\n등록된 모든 수업과 회원 데이터가 영구 삭제됩니다.\n이 작업은 즉시 실행되며 복구가 불가능합니다.'
    );
    if (!secondConfirm) return;

    const user = auth.currentUser;
    if (!user) return;

    setIsDeleting(true);
    try {
      // 1. 해당 사업자의 모든 수업 삭제
      const classQuery = query(collection(db, 'classes'), where('businessId', '==', user.uid));
      const classSnap = await getDocs(classQuery);
      const classDeletes = classSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(classDeletes);

      // 2. 해당 사업자 관련 예약 내역 삭제
      const resQuery = query(collection(db, 'reservations'), where('businessId', '==', user.uid));
      const resSnap = await getDocs(resQuery);
      const resDeletes = resSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(resDeletes);

      // 3. 해당 사용자의 로그인 기록 삭제
      const logQuery = query(collection(db, 'loginLogs'), where('uid', '==', user.uid));
      const logSnap = await getDocs(logQuery);
      const logDeletes = logSnap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(logDeletes);

      // 4. Firestore 사용자 문서 삭제
      await deleteDoc(doc(db, 'users', user.uid));

      // 5. Firebase Auth 계정 삭제
      await deleteUser(user);

      alert('탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
      navigate('/');
    } catch (err: any) {
      console.error('Account deletion error:', err);
      if (err.code === 'auth/requires-recent-login') {
        alert('보안을 위해 재로그인이 필요합니다.\n로그아웃 후 다시 로그인하여 탈퇴를 시도해주세요.');
        await signOut(auth);
        navigate('/login');
      } else {
        alert('탈퇴 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleShowMemberDetails = async (member: any) => {
    setIsLogModalOpen(true);
    setMemberModalTab('info');
    setMemberLogs([]); // 초기화
    
    try {
      // 최신 유저 정보 가져오기 (loginCount 등)
      const userDoc = await getDoc(doc(db, 'users', member.uid));
      if (userDoc.exists()) {
        setSelectedMember({ ...member, ...userDoc.data() });
      } else {
        setSelectedMember(member);
      }

      const q = query(
        collection(db, 'loginLogs'),
        where('uid', '==', member.uid),
        orderBy('loginAt', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMemberLogs(logs);
    } catch (err) {
      console.error('Error fetching member logs:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-light">
        <p className="text-primary font-bold animate-pulse">사업자 대시보드 로딩 중...</p>
      </div>
    );
  }

  const tabs = [
    { key: 'dashboard', label: '대시보드', icon: 'dashboard' },
    { key: 'class-list', label: '수업 목록', icon: 'format_list_bulleted' },
    { key: 'classes', label: '수업 일정 관리', icon: 'calendar_month' },
    { key: 'approvals', label: '승인요청', icon: 'how_to_reg' },
    { key: 'members', label: '회원 관리', icon: 'group' },
    { key: 'logs', label: '접속 이력', icon: 'history' },
    { key: 'settings', label: '업체 설정', icon: 'settings' },
  ] as const;

  return (
    <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">

      {/* 사이드바 (데스크톱) */}
      <aside className="hidden md:flex w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary rounded-lg p-2 text-white">
            <span className="material-symbols-outlined text-2xl">storefront</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight truncate">{userData?.businessName || '내 업체'}</h1>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Business</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors text-left ${
                activeTab === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.key === 'approvals' && stats.pendingRequests > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-bounce">
                  {stats.pendingRequests}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                {userData?.name?.[0] || 'B'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold truncate">{userData?.name || '사업자'}</span>
                <span className="text-xs text-slate-500 truncate">{userData?.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-primary transition-colors shrink-0">
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 메인 */}
      <main className="flex-1 md:ml-64 flex flex-col min-w-0 w-full">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-3 md:hidden">
             <div className="bg-primary rounded-lg p-1.5 text-white">
              <span className="material-symbols-outlined text-sm">storefront</span>
            </div>
            <h2 className="text-base font-bold truncate">{userData?.businessName || '내 업체'}</h2>
          </div>
          <h2 className="text-lg font-bold hidden md:block">사업자 대시보드</h2>
          <div className="flex items-center gap-3">
            {userData?.lastLoginAt?.toDate && (
              <span className="text-xs text-slate-400 hidden sm:inline-block">
                마지막 접속: {new Date(userData.lastLoginAt.toDate()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={handleLogout} className="md:hidden text-slate-400 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-xl">logout</span>
            </button>
          </div>
        </header>

        {/* 모바일 탭 네비게이션 */}
        <div className="md:hidden flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-16 z-10 custom-scrollbar scroll-smooth">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-600 dark:text-slate-400'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.key === 'approvals' && stats.pendingRequests > 0 && (
                <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {stats.pendingRequests}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-8 overflow-y-auto">

          {/* ===== 대시보드 탭 ===== */}
          {activeTab === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  { label: '오늘 수업', value: `${stats.todayClasses}개`, icon: 'event_available', color: 'blue' },
                  { label: '승인 대기', value: `${stats.pendingRequests}건`, icon: 'pending_actions', color: 'rose' },
                  { label: '전체 신청자', value: `${stats.totalApplicants}명`, icon: 'person_add', color: 'orange' },
                  { label: '전체 회원', value: `${stats.totalMembers}명`, icon: 'group', color: 'purple' },
                  { label: '오늘 접속', value: `${stats.todayLogins}회`, icon: 'login', color: 'teal' },
                ].map((card, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className={`p-2 bg-${card.color}-50 text-${card.color}-600 dark:bg-${card.color}-900/20 rounded-lg w-fit mb-3`}>
                      <span className="material-symbols-outlined">{card.icon}</span>
                    </div>
                    <h3 className="text-slate-500 text-xs font-medium">{card.label}</h3>
                    <p className="text-xl font-bold mt-1">{card.value}</p>
                  </div>
                ))}
              </div>

              {/* 최근 수업 미리보기 */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <h3 className="text-lg font-bold">최근 등록 수업</h3>
                  <button onClick={() => setActiveTab('classes')} className="text-primary text-sm font-bold hover:underline">전체보기 →</button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {classes.slice(0, 5).map(c => (
                    <div key={c.id} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined">event</span>
                        </div>
                        <div>
                          <p className="font-bold text-sm">{c.className || '수업'} <span className="font-normal text-slate-400">·</span> {c.date} {c.time}</p>
                          <p className="text-xs text-slate-500">{c.duration || 60}분 · 최대 {c.maxCapacity}명</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium">{c.currentCapacity}/{c.maxCapacity}명</span>
                    </div>
                  ))}
                  {classes.length === 0 && <p className="px-6 py-12 text-center text-slate-400">등록된 수업이 없습니다.</p>}
                </div>
              </div>
            </>
          )}

          {/* ===== 수업 목록 (시리즈별) 탭 ===== */}
          {activeTab === 'class-list' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="text-xl font-bold">등록 수업 마스터 목록</h3>
                  <p className="text-sm text-slate-500">생성된 전체 수업을 달력 또는 목록 형태로 확인합니다.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mr-2">
                    <button 
                      onClick={() => setClassListViewFormat('calendar')}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${classListViewFormat === 'calendar' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">calendar_month</span>달력 보기
                    </button>
                    <button 
                      onClick={() => setClassListViewFormat('list')}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${classListViewFormat === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>목록 보기
                    </button>
                  </div>
                  
                  <button 
                    onClick={handleDeleteAllClasses}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-500 rounded-xl font-bold text-sm hover:bg-rose-100 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    전체 초기화
                  </button>
                  <button 
                    onClick={() => {
                      handleResetForm();
                      setActiveTab('classes');
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    새 수업 등록하기
                  </button>
                </div>
              </div>

              {classListViewFormat === 'calendar' ? (
                <ClassCalendar classes={classes} />
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {groupedClassesList.map((group: any, idx: number) => (
                  <div key={idx} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-slate-100 dark:border-slate-800">
                        {group.sampleDoc?.classPhotoURL ? (
                          <img src={group.sampleDoc.classPhotoURL} alt={group.className} className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-3xl">exercise</span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{group.className}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-slate-400">calendar_today</span>
                            {group.startDate} ~ {group.endDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-slate-400">schedule</span>
                            {Array.from(group.times).sort().join(', ')} ({group.duration}분)
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-slate-400">groups</span>
                            정원 {group.maxCapacity}명
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
          <div className="text-center px-4 border-x border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">총 일정</p>
                        <p className="text-xl font-black text-primary">{group.totalInstances}<span className="text-xs font-medium text-slate-400 ml-0.5">회</span></p>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">누적 예약</p>
                        <p className="text-xl font-black text-slate-700 dark:text-slate-200">{group.totalCapacity}<span className="text-xs font-medium text-slate-400 ml-0.5">명</span></p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button 
                          onClick={() => startEditing(group, true)}
                          className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
                          title="전체 수정"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteSeries(group.groupId, group.className)}
                          className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          title="전체 삭제"
                        >
                          <span className="material-symbols-outlined text-xl">delete_sweep</span>
                        </button>
                        <button 
                          onClick={() => {
                            setActiveTab('classes');
                          }}
                          className="px-4 h-10 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-bold hover:brightness-110 transition-all flex items-center gap-2"
                        >
                          일정 보기
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {groupedClassesList.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 md:p-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">inventory_2</span>
                    <p className="text-slate-400 font-medium">등록된 수업이 없습니다.</p>
                    <button onClick={() => setActiveTab('classes')} className="mt-4 text-primary font-bold text-sm hover:underline underline-offset-4">첫 수업 등록하러 가기 →</button>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* ===== 수업 목록 뷰 (테이블 타입) ===== */}
          {activeTab === 'classes' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col h-[80vh] min-h-[600px] overflow-hidden relative">
              {/* Header */}
              <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                      const d = new Date();
                      d.setHours(0, 0, 0, 0);
                      d.setDate(d.getDate() - d.getDay());
                      setCurrentWeekStart(d);
                    }} 
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold hover:bg-slate-50 transition-colors text-slate-700 dark:text-slate-300"
                  >
                    오늘
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      const d = new Date(currentWeekStart);
                      d.setDate(d.getDate() - 7);
                      setCurrentWeekStart(d);
                    }} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-lg">chevron_left</span>
                    </button>
                    <button onClick={() => {
                      const d = new Date(currentWeekStart);
                      d.setDate(d.getDate() + 7);
                      setCurrentWeekStart(d);
                    }} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-lg">chevron_right</span>
                    </button>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 ml-2">
                    {currentWeekStart.getFullYear()}년 {currentWeekStart.getMonth() + 1}월
                  </h3>
                </div>
                {/* 모드 전환 토글 */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button 
                    onClick={() => { setIsSelectionMode(false); setSelectedClassIds([]); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${!isSelectionMode ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    수업 등록
                  </button>
                  <button 
                    onClick={() => { setIsSelectionMode(true); setDraftEvent(null); setEditingClassId(null); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${isSelectionMode ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    다중 선택
                  </button>
                </div>
              </div>

              {/* Grid Body */}
              <div 
                className="flex flex-1 overflow-auto relative"
                onMouseUp={() => {
                  if (dragSelection) {
                    const minIdx = Math.min(dragSelection.startIdx, dragSelection.currentIdx);
                    const maxIdx = Math.max(dragSelection.startIdx, dragSelection.currentIdx);
                    
                    const hour = Math.floor(minIdx / 2);
                    const min = (minIdx % 2) * 30;
                    const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                    
                    let totalDuration = (maxIdx - minIdx + 1) * 30;
                    if (minIdx === maxIdx) totalDuration = 60; // 클릭만 했을 경우 기본 1시간
                    
                    if (isSelectionMode) {
                      const targetClasses = classes.filter(c => {
                        if (c.date !== dragSelection.date) return false;
                        const [cH, cM] = c.time.split(':').map(Number);
                        const cStart = cH * 60 + cM;
                        const cEnd = cStart + (c.duration || 60);
                        const sStart = hour * 60 + min;
                        const sEnd = sStart + totalDuration;
                        return cStart < sEnd && cEnd > sStart;
                      });
                      
                      const targetIds = targetClasses.map(c => c.id);
                      if (targetIds.length > 0) {
                        setSelectedClassIds(prev => {
                          const newSet = new Set(prev);
                          let allSelected = targetIds.every(id => newSet.has(id));
                          if (allSelected) {
                            targetIds.forEach(id => newSet.delete(id));
                          } else {
                            targetIds.forEach(id => newSet.add(id));
                          }
                          return Array.from(newSet);
                        });
                      }
                      setDragSelection(null);
                      return;
                    }
                    
                    // 기본 진행 시간 단위 설정 (총 시간이 30분이면 30분, 그 외는 60분 등)
                    let baseDuration = 60;
                    if (totalDuration === 30) baseDuration = 30;
                    else if (totalDuration % 60 !== 0 && totalDuration < 60) baseDuration = 30;
                    
                    setDraftEvent({
                      date: dragSelection.date,
                      time,
                      duration: baseDuration,
                      totalSelectedDuration: totalDuration,
                      className: '',
                      maxCapacity: 6,
                      excludeHolidays: true,
                      recurringRule: {
                        frequency: 'none',
                        interval: 1,
                        endType: 'infinite',
                        endCount: 10,
                        endDate: dragSelection.date,
                        weeklyDays: [new Date(dragSelection.date).getDay()],
                        infiniteDuration: 'year'
                      }
                    });
                    setEditingClassId(null);
                    setDragSelection(null);
                  }
                }}
                onMouseLeave={() => setDragSelection(null)}
              >
                {/* Time Labels */}
                <div className="w-16 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky left-0 z-20">
                  <div className="h-16 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-30"></div>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="h-[60px] border-b border-slate-100 dark:border-slate-800 text-right pr-2 text-[10px] font-medium text-slate-400 relative">
                      <span className="absolute -top-2.5 right-2 bg-white dark:bg-slate-900 px-1">
                        {i === 0 ? '' : i < 12 ? `오전 ${i}시` : i === 12 ? '오후 12시' : `오후 ${i - 12}시`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Days */}
                <div className="flex flex-1 min-w-[700px]">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const date = new Date(currentWeekStart);
                    date.setDate(date.getDate() + dayIdx);
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    const isToday = dateStr === new Date().toLocaleDateString('sv-SE');
                    const dayClasses = classes.filter(c => c.date === dateStr);
                    
                    const holidayName = koreanHolidaysMap.get(dateStr);
                    const isHolidayOrSunday = dayIdx === 0 || !!holidayName;
                    const dayColor = isHolidayOrSunday ? 'text-rose-500' : dayIdx === 6 ? 'text-blue-500' : 'text-slate-500';
                    const numColor = isToday ? 'bg-primary text-white' : isHolidayOrSunday ? 'text-rose-500' : dayIdx === 6 ? 'text-blue-500' : 'text-slate-800 dark:text-slate-200';

                    return (
                      <div key={dateStr} className="flex-1 min-w-[100px] border-r border-slate-200 dark:border-slate-800 relative group">
                        {/* Day Header */}
                        <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center sticky top-0 bg-white dark:bg-slate-900 z-30">
                          <span className={`text-[11px] font-bold ${dayColor}`}>{dayLabels[dayIdx]}</span>
                          <span className={`text-xl font-black mt-0.5 w-8 h-8 flex items-center justify-center rounded-full ${numColor}`}>
                            {date.getDate()}
                          </span>
                          {holidayName && (
                            <span className="text-[9px] text-rose-500 font-bold bg-rose-50 dark:bg-rose-500/10 px-1 rounded-sm absolute bottom-0.5 truncate max-w-[90%]">{holidayName}</span>
                          )}
                        </div>

                        {/* Grid Lines & Click Handlers */}
                        <div className="relative h-[1440px]">
                          {Array.from({ length: 48 }).map((_, i) => (
                            <div 
                              key={i} 
                              onMouseDown={() => setDragSelection({ date: dateStr, startIdx: i, currentIdx: i })}
                              onMouseEnter={() => {
                                if (dragSelection && dragSelection.date === dateStr) {
                                  setDragSelection(prev => prev ? { ...prev, currentIdx: i } : null);
                                }
                              }}
                              className="h-[30px] border-b border-slate-100 dark:border-slate-800/50 hover:bg-primary/10 cursor-pointer transition-colors"
                            />
                          ))}

                          {/* Drag Selection Overlay */}
                          {dragSelection && dragSelection.date === dateStr && (
                            <div
                              className={`absolute left-1 right-1 rounded-md border-2 pointer-events-none z-20 ${isSelectionMode ? 'bg-blue-500/30 border-blue-500/80' : 'bg-rose-500/50 border-rose-500/80'}`}
                              style={{
                                top: `${Math.min(dragSelection.startIdx, dragSelection.currentIdx) * 30}px`,
                                height: `${(Math.abs(dragSelection.currentIdx - dragSelection.startIdx) + 1) * 30}px`
                              }}
                            />
                          )}

                          {/* Existing Classes */}
                          {dayClasses.map(c => {
                            const [h, m] = c.time.split(':').map(Number);
                            const top = h * 60 + m;
                            const height = c.duration || 60;
                            const isSelected = selectedClassIds.includes(c.id);
                            return (
                              <div
                                key={c.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isSelectionMode) {
                                    setSelectedClassIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                                    return;
                                  }
                                  setEditingClassId(c.id);
                                  setDraftEvent({
                                    date: c.date,
                                    time: c.time,
                                    duration: c.duration || 60,
                                    totalSelectedDuration: c.duration || 60,
                                    className: c.className,
                                    maxCapacity: c.maxCapacity
                                  });
                                }}
                                className={`absolute left-1 right-1 rounded-md text-white p-1.5 shadow-sm border overflow-hidden cursor-pointer hover:brightness-110 z-10 flex flex-col transition-all ${isSelected ? 'bg-primary ring-2 ring-blue-500 ring-offset-1 border-primary !z-20' : 'bg-primary/90 border-primary'}`}
                                style={{ top: `${top}px`, height: `${height}px` }}
                              >
                                {isSelected && (
                                  <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow-sm">
                                    <span className="material-symbols-outlined text-[10px] text-white font-bold">check</span>
                                  </div>
                                )}
                                <p className={`text-xs font-bold leading-tight line-clamp-2 ${isSelected ? 'pr-4' : ''}`}>{c.className}</p>
                                <p className="text-[9px] opacity-90 mt-0.5">{c.time} ({height}분)</p>
                                <p className="text-[9px] opacity-90">{c.currentCapacity}/{c.maxCapacity}명</p>
                              </div>
                            );
                          })}

                          {/* Draft Event (Creating / Editing) */}
                          {draftEvent && draftEvent.date === dateStr && (
                            <div
                              className="absolute left-1 right-1 rounded-md bg-rose-500/90 text-white p-1.5 shadow-lg border border-rose-600 overflow-visible z-40"
                              style={{
                                top: `${Number(draftEvent.time.split(':')[0]) * 60 + Number(draftEvent.time.split(':')[1])}px`,
                                height: `${draftEvent.totalSelectedDuration}px`
                              }}
                            >
                              <p className="text-xs font-bold truncate">{draftEvent.className || '(제목 없음)'}</p>
                              <p className="text-[9px] opacity-90 mt-0.5">{draftEvent.time} (총 {draftEvent.totalSelectedDuration}분)</p>
                              {!editingClassId && Math.floor(draftEvent.totalSelectedDuration / draftEvent.duration) > 1 && (
                                <p className="text-[9.5px] font-bold text-yellow-200 mt-0.5 leading-tight">
                                  {draftEvent.duration}분씩 {Math.floor(draftEvent.totalSelectedDuration / draftEvent.duration)}개 연속 생성
                                </p>
                              )}
                              
                              {/* Popover Form (Desktop: Side floating, Mobile: Center fixed) */}
                              <div className={`fixed inset-0 sm:absolute sm:inset-auto sm:-top-4 ${dayIdx >= 4 ? 'sm:right-full sm:mr-2' : 'sm:left-full sm:ml-2'} bg-black/40 sm:bg-transparent z-50 flex items-center justify-center p-4`}
                                   onClick={(e) => { e.stopPropagation(); setDraftEvent(null); setEditingClassId(null); }}>
                                <div className="w-full max-w-[320px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 text-slate-800 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-200"
                                     onClick={e => e.stopPropagation()}>
                                  
                                  <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-sm flex items-center gap-1.5">
                                      <span className="material-symbols-outlined text-rose-500">event_note</span>
                                      {editingClassId ? '수업 정보 수정' : '새 수업 추가'}
                                    </h4>
                                    <button type="button" onClick={() => { setDraftEvent(null); setEditingClassId(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                                      <span className="material-symbols-outlined">close</span>
                                    </button>
                                  </div>
                                  
                                  <div className="space-y-4">
                                    <input 
                                      type="text" 
                                      placeholder="수업 이름 추가" 
                                      className="w-full text-lg border-b-2 border-slate-200 dark:border-slate-700 bg-transparent focus:border-rose-500 outline-none pb-1 font-bold placeholder-slate-400 transition-colors"
                                      value={draftEvent.className}
                                      onChange={e => setDraftEvent({ ...draftEvent, className: e.target.value })}
                                      autoFocus
                                    />
                                    
                                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                      <span className="material-symbols-outlined text-slate-400">schedule</span>
                                      <div className="flex-1 flex items-center gap-2">
                                        <input 
                                          type="time" 
                                          value={draftEvent.time}
                                          onChange={e => setDraftEvent({ ...draftEvent, time: e.target.value })}
                                          className="bg-transparent font-medium focus:outline-none w-[70px] text-center"
                                        />
                                        <span className="text-slate-300">-</span>
                                        <select 
                                          value={draftEvent.duration}
                                          onChange={e => setDraftEvent({ ...draftEvent, duration: Number(e.target.value) })}
                                          className="bg-transparent font-medium focus:outline-none cursor-pointer flex-1"
                                        >
                                          <option value={30}>30분</option>
                                          <option value={60}>1시간</option>
                                          <option value={90}>1시간 30분</option>
                                          <option value={120}>2시간</option>
                                        </select>
                                      </div>
                                    </div>

                                    {!editingClassId && Math.floor(draftEvent.totalSelectedDuration / draftEvent.duration) > 1 && (
                                      <div className="text-[11px] text-primary bg-primary/10 px-3 py-2 rounded-xl flex items-center gap-1.5 font-bold animate-in fade-in zoom-in-95 duration-200">
                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                        선택한 {draftEvent.totalSelectedDuration}분 동안 {draftEvent.duration}분씩 총 {Math.floor(draftEvent.totalSelectedDuration / draftEvent.duration)}개의 연속 수업이 생성됩니다.
                                      </div>
                                    )}

                                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                      <span className="material-symbols-outlined text-slate-400">group</span>
                                      <span className="font-bold whitespace-nowrap text-xs">최대 정원</span>
                                      <div className="flex gap-1.5 flex-wrap justify-end flex-1">
                                        {[1, 2, 3, 4, 5, 6].map(n => (
                                          <button
                                            key={n}
                                            type="button"
                                            onClick={() => setDraftEvent({ ...draftEvent, maxCapacity: n })}
                                            className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${draftEvent.maxCapacity === n ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20' : 'bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600 text-slate-500 hover:border-rose-300 hover:text-rose-500'}`}
                                          >
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    
                                    {/* 연속 일정(반복) 옵션 (신규 생성 시에만 표시) */}
                                    {!editingClassId && draftEvent.recurringRule && (
                                      <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-3 mb-2">
                                          <span className="material-symbols-outlined text-slate-400">event_repeat</span>
                                          <span className="font-bold whitespace-nowrap text-xs">반복 설정</span>
                                          <div className="flex-1 text-right">
                                            <select 
                                              value={draftEvent.recurringRule.frequency}
                                              onChange={e => setDraftEvent({...draftEvent, recurringRule: { ...draftEvent.recurringRule!, frequency: e.target.value as any }})}
                                              className="bg-transparent font-medium text-xs focus:outline-none cursor-pointer text-slate-700 dark:text-slate-300 text-right w-full"
                                            >
                                              <option value="none">반복 안함</option>
                                              <option value="daily">매일</option>
                                              <option value="weekly">매주</option>
                                              <option value="monthly">매월</option>
                                              <option value="yearly">매년</option>
                                            </select>
                                          </div>
                                        </div>
                                        
                                        {draftEvent.recurringRule.frequency === 'weekly' && (
                                          <div className="flex justify-between mt-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                                            {['일', '월', '화', '수', '목', '금', '토'].map((label, idx) => {
                                              const currentDays = draftEvent.recurringRule!.weeklyDays;
                                              const isSelected = currentDays.includes(idx);
                                              return (
                                                <button
                                                  key={idx}
                                                  type="button"
                                                  onClick={() => {
                                                    let newDays = [...currentDays];
                                                    if (isSelected) {
                                                      if (newDays.length > 1) newDays = newDays.filter(d => d !== idx);
                                                    } else {
                                                      newDays.push(idx);
                                                      newDays.sort();
                                                    }
                                                    setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, weeklyDays: newDays } });
                                                  }}
                                                  className={`w-7 h-7 rounded-full text-[10px] font-bold transition-all ${
                                                    isSelected ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600 text-slate-400 hover:border-primary/50 hover:text-primary'
                                                  }`}
                                                >
                                                  {label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {draftEvent.recurringRule.frequency !== 'none' && (
                                          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                                            <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">상세 설정</p>
                                            
                                            <label className="flex items-center gap-2 cursor-pointer mb-3 p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                                              <input type="checkbox" checked={draftEvent.excludeHolidays !== false} onChange={e => setDraftEvent({ ...draftEvent, excludeHolidays: e.target.checked })} className="accent-rose-500 w-4 h-4 rounded" />
                                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">공휴일 제외 <span className="text-[10px] text-slate-400 font-normal">(법정 공휴일에는 수업 미생성)</span></span>
                                            </label>

                                            <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">종료 조건</p>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                              <input type="radio" name="endType" value="infinite" checked={draftEvent.recurringRule.endType === 'infinite'} onChange={() => setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, endType: 'infinite' } })} className="accent-primary" />
                                              <span className="text-xs font-medium">계속 반복 <span className="text-[10px] text-slate-400 font-normal">(자동 생성 기간)</span></span>
                                              {draftEvent.recurringRule.endType === 'infinite' && (
                                                <select 
                                                  value={draftEvent.recurringRule.infiniteDuration || 'year'} 
                                                  onChange={e => setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, infiniteDuration: e.target.value as any } })}
                                                  className="ml-auto px-2 py-1 text-xs border border-slate-200 rounded-md dark:bg-slate-700 dark:border-slate-600 text-right focus:outline-none focus:border-primary font-bold bg-transparent"
                                                >
                                                  <option value="year">최대 1년</option>
                                                  <option value="month">최대 1개월</option>
                                                  <option value="week">최대 1주일</option>
                                                  <option value="day">최대 1일</option>
                                                </select>
                                              )}
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                                              <input type="radio" name="endType" value="count" checked={draftEvent.recurringRule.endType === 'count'} onChange={() => setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, endType: 'count' } })} className="accent-primary" />
                                              <span className="text-xs font-medium">일정 반복 횟수</span>
                                              {draftEvent.recurringRule.endType === 'count' && (
                                                <input type="number" min={1} max={365} value={draftEvent.recurringRule.endCount} onChange={e => setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, endCount: Math.max(1, Number(e.target.value)) } })} className="w-16 ml-auto px-2 py-1 text-xs border border-slate-200 rounded-md dark:bg-slate-700 dark:border-slate-600 text-right focus:outline-none focus:border-primary font-bold" />
                                              )}
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                                              <input type="radio" name="endType" value="until" checked={draftEvent.recurringRule.endType === 'until'} onChange={() => setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, endType: 'until' } })} className="accent-primary" />
                                              <span className="text-xs font-medium">종료 날짜 지정</span>
                                              {draftEvent.recurringRule.endType === 'until' && (
                                                <input type="date" value={draftEvent.recurringRule.endDate} onChange={e => setDraftEvent({ ...draftEvent, recurringRule: { ...draftEvent.recurringRule!, endDate: e.target.value } })} className="ml-auto px-2 py-1 text-xs border border-slate-200 rounded-md dark:bg-slate-700 dark:border-slate-600 focus:outline-none focus:border-primary font-bold text-slate-600 dark:text-slate-300" />
                                              )}
                                            </label>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="mt-6 flex justify-end gap-2">
                                    {editingClassId && (
                                      <button 
                                        type="button" 
                                        onClick={() => {
                                          handleDeleteClass(editingClassId);
                                          setDraftEvent(null);
                                          setEditingClassId(null);
                                        }}
                                        className="px-4 py-2.5 rounded-xl text-rose-500 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 mr-auto transition-colors"
                                      >
                                        삭제
                                      </button>
                                    )}
                                    <button 
                                      type="button" 
                                      onClick={() => handleSaveDraftEvent()}
                                      className="flex-1 px-6 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold shadow-md shadow-rose-500/20 hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"
                                      disabled={isRegistering}
                                    >
                                      {isRegistering ? '저장 중...' : '저장'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Floating Action Bar */}
              {isSelectionMode && selectedClassIds.length > 0 && activeTab === 'classes' && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10 z-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm font-bold text-white">check</span>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">다중 선택 모드</p>
                      <p className="text-sm font-black"><span className="text-blue-400">{selectedClassIds.length}개</span>의 수업 선택됨</p>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-700 dark:bg-slate-300"></div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedClassIds([])}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-slate-300 dark:text-slate-600 hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors"
                    >
                      선택 취소
                    </button>
                    <button 
                      onClick={handleBulkDelete}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      일괄 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== 승인 요청 탭 ===== */}
          {activeTab === 'approvals' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold">수강 신청 승인 대기</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">신청자</th>
                      <th className="px-6 py-4">신청 수업</th>
                      <th className="px-6 py-4">신청 일시</th>
                      <th className="px-6 py-4 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {pendingReservations.map(res => (
                      <tr key={res.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">
                              {res.userName?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="font-bold">{res.userName}</p>
                              <p className="text-[10px] text-slate-400">{res.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-primary">{res.classDate} {res.classTime}</p>
                          <p className="text-xs text-slate-500">{res.className || '수업'}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {res.createdAt?.toDate?.() ? new Date(res.createdAt.toDate()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleApproveReservation(res)}
                              className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors"
                            >
                              승인
                            </button>
                            <button 
                              onClick={() => handleRejectReservation(res)}
                              className="px-3 py-1.5 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600 transition-colors"
                            >
                              거절
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pendingReservations.length === 0 && <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-400">대기 중인 승인 요청이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* ===== 회원 관리 탭 ===== */}
          {activeTab === 'members' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-bold">승인 완료 회원 목록</h3>
                <span className="text-xs text-slate-500">총 {membersList.length}명의 회원이 등록되어 있습니다.</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">회원 정보</th>
                      <th className="px-6 py-4">잔여 수강권</th>
                      <th className="px-6 py-4">접속 통계</th>
                      <th className="px-6 py-4">마지막 신청 수업</th>
                      <th className="px-6 py-4">상태</th>
                      <th className="px-6 py-4 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {membersList.map(member => (
                      <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td 
                          className="px-6 py-4 cursor-pointer group"
                          onClick={() => handleShowMemberDetails(member)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold group-hover:bg-primary group-hover:text-white transition-all">
                              {member.userName?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="font-bold group-hover:text-primary transition-colors">{member.userName}</p>
                              <p className="text-xs text-slate-400">{member.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-primary">{member.tickets || 0}회</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              누적 {member.loginCount || 0}회
                            </span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full inline-block w-fit">
                              평균 {formatAverageLoginTime(member.avgLoginTimeMinutes)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium">{member.classDate} {member.classTime}</p>
                          <p className="text-xs text-slate-500">{member.className || '수업'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider">Active</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleAddTickets(member.uid, member.userName)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-all"
                              title={`수강권 ${(userData?.ticketPolicy?.amount || 10)}회 지급`}
                            >
                              <span className="material-symbols-outlined text-sm">confirmation_number</span>
                              +{userData?.ticketPolicy?.amount || 10}회
                            </button>
                            <button 
                              onClick={() => handleShowMemberDetails(member)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-600 rounded-lg text-xs font-bold transition-all"
                            >
                              <span className="material-symbols-outlined text-sm">history</span>
                              이력 확인
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {membersList.length === 0 && <tr><td colSpan={4} className="px-6 py-20 text-center text-slate-400">등록된 회원이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* ===== 접속 이력 탭 ===== */}
          {activeTab === 'logs' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-teal-500">history</span>
                  접속 이력
                </h3>
                <span className="text-xs text-slate-400">총 로그인 횟수: <span className="font-bold text-slate-600">{userData?.loginCount || 0}회</span></span>
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
                          {log.loginAt?.toDate?.() ? new Date(log.loginAt.toDate()).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${log.loginMethod?.includes('google') ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {log.loginMethod?.includes('google') ? 'Google' : '이메일'}{log.loginMethod?.includes('signup') ? ' (가입)' : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{log.platform || '-'}</td>
                      </tr>
                    ))}
                    {loginLogs.length === 0 && <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400">접속 기록이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== 업체 설정 탭 ===== */}
          {activeTab === 'settings' && (
            <div className="max-w-xl">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">settings</span>
                  업체 정보 설정
                </h3>
                <div className="flex flex-col items-center gap-3 mb-8 px-4">
                  <div className="relative group w-full max-w-[320px]">
                    <div className="w-full aspect-video rounded-xl border-4 border-slate-50 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 overflow-hidden shadow-sm flex items-center justify-center">
                      {businessLogoURL ? (
                        <img src={businessLogoURL} alt="업체 로고" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <span className="material-symbols-outlined text-4xl text-slate-400">storefront</span>
                          <p className="text-xs text-slate-400 font-bold mt-1">업체 대표 사진</p>
                        </div>
                      )}
                    </div>
                    <label className="absolute -bottom-3 -right-3 w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:bg-emerald-600 transition-transform hover:scale-105 active:scale-95">
                      <span className="material-symbols-outlined text-base">{uploadingLogo ? 'hourglass_empty' : 'photo_camera'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    </label>
                  </div>
                  <div className="text-center mt-3">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">업체 로고 / 대표 사진</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">권장: 16:9 가로 비율, 10MB 이하</p>
                  </div>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1.5 px-1">업체명</label>
                    <input
                      type="text"
                      value={editBusinessName}
                      onChange={e => setEditBusinessName(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      placeholder="업체명을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1.5 px-1">연락처</label>
                    <input
                      type="text"
                      value={editPhoneNumber}
                      onChange={e => setEditPhoneNumber(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      placeholder="업체 연락처를 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1.5 px-1">구글 캘린더 연동</label>
                    <div className="flex items-center gap-3">
                      {editGoogleCalendarId ? (
                        <div className="flex-1 h-12 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center justify-between font-medium">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                            <span>{editGoogleCalendarId}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleGoogleCalendarLink}
                              className="text-xs font-bold bg-white text-emerald-700 px-3 py-1.5 rounded-lg shadow-sm border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            >
                              계정 변경
                            </button>
                            <button
                              type="button"
                              onClick={handleGoogleCalendarUnlink}
                              className="text-xs font-bold bg-white text-rose-500 px-3 py-1.5 rounded-lg shadow-sm border border-rose-200 hover:bg-rose-50 transition-colors"
                            >
                              연동 취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleGoogleCalendarLink}
                          className="w-full h-12 px-4 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-800 shadow-sm"
                        >
                          <span className="material-symbols-outlined">calendar_today</span>
                          구글 계정 연동하기
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 px-1">
                      * 캘린더 일정을 동기화하려면 구글 계정을 연동해 주세요.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1.5 px-1">대표자</label>
                    <input type="text" value={userData?.name || ''} disabled className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 font-medium text-slate-500 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1.5 px-1">이메일</label>
                    <input type="text" value={userData?.email || ''} disabled className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 font-medium text-slate-500 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1.5 px-1">최초 가입일</label>
                    <div className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 font-medium text-slate-400 flex items-center">
                      {userData?.createdAt?.toDate?.() ? new Date(userData.createdAt.toDate()).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                    </div>
                  </div>
                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={handleSaveBusinessInfo}
                      disabled={isSaving}
                      className="w-full h-14 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSaving ? '저장 중...' : '업체 정보 저장'}
                    </button>
                  </div>

                  {/* 회원 탈퇴 영역 */}
                  <div className="mt-10 pt-6 border-t border-dashed border-slate-200 dark:border-slate-800">
                    <div className="flex items-start gap-3 mb-4">
                      <span className="material-symbols-outlined text-rose-400 text-lg mt-0.5">warning</span>
                      <div>
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-400">회원 탈퇴</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">탈퇴 시 모든 업체 정보, 수업 일정, 회원 예약 내역이 영구 삭제됩니다.<br/>이 작업은 되돌릴 수 없습니다.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                      className="w-full h-12 bg-rose-50 dark:bg-rose-900/20 text-rose-500 font-bold rounded-xl border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {isDeleting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent animate-spin rounded-full"></div>
                          <span>탈퇴 처리 중...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-lg">person_remove</span>
                          회원 탈퇴
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 회원 상세/접속 이력 모달 */}
        {isLogModalOpen && selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              {/* 모달 헤더 */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary text-xl font-bold">
                    {selectedMember.userName?.[0] || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold">{selectedMember.userName} 회원 정보</h3>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-md">
                        총 {selectedMember.loginCount || 0}회 접속
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{selectedMember.userEmail}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsLogModalOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center text-slate-400"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* 모달 컨텐츠 */}
              <div className="p-6 space-y-6">
                {/* 탭 네비게이션 */}
                <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button 
                    onClick={() => setMemberModalTab('info')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${memberModalTab === 'info' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    상세 정보
                  </button>
                  <button 
                    onClick={() => setMemberModalTab('reservations')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${memberModalTab === 'reservations' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    수강 이력
                  </button>
                  <button 
                    onClick={() => setMemberModalTab('logs')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${memberModalTab === 'logs' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    접속 이력
                  </button>
                </div>

                {memberModalTab === 'info' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">연락처</p>
                    <p className="text-sm font-bold">{selectedMember.phoneNumber || '-'}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">이메일</p>
                    <p className="text-sm font-bold truncate">{selectedMember.userEmail}</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">최초 가입일</p>
                    <p className="text-sm font-bold">
                      {selectedMember.createdAt?.toDate?.() ? new Date(selectedMember.createdAt.toDate()).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                    </p>
                  </div>
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                    <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">잔여 수강권</p>
                    <p className="text-sm font-black text-primary">{(selectedMember.ticketsByBusiness?.[auth.currentUser?.uid || ''] || selectedMember.tickets || 0)}회</p>
                  </div>
                </div>
                )}

                {memberModalTab === 'reservations' && (
                <div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">최근 수강 이력</h4>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="px-5 py-3">신청 일시</th>
                          <th className="px-5 py-3">수업 일정</th>
                          <th className="px-5 py-3">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allReservations.filter(r => r.uid === selectedMember.uid).map((res) => (
                          <tr key={res.id} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-5 py-3 text-slate-500">
                              {res.createdAt?.toDate?.() ? new Date(res.createdAt.toDate()).toLocaleDateString('ko-KR') : '-'}
                            </td>
                            <td className="px-5 py-3">
                              <p className="font-bold text-slate-700 dark:text-slate-300">{res.className}</p>
                              <p className="text-[10px] text-slate-400">{res.classDate} {res.classTime}</p>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                res.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-600' :
                                res.status === 'PENDING' ? 'bg-amber-100 text-amber-600' :
                                'bg-rose-100 text-rose-600'
                              }`}>
                                {res.status === 'CONFIRMED' ? '승인완료' : res.status === 'PENDING' ? '대기중' : '취소/거절'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {allReservations.filter(r => r.uid === selectedMember.uid).length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-5 py-10 text-center text-slate-400">수강 이력이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                {memberModalTab === 'logs' && (
                <div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">최근 접속 이력</h4>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-500">
                        <tr>
                          <th className="px-5 py-3">접속 일시</th>
                          <th className="px-5 py-3">방법</th>
                          <th className="px-5 py-3">기기/플랫폼</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {memberLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-5 py-3 font-medium">
                              {log.loginAt?.toDate?.() ? new Date(log.loginAt.toDate()).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                log.loginMethod?.includes('google') ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                              }`}>
                                {log.loginMethod?.includes('google') ? 'GOOGLE' : 'EMAIL'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-400 text-xs truncate max-w-[150px]">
                              {log.platform || 'Unknown'}
                            </td>
                          </tr>
                        ))}
                        {memberLogs.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-5 py-10 text-center text-slate-400">접속 기록이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={() => setIsLogModalOpen(false)}
                    className="px-6 py-2.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-bold rounded-xl hover:brightness-110 transition-all"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 일괄 수정 모달 */}
        {isBatchEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsBatchEditModalOpen(false)}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">일괄 수정 ({selectedClassIds.length}개)</h3>
                <button onClick={() => setIsBatchEditModalOpen(false)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">수업 이름</label>
                  <input type="text" value={batchEditData.className} onChange={e => setBatchEditData({...batchEditData, className: e.target.value})} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-primary font-bold" placeholder="변경할 수업 이름" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">수업 시간 (길이)</label>
                  <select value={batchEditData.duration} onChange={e => setBatchEditData({...batchEditData, duration: Number(e.target.value)})} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:border-primary font-bold">
                    <option value={30}>30분</option>
                    <option value={60}>1시간</option>
                    <option value={90}>1시간 30분</option>
                    <option value={120}>2시간</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">최대 정원</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <button key={n} type="button" onClick={() => setBatchEditData({...batchEditData, maxCapacity: n})} className={`w-8 h-8 rounded-lg text-sm font-black transition-all ${batchEditData.maxCapacity === n ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:text-primary'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setIsBatchEditModalOpen(false)} className="flex-1 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:brightness-95 transition-all">취소</button>
                <button onClick={handleBatchEdit} className="flex-1 p-3 rounded-xl bg-primary text-white font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all">수정 완료</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BusinessDashboard;
