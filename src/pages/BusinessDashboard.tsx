import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs,
  query, where, onSnapshot, orderBy, limit, updateDoc, setDoc,
  serverTimestamp, increment, runTransaction
} from 'firebase/firestore';

const BusinessDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'classes' | 'approval' | 'members' | 'logs' | 'settings' | 'class-list'>('dashboard');
  const [stats, setStats] = useState({ todayClasses: 0, totalReservations: 0, totalClasses: 0, todayLogins: 0, pendingRequests: 0, totalApplicants: 0, totalMembers: 0 });
  const [pendingReservations, setPendingReservations] = useState<any[]>([]);
  const [membersList, setMembersList] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberLogs, setMemberLogs] = useState<any[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const [activeActionMenu, setActiveActionMenu] = useState<{ id: string, type: 'edit' | 'delete' } | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classStatusFilter, setClassStatusFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

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
        sampleDoc: curr // 수정/삭제 시 참조용
      });
    } else {
      const existing = acc.get(key);
      if (curr.date < existing.startDate) existing.startDate = curr.date;
      if (curr.date > existing.endDate) existing.endDate = curr.date;
      existing.times.add(curr.time);
      existing.totalInstances += 1;
      existing.totalCapacity += (curr.currentCapacity || 0);
    }
    return acc;
  }, new Map()).values());

  // 수업 등록 폼
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultSchedule = { startTime: '10:00', endTime: '18:00', disabledSlots: [] as string[] };
  const periodLabels: Record<string, string> = { week: '주', month: '월', year: '년' };
  const [newClass, setNewClass] = useState({
    className: '',
    startDate: todayStr,
    endDate: todayStr,
    duration: 60 as 30 | 60,
    maxCapacity: 6,
    ticketPolicy: { period: 'month' as 'week' | 'month' | 'year', amount: 10 },
    selectedDays: [1, 2, 3, 4, 5] as number[],
    daySchedules: {
      0: { ...defaultSchedule }, 1: { ...defaultSchedule }, 2: { ...defaultSchedule },
      3: { ...defaultSchedule }, 4: { ...defaultSchedule }, 5: { ...defaultSchedule }, 6: { ...defaultSchedule }
    } as Record<number, { startTime: string, endTime: string, disabledSlots: string[] }>
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  const generateSlots = (start: string, end: string, duration: number) => {
    const slots: string[] = [];
    if (!start || !end) return slots;
    
    let [h, m] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const endMinutes = endH * 60 + endM;

    while (h * 60 + m + duration <= endMinutes) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += duration;
      if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
      }
    }
    return slots;
  };

  const handleResetForm = () => {
    setEditingClassId(null);
    setEditingGroupId(null);
    setNewClass({
      className: '',
      startDate: todayStr,
      endDate: todayStr,
      duration: 60 as 30 | 60,
      maxCapacity: 6,
      ticketPolicy: userData?.ticketPolicy || { period: 'month' as 'week' | 'month' | 'year', amount: 10 },
      selectedDays: [1, 2, 3, 4, 5] as number[],
      daySchedules: {
        0: { ...defaultSchedule }, 1: { ...defaultSchedule }, 2: { ...defaultSchedule },
        3: { ...defaultSchedule }, 4: { ...defaultSchedule }, 5: { ...defaultSchedule }, 6: { ...defaultSchedule }
      }
    });
  };

  // 업체 설정 폼
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  const triggerFetchMembers = async (uids: string[], confirmedRes: any[], businessId: string) => {
    try {
      const list = [];
      for (const uid of uids) {
        const lastRes = confirmedRes.find((r: any) => r.uid === uid);
        if (!lastRes) continue;
        try {
          const uDoc = await getDoc(doc(db, 'users', uid));
          list.push({
            ...lastRes,
            tickets: uDoc.exists() ? (uDoc.data().ticketsByBusiness?.[businessId] || 0) : 0
          });
        } catch { list.push({ ...lastRes, tickets: 0 }); }
      }
      setMembersList(list);
    } catch (e) { console.error("fetchMembers error:", e); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  // 기간 내 선택된 요일의 날짜 목록 생성 (타임존 이슈 해결)
  const getDatesInRange = (start: string, end: string, days: number[]): string[] => {
    const dates: string[] = [];
    const startD = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    
    let current = new Date(startD);
    while (current <= endD) {
      if (days.includes(current.getDay())) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const handleAddClass = async (e: FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    if (!newClass.className.trim()) { alert('수업 이름을 입력해주세요.'); return; }

    if (editingClassId || editingGroupId) {
      // 수업 수정 로직
      const confirmMsg = editingGroupId ? '연관된 모든 수업 일정을 한 번에 수정하시겠습니까?' : '이 수업 일정을 수정하시겠습니까?';
      if (!window.confirm(confirmMsg)) return;
      setIsRegistering(true);
      try {
        const dayOfWeek = new Date(newClass.startDate + 'T00:00:00').getDay();
        const schedule = newClass.daySchedules[dayOfWeek];
        const [h, m] = schedule.startTime.split(':').map(Number);
        const endMin = h * 60 + m + newClass.duration;
        const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

        if (editingGroupId) {
          // [전체 수정] groupId가 같은 모든 수업 업데이트
          // groupId가 없는 구버전 데이터는 className으로 매칭
          const q = query(
            collection(db, 'classes'),
            where('businessId', '==', user.uid),
            editingGroupId !== 'legacy' 
              ? where('groupId', '==', editingGroupId)
              : where('className', '==', newClass.className)
          );
          const snap = await getDocs(q);
          const batchPromises = snap.docs.map(d => updateDoc(d.ref, {
            className: newClass.className,
            maxCapacity: newClass.maxCapacity,
            // 전체 수정 시에는 시간/날짜는 각자 다를 수 있으므로 이름과 정원만 우선 업데이트
          }));
          await Promise.all(batchPromises);
          alert(`총 ${snap.docs.length}개의 수업 정보가 일괄 수정되었습니다! ✨`);
        } else if (editingClassId) {
          // [단일 수정]
          await updateDoc(doc(db, 'classes', editingClassId), {
            className: newClass.className,
            date: newClass.startDate,
            time: schedule.startTime,
            endTime,
            duration: newClass.duration,
            maxCapacity: newClass.maxCapacity,
          });
          alert('수업 정보가 수정되었습니다! ✨');
        }

        setEditingClassId(null);
        setEditingGroupId(null);
        setNewClass({ ...newClass, className: '' });
      } catch (err) {
        console.error(err);
        alert('수업 수정 실패');
      } finally {
        setIsRegistering(false);
      }
      return;
    }

    // 새 수업 등록 로직 (기존 유지)
    if (newClass.selectedDays.length === 0) { alert('수업 요일을 선택해주세요.'); return; }
    if (newClass.startDate > newClass.endDate) { alert('종료일은 시작일 이후여야 합니다.'); return; }

    const dates = getDatesInRange(newClass.startDate, newClass.endDate, newClass.selectedDays);
    if (dates.length === 0) { alert('선택한 기간과 요일에 해당하는 날짜가 없습니다.'); return; }
    
    const totalClassesToCreate = dates.reduce((acc, date) => {
      const dayOfWeek = new Date(date + 'T00:00:00').getDay();
      const schedule = newClass.daySchedules[dayOfWeek] || defaultSchedule;
      if (!schedule) return acc;
      const availableSlots = generateSlots(schedule.startTime, schedule.endTime, newClass.duration);
      const activeSlots = availableSlots.filter(s => !schedule.disabledSlots.includes(s));
      return acc + activeSlots.length;
    }, 0);

    if (totalClassesToCreate === 0) {
      alert('설정된 시간 범위 내에 생성할 수 있는 수업 슬롯이 없습니다. 시작/종료 시간을 다시 확인해주세요.');
      return;
    }

    if (!window.confirm(`"${newClass.className}" 수업을 총 ${totalClassesToCreate}개 일정으로 등록하시겠습니까?\n(${newClass.startDate} ~ ${newClass.endDate})`)) return;

    setIsRegistering(true);
    const groupId = Date.now().toString(); // 그룹 식별자 생성
    try {
      // 사업자 프로필에 티켓 정책 저장 (추후 회원 승인 시 사용)
      await updateDoc(doc(db, 'users', user.uid), {
        ticketPolicy: newClass.ticketPolicy
      });

      const promises: Promise<any>[] = [];
      dates.forEach(date => {
        const dayOfWeek = new Date(date + 'T00:00:00').getDay();
        const schedule = newClass.daySchedules[dayOfWeek] || defaultSchedule;
        if (!schedule) return;
        
        const availableSlots = generateSlots(schedule.startTime, schedule.endTime, newClass.duration);
        const times = availableSlots.filter(s => !schedule.disabledSlots.includes(s));
        
        times.forEach(time => {
          // 종료 시간 계산
          const [h, m] = time.split(':').map(Number);
          const endMin = h * 60 + m + newClass.duration;
          const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
          
          promises.push(addDoc(collection(db, 'classes'), {
            className: newClass.className,
            date,
            time,
            endTime,
            duration: newClass.duration,
            maxCapacity: newClass.maxCapacity,
            businessId: user.uid,
            businessName: userData?.businessName || '내 업체',
            currentCapacity: 0,
            groupId, // 동일 배치 수업 그룹화
            createdAt: serverTimestamp()
          }));
        });
      });
      await Promise.all(promises);
      alert(`${totalClassesToCreate}개 수업이 성공적으로 등록되었습니다! 🎉`);
      setNewClass({ ...newClass, className: '' });
    } catch { alert('수업 등록 실패'); }
    finally { setIsRegistering(false); }
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

  const startEditing = (cls: any, isSeries: boolean = false) => {
    const classDate = new Date(cls.date + 'T00:00:00');
    const dayIdx = classDate.getDay();
    
    if (isSeries) {
      setEditingGroupId(cls.groupId || 'legacy');
      setEditingClassId(null);
    } else {
      setEditingClassId(cls.id);
      setEditingGroupId(null);
    }

    setNewClass({
      className: cls.className,
      startDate: cls.date,
      endDate: cls.date,
      duration: cls.duration || 60,
      maxCapacity: cls.maxCapacity,
      selectedDays: [dayIdx],
      daySchedules: {
        ...newClass.daySchedules,
        [dayIdx]: {
          startTime: cls.time,
          endTime: cls.endTime || '18:00',
          disabledSlots: []
        }
      },
      ticketPolicy: cls.ticketPolicy || userData?.ticketPolicy || { period: 'month', amount: 10 }
    });
    setActiveTab('classes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };



  const handleRejectReservation = async (res: any) => {
    if (!window.confirm(`${res.userName}님의 예약을 거절하시겠습니까?`)) return;
    
    try {
      await updateDoc(doc(db, 'reservations', res.id), { status: 'REJECTED' });
      
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
        const userRef = doc(db, 'users', resData.uid);
        await updateDoc(userRef, { 
          [`ticketsByBusiness.${user.uid}`]: increment(1) 
        });
      }

      await deleteDoc(doc(db, 'classes', id));
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
          const userRef = doc(db, 'users', resData.uid);
          await updateDoc(userRef, { 
            [`ticketsByBusiness.${user.uid}`]: increment(1) 
          });
        }
        await deleteDoc(d.ref);
      }
      
      alert(`총 ${snap.docs.length}개의 수업 일정이 삭제되었습니다.`);
      setEditingGroupId(null);
      setEditingClassId(null);
      setNewClass({ ...newClass, className: '' });
    } catch (err) {
      console.error(err);
      alert('일괄 삭제 실패');
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
            const userRef = doc(db, 'users', resData.uid);
            await updateDoc(userRef, { 
              [`ticketsByBusiness.${user.uid}`]: increment(1) 
            });
          }
        }
        await deleteDoc(doc(db, 'classes', id));
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

  const handleSaveBusinessInfo = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        businessName: editBusinessName,
        phoneNumber: editPhoneNumber 
      });
      alert('업체 정보가 저장되었습니다.');
    } catch { alert('저장 실패'); }
    finally { setIsSaving(false); }
  };

  const handleShowMemberDetails = async (member: any) => {
    setIsLogModalOpen(true);
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
    { key: 'approval', label: '승인요청', icon: 'how_to_reg' },
    { key: 'members', label: '회원 관리', icon: 'group' },
    { key: 'logs', label: '접속 이력', icon: 'history' },
    { key: 'settings', label: '업체 설정', icon: 'settings' },
  ] as const;

  return (
    <div className="flex min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">

      {/* 사이드바 */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col fixed h-full">
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
              {tab.key === 'approval' && stats.pendingRequests > 0 && (
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
      <main className="flex-1 ml-64 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-lg font-bold">사업자 대시보드</h2>
          {userData?.lastLoginAt?.toDate && (
            <span className="text-xs text-slate-400">
              마지막 접속: {new Date(userData.lastLoginAt.toDate()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </header>

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
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">등록 수업 마스터 목록</h3>
                  <p className="text-sm text-slate-500">등록된 수업 종류별(시리즈별) 요약 목록입니다.</p>
                </div>
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

              <div className="grid grid-cols-1 gap-4">
                {groupedClassesList.map((group: any, idx: number) => (
                  <div key={idx} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-3xl">exercise</span>
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
                          onClick={() => startEditing(group.sampleDoc, true)}
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
                            setSelectedDate(group.startDate);
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
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">inventory_2</span>
                    <p className="text-slate-400 font-medium">등록된 수업이 없습니다.</p>
                    <button onClick={() => setActiveTab('classes')} className="mt-4 text-primary font-bold text-sm hover:underline underline-offset-4">첫 수업 등록하러 가기 →</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== 수업 일정 관리 탭 ===== */}
          {activeTab === 'classes' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">{editingClassId || editingGroupId ? 'edit_calendar' : 'add_circle'}</span>
                    {editingGroupId ? '전체 수업 수정' : editingClassId ? '단일 수업 수정' : '새 수업 등록'}
                  </h3>
                  {(editingClassId || editingGroupId) && (
                    <button 
                      type="button" 
                      onClick={handleResetForm}
                      className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      수정 취소
                    </button>
                  )}
                </div>
                <form onSubmit={handleAddClass} className="space-y-4">
                  {/* 수업 이름 */}
                  <div>
                    <label className="text-xs text-slate-500 font-bold block mb-1.5">수업 이름</label>
                    <input 
                      type="text" 
                      placeholder="예: 요가 기초반, 필라테스 A반" 
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-900" 
                      value={newClass.className} 
                      onChange={e => setNewClass({ ...newClass, className: e.target.value })} 
                      required 
                    />
                  </div>

                  {/* 수업 기간 - 수정 시에는 시작일만 노출 (전체 수정 시에는 기간 안내) */}
                  <div>
                    <label className="text-xs text-slate-500 font-bold block mb-1.5">{editingGroupId ? '수업 정보' : editingClassId ? '수업 날짜' : '수업 기간'}</label>
                    {editingGroupId ? (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500">
                        <p className="flex items-center gap-1 font-bold text-primary mb-1">
                          <span className="material-symbols-outlined text-xs">info</span>
                          전체 수정 모드 안내
                        </p>
                        <p>선택하신 수업과 같은 그룹으로 등록된 모든 일정의 <strong>이름</strong>과 <strong>최대 정원</strong>이 일괄 변경됩니다.</p>
                        <p className="mt-1 text-[10px] text-slate-400">※ 개별적인 시간 및 날짜 변경은 '단일 수업 수정'을 이용해주세요.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div className={editingClassId ? 'col-span-2' : ''}>
                          <span className="text-[10px] text-slate-400 block mb-0.5">{editingClassId ? '날짜 선택' : '시작일'}</span>
                          <input 
                            type="date" 
                            className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                            value={newClass.startDate} 
                            onChange={e => setNewClass({ ...newClass, startDate: e.target.value })} 
                            required 
                          />
                        </div>
                        {!editingClassId && (
                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">종료일</span>
                            <input 
                              type="date" 
                              className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                              value={newClass.endDate} 
                              onChange={e => setNewClass({ ...newClass, endDate: e.target.value })} 
                              required 
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 요일 선택 - 수정 시에는 숨김 */}
                  {!editingClassId && !editingGroupId && (
                    <div>
                      <label className="text-xs text-slate-500 font-bold block mb-1.5">수업 요일</label>
                      <div className="flex gap-1">
                        {dayLabels.map((label, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const days = newClass.selectedDays.includes(idx)
                                ? newClass.selectedDays.filter(d => d !== idx)
                                : [...newClass.selectedDays, idx];
                              setNewClass({ ...newClass, selectedDays: days });
                            }}
                            className={`flex-1 h-9 rounded-lg text-xs font-bold transition-all ${
                              newClass.selectedDays.includes(idx)
                                ? idx === 0 ? 'bg-rose-500 text-white' : idx === 6 ? 'bg-blue-500 text-white' : 'bg-primary text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 요일별 시간 설정 - 수정 시에는 숨김(단일 수정만 표시) */}
                  {newClass.selectedDays.length > 0 && !editingGroupId && (
                    <div>
                      <label className="text-xs text-slate-500 font-bold block mb-1.5 flex items-center justify-between">
                        <span>{editingClassId ? '수업 시간 확인' : '요일별 수업 시간'}</span>
                        {!editingClassId && <span className="font-normal text-slate-400">원하지 않는 시간은 클릭하여 OFF할 수 있습니다.</span>}
                      </label>
                      <div className="space-y-4">
                        {newClass.selectedDays.sort((a, b) => a - b).map((dayIdx, index) => {
                          const schedule = newClass.daySchedules[dayIdx] || defaultSchedule;
                          const availableSlots = generateSlots(schedule.startTime, schedule.endTime, newClass.duration);
                          
                          return (
                            <div key={dayIdx} className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                                  dayIdx === 0 ? 'bg-rose-500' : dayIdx === 6 ? 'bg-blue-500' : 'bg-primary'
                                }`}>
                                  {dayLabels[dayIdx]}
                                </span>
                                
                                <input 
                                  type="time" 
                                  className="h-9 px-2 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                  value={schedule.startTime}
                                  onChange={e => {
                                    setNewClass({
                                      ...newClass,
                                      daySchedules: { ...newClass.daySchedules, [dayIdx]: { ...schedule, startTime: e.target.value, disabledSlots: [] } }
                                    });
                                  }}
                                />
                                <span className="text-slate-400 font-bold">~</span>
                                <input 
                                  type="time" 
                                  className="h-9 px-2 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                  value={schedule.endTime}
                                  onChange={e => {
                                    setNewClass({
                                      ...newClass,
                                      daySchedules: { ...newClass.daySchedules, [dayIdx]: { ...schedule, endTime: e.target.value, disabledSlots: [] } }
                                    });
                                  }}
                                />
                                
                                {index === 0 && newClass.selectedDays.length > 1 && !editingClassId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newSchedules = { ...newClass.daySchedules };
                                      newClass.selectedDays.forEach(d => {
                                        newSchedules[d] = { ...schedule, disabledSlots: [...schedule.disabledSlots] };
                                      });
                                      setNewClass({ ...newClass, daySchedules: newSchedules });
                                      alert('다른 선택된 요일에도 동일한 설정이 적용되었습니다.');
                                    }}
                                    className="ml-auto text-xs bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all flex items-center gap-1 font-medium"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                    다른 요일에 동일 적용
                                  </button>
                                )}
                              </div>
                              
                              <div className="flex flex-wrap gap-2 pl-10">
                                {editingClassId || editingGroupId ? (
                                  <p className="text-xs text-slate-500 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 font-bold">
                                    {schedule.startTime} 수업 수정 중
                                  </p>
                                ) : availableSlots.length > 0 ? availableSlots.map(slot => {
                                  const isDisabled = schedule.disabledSlots.includes(slot);
                                  return (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => {
                                        const newDisabled = isDisabled 
                                          ? schedule.disabledSlots.filter(s => s !== slot)
                                          : [...schedule.disabledSlots, slot];
                                        setNewClass({
                                          ...newClass,
                                          daySchedules: { ...newClass.daySchedules, [dayIdx]: { ...schedule, disabledSlots: newDisabled } }
                                        });
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                        isDisabled
                                          ? 'bg-slate-200 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 line-through opacity-60'
                                          : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white shadow-sm'
                                      }`}
                                    >
                                      {slot}
                                    </button>
                                  );
                                }) : (
                                  <p className="text-xs text-slate-400 py-1 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">info</span>
                                    설정된 시간 내에 생성 가능한 수업이 없습니다.
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 수업 시간 (길이) - 전체 수정 시 숨김 */}
                  {!editingGroupId && (
                    <div>
                      <label className="text-xs text-slate-500 font-bold block mb-1.5">수업 시간</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newSchedules = { ...newClass.daySchedules };
                            Object.keys(newSchedules).forEach(k => { newSchedules[Number(k)].disabledSlots = []; });
                            setNewClass({ ...newClass, duration: 60, daySchedules: newSchedules });
                          }}
                          className={`h-11 rounded-xl text-sm font-bold transition-all border ${
                            newClass.duration === 60
                              ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
                          1시간
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newSchedules = { ...newClass.daySchedules };
                            Object.keys(newSchedules).forEach(k => { newSchedules[Number(k)].disabledSlots = []; });
                            setNewClass({ ...newClass, duration: 30, daySchedules: newSchedules });
                          }}
                          className={`h-11 rounded-xl text-sm font-bold transition-all border ${
                            newClass.duration === 30
                              ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm align-middle mr-1">schedule</span>
                          30분
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 회원 인원 */}
                  <div>
                    <label className="text-xs text-slate-500 font-bold block mb-1.5">회원 인원 <span className="text-primary">({newClass.maxCapacity}명)</span></label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5, 6].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNewClass({ ...newClass, maxCapacity: n })}
                          className={`flex-1 h-10 rounded-lg text-sm font-bold transition-all ${
                            newClass.maxCapacity === n
                              ? 'bg-primary text-white shadow-md shadow-primary/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 신규 회원 수강권 정책 설정 */}
                  {!editingClassId && !editingGroupId && (
                    <div className="space-y-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl">
                      <label className="text-xs text-amber-700 dark:text-amber-400 font-bold block flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">confirmation_number</span>
                        수강권 지급 정책
                      </label>

                      {/* 기간 단위 선택 */}
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold mb-1.5 px-1">기간 단위</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(['week', 'month', 'year'] as const).map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setNewClass({ ...newClass, ticketPolicy: { ...newClass.ticketPolicy, period: p } })}
                              className={`h-11 rounded-xl text-sm font-bold transition-all border ${
                                newClass.ticketPolicy.period === p
                                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-primary'
                              }`}
                            >
                              {periodLabels[p]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 횟수 설정 */}
                      <div>
                        <p className="text-[10px] text-slate-500 font-bold mb-1.5 px-1">지급 횟수</p>
                        <div className="flex gap-2">
                          {[5, 10, 20, 30, 50].map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setNewClass({ ...newClass, ticketPolicy: { ...newClass.ticketPolicy, amount: n } })}
                              className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all border ${
                                newClass.ticketPolicy.amount === n
                                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 hover:border-primary'
                              }`}
                            >
                              {n}회
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">직접 입력:</span>
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={newClass.ticketPolicy.amount}
                            onChange={(e) => setNewClass({ ...newClass, ticketPolicy: { ...newClass.ticketPolicy, amount: Math.max(1, parseInt(e.target.value) || 1) } })}
                            className="w-20 h-8 px-2 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          />
                          <span className="text-[10px] text-slate-400">회</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                        <span className="material-symbols-outlined text-primary text-sm">info</span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          회원 승인 시 <strong className="text-primary">{periodLabels[newClass.ticketPolicy.period]} {newClass.ticketPolicy.amount}회</strong> 자동 지급
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 미리보기 - 수정 시에는 숨김 */}
                  {!editingClassId && !editingGroupId && newClass.className && newClass.startDate && newClass.endDate && newClass.selectedDays.length > 0 && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-slate-600">
                      <p className="font-bold text-primary mb-1">📋 등록 미리보기</p>
                      <p>수업명: <strong>{newClass.className}</strong></p>
                      <p>기간: {newClass.startDate} ~ {newClass.endDate}</p>
                      <p>수강권 정책: <strong>{periodLabels[newClass.ticketPolicy.period]} {newClass.ticketPolicy.amount}회</strong> (신규 회원 승인 시)</p>
                      <div className="mt-1">
                        {newClass.selectedDays.sort((a, b) => a - b).map(d => {
                          const schedule = newClass.daySchedules[d];
                          const available = schedule ? generateSlots(schedule.startTime, schedule.endTime, newClass.duration) : [];
                          const active = available.filter(s => !schedule?.disabledSlots.includes(s));
                          return (
                            <p key={d}>{dayLabels[d]}요일: <strong>{active.length > 0 ? active.join(', ') : '수업 없음'}</strong></p>
                          );
                        })}
                      </div>
                      <p>수업시간: <strong>{newClass.duration}분</strong> · 인원: <strong>{newClass.maxCapacity}명</strong></p>
                      <p className="mt-1 text-primary font-bold">
                        → 총 {(() => {
                          const dates = getDatesInRange(newClass.startDate, newClass.endDate, newClass.selectedDays);
                          return dates.reduce((acc, date) => {
                            const dayNum = new Date(date + 'T00:00:00').getDay();
                            const schedule = newClass.daySchedules[dayNum] || defaultSchedule;
                            const available = generateSlots(schedule.startTime, schedule.endTime, newClass.duration);
                            return acc + available.filter(s => !schedule.disabledSlots.includes(s)).length;
                          }, 0);
                        })()}개 수업 생성 예정
                      </p>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={isRegistering}
                    className="w-full py-3.5 bg-primary text-white rounded-xl font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRegistering ? (
                      <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> 처리 중...</>
                    ) : (
                      <><span className="material-symbols-outlined text-lg">{editingClassId || editingGroupId ? 'save' : 'add'}</span> {editingGroupId ? '전체 수업 정보 수정하기' : editingClassId ? '수업 정보 수정하기' : '수업 등록하기'}</>
                    )}
                  </button>

                  {/* 전체 삭제 버튼 (전체 수정 모드일 때만 노출) */}
                  {editingGroupId && (
                    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleDeleteSeries(editingGroupId, newClass.className)}
                        className="w-full py-3 text-rose-500 font-bold rounded-xl border border-rose-100 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all flex items-center justify-center gap-2 group"
                      >
                        <span className="material-symbols-outlined text-lg group-hover:animate-bounce">delete_sweep</span>
                        이 그룹 수업 전체 삭제하기
                      </button>
                      <p className="text-[10px] text-slate-400 text-center mt-2">※ 같은 시리즈로 등록된 모든 수업이 삭제됩니다.</p>
                    </div>
                  )}
                </form>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold">수업 관리 목록</h3>
                      <p className="text-xs text-slate-400 mt-0.5">총 {classes.length}개의 수업 일정이 등록되어 있습니다.</p>
                    </div>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      <button 
                        onClick={() => setViewMode('calendar')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400'}`}
                      >
                        <span className="material-symbols-outlined text-sm">calendar_month</span>
                        달력형
                      </button>
                      <button 
                        onClick={() => setViewMode('list')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400'}`}
                      >
                        <span className="material-symbols-outlined text-sm">list</span>
                        리스트형
                      </button>
                    </div>
                  </div>

                  {viewMode === 'calendar' ? (
                    <div className="p-6">
                      {/* 달력 헤더 */}
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">
                          {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                        </h4>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                          >
                            <span className="material-symbols-outlined text-lg">chevron_left</span>
                          </button>
                          <button 
                            onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                          >
                            <span className="material-symbols-outlined text-lg">chevron_right</span>
                          </button>
                        </div>
                      </div>

                      {/* 달력 그리드 */}
                      <div className="grid grid-cols-7 gap-px bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                          <div key={d} className={`bg-slate-50 dark:bg-slate-900/50 py-3 text-center text-[10px] font-black uppercase tracking-widest ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>
                            {d}
                          </div>
                        ))}
                        {(() => {
                          const year = currentMonth.getFullYear();
                          const month = currentMonth.getMonth();
                          const firstDay = new Date(year, month, 1).getDay();
                          const lastDate = new Date(year, month + 1, 0).getDate();
                          const prevLastDate = new Date(year, month, 0).getDate();
                          
                          const cells = [];
                          for (let i = firstDay - 1; i >= 0; i--) {
                            cells.push({ day: prevLastDate - i, current: false, dateStr: null });
                          }
                          for (let i = 1; i <= lastDate; i++) {
                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                            cells.push({ day: i, current: true, dateStr });
                          }
                          const remaining = 42 - cells.length;
                          for (let i = 1; i <= remaining; i++) {
                            cells.push({ day: i, current: false, dateStr: null });
                          }

                          return cells.map((cell, i) => {
                            const dayClasses = cell.dateStr ? classes.filter(c => c.date === cell.dateStr) : [];
                            const isToday = cell.dateStr === new Date().toLocaleDateString('sv-SE');
                            const isSelected = cell.dateStr === selectedDate;

                            return (
                              <div 
                                key={i} 
                                onClick={() => cell.dateStr && setSelectedDate(selectedDate === cell.dateStr ? null : cell.dateStr)}
                                className={`min-h-[100px] bg-white dark:bg-slate-900 p-2 transition-all cursor-pointer hover:bg-primary/5 group relative ${!cell.current ? 'opacity-30 pointer-events-none' : ''} ${isSelected ? 'ring-2 ring-inset ring-primary bg-primary/5' : ''}`}
                              >
                                <div className="flex justify-between items-start">
                                  <span className={`text-xs font-bold ${isToday ? 'w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center' : (i % 7 === 0 ? 'text-rose-500' : i % 7 === 6 ? 'text-blue-500' : 'text-slate-500')}`}>
                                    {cell.day}
                                  </span>
                                  {dayClasses.length > 0 && (
                                    <span className="text-[10px] font-black text-primary px-1.5 py-0.5 bg-primary/10 rounded-md">
                                      {dayClasses.length}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 space-y-1">
                                  {dayClasses.slice(0, 3).map((c, idx) => (
                                    <div key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 truncate font-medium">
                                      {c.time} {c.className}
                                    </div>
                                  ))}
                                  {dayClasses.length > 3 && (
                                    <div className="text-[9px] text-slate-400 pl-1 font-bold">
                                      외 {dayClasses.length - 3}개...
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      
                      {selectedDate && (
                        <div className="mt-6 p-4 bg-primary/5 border border-primary/10 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300 relative">
                            <div className="flex items-center gap-3 mb-3">
                              <h5 className="text-sm font-bold text-primary flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">event</span>
                                {selectedDate} 수업 상세 내역
                              </h5>
                              
                              {isSelectionMode && (
                                <div className="flex items-center gap-2 ml-2 pr-2 border-r border-slate-200">
                                  <button
                                    onClick={() => {
                                      const classesOnDate = classes.filter(c => c.date === selectedDate);
                                      const allIdsOnDate = classesOnDate.map(c => c.id);
                                      const isAllSelected = allIdsOnDate.every(id => selectedClassIds.includes(id));
                                      
                                      if (isAllSelected) {
                                        setSelectedClassIds(prev => prev.filter(id => !allIdsOnDate.includes(id)));
                                      } else {
                                        setSelectedClassIds(prev => Array.from(new Set([...prev, ...allIdsOnDate])));
                                      }
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors group"
                                  >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                      classes.filter(c => c.date === selectedDate).every(c => selectedClassIds.includes(c.id))
                                        ? 'bg-primary border-primary text-white' 
                                        : 'border-slate-300 bg-white group-hover:border-primary'
                                    }`}>
                                      {classes.filter(c => c.date === selectedDate).every(c => selectedClassIds.includes(c.id)) && (
                                        <span className="material-symbols-outlined text-[10px] font-black">check</span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-600">전체 선택</span>
                                  </button>
                                </div>
                              )}
                              
                              <button 
                                onClick={() => {
                                  if (isSelectionMode) {
                                    handleBulkDelete();
                                  } else {
                                    setIsSelectionMode(true);
                                    setActiveActionMenu(null);
                                  }
                                }}
                                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                                  isSelectionMode 
                                    ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-500/20' 
                                    : 'bg-white border border-slate-200 text-slate-500 hover:border-rose-500 hover:text-rose-500'
                                }`}
                              >
                                <span className="material-symbols-outlined text-xs">{isSelectionMode ? 'check' : 'delete_sweep'}</span>
                                {isSelectionMode ? '삭제 완료' : '선택 삭제'}
                              </button>
                              
                              {isSelectionMode && (
                                <button 
                                  onClick={() => {
                                    setIsSelectionMode(false);
                                    setSelectedClassIds([]);
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-slate-600 font-bold underline"
                                >
                                  취소
                                </button>
                              )}

                              <button onClick={() => { setSelectedDate(null); setActiveActionMenu(null); setIsSelectionMode(false); }} className="ml-auto text-slate-400 hover:text-rose-500">
                                <span className="material-symbols-outlined text-lg">close</span>
                              </button>
                            </div>
                            
                            {activeActionMenu && (
                              <div className="absolute top-4 right-12 z-50 animate-in fade-in zoom-in-95 slide-in-from-right-4 duration-300">
                                <div className="bg-white dark:bg-slate-800 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex items-stretch">
                                  <div className={`w-1.5 ${activeActionMenu.type === 'edit' ? 'bg-primary' : 'bg-rose-500'}`}></div>
                                  <div className="px-4 py-2 flex items-center gap-4">
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">
                                      {activeActionMenu.type === 'edit' ? '수정 선택' : '삭제 선택'}
                                    </span>
                                    <div className="flex gap-1">
                                      <button 
                                        onClick={() => {
                                          const c = classes.find(cls => cls.id === activeActionMenu.id);
                                          if (activeActionMenu.type === 'edit') startEditing(c, false);
                                          else handleDeleteClass(c.id);
                                          setActiveActionMenu(null);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                          activeActionMenu.type === 'edit' 
                                            ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white' 
                                            : 'bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white'
                                        }`}
                                      >
                                        <span className="material-symbols-outlined text-sm">{activeActionMenu.type === 'edit' ? 'person' : 'delete'}</span>
                                        단일 {activeActionMenu.type === 'edit' ? '수정' : '삭제'}
                                      </button>
                                      <button 
                                        onClick={() => {
                                          const c = classes.find(cls => cls.id === activeActionMenu.id);
                                          if (activeActionMenu.type === 'edit') startEditing(c, true);
                                          else handleDeleteSeries(c.groupId || 'legacy', c.className);
                                          setActiveActionMenu(null);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                          activeActionMenu.type === 'edit' 
                                            ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white' 
                                            : 'bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white'
                                        }`}
                                      >
                                        <span className="material-symbols-outlined text-sm">{activeActionMenu.type === 'edit' ? 'groups' : 'delete_sweep'}</span>
                                        전체 {activeActionMenu.type === 'edit' ? '수정' : '삭제'}
                                      </button>
                                      <button 
                                        onClick={() => setActiveActionMenu(null)}
                                        className="p-1.5 text-slate-300 hover:text-slate-500 transition-colors"
                                      >
                                        <span className="material-symbols-outlined text-sm">close</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {classes.filter(c => c.date === selectedDate).map(c => {
                                const classRes = allReservations.filter(r => r.classId === c.id && r.status === 'CONFIRMED');
                                const isFull = c.currentCapacity >= c.maxCapacity;

                                return (
                                  <div 
                                    key={c.id} 
                                    onClick={() => {
                                      if (isSelectionMode) {
                                        setSelectedClassIds(prev => 
                                          prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                        );
                                      }
                                    }}
                                    className={`flex flex-col p-4 rounded-xl border transition-all relative ${
                                      isSelectionMode && selectedClassIds.includes(c.id) 
                                        ? 'border-rose-500 bg-rose-50/30' 
                                        : isFull ? 'bg-rose-50/50 border-rose-100' : 'bg-white border-slate-100 shadow-sm'
                                    } ${isSelectionMode ? 'cursor-pointer' : ''} dark:bg-slate-800 dark:border-slate-800`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-3">
                                        {isSelectionMode && (
                                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                            selectedClassIds.includes(c.id) ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-200 bg-white'
                                          }`}>
                                            {selectedClassIds.includes(c.id) && <span className="material-symbols-outlined text-xs">check</span>}
                                          </div>
                                        )}
                                        <span className={`text-xs font-black px-2 py-1 rounded-lg ${isFull ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-400'}`}>
                                          {c.time}
                                        </span>
                                        <span className="text-sm font-bold">{c.className}</span>
                                        {isFull && <span className="text-[10px] font-bold text-rose-500 border border-rose-200 px-1.5 py-0.5 rounded">마감</span>}
                                      </div>
                                      {!isSelectionMode && (
                                        <div className="flex items-center gap-1">
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveActionMenu({ id: c.id, type: 'edit' });
                                            }}
                                            className={`p-1.5 rounded-lg transition-all ${activeActionMenu?.id === c.id && activeActionMenu?.type === 'edit' ? 'bg-primary text-white shadow-md' : 'text-slate-300 hover:bg-primary/10 hover:text-primary'}`}
                                          >
                                            <span className="material-symbols-outlined text-sm">edit</span>
                                          </button>
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveActionMenu({ id: c.id, type: 'delete' });
                                            }}
                                            className={`p-1.5 rounded-lg transition-all ${activeActionMenu?.id === c.id && activeActionMenu?.type === 'delete' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-300 hover:bg-rose-50 hover:text-rose-500'}`}
                                          >
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center justify-between">
                                      <div className="flex flex-wrap gap-1">
                                        {classRes.length > 0 ? classRes.map((r, i) => (
                                          <span key={i} className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">person</span>
                                            {r.userName}
                                          </span>
                                        )) : (
                                          <span className="text-[11px] text-slate-400 italic">예약자 없음</span>
                                        )}
                                      </div>
                                      <span className={`text-xs font-bold ${isFull ? 'text-rose-500' : 'text-primary'}`}>
                                        {isFull ? '[예약 완료]' : `${c.currentCapacity}/${c.maxCapacity}명`}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-0 relative">
                      {/* 플로팅 액션 메뉴 (달력형과 동일 UI) */}
                      {activeActionMenu && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 w-[95%] animate-in fade-in zoom-in-95 duration-200">
                          <div className="bg-white dark:bg-slate-800 shadow-2xl rounded-2xl border-2 border-primary/20 p-2 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 ml-2">
                              <div className={`w-1.5 h-8 rounded-full ${activeActionMenu.type === 'edit' ? 'bg-primary' : 'bg-rose-500'}`} />
                              <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                                {activeActionMenu.type === 'edit' ? '수정 선택' : '삭제 선택'}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <button 
                                onClick={() => {
                                  const c = classes.find(cls => cls.id === activeActionMenu.id);
                                  if (activeActionMenu.type === 'edit') startEditing(c, false);
                                  else handleDeleteClass(c.id);
                                  setActiveActionMenu(null);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                  activeActionMenu.type === 'edit' 
                                    ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white' 
                                    : 'bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white'
                                }`}
                              >
                                <span className="material-symbols-outlined text-sm">{activeActionMenu.type === 'edit' ? 'person' : 'delete'}</span>
                                단일 {activeActionMenu.type === 'edit' ? '수정' : '삭제'}
                              </button>
                              
                              <button 
                                onClick={() => {
                                  const c = classes.find(cls => cls.id === activeActionMenu.id);
                                  if (activeActionMenu.type === 'edit') startEditing(c, true);
                                  else handleDeleteSeries(c.groupId || 'legacy', c.className);
                                  setActiveActionMenu(null);
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                  activeActionMenu.type === 'edit' 
                                    ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white' 
                                    : 'bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white'
                                }`}
                              >
                                <span className="material-symbols-outlined text-sm">{activeActionMenu.type === 'edit' ? 'groups' : 'delete_sweep'}</span>
                                전체 {activeActionMenu.type === 'edit' ? '수정' : '삭제'}
                              </button>
                              
                              <button 
                                onClick={() => setActiveActionMenu(null)}
                                className="p-2 text-slate-300 hover:text-slate-500 transition-colors"
                              >
                                <span className="material-symbols-outlined">close</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 필터 도구 바 */}
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900">
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                          <button 
                            onClick={() => { setClassStatusFilter('all'); setActiveActionMenu(null); }}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${classStatusFilter === 'all' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            전체 {classes.length}
                          </button>
                          <button 
                            onClick={() => { setClassStatusFilter('upcoming'); setActiveActionMenu(null); }}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${classStatusFilter === 'upcoming' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            진행 예정 {classes.filter(c => {
                              const now = new Date();
                              const cDate = new Date(`${c.date}T${c.time}`);
                              return cDate >= now;
                            }).length}
                          </button>
                          <button 
                            onClick={() => { setClassStatusFilter('completed'); setActiveActionMenu(null); }}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${classStatusFilter === 'completed' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            수강 완료 {classes.filter(c => {
                              const now = new Date();
                              const cDate = new Date(`${c.date}T${c.time}`);
                              return cDate < now;
                            }).length}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              if (isSelectionMode) {
                                if (selectedClassIds.length > 0) handleBulkDelete();
                                else alert('삭제할 수업을 먼저 선택해주세요.');
                              } else {
                                setIsSelectionMode(true);
                                setSelectedClassIds([]);
                                setActiveActionMenu(null);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                              isSelectionMode 
                                ? (selectedClassIds.length > 0 ? 'bg-rose-500 text-white shadow-md' : 'bg-slate-100 text-slate-400')
                                : 'bg-white border border-slate-200 text-slate-500 hover:border-rose-500 hover:text-rose-500'
                            }`}
                          >
                            <span className="material-symbols-outlined text-xs">{isSelectionMode ? 'check' : 'delete_sweep'}</span>
                            {isSelectionMode ? `삭제 완료 (${selectedClassIds.length})` : '선택 삭제'}
                          </button>

                          {isSelectionMode && (
                            <button onClick={() => { setIsSelectionMode(false); setSelectedClassIds([]); }} className="text-[10px] text-slate-400 font-bold underline px-2">취소</button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase text-slate-500">
                            <tr>
                              {isSelectionMode && (
                                <th className="px-6 py-4 w-10">
                                  <div 
                                    onClick={() => {
                                      const filtered = classes.filter(c => {
                                        const now = new Date();
                                        const cDate = new Date(`${c.date}T${c.time}`);
                                        if (classStatusFilter === 'upcoming') return cDate >= now;
                                        if (classStatusFilter === 'completed') return cDate < now;
                                        return true;
                                      });
                                      const allIds = filtered.map(c => c.id);
                                      const isAllSelected = allIds.length > 0 && allIds.every(id => selectedClassIds.includes(id));
                                      if (isAllSelected) setSelectedClassIds(prev => prev.filter(id => !allIds.includes(id)));
                                      else setSelectedClassIds(prev => Array.from(new Set([...prev, ...allIds])));
                                    }}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${
                                      classes.filter(c => {
                                        const now = new Date();
                                        const cDate = new Date(`${c.date}T${c.time}`);
                                        if (classStatusFilter === 'upcoming') return cDate >= now;
                                        if (classStatusFilter === 'completed') return cDate < now;
                                        return true;
                                      }).every(c => selectedClassIds.includes(c.id)) && classes.filter(c => {
                                        const now = new Date();
                                        const cDate = new Date(`${c.date}T${c.time}`);
                                        if (classStatusFilter === 'upcoming') return cDate >= now;
                                        if (classStatusFilter === 'completed') return cDate < now;
                                        return true;
                                      }).length > 0
                                        ? 'bg-primary border-primary text-white' : 'border-slate-200 bg-white'
                                    }`}
                                  >
                                    {classes.filter(c => {
                                      const now = new Date();
                                      const cDate = new Date(`${c.date}T${c.time}`);
                                      if (classStatusFilter === 'upcoming') return cDate >= now;
                                      if (classStatusFilter === 'completed') return cDate < now;
                                      return true;
                                    }).every(c => selectedClassIds.includes(c.id)) && classes.filter(c => {
                                      const now = new Date();
                                      const cDate = new Date(`${c.date}T${c.time}`);
                                      if (classStatusFilter === 'upcoming') return cDate >= now;
                                      if (classStatusFilter === 'completed') return cDate < now;
                                      return true;
                                    }).length > 0 && <span className="material-symbols-outlined text-xs">check</span>}
                                  </div>
                                </th>
                              )}
                              <th className="px-6 py-4">상태</th>
                              <th className="px-6 py-4">수업명</th>
                              <th className="px-6 py-4">날짜</th>
                              <th className="px-6 py-4">시간</th>
                              <th className="px-6 py-4">인원</th>
                              <th className="px-6 py-4 text-right">관리</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {classes
                              .filter(c => {
                                const now = new Date();
                                const cDate = new Date(`${c.date}T${c.time}`);
                                if (classStatusFilter === 'upcoming') return cDate >= now;
                                if (classStatusFilter === 'completed') return cDate < now;
                                return true;
                              })
                              .map(c => {
                                const now = new Date();
                                const cDate = new Date(`${c.date}T${c.time}`);
                                const isCompleted = cDate < now;

                                return (
                                  <tr 
                                    key={c.id} 
                                    onClick={() => {
                                      if (isSelectionMode) {
                                        setSelectedClassIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]);
                                      }
                                    }}
                                    className={`transition-colors ${
                                      isSelectionMode 
                                        ? (selectedClassIds.includes(c.id) ? 'bg-rose-50/50 dark:bg-rose-500/10 cursor-pointer' : 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer')
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    {isSelectionMode && (
                                      <td className="px-6 py-4">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                          selectedClassIds.includes(c.id) ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-200 bg-white'
                                        }`}>
                                          {selectedClassIds.includes(c.id) && <span className="material-symbols-outlined text-xs">check</span>}
                                        </div>
                                      </td>
                                    )}
                                    <td className="px-6 py-4">
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-md ${isCompleted ? 'bg-slate-100 text-slate-400' : 'bg-primary/10 text-primary'}`}>
                                        {isCompleted ? '수강 완료' : '진행 예정'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className={`font-bold transition-colors ${selectedClassIds.includes(c.id) ? 'text-rose-600' : (isCompleted ? 'text-slate-400' : 'text-primary')}`}>
                                        {c.className || '-'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4"><span className={`font-bold ${isCompleted ? 'text-slate-400' : ''}`}>{c.date}</span></td>
                                    <td className="px-6 py-4">
                                      <span className={`font-medium ${isCompleted ? 'text-slate-400' : ''}`}>{c.time}</span>
                                      {c.endTime && <span className="text-slate-400"> ~ {c.endTime}</span>}
                                      <span className="text-[10px] text-slate-400 ml-1">({c.duration || 60}분)</span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-500">{c.currentCapacity}/{c.maxCapacity}명</td>
                                    <td className="px-6 py-4 text-right">
                                      {!isSelectionMode && (
                                        <div className="flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                                          <button 
                                            onClick={() => setActiveActionMenu({ id: c.id, type: 'edit' })}
                                            className={`p-1.5 rounded-lg transition-all ${activeActionMenu?.id === c.id && activeActionMenu?.type === 'edit' ? 'bg-primary text-white shadow-md' : 'text-slate-300 hover:text-primary hover:bg-primary/10'}`}
                                          >
                                            <span className="material-symbols-outlined text-sm">edit</span>
                                          </button>
                                          <button 
                                            onClick={() => setActiveActionMenu({ id: c.id, type: 'delete' })}
                                            className={`p-1.5 rounded-lg transition-all ${activeActionMenu?.id === c.id && activeActionMenu?.type === 'delete' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                                          >
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            {classes.filter(c => {
                                const now = new Date();
                                const cDate = new Date(`${c.date}T${c.time}`);
                                if (classStatusFilter === 'upcoming') return cDate >= now;
                                if (classStatusFilter === 'completed') return cDate < now;
                                return true;
                              }).length === 0 && <tr><td colSpan={isSelectionMode ? 7 : 6} className="px-6 py-20 text-center text-slate-400">해당하는 수업이 없습니다.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===== 승인 요청 탭 ===== */}
          {activeTab === 'approval' && (
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
                {/* 회원 상세 정보 카드 */}
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
      </main>
    </div>
  );
};

export default BusinessDashboard;
