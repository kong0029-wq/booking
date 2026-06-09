import React, { useState, useMemo } from 'react';

type ViewMode = 'year' | 'month' | 'week' | 'day';

interface ClassCalendarProps {
  classes: any[];
}

export const ClassCalendar: React.FC<ClassCalendarProps> = ({ classes }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'year') newDate.setFullYear(newDate.getFullYear() - 1);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
    if (viewMode === 'week') newDate.setDate(newDate.getDate() - 7);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'year') newDate.setFullYear(newDate.getFullYear() + 1);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
    if (viewMode === 'week') newDate.setDate(newDate.getDate() + 7);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => setCurrentDate(new Date());

  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

  // --- Month View ---
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= lastDate; i++) days.push(i);

    return (
      <div className="flex flex-col h-[700px] border-t border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`py-3 text-center text-xs font-black tracking-widest border-r border-slate-200 dark:border-slate-800 ${i===0?'text-rose-500':i===6?'text-blue-500':'text-slate-600 dark:text-slate-400'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {days.map((d, idx) => {
            if (!d) return <div key={`empty-${idx}`} className="border-r border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20" />;
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayClasses = classes.filter(c => c.date === dateStr).sort((a,b) => a.time.localeCompare(b.time));
            const isToday = dateStr === todayStr;

            return (
              <div key={d} className="border-r border-b border-slate-200 dark:border-slate-800 p-1.5 flex flex-col overflow-hidden min-h-[120px] transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <div className="flex justify-between items-start mb-1.5">
                  <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white shadow-md shadow-primary/20' : idx%7===0 ? 'text-rose-500' : idx%7===6 ? 'text-blue-500' : 'text-slate-700 dark:text-slate-300'}`}>
                    {d}
                  </div>
                  {dayClasses.length > 0 && (
                    <span className="text-[9px] font-bold text-slate-400 mt-1 mr-1">{dayClasses.length}개</span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {dayClasses.map(c => (
                    <div key={c.id} className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-1.5 cursor-pointer hover:bg-primary hover:text-white hover:border-primary transition-all group shadow-sm">
                      <div className="font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary group-hover:bg-white transition-colors" />
                        {c.time}
                      </div>
                      <div className="truncate mt-0.5 opacity-90 group-hover:opacity-100">{c.className}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // --- Week View ---
  const renderWeekView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = currentDate.getDate();
    const day = currentDate.getDay();

    const weekDays = Array.from({length: 7}, (_, i) => {
      const d = new Date(year, month, date - day + i);
      return d;
    });

    const minHour = 6;
    const maxHour = 23;
    const hours = Array.from({length: maxHour - minHour + 1}, (_, i) => i + minHour);

    return (
      <div className="flex flex-col h-[700px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
          <div className="w-14 shrink-0 border-r border-slate-200 dark:border-slate-800"></div>
          {weekDays.map((d, i) => {
             const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
             const isToday = dStr === todayStr;
             return (
              <div key={i} className={`flex-1 py-3 text-center border-r border-slate-200 dark:border-slate-800 last:border-0 ${isToday ? 'bg-primary/5' : ''}`}>
                <p className={`text-[10px] font-black tracking-widest ${i===0?'text-rose-500':i===6?'text-blue-500':'text-slate-500'}`}>
                  {['일', '월', '화', '수', '목', '금', '토'][i]}
                </p>
                <div className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-black ${isToday ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-800 dark:text-slate-200'}`}>
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto relative custom-scrollbar">
          {hours.map(h => (
            <div key={h} className="flex h-[80px] border-b border-slate-100 dark:border-slate-800/50">
              <div className="w-14 shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-start justify-center pt-2 bg-slate-50/50 dark:bg-slate-800/20">
                <span className="text-[10px] font-bold text-slate-400">{String(h).padStart(2, '0')}:00</span>
              </div>
              {weekDays.map((d, i) => {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const cellClasses = classes.filter(c => c.date === dateStr && parseInt(c.time.split(':')[0]) === h);
                return (
                  <div key={i} className="flex-1 border-r border-slate-100 dark:border-slate-800/50 last:border-0 relative p-1">
                    {cellClasses.map((c, idx) => {
                      const [ch, cm] = c.time.split(':').map(Number);
                      const top = (cm / 60) * 80;
                      const height = Math.max(((c.duration || 60) / 60) * 80, 24); // 최소 높이 보장
                      
                      return (
                        <div key={c.id} className="absolute left-1 right-1 bg-primary/95 text-white rounded-lg p-2 shadow-sm text-[10px] leading-tight overflow-hidden hover:brightness-110 hover:shadow-md hover:z-20 cursor-pointer transition-all border border-primary/20" style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 + idx }}>
                          <p className="font-bold truncate flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white/80"></span>{c.className}</p>
                          {height > 30 && <p className="opacity-90 font-medium mt-0.5 ml-2.5">{c.time}</p>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- Day View ---
  const renderDayView = () => {
    const d = currentDate;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const minHour = 6;
    const maxHour = 23;
    const hours = Array.from({length: maxHour - minHour + 1}, (_, i) => i + minHour);

    return (
      <div className="flex flex-col h-[700px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 max-w-2xl mx-auto w-full shadow-sm">
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
          <div className="w-16 shrink-0 border-r border-slate-200 dark:border-slate-800"></div>
          <div className="flex-1 py-4 text-center">
            <p className="text-xs font-bold text-slate-500 mb-1">{['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][d.getDay()]}</p>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-200">{d.getDate()}일</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto relative custom-scrollbar">
          {hours.map(h => (
            <div key={h} className="flex h-[100px] border-b border-slate-100 dark:border-slate-800/50">
              <div className="w-16 shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-start justify-center pt-2 bg-slate-50/50 dark:bg-slate-800/20">
                <span className="text-xs font-bold text-slate-400">{String(h).padStart(2, '0')}:00</span>
              </div>
              <div className="flex-1 relative p-2">
                {classes.filter(c => c.date === dateStr && parseInt(c.time.split(':')[0]) === h).map((c, idx) => {
                  const [ch, cm] = c.time.split(':').map(Number);
                  const top = (cm / 60) * 100;
                  const height = Math.max(((c.duration || 60) / 60) * 100, 30);
                  
                  return (
                    <div key={c.id} className="absolute left-4 right-4 bg-primary/95 text-white rounded-xl p-3 shadow-md text-xs leading-relaxed overflow-hidden hover:brightness-110 cursor-pointer transition-all border border-primary/20" style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 + idx }}>
                      <div className="flex justify-between items-start">
                        <p className="font-bold truncate text-sm">{c.className}</p>
                        <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">{c.currentCapacity}/{c.maxCapacity}명</span>
                      </div>
                      <p className="opacity-90 font-medium mt-1">{c.time} ({c.duration}분)</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // --- Year View ---
  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const months = Array.from({length: 12}, (_, i) => i);

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
        {months.map(month => {
          const firstDay = new Date(year, month, 1).getDay();
          const lastDate = new Date(year, month + 1, 0).getDate();
          const days = [];
          for (let i = 0; i < firstDay; i++) days.push(null);
          for (let i = 1; i <= lastDate; i++) days.push(i);

          return (
            <div key={month} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <h3 
                onClick={() => {
                  setCurrentDate(new Date(year, month, 1));
                  setViewMode('month');
                }}
                className="text-center font-black text-lg mb-4 text-slate-800 dark:text-slate-200 cursor-pointer hover:text-primary transition-colors inline-block w-full"
              >
                {month + 1}월
              </h3>
              <div className="grid grid-cols-7 mb-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <div key={d} className={`text-center text-[10px] font-bold ${i===0?'text-rose-400':i===6?'text-blue-400':'text-slate-400'}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-2">
                {days.map((d, idx) => {
                  if (!d) return <div key={`empty-${idx}`} />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const hasClasses = classes.some(c => c.date === dateStr);
                  const isToday = dateStr === todayStr;

                  return (
                    <div 
                      key={d} 
                      onClick={() => {
                        setCurrentDate(new Date(year, month, d));
                        setViewMode('day');
                      }}
                      className="relative flex justify-center cursor-pointer group"
                    >
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors ${isToday ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 group-hover:bg-slate-100 dark:group-hover:bg-slate-800'}`}>
                        {d}
                      </span>
                      {hasClasses && (
                        <span className={`absolute -bottom-1 w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-primary'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
         <div className="flex items-center gap-4">
           <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 min-w-[140px]">
             {viewMode === 'year' && `${currentDate.getFullYear()}년`}
             {viewMode === 'month' && `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`}
             {viewMode === 'week' && `${currentDate.getMonth() + 1}월 ${Math.ceil(currentDate.getDate() / 7)}주차`}
             {viewMode === 'day' && `${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일`}
           </h2>
           <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700">
             <button onClick={handlePrev} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-slate-800 hover:shadow-sm transition-all"><span className="material-symbols-outlined text-sm block">arrow_back_ios_new</span></button>
             <button onClick={handleToday} className="px-4 py-1.5 text-xs font-bold bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm rounded-lg hover:text-primary transition-colors">오늘</button>
             <button onClick={handleNext} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-slate-800 hover:shadow-sm transition-all"><span className="material-symbols-outlined text-sm block">arrow_forward_ios</span></button>
           </div>
         </div>
         <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
           {(['year', 'month', 'week', 'day'] as ViewMode[]).map(mode => (
             <button
               key={mode}
               onClick={() => setViewMode(mode)}
               className={`px-5 py-2 text-xs font-black rounded-lg transition-all ${viewMode === mode ? 'bg-white dark:bg-slate-700 shadow-sm text-primary border border-slate-200/50' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
             >
               {mode === 'year' ? '연간' : mode === 'month' ? '월간' : mode === 'week' ? '주간' : '일간'}
             </button>
           ))}
         </div>
       </div>

       <div className="w-full">
         {viewMode === 'year' && renderYearView()}
         {viewMode === 'month' && renderMonthView()}
         {viewMode === 'week' && renderWeekView()}
         {viewMode === 'day' && renderDayView()}
       </div>
    </div>
  );
};
