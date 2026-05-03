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
  const [searchTerm, setSearchTerm] = useState('');
  
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
        <div className="nav-content" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ChevronLeft size={24} onClick={() => navigate('/home')} style={{ cursor: 'pointer' }} />
            <div className="nav-logo" style={{ fontSize: '20px', fontWeight: '700' }}>수강 가능 업체 리스트</div>
          </div>
          
          {/* 검색창 추가 */}
          <div style={{ position: 'relative', width: '240px' }}>
            <input 
              type="text" 
              placeholder="수업 또는 센터 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 16px 10px 40px',
                borderRadius: '12px',
                border: '1px solid var(--glass-border)',
                backgroundColor: '#f5f5f5',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <span className="material-symbols-outlined" style={{ 
              position: 'absolute', 
              left: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              fontSize: '20px',
              color: '#999'
            }}>search</span>
          </div>
        </div>
      </nav>

      <main className="page-container" style={{ paddingTop: '120px' }}>
        <section style={{ marginBottom: '80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '48px' }}>
            <div style={{ width: '40px', height: '2px', backgroundColor: 'black' }}></div>
            <h1 style={{ fontSize: '24px', letterSpacing: '0.1em' }}>SELECT CLASS</h1>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
            {(() => {
              // 수업명과 사업자 ID를 기준으로 그룹화하여 고유한 수업 유형 생성
              const groupedClasses = Array.from(classes.reduce((acc, curr) => {
                const key = `${curr.className}-${curr.businessId}`;
                if (!acc.has(key)) {
                  const biz = businesses.find(b => b.id === curr.businessId);
                  if (biz) {
                    acc.set(key, {
                      className: curr.className || '기본 수업',
                      businessId: curr.businessId,
                      businessName: biz.businessName || '이름 없는 센터',
                      businessDescription: biz.businessDescription || biz.about || '센터 설명이 준비 중입니다.',
                      id: curr.id, // 그룹을 대표하는 샘플 ID
                      classPhotoURL: curr.classPhotoURL,
                      bizData: biz
                    });
                  }
                }
                return acc;
              }, new Map()).values())
              // 검색어 필터링 추가
              .filter((item: any) => {
                const lowerSearch = searchTerm.toLowerCase();
                return item.className.toLowerCase().includes(lowerSearch) || 
                       item.businessName.toLowerCase().includes(lowerSearch);
              });

              return groupedClasses.length > 0 ? groupedClasses.map((item: any) => {
                const myRes = myReservations.find(r => r.businessId === item.businessId);
                const status = myRes?.status;
                const isExpanded = selectedBizId === `${item.className}-${item.businessId}`;

                return (
                  <div key={`${item.className}-${item.businessId}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* 수업명 중심 카드 */}
                    <motion.div
                      onClick={() => setSelectedBizId(isExpanded ? null : `${item.className}-${item.businessId}`)}
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
                        <div style={{ width: '80px', height: '80px', backgroundColor: '#f8f9fa', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #edf2f7', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                          {item.classPhotoURL ? (
                            <img src={item.classPhotoURL} alt={item.className} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ textAlign: 'center' }}>
                              <Store size={24} color="#cbd5e0" />
                              <p style={{ fontSize: '8px', color: '#a0aec0', margin: '2px 0 0' }}>IMAGE</p>
                            </div>
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h2 style={{ fontSize: '24px', margin: 0, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.className}
                          </h2>
                          <p style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
                            {item.businessName}
                          </p>
                          <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                            {item.businessDescription}
                          </p>
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
                              onClick={() => handleApplyCenter(item.bizData)}
                              disabled={loadingId === item.businessId}
                              className="monolith-button"
                              style={{ flex: 2 }}
                            >
                              {loadingId === item.businessId ? '신청 중...' : '수강 신청'}
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
              );
            })()}
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
