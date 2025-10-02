import React, { useEffect, useMemo, useRef, useState } from "react";

// --- Utilities: dates (ISO week, month matrix) ---
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_PL = [
  "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
  "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"
];
const WEEKDAYS_PL = ["Pn","Wt","Śr","Cz","Pt","So","Nd"]; // Monday-first

function toDateOnlyStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fromDateOnlyStr(s){
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function isSameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }

// ISO week number
function getISOWeek(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1..7, Monday=1
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // to Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / DAY_MS) + 1) / 7);
  return weekNo;
}

// Month matrix (6 rows x 7 cols), Monday-first
function monthMatrix(year, month){
  const first = new Date(year, month, 1);
  // JS: getDay() Sun=0..Sat=6; convert to Monday-first index 1..7
  const jsDay = first.getDay();
  const monFirstIdx = jsDay === 0 ? 7 : jsDay; // 1..7
  const offsetToMonday = monFirstIdx - 1; // 0..6
  const start = addDays(first, -offsetToMonday);
  const weeks = [];
  let cur = start;
  for(let w=0; w<6; w++){
    const days = [];
    for(let i=0;i<7;i++){
      days.push(cur);
      cur = addDays(cur, 1);
    }
    weeks.push(days);
  }
  return weeks; // array of [ [Date x7], ... x6 ]
}

// --- Local storage helpers ---
const LS_TASKS_KEY = 'calendar_tasks_v1';
const LS_SETTINGS_KEY = 'calendar_settings_v1';

function loadTasks(){
  try{ const raw = localStorage.getItem(LS_TASKS_KEY); return raw ? JSON.parse(raw) : {}; }catch{ return {}; }
}
function saveTasks(obj){
  try{ localStorage.setItem(LS_TASKS_KEY, JSON.stringify(obj)); }catch{}
}
function loadSettings(){
  try{ const raw = localStorage.getItem(LS_SETTINGS_KEY); return raw ? JSON.parse(raw) : {}; }catch{ return {}; }
}
function saveSettings(obj){
  try{ localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(obj)); }catch{}
}

// --- Small UI helpers ---
function Icon({name, className}){
  // Minimal inline icons
  const common = "w-5 h-5" + (className?` ${className}`:"");
  switch(name){
    case 'chev-left': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6"/></svg>);
    case 'chev-right': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6"/></svg>);
    case 'calendar': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
    case 'plus': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M12 5v14M5 12h14"/></svg>);
    case 'trash': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M3 6h18M8 6v14m8-14v14M5 6l1-2h12l1 2"/></svg>);
    case 'check': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M5 13l4 4L19 7"/></svg>);
    case 'list': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>);
    case 'external': return (<svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7"/></svg>);
    default: return null;
  }
}

