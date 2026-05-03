import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle, Store } from 'lucide-react';
import { auth, db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

const TicketPurchase = () => {
  const navigate = useNavigate();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [myReservations, setMyReservations] = useState<any[]>([]);
  
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. 업체(BUSINESS) 목록 가져오기
    const qBiz = query(collection(db, 'users'), where('role', '==', 'BUSINESS'));
    const unsubBiz = onSnapshot(qBiz, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBusinesses(list);
    });

    // 2. 수업 목록 가져오기 (필터링용)
    const qClasses = query(collection(db, 'classes'));
    const unsubClasses = onSnapshot(qClasses, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClasses(list);
    });

    // 3. 내 예약/신청 현황 확인
    const qRes = query(collection(db, 'reservations'), where('uid', '==', user.uid));
    const unsubRes = onSnapshot(qRes, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyReservations(list);
    });

    return () => {
      unsubBiz();
      unsubClasses();
      unsubRes();
    };
  }, []);

  const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

  // 수업이 있는 업체만 필터링 (오늘 이후의 수업이 존재하는 업체)
  const activeBusinesses = businesses.filter(biz => 
    classes.some(cls => cls.businessId === biz.id && cls.date >= todayStr)
  );

  // 센터 수강 신청 처리
  const handleApplyCenter = async (biz: any) => {
    const user = auth.currentUser;
    if (!user) { alert('로그인이 필요합니다.'); navigate('/'); return; }
    
    setLoadingId(biz.id);
    try {
      await runTransaction(db, async (transaction) => {
        const resId = `app_${user.uid}_${biz.id}`;
        const resRef = doc(db, 'reservations', resId);
        
        // 1. 신청 내역 생성 (승인 대기 상태)
        transaction.set(resRef, {
          uid: user.uid,
          userName: user.displayName || '회원',
          userEmail: user.email,
          businessId: biz.id,
          businessName: biz.businessName || '센터',
          className: '센터 멤버십 신청',
          status: 'PENDING', // <- 이제 PENDING(대기) 상태가 됨
          createdAt: serverTimestamp()
        });

        // 참고: 수강권 지급은 이제 사업자가 승인할 때 수행됩니다.
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      alert('신청 중 오류가 발생했습니다.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--background)', minHeight: '100vh' }}>
      <nav className="top-nav">
        <div className="nav-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ChevronLeft size={24} onClick={() => navigate('/home')} style={{ cursor: 'pointer' }} />
            <div className="nav-logo" style={{ fontSize: '20px', fontWeight: '700' }}>수강 가능 업체 리스트</div>
          </div>
        </div>
      </nav>

      <main className="page-container" style={{ paddingTop: '120px' }}>
        <section style={{ marginBottom: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '48px' }}>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'black' }}></div>
            <h1 style={{ fontSize: '24px', letterSpacing: '0.1em' }}>SELECT CENTER</h1>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
            {activeBusinesses.length > 0 ? activeBusinesses.map((biz) => {
              const myRes = myReservations.find(r => r.businessId === biz.id);
              const status = myRes?.status;
              const isExpanded = selectedBizId === biz.id;

              return (
                <div key={biz.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* 업체명 카드 */}
                  <motion.div
                    onClick={() => setSelectedBizId(isExpanded ? null : biz.id)}
                    style={{ 
                      padding: '32px', 
                      backgroundColor: 'white', 
                      border: '1px solid var(--glass-border)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: isExpanded ? '0 10px 30px rgba(0,0,0,0.05)' : 'none'
                    }}
                    className="monolith-card"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ width: '48px', height: '48px', backgroundColor: '#f5f5f5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Store size={24} color="black" />
                      </div>
                      <div>
                        <h2 style={{ fontSize: '24px', margin: 0, fontWeight: 800 }}>{biz.businessName || '이름 없는 센터'}</h2>
                        <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{biz.businessDescription || biz.about || biz.address || '센터 설명이 준비 중입니다.'}</p>
                      </div>
                    </div>
                    <ChevronLeft size={24} style={{ transform: isExpanded ? 'rotate(-90deg)' : 'rotate(180deg)', transition: 'transform 0.3s ease' }} />
                  </motion.div>

                  {/* 하위 버튼 리스트 (확장 영역) */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', display: 'flex', gap: '12px', padding: '10px 0 20px' }}
                      >
                        {status === 'PENDING' ? (
                          <button disabled className="monolith-button secondary" style={{ flex: 2, cursor: 'default', opacity: 0.7 }}>
                            승인 대기중
                          </button>
                        ) : status === 'CONFIRMED' ? (
                          <button disabled className="monolith-button" style={{ flex: 2, background: '#006c49', cursor: 'default' }}>
                            승인 완료
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleApplyCenter(biz)}
                            disabled={loadingId === biz.id}
                            className="monolith-button"
                            style={{ flex: 2 }}
                          >
                            {loadingId === biz.id ? '신청 중...' : '수강 신청'}
                          </button>
                        )}
                        
                        <button 
                          onClick={() => setSelectedBizId(null)}
                          className="monolith-button secondary"
                          style={{ flex: 1 }}
                        >
                          닫기
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }) : (
              <div style={{ textAlign: 'center', padding: '100px 0', color: '#999' }}>
                <p>수업이 등록된 업체가 없습니다.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(255,255,255,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
              <CheckCircle size={48} color="black" style={{ marginBottom: '16px' }} />
              <h2 style={{ fontSize: '24px', fontWeight: 900 }}>신청 완료</h2>
              <p style={{ color: '#666' }}>사업자의 승인을 기다려주세요.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TicketPurchase;