function Badge({children, className=''}){
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 ${className}`}>{children}</span>
}

// --- Day Drawer ---
function DayDrawer({date, open, onClose, tasksByDate, setTasksByDate}){
  const inputRef = useRef(null);
  const dateStr = date ? toDateOnlyStr(date) : null;
  const tasks = dateStr ? (tasksByDate[dateStr] || []) : [];

  useEffect(()=>{
    if(open && inputRef.current){ inputRef.current.focus(); }
  },[open]);

  function addTask(text){
    if(!text.trim()) return;
    const t = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), text: text.trim(), done: false, createdAt: Date.now() };
    const next = {...tasksByDate};
    next[dateStr] = [t, ...(next[dateStr]||[])];
    setTasksByDate(next);
  }
  function toggleTask(id){
    const next = {...tasksByDate};
    next[dateStr] = (next[dateStr]||[]).map(t=> t.id===id? {...t, done: !t.done} : t);
    setTasksByDate(next);
  }
  function removeTask(id){
    const next = {...tasksByDate};
    next[dateStr] = (next[dateStr]||[]).filter(t=> t.id!==id);
    if(next[dateStr].length===0) delete next[dateStr];
    setTasksByDate(next);
  }

  function onSubmit(e){
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (fd.get('task')||'').toString();
    addTask(val);
    e.currentTarget.reset();
  }

  return (
    <div className={`fixed inset-y-0 right-0 w-full sm:w-[440px] bg-white dark:bg-slate-900 shadow-2xl transform transition-transform duration-300 ${open? 'translate-x-0':'translate-x-full'} z-40 flex flex-col`}
         role="dialog" aria-modal="true">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">{date && date.toLocaleDateString('pl-PL', { weekday:'long' })}</div>
          <div className="text-xl font-semibold">{date && date.toLocaleDateString('pl-PL')}</div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Zamknij">✕</button>
      </div>

      <form onSubmit={onSubmit} className="p-4 flex gap-2">
        <input ref={inputRef} name="task" placeholder="Nowe zadanie..." className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-indigo-600 text-white shadow hover:bg-indigo-700"><Icon name="plus"/>Dodaj</button>
      </form>

      <div className="px-4 pb-4 space-y-2 overflow-y-auto">
        {tasks.length===0 ? (
          <div className="text-slate-500 text-sm">Brak zadań. Dodaj pierwsze powyżej.</div>
        ) : tasks.map(t=> (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <button onClick={()=>toggleTask(t.id)} className={`w-6 h-6 rounded-md flex items-center justify-center border ${t.done? 'bg-green-600 border-green-600 text-white':'border-slate-300 dark:border-slate-600'}`} aria-label="Przełącz wykonanie">
              {t.done? <Icon name="check"/>: null}
            </button>
            <div className={`flex-1 ${t.done? 'line-through text-slate-400':''}`}>{t.text}</div>
            <button onClick={()=>removeTask(t.id)} className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600" aria-label="Usuń"><Icon name="trash"/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Tasks View (grouped) ---
function TasksView({tasksByDate, onClose}){
  const [query, setQuery] = useState("");

  const entries = useMemo(()=>{
    const list = Object.entries(tasksByDate)
      .flatMap(([dateStr, items])=> items.map(t=> ({...t, dateStr})))
      .filter(row => row.text.toLowerCase().includes(query.toLowerCase()));
    // Group by YYYY-MM then by date
    const byMonth = new Map();
    for(const row of list){
      const monthKey = row.dateStr.slice(0,7); // YYYY-MM
      if(!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
      const byDay = byMonth.get(monthKey);
      if(!byDay.has(row.dateStr)) byDay.set(row.dateStr, []);
      byDay.get(row.dateStr).push(row);
    }
    return byMonth; // Map( monthKey => Map(dateStr => rows[]) )
  },[tasksByDate, query]);

  function openInNewWindow(){
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Lista zadań</title>
      <style>body{font-family: ui-sans-serif,system-ui,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif; padding:24px;}
      h1{margin:0 0 16px 0} h2{margin:24px 0 8px 0} h3{margin:12px 0 6px 0}
      .done{color:#64748b;text-decoration:line-through}
      .chip{display:inline-block;padding:2px 8px;border-radius:9999px;background:#eef2ff;margin-left:8px;font-size:12px;color:#3730a3}
      ul{margin:6px 0 16px 20px}
      </style></head><body>
      <h1>Lista zadań</h1>
      ${[...entries.keys()].sort().map(mon=>{
        const [y,m]=mon.split('-');
        const monthName = MONTHS_PL[Number(m)-1];
        const days = entries.get(mon);
        return `<h2>${monthName} ${y} <span class="chip">${[...days.values()].reduce((a,b)=>a+b.length,0)} zadań</span></h2>`+
          [...days.keys()].sort().map(ds=>{
            const disp = fromDateOnlyStr(ds).toLocaleDateString('pl-PL', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
            const rows = days.get(ds);
            return `<h3>${disp} <span class="chip">${rows.length}</span></h3><ul>`+
                   rows.map(r=>`<li class="${r.done?'done':''}">${r.text}</li>`).join('')+
                   `</ul>`
          }).join('');
      }).join('')}
      </body></html>`;
    const w = window.open('about:blank','tasks_view');
    if(w){ w.document.write(html); w.document.close(); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Icon name="list"/>
          <div className="text-lg font-semibold flex-1">Widok zadań</div>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Szukaj..." className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"/>
          <button onClick={openInNewWindow} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-indigo-600 text-white shadow hover:bg-indigo-700"><Icon name="external"/> Nowe okno</button>
          <button onClick={onClose} className="ml-2 rounded-xl px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">Zamknij</button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {entries.size===0 ? (
            <div className="text-slate-500 text-sm">Brak zadań do wyświetlenia.</div>
          ) : (
            [...entries.keys()].sort().map(mon=>{
              const [y,m]=mon.split('-');
              const monthName = MONTHS_PL[Number(m)-1];
              const days = entries.get(mon);
              const total = [...days.values()].reduce((a,b)=>a+b.length,0);
              return (
                <div key={mon} className="mb-6">
                  <div className="text-base font-semibold mb-2">{monthName} {y} <Badge>{total} zadań</Badge></div>
                  {[...days.keys()].sort().map(ds=>{
                    const date = fromDateOnlyStr(ds);
                    const rows = days.get(ds);
                    return (
                      <div key={ds} className="mb-3">
                        <div className="text-sm text-slate-500 mb-1">{date.toLocaleDateString('pl-PL', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' })} <Badge>{rows.length}</Badge></div>
                        <ul className="space-y-1 ml-4 list-disc">
                          {rows.map(r=> (
                            <li key={r.id} className={r.done? 'line-through text-slate-400' : ''}>{r.text}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main App ---
export default function CalendarApp(){
  const now = new Date();
  const [viewDate, setViewDate] = useState(()=>{
    const s = loadSettings();
    if(s?.viewDate){ return fromDateOnlyStr(s.viewDate); }
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [tasksByDate, setTasksByDate] = useState(loadTasks);
  const [showTasksView, setShowTasksView] = useState(false);

  useEffect(()=>{ saveTasks(tasksByDate); }, [tasksByDate]);
  useEffect(()=>{ saveSettings({ viewDate: toDateOnlyStr(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)) }); }, [viewDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const weeks = useMemo(()=> monthMatrix(year, month), [year, month]);

  function prevMonth(){ setViewDate(d=> new Date(d.getFullYear(), d.getMonth()-1, 1)); }
  function nextMonth(){ setViewDate(d=> new Date(d.getFullYear(), d.getMonth()+1, 1)); }
  function setMonthYear(m,y){ setViewDate(new Date(y, m, 1)); }

  function tasksCountForDate(d){ const arr = tasksByDate[toDateOnlyStr(d)] || []; return arr.length; }
  const today = now;

  // Build month/year pickers
  const years = Array.from({length: 11}, (_,i)=> year-5+i);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="inline-flex p-2 rounded-2xl bg-indigo-600 text-white shadow-lg"><Icon name="calendar" className="w-6 h-6"/></div>
            <div>
              <div className="text-2xl font-bold tracking-tight">Kalendarz</div>
              <div className="text-sm text-slate-500">Tydzień ISO + zadania dzienne</div>
            </div>
          </div>
          <div className="flex-1"/>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowTasksView(true)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700">
              <Icon name="list"/> Widok zadań
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="inline-flex items-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button onClick={prevMonth} className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Poprzedni miesiąc"><Icon name="chev-left"/></button>
            <div className="px-3 py-2 font-semibold">{MONTHS_PL[month]} {year}</div>
            <button onClick={nextMonth} className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Następny miesiąc"><Icon name="chev-right"/></button>
          </div>

          <select value={month} onChange={e=>setMonthYear(Number(e.target.value), year)} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
            {MONTHS_PL.map((m,i)=>(<option key={m} value={i}>{m}</option>))}
          </select>
          <select value={year} onChange={e=>setMonthYear(month, Number(e.target.value))} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
            {years.map(y=>(<option key={y} value={y}>{y}</option>))}
          </select>

          <div className="ml-auto text-sm text-slate-500">
            Dziś: {today.toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric' })}
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="grid grid-cols-8 bg-slate-50 dark:bg-slate-900/40 text-sm font-medium">
            <div className="p-2 text-center text-slate-500">Tydz</div>
            {WEEKDAYS_PL.map(d=>(<div key={d} className="p-2 text-center">{d}</div>))}
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {weeks.map((row, idx)=>{
              const weekNo = getISOWeek(row[0]);
              return (
                <div key={idx} className="grid grid-cols-8">
                  <div className="p-3 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/40 border-r border-slate-200 dark:border-slate-800 flex items-center justify-center">{String(weekNo).padStart(2,'0')}</div>
                  {row.map((d,i)=>{
                    const inMonth = d.getMonth()===month;
                    const isToday = isSameDay(d, today);
                    const tCount = tasksCountForDate(d);
                    return (
                      <button key={i} onClick={()=>{ setSelectedDate(d); }}
                        className={`relative h-28 p-2 text-left border-r border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${i===6? 'border-r-0':''} ${inMonth? 'bg-white dark:bg-slate-950':'bg-slate-50 dark:bg-slate-900/30 text-slate-400'} hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20`}> 
                        <div className="flex items-center justify-between">
                          <div className={`text-sm font-medium ${isToday? 'text-indigo-600 dark:text-indigo-400':''}`}>{d.getDate()}</div>
                          {isToday && <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">Dziś</Badge>}
                        </div>
                        {tCount>0 && (
                          <div className="absolute bottom-2 left-2 right-2">
                            <div className="text-xs text-slate-500">Zadania:</div>
                            <div className="mt-1 flex gap-1 flex-wrap">
                              {Array.from({length: Math.min(6,tCount)}).map((_,i)=> <span key={i} className="w-2 h-2 rounded-full inline-block bg-indigo-500"/>) }
                              {tCount>6 && <Badge>+{tCount-6}</Badge>}
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">Europe/Warsaw • ISO-8601 (poniedziałek jako pierwszy dzień tygodnia)</div>
      </div>

      <DayDrawer
        date={selectedDate}
        open={!!selectedDate}
        onClose={()=>setSelectedDate(null)}
        tasksByDate={tasksByDate}
        setTasksByDate={setTasksByDate}
      />

      {showTasksView && (
        <TasksView tasksByDate={tasksByDate} onClose={()=>setShowTasksView(false)}/>
      )}
    </div>
  );
}


export default function CalendarPanel({ open=true, onClose }){
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
          <div className="font-semibold">Kalendarz</div>
          <button onClick={onClose} className="px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="Zamknij">✕</button>
        </div>
        <div className="flex-1 min-h-0">
          <CalendarInner/>
        </div>
      </div>
    </div>
  );
}
