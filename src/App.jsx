
import React, { useEffect, useMemo, useRef, useState } from "react";
import db from "./db.js";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus, CalendarDays, Timer as TimerIcon, Play, Square, Palette, Search, Download, Upload, X,
  Trash2, Settings, Tag, Bell, GripVertical, PlusCircle, CheckSquare, Layers, FolderClosed,
  FolderPlus, CalendarClock, Pencil, Columns as ColumnsIcon, MessageSquare, Send
, ChevronDown , ListChecks } from "lucide-react";

import {DndContext, DragOverlay, PointerSensor, closestCenter, closestCorners, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors} from "@dnd-kit/core";
// (injected)
import { SortableContext, useSortable, verticalListSortingStrategy, defaultAnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CalendarPage from "./components/CalendarPage.jsx";

// -------------------------
// Dexie (IndexedDB) setup
// -------------------------


// -------------------------
// Helpers
// -------------------------
const DEFAULT_STATUSES = [
  { key: "Backlog", color: "#94a3b8" },
  { key: "Todo", color: "#38bdf8" },
  { key: "In Progress", color: "#f59e0b" },
  { key: "Review", color: "#a78bfa" },
  { key: "Blocked", color: "#ef4444" },
  { key: "Done", color: "#22c55e" },
];
const PRIORITIES = ["Low", "Normal", "High", "Critical"];
const TODAY_KEY = "__TODAY__";

function classNames(...arr){ return arr.filter(Boolean).join(" "); }
function msToHMS(ms) { const sec = Math.floor(ms/1000); const h = Math.floor(sec/3600); const m = Math.floor((sec%3600)/60); const s = sec%60; return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":"); }
function fmtDate(ts) { if (!ts) return "—"; const d=new Date(ts); return d.toLocaleString(); }
function fmtDateShort(ts) { if (!ts) return "—"; const d=new Date(ts); return d.toLocaleDateString(); }
function ymd(ts){ if(!ts) return ""; const d=new Date(ts); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
function fromYmd(str){ if(!str) return null; const d=new Date(str+"T00:00:00"); return isNaN(d.getTime())?null:d.getTime(); }
function dtLocal(ts){ if(!ts) return ""; const d=new Date(ts); const pad=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalDT(str){ if(!str) return null; const d=new Date(str); return isNaN(d.getTime())?null:d.getTime(); }
function startOfDay(ts){ const d=new Date(ts); d.setHours(0,0,0,0); return +d; }
function endOfDay(ts){ const d=new Date(ts); d.setHours(23,59,59,999); return +d; }

function useNow(intervalMs = 1000) { const [, setTick] = useState(0); useEffect(()=>{ const t=setInterval(()=>setTick(x=>(x+1)%1_000_000), intervalMs); return ()=>clearInterval(t); },[intervalMs]); }
function useTotalTimeForTask(taskId, allLogs) {
  useNow(1000);
  return useMemo(() => {
    const logs = allLogs.filter(l => l.taskId === taskId);
    let total = 0;
    for (const l of logs) total += ((l.end || Date.now()) - l.start);
    return total;
  }, [taskId, allLogs]);
}
function timeOnDay(log, dayStart, dayEnd){
  const s = Math.max(log.start, dayStart);
  const e = Math.min((log.end || Date.now()), dayEnd);
  return Math.max(0, e - s);
}

// -------------------------
// Settings helpers
// -------------------------
async function setStatuses(next){ await db.settings.put({ key: "statuses", value: next }); }
async function setProjects(next){ await db.settings.put({ key: "projects", value: next }); }
async function setHiddenCols(next){ await db.settings.put({ key: "hiddenColumns", value: next }); }
async function setShowToday(val){ await db.settings.put({ key: "showToday", value: !!val }); }

// -------------------------
// Main App
// -------------------------
export default function App(){
  const [onlyWithComments, setOnlyWithComments] = useState(() =>
    (localStorage.getItem("onlyWithComments") === "1")
  );
  const commentsAll = useLiveQuery(() => db.comments.toArray(), []) || [];
  const commentedTaskIds = useMemo(
    () => new Set(commentsAll.map(c => c.taskId)),
    [commentsAll]
  );

  const [view, setView] = useState("board"); // board | table | today | report
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all"); // 'all' or projectId
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [notifGranted, setNotifGranted] = useState(typeof Notification !== "undefined" ? Notification.permission === "granted" : false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("");
  const [sortBy, setSortBy] = useState("dueAsc");
  const [reportDate, setReportDate] = useState(ymd(Date.now()));

  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const timelogs = useLiveQuery(() => db.timelogs.toArray(), []) || [];
  const statusesDoc = useLiveQuery(() => db.settings.get("statuses"), []);
  const projectsDoc = useLiveQuery(() => db.settings.get("projects"), []);
  const hiddenColsDoc = useLiveQuery(() => db.settings.get("hiddenColumns"), []);
  const showTodayDoc = useLiveQuery(() => db.settings.get("showToday"), []);

  const STATUSES = statusesDoc?.value || DEFAULT_STATUSES;
  const PROJECTS = projectsDoc?.value || [{ id: "default", name: "Domyślny", color: "#0ea5e9" }];
  const HIDDEN = hiddenColsDoc?.value || [];
  const SHOW_TODAY = showTodayDoc?.value ?? true;

  useEffect(()=>{
    (async ()=>{
      if (!(await db.settings.get("statuses"))) await setStatuses(DEFAULT_STATUSES);
      if (!(await db.settings.get("projects"))) await setProjects([{ id: "default", name: "Domyślny", color: "#0ea5e9" }]);
      if (!(await db.settings.get("hiddenColumns"))) await setHiddenCols([]);
      if ((await db.settings.get("showToday"))?.value === undefined) await setShowToday(true);
      const withoutProj = await db.tasks.toCollection().filter(t => t.projectId == null).toArray();
      if (withoutProj.length) await db.tasks.bulkPut(withoutProj.map(t => ({ ...t, projectId: (projectId || "default") })));
    })();
  }, []);

  // Local reminders
  useEffect(() => {
    const t = setInterval(async () => {
      const now = Date.now();
      const due = tasks.filter(t => t.remindAt && now >= t.remindAt && (!t.lastRemindedAt || t.lastRemindedAt < t.remindAt));
      if (!due.length) return;
      for (const task of due) {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Przypomnienie: " + (task.title || "Zadanie"), { body: (task.description || "").slice(0, 120) || "Masz zaplanowane przypomnienie." });
        }
        await db.tasks.update(task.id, { lastRemindedAt: now });
      }
    }, 30000);
    return ()=>clearInterval(t);
  }, [tasks]);

  const baseFilter = useMemo(()=>{
    const q = query.trim().toLowerCase();
    return (t) => (
      (project === "all" ? true : t.projectId === project) &&
      (statusFilter === "all" ? true : t.status === statusFilter) &&
      (priorityFilter === "all" ? true : (t.priority || "Normal") === priorityFilter) &&
      (!labelFilter.trim() ? true : (t.labels || []).some(l => l.toLowerCase().includes(labelFilter.toLowerCase()))) &&
      (!q || (t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)))
    );
  }, [project, statusFilter, priorityFilter, labelFilter, query]);

  const filteredTasks = useMemo(() => {
    const arr = tasks.filter(baseFilter);
    return arr.sort((a,b)=>{
      if (sortBy === "dueAsc"){ const ad=a.dueAt||Infinity, bd=b.dueAt||Infinity; if (ad!==bd) return ad-bd; }
      else if (sortBy === "updatedDesc"){ const au=a.updatedAt||0, bu=b.updatedAt||0; if (au!==bu) return bu-au; }
      else if (sortBy === "priorityDesc"){ const ap=PRIORITIES.indexOf(a.priority||"Normal"); const bp=PRIORITIES.indexOf(b.priority||"Normal"); if (ap!==bp) return bp-ap; }
      return (a.order||0)-(b.order||0);
    });
  }, [tasks, baseFilter, sortBy]);

  async function addTask(partial = {}){
    const status = partial.status || (STATUSES[0]?.key || "Backlog");
    const now = Date.now();
    const order = now;
    const id = await db.tasks.add({
      title: partial.title || "Nowe zadanie",
      description: partial.description || "",
      status,
      color: partial.color || STATUSES.find(s=>s.key===status)?.color || "#7c3aed",
      createdAt: now, updatedAt: now, dueAt: partial.dueAt || null,
      statusHistory: [{ status, at: now }],
      labels: [], priority: "Normal", checklist: [], order,
      remindAt: null, lastRemindedAt: null,
      projectId: partial.projectId || (project === "all" ? "default" : project),
      todayDate: partial.todayDate || null,
    });
    if (partial.autoStartTimer){
      await db.timelogs.add({ taskId: id, start: Date.now(), end: null });
    }
    setSelectedTaskId(id);
  }

  function exportData(){
    Promise.all([db.tasks.toArray(), db.comments.toArray(), db.timelogs.toArray(), db.settings.toArray()]).then(([t,c,l,s])=>{
      const blob = new Blob([JSON.stringify({tasks:t,comments:c,timelogs:l,settings:s},null,2)],{type:"application/json"});
      const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`taskflow-export-${new Date().toISOString().slice(0,19)}.json`; a.click(); URL.revokeObjectURL(url);
    });
  }
  function importData(file){
    const r=new FileReader();
    r.onload=async()=>{ try{ const data=JSON.parse(r.result); if(data?.tasks) await db.tasks.bulkPut(data.tasks); if(data?.comments) await db.comments.bulkPut(data.comments); if(data?.timelogs) await db.timelogs.bulkPut(data.timelogs); if(data?.settings) await db.settings.bulkPut(data.settings);}catch{ alert("Niepoprawny plik JSON"); } };
    r.readAsText(file);
  }

  async function askNotifications(){ if(typeof Notification==="undefined"){ alert("Twoja przeglądarka nie wspiera Notifications API."); return; } const res=await Notification.requestPermission(); setNotifGranted(res==="granted"); }

  return (
    <div data-task-card className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <TopBar onOpenCalendar={()=>setView("calendar")}
        view={view} setView={setView}
        query={query} setQuery={setQuery}
        project={project} setProject={setProject} projects={PROJECTS}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
        labelFilter={labelFilter} setLabelFilter={setLabelFilter}
        sortBy={sortBy} setSortBy={setSortBy}
        statuses={STATUSES} hiddenCols={HIDDEN} showToday={SHOW_TODAY}
        onAdd={() => addTask({})}onExport={exportData} onImport={importData}
        onOpenSettings={()=>setSettingsOpen(true)}
        onOpenColumns={()=>setColumnsOpen(true)}
        onOpenProjects={()=>setProjectsOpen(true)}
        notifGranted={notifGranted} onAskNotifications={askNotifications}
        onQuickAddToday={()=> addTask({ status: TODAY_KEY, todayDate: ymd(Date.now()), autoStartTimer: true, title: "Nowe (dziś)", projectId: (project==="all" ? "default" : project) }) }
      />

      {view === "calendar" && (
        <CalendarPage tasks={tasks} onOpenTask={setSelectedTaskId} />
      )}

      {view === "board" && (project === "all"
        ? <StackedBoards tasks={filteredTasks} timelogs={timelogs} statuses={STATUSES} projects={PROJECTS} hiddenCols={HIDDEN} showToday={SHOW_TODAY} onOpen={setSelectedTaskId} />
        : <BoardView key={project} projectId={project} tasks={filteredTasks} timelogs={timelogs} statuses={STATUSES} hiddenCols={HIDDEN} showToday={SHOW_TODAY} onOpen={setSelectedTaskId} />
      )}

      {view === "table" && (
        <TableView tasks={filteredTasks} timelogs={timelogs} onOpen={setSelectedTaskId} statuses={STATUSES} projects={PROJECTS} />
      )}

      {view === "today" && (<TodayView tasks={tasks} timelogs={timelogs} onOpen={setSelectedTaskId} projectId={(project==="all" ? "default" : project)} />)}

      {view === "report" && (
        <WeeklyReportView anchorDateStr={reportDate} setAnchorDateStr={setReportDate} tasks={tasks} timelogs={timelogs} projects={PROJECTS} />
      )}

      {selectedTaskId != null && (
        <TaskModal taskId={selectedTaskId} onClose={()=>setSelectedTaskId(null)} statuses={STATUSES} projects={PROJECTS} />
      )}

      {settingsOpen && <SettingsModal statuses={STATUSES} onClose={()=>setSettingsOpen(false)} />}
      {columnsOpen && <ColumnsModal statuses={STATUSES} onClose={()=>setColumnsOpen(false)} />}
      {projectsOpen && <ProjectsModal projects={PROJECTS} onClose={()=>setProjectsOpen(false)} />}
    </div>
  );
}

// -------------------------
// Stacked boards (projects) with collapse on double click
// -------------------------
function StackedBoards({ tasks, timelogs, statuses, projects, hiddenCols, showToday, onOpen }){
  const [collapsed, setCollapsed] = useState(()=>{ try{ const raw=localStorage.getItem("tf_collapsed_projects"); return raw? new Set(JSON.parse(raw)) : new Set(); }catch{ return new Set(); } });
  useEffect(()=>{ try{ localStorage.setItem("tf_collapsed_projects", JSON.stringify(Array.from(collapsed))); }catch{} }, [collapsed]);
  const byProject = useMemo(()=>{
    const map = new Map();
    for (const p of projects) map.set(p.id, []);
    for (const t of tasks) (map.get(t.projectId) || []).push(t);
    return map;
  }, [tasks, projects]);

  function toggle(pid){
    const n = new Set(collapsed);
    if (n.has(pid)) n.delete(pid); else n.add(pid);
    setCollapsed(n);
  }

  return (
    <div className="space-y-6 px-5 pb-10">
      {projects.map(p => {
        const isCollapsed = collapsed.has(p.id);
        return (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white/70 shadow-sm overflow-hidden">
            <div
              className="flex items-center gap-2 px-4 py-2 cursor-pointer select-none hover:bg-white/80 transition"
              onDoubleClick={()=>toggle(p.id)}
              title="Podwójny klik: zwiń/rozwiń projekt"
            >
              <div className="h-2 w-2 rounded-full" style={{background: p.color}} />
              <div className="uppercase tracking-wider text-xs text-slate-500">PROJEKT</div>
              <div className="font-semibold">{p.name}</div>
              <div className="ml-auto text-slate-300">—</div>
            </div>

            <div className={classNames("transition-all duration-300 ease-in-out", isCollapsed ? "max-h-0 opacity-0 overflow-hidden" : "max-h-[1600px] opacity-100")}>
              {!isCollapsed && (
                <div className="px-4 pb-4 pt-2">
                  <BoardView tasks={byProject.get(p.id) || []} timelogs={timelogs} statuses={statuses} hiddenCols={hiddenCols} showToday={showToday} onOpen={onOpen} projectId={p.id} embedded />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------
// BoardView – DnD with overlay, click-empty-to-add, collapsible columns
// -------------------------
function BoardView({ tasks, timelogs, statuses, hiddenCols, showToday, onOpen, embedded=false, projectId }){
  const [activeId, setActiveId] = useState(null);
  const [collapsedCols, setCollapsedCols] = useState(()=>{ try{ const raw=localStorage.getItem("tf_collapsed_cols"); return raw? new Set(JSON.parse(raw)) : new Set(); }catch{ return new Set(); } });
  useEffect(()=>{ try{ localStorage.setItem("tf_collapsed_cols", JSON.stringify(Array.from(collapsedCols))); }catch{} }, [collapsedCols]);

  const colsBase = statuses.filter(s => !hiddenCols?.includes?.(s.key)).map(s => s.key);
  const cols = showToday ? [TODAY_KEY, ...colsBase] : colsBase;
  const colColors = (key) => key===TODAY_KEY ? "#14b8a6" : (statuses.find(s=>s.key===key)?.color || "#64748b");

  const byCol = useMemo(()=>{
    const map = Object.fromEntries(cols.map(c => [c, []]));
    for (const t of tasks){
      const k = (t.status === TODAY_KEY ? TODAY_KEY : t.status);
      if (!map[k]) continue;
      map[k].push(t);
    }
    for (const k of Object.keys(map)) map[k].sort((a,b)=> (a.order||0)-(b.order||0));
    return map;
  }, [tasks, statuses, hiddenCols]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function onMoveTask(taskId, status, newOrder){
    const now = Date.now();
    const t = await db.tasks.get(taskId);
    if (!t) return;
    const statusChanged = t.status !== status;
    const hist = Array.isArray(t.statusHistory) ? [...t.statusHistory] : [];
    if (statusChanged && status !== TODAY_KEY) hist.push({ status, at: now });
    const patch = { status, order: newOrder, updatedAt: now, statusHistory: hist };
    if (status === TODAY_KEY){ patch.todayDate = ymd(Date.now()); }
    await db.tasks.update(taskId, patch);
    if ((status === "Done") || (t.status === TODAY_KEY && status !== TODAY_KEY)){
      const open = await db.timelogs.where("taskId").equals(taskId).and(l => l.end == null).toArray();
      for (const l of open) await db.timelogs.update(l.id, { end: Date.now() });
    }
  }

  function getTask(idStr){
    const id = Number(idStr);
    return tasks.find(t => t.id === id) || null;
  }

  
  
  
  async function handleDragEnd(evt){
  try {
    const { active, over } = evt;
if (!over) { return; }

    const [typeA, idStrA] = String(active.id).split(":");
    const [typeB, idStrB] = String(over.id).split(":");
    if (typeA !== "task") { return; }

    const taskId = Number(idStrA);

    // Locate source (column + index) of active
    let srcCol = null, srcIdx = -1;
    for (const k of Object.keys(byCol)){
      const arr = byCol[k] || [];
      const ix = arr.findIndex(x => x.id === taskId);
      if (ix >= 0){ srcCol = k; srcIdx = ix; break; }
    }

    // If drop on column background -> append at end
    if (typeB === "col"){
      const status = idStrB;
      const arr = byCol[status] || [];
      const lastOrder = arr.length ? (arr[arr.length-1].order || Date.now()) : Date.now();
      await onMoveTask(taskId, status, lastOrder + 1);
      return;
    }

    // Drop on task -> compute before/after based on relative indices
    if (typeB === "task"){
      const targetId = Number(idStrB);

      // Find target info
      let tgtCol = null, tgtIdx = -1, tgtOrder = Date.now();
      for (const k of Object.keys(byCol)){
        const arr = byCol[k] || [];
        const ix = arr.findIndex(x => x.id === targetId);
        if (ix >= 0){ tgtCol = k; tgtIdx = ix; tgtOrder = (arr[ix].order || Date.now()); break; }
      }
      if (!tgtCol) { return; }

      const arr = byCol[tgtCol] || [];
      // decide before/after target
      let placeAfter = true;
      if (tgtCol === srcCol && srcIdx !== -1 && tgtIdx < srcIdx){
        // dragging upwards over item -> place before target
        placeAfter = false;
      }
      let newOrder;
      if (!placeAfter){
        const prev = arr[tgtIdx-1];
        if (prev && typeof prev.order === 'number'){
          newOrder = (prev.order + tgtOrder) / 2;
        } else {
          newOrder = tgtOrder - 1;
        }
      } else {
        const next = arr[tgtIdx+1];
        if (next && typeof next.order === 'number'){
          newOrder = (tgtOrder + next.order) / 2;
        } else {
          newOrder = tgtOrder + 1;
        }
      }
      await onMoveTask(taskId, tgtCol, newOrder);
      return;
    }
  
  } finally {
    setActiveId(null);
  }
}




  function addQuick(col){
    const color = colColors(col);
    if (col === TODAY_KEY) {
      db.tasks.add({
        title: "Nowe (dziś)", description: "", status: TODAY_KEY, color,
        createdAt: Date.now(), updatedAt: Date.now(),
        statusHistory: [], labels: [], priority: "Normal", checklist: [], order: Date.now(),
        remindAt: null, lastRemindedAt: null, projectId: (projectId || "default"), todayDate: ymd(Date.now())
      }).then(async (id)=>{ await db.timelogs.add({ taskId: id, start: Date.now(), end: null }); });
    } else {
      db.tasks.add({
        title: "Nowe zadanie", description: "", status: col, color,
        createdAt: Date.now(), updatedAt: Date.now(),
        statusHistory: [{ status: col, at: Date.now() }], labels: [], priority: "Normal", checklist: [], order: Date.now(),
        remindAt: null, lastRemindedAt: null, projectId: (projectId || "default")
      });
    }
  }

  function toggleCol(col){
    const n = new Set(collapsedCols);
    if (n.has(col)) n.delete(col); else n.add(col);
    setCollapsedCols(n);
  }

  const activeTask = activeId ? getTask(activeId.split(":")[1]) : null;

  return (
    <div className={classNames("pb-8", embedded ? "" : "px-5")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragStart={(e)=> setActiveId(String(e.active.id))}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {cols.map(col => {
            const collapsed = collapsedCols.has(col);
            const label = col === TODAY_KEY ? "Dzisiaj" : col;
            const color = colColors(col);
            if (collapsed) {
              return <CollapsedColumn key={col} color={color} label={label} onExpand={()=>toggleCol(col)} />;
            }
            return (
              <div key={col} className="rounded-2xl bg-slate-100/70 border border-slate-200 shadow-sm overflow-hidden flex flex-col w-[320px] flex-none">
                <div className="px-3 py-2 bg-white/80 backdrop-blur sticky top-0 z-10 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none" onDoubleClick={()=>toggleCol(col)} title="Podwójny klik: zwiń/rozwiń kolumnę">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{backgroundColor: color}} />
                    <div className="font-semibold text-slate-700">{label}</div>
                  </div>
                  <button
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50"
                    onClick={(e)=>{ e.stopPropagation(); addQuick(col); }}
                  >
                    {col===TODAY_KEY ? "Dodaj dziś" : "Dodaj"}
                  </button>
                </div>

                <SortableContext items={(byCol[col]||[]).map(t=>`task:${t.id}`)} strategy={verticalListSortingStrategy}>
                  <DroppableArea id={`col:${col}`} onEmptyClick={()=>addQuick(col)}>
                    <div className="p-2 py-2 space-y-2" onDoubleClick={(e)=>{ const el=e.target; const inCard = el && el.closest ? el.closest("[data-task-card]") : null; if(!inCard) addQuick(col); }} style={{minHeight: embedded ? "280px" : "calc(100vh - 220px)"}}>
                      {(byCol[col] || []).map(t => (
                        <SortableTask key={t.id} id={`task:${t.id}`} activeId={activeId}>
                          <TaskCard t={t} timelogs={timelogs} onOpen={()=>onOpen(t.id)} statuses={statuses} />
                        </SortableTask>
                      ))}
                    </div>
                  </DroppableArea>
                </SortableContext>
              </div>
            );
          })}
        </div>

{/* ...tuż przed zamknięciem <DndContext> */}
<DragOverlay dropAnimation={null}>
  {activeTask ? (
    <TaskCard t={activeTask} timelogs={timelogs} dragOverlay />
  ) : null}
</DragOverlay>

      </DndContext>
    </div>
  );
}

function CollapsedColumn({ color, label, onExpand }){
  return (
    <div className="w-[40px] flex-none bg-white/80 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-center cursor-pointer"
      title="Kliknij, aby rozwinąć"
      onClick={onExpand}
    >
      <div className="text-slate-600 text-xs font-medium" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{label}</div>
    </div>
  );
}

function DroppableArea({ id, onEmptyClick, children }){
  const { setNodeRef, isOver } = useDroppable({ id });
  function handleDbl(e){
    if (!onEmptyClick) return;
    const el = e.target;
    const inCard = el && el.closest ? el.closest('[data-task-card]') : null;
    if (!inCard) onEmptyClick();
  }
  return (
    <div ref={setNodeRef} className={classNames(isOver ? "outline outline-2 outline-slate-300/60 rounded-xl" : "")}>
      <div className="relative" onDoubleClick={handleDbl}>
        {children}
      </div>
    </div>
  );
}


function SortableTask({ id, children, activeId }){
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    animateLayoutChanges: (args) => {
      // Turn off the post-drop "return" animation
      if (args.isSorting || args.wasDragging || args.active?.id === id) return false;
      return defaultAnimateLayoutChanges(args);
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    // Keep transitions while dragging for smoothness, but disable once dropped
    transition: transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className={classNames("relative group", (isDragging || activeId === id) ? "opacity-0 pointer-events-none" : "opacity-100")}>
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition">
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        {children}
      </div>
    </div>
  );
}


// -------------------------
// Table / Today / Report
// -------------------------
function TableView({ tasks, timelogs, onOpen, statuses, projects }){
  return (
    <div className="px-5 pb-8">
      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Zadanie</th>
              <th className="text-left px-4 py-2">Projekt</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Priorytet</th>
              <th className="text-left px-4 py-2">Etykiety</th>
              <th className="text-left px-4 py-2">Termin</th>
              <th className="text-left px-4 py-2">Przypomnienie</th>
              <th className="text-left px-4 py-2">Czas</th>
              <th className="text-left px-4 py-2">Utworzone</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <button className="font-medium hover:underline" onClick={()=>onOpen(t.id)}>{t.title || "(bez nazwy)"}</button>
                </td>
                <td className="px-4 py-2">{projects.find(p=>p.id===t.projectId)?.name || "—"}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{backgroundColor: t.status===TODAY_KEY ? "#14b8a6" : (statuses.find(s=>s.key===t.status)?.color)}} />
                    {t.status===TODAY_KEY ? "Dzisiaj" : t.status}
                  </span>
                </td>
                <td className="px-4 py-2">{t.priority || "Normal"}</td>
                <td className="px-4 py-2 text-xs">{(t.labels||[]).join(", ")}</td>
                <td className="px-4 py-2">{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2">{t.remindAt ? new Date(t.remindAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-2">{msToHMS(sumTimeFor(t.id, timelogs))}</td>
                <td className="px-4 py-2">{new Date(t.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function sumTimeFor(taskId, logs){ let total=0; for(const l of logs){ if(l.taskId===taskId){ total += ((l.end||Date.now()) - l.start); }} return total; }


function TodayView({ tasks, timelogs, onOpen, projectId }){
  const todayStr = ymd(Date.now());
  const todays = tasks.filter(t => (t.status===TODAY_KEY) && t.todayDate===todayStr);

  const openByTask = useMemo(()=>{
    const map = new Map();
    for (const l of timelogs){ if (l.end == null) map.set(l.taskId, true); }
    return map;
  }, [timelogs]);

  const working = todays.filter(t => openByTask.get(t.id));
  const idle = todays.filter(t => !openByTask.get(t.id));

  const workingSorted = useMemo(() => [...working].sort((a,b)=>(a.order ?? 0) - (b.order ?? 0)), [working]);
  const idleSorted = useMemo(() => [...idle].sort((a,b)=>(a.order ?? 0) - (b.order ?? 0)), [idle]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [ activeId, setActiveId ] = useState(null);
  const activeDraggedTask = useMemo(() => {
    if (!activeId) return null;
    const parts = String(activeId).split(':');
    const id = Number(parts[1]);
    if (!Number.isFinite(id)) return null;
    return tasks.find(t => t.id === id) || null;
  }, [activeId, tasks]);

  async function startTimer(taskId){
    const opens = await db.timelogs.where("taskId").equals(taskId).and(l => l.end == null).toArray();
    for (const l of opens) await db.timelogs.update(l.id, { end: Date.now() });
    await db.timelogs.add({ taskId, start: Date.now(), end: null });
  }
  async function stopTimer(taskId){
    const opens = await db.timelogs.where("taskId").equals(taskId).and(l => l.end == null).toArray();
    for (const l of opens) await db.timelogs.update(l.id, { end: Date.now() });
  }

  
  async function handleDragEnd(evt){
    try {
      const { active, over } = evt;
      if (!over) { return; }
      const [typeA, idStrA] = String(active.id).split(":");
      const [typeB, idStrB] = String(over.id).split(":");
      if (typeA !== "task") { return; }
      const taskId = Number(idStrA);

      // Drop on section headers -> start/stop timer
      if (typeB === "today"){
        if (idStrB === "working") { await startTimer(taskId); return; }
        if (idStrB === "idle")    { await stopTimer(taskId);  return; }
      }

      if (typeB === "task"){
        const targetId = Number(idStrB);
        const activeInWorking = !!openByTask.get(taskId);
        const targetInWorking = !!openByTask.get(targetId);

        // Same section -> reorder
        if (activeInWorking === targetInWorking){
          const arr = activeInWorking ? workingSorted : idleSorted;
          const srcIdx = arr.findIndex(x => x.id === taskId);
          const tgtIdx = arr.findIndex(x => x.id === targetId);
          if (tgtIdx === -1) return;

          const tgtOrder = (arr[tgtIdx]?.order ?? Date.now());
          let placeAfter = true;
          if (srcIdx !== -1 && tgtIdx < srcIdx) placeAfter = false;

          let newOrder;
          if (!placeAfter){
            const prev = arr[tgtIdx-1];
            if (prev && typeof prev.order === 'number'){
              newOrder = (prev.order + tgtOrder) / 2;
            } else {
              newOrder = tgtOrder - 1;
            }
          } else {
            const next = arr[tgtIdx+1];
            if (next && typeof next.order === 'number'){
              newOrder = (tgtOrder + next.order) / 2;
            } else {
              newOrder = tgtOrder + 1;
            }
          }
          await db.tasks.update(taskId, { order: newOrder, updatedAt: Date.now() });
          return;
        }

        // Different sections -> toggle timer by target's section
        if (targetInWorking) { await startTimer(taskId); }
        else { await stopTimer(taskId); }
        return;
      }
    } finally {
      setActiveId(null);
    }
  }


  // Live summary
  useNow(1000);
  const dayStart = startOfDay(Date.now());
  const dayEnd = endOfDay(dayStart);
  const byTask = useMemo(()=>{
    const m = new Map();
    for (const l of timelogs){
      const dur = timeOnDay(l, dayStart, dayEnd);
      if (dur <= 0) continue;
      m.set(l.taskId, (m.get(l.taskId)||0) + dur);
    }
    return m;
  }, [timelogs, dayStart, dayEnd]);
  const summaryRows = todays.map(t => ({ task: t, ms: byTask.get(t.id)||0 }));
  const totalMs = summaryRows.reduce((s,r)=>s+r.ms,0);

  return (
    <div className="px-5 pb-8">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-5 w-5" />
        <div className="text-lg font-semibold">Dziś — {new Date().toLocaleDateString()}</div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e=>setActiveId(String(e.active.id))} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_360px] gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-100/60 border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <div className="font-semibold">Aktualnie pracuję</div>
                </div>
                <div className="text-xs text-slate-500">{working.length}</div>
              </div>
              <SortableContext items={workingSorted.map(t=>`task:${t.id}`)} strategy={verticalListSortingStrategy}>
                <DroppableArea id={`today:working`} onEmptyClick={()=>addQuick(TODAY_KEY)}>
                  <div className="p-2 py-4 space-y-2" onDoubleClick={(e)=>{ const el=e.target; const inCard = el && el.closest ? el.closest("[data-task-card]") : null; if(!inCard) addQuick(TODAY_KEY); }} style={{minHeight:"50vh"}}>
                    {workingSorted.map(t => (
                      <SortableTask key={t.id} id={`task:${t.id}`} activeId={activeId}>
                        <TaskCard t={t} timelogs={timelogs} onOpen={()=>onOpen(t.id)} />
                      </SortableTask>
                    ))}
                    {!working.length && <div className="text-sm text-slate-500 text-center py-6">Upuść tutaj, aby wystartować licznik</div>}
                  </div>
                </DroppableArea>
              </SortableContext>
            </div>

            <div className="rounded-2xl bg-slate-100/60 border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-slate-400" />
                  <div className="font-semibold">IDLE</div>
                </div>
                <div className="text-xs text-slate-500">{idle.length}</div>
              </div>
              <SortableContext items={idleSorted.map(t=>`task:${t.id}`)} strategy={verticalListSortingStrategy}>
                <DroppableArea id={`today:idle`} onEmptyClick={()=>addQuick(TODAY_KEY)}>
                  <div className="p-2 py-4 space-y-2" onDoubleClick={(e)=>{ const el=e.target; const inCard = el && el.closest ? el.closest("[data-task-card]") : null; if(!inCard) addQuick(TODAY_KEY); }} style={{minHeight:"50vh"}}>
                    {idleSorted.map(t => (
                      <SortableTask key={t.id} id={`task:${t.id}`} activeId={activeId}>
                        <TaskCard t={t} timelogs={timelogs} onOpen={()=>onOpen(t.id)} />
                      </SortableTask>
                    ))}
                    {!idle.length && <div className="text-sm text-slate-500 text-center py-6">Upuść tutaj, aby zatrzymać licznik</div>}
                  </div>
                </DroppableArea>
              </SortableContext>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm h-fit">
            <div className="px-4 py-2 border-b border-slate-200 text-slate-600 text-sm sticky top-0 bg-white/80 backdrop-blur">Czas dzisiaj</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2">Zadanie</th>
                  <th className="text-left px-4 py-2">Czas</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(r => (
                  <tr key={r.task.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{r.task.title || "(bez nazwy)"}</td>
                    <td className="px-4 py-2">{msToHMS(r.ms)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-4 py-2">Razem</td>
                  <td className="px-4 py-2">{msToHMS(totalMs)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

{/* ...tuż przed zamknięciem <DndContext> */}
<DragOverlay dropAnimation={null}>
  {activeDraggedTask ? (
    <TaskCard t={activeDraggedTask} timelogs={timelogs} dragOverlay />
  ) : null}
</DragOverlay>

      </DndContext>
    </div>
  );
}
// ---- Week helpers ----
function startOfWeekISO(ts){
  const d = new Date(ts);
  // Set to Monday
  const day = d.getDay(); // 0..6, Sun=0
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d.getTime();
}
function endOfWeekISO(ts){
  const s = startOfWeekISO(ts);
  const d = new Date(s);
  d.setDate(d.getDate() + 6);
  d.setHours(23,59,59,999);
  return d.getTime();
}
function isoWeekNumber(ts){
  // ISO week: Thursday-based
  const d = new Date(ts);
  d.setHours(0,0,0,0);
  // Thursday in current week decides the year.
  d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7));
  const week1 = new Date(d.getFullYear(),0,4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay()+6)%7)) / 7);
}
function addDays(ts, days){ const d=new Date(ts); d.setDate(d.getDate()+days); return d.getTime(); }
function fmtHHMM(ts){
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2,"0");
  const m = d.getMinutes().toString().padStart(2,"0");
  return `${h}:${m}`;
}


function WeeklyReportView({ anchorDateStr, setAnchorDateStr, tasks, timelogs, projects }){
  const anchorTs = startOfDay(new Date(anchorDateStr||ymd(Date.now())).getTime());
  const weekStart = startOfWeekISO(anchorTs);
  const weekEnd = endOfWeekISO(anchorTs);

  const days = Array.from({length:7}, (_,i)=>{
    const ds = addDays(weekStart, i);
    const dayStart = startOfDay(ds);
    const dayEnd = endOfDay(ds);
    // Logs that touch this day
    const logsDay = timelogs.filter(l => (l.end || Date.now()) >= dayStart && l.start <= dayEnd);
    // Map into visible rows (each time slice clipped to the day)
    const rows = [];
    let total = 0;
    for (const l of logsDay){
      const from = Math.max(l.start, dayStart);
      const to = Math.min(l.end || Date.now(), dayEnd);
      const dur = Math.max(0, to - from);
      if (dur <= 0) continue;
      const task = tasks.find(x=>x.id===l.taskId);
      rows.push({
        id: l.id || `${l.taskId}-${from}`,
        taskId: l.taskId,
        title: task?.title || "(bez nazwy)",
        projectId: task?.projectId,
        from, to, dur
      });
      total += dur;
    }
    // Sort rows by start time ascending
    rows.sort((a,b)=> a.from - b.from);
    return { dayStart, dayEnd, rows, total };
  });

  const weekTotal = days.reduce((s,d)=>s+d.total,0);
  const weekNo = isoWeekNumber(weekStart);
  // Collapsible days (default collapsed: Saturday & Sunday)
  const [collapsedDays, setCollapsedDays] = useState(()=> new Set([5,6])); // 0=Mon..6=Sun
  function toggleDay(i){
    const n = new Set(collapsedDays);
    if(n.has(i)) n.delete(i); else n.add(i);
    setCollapsedDays(n);
  }


  function moveWeek(delta){
    const d = new Date(anchorTs);
    d.setDate(d.getDate() + delta*7);
    setAnchorDateStr(ymd(d.getTime()));
  }

  return (
    <div className="max-w-full px-5 py-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-lg font-semibold">Raport tygodniowy</div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={()=>moveWeek(-1)}>← Poprzedni tydzień</button>
          <input type="date" value={anchorDateStr} onChange={e=>setAnchorDateStr(e.target.value)} className="px-2 py-1 rounded-lg border border-slate-300" title="Wybierz dzień w tygodniu" />
          <button className="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={()=>moveWeek(1)}>Następny tydzień →</button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 text-sm text-slate-600">
        <div>Zakres: <span className="font-mono">{fmtDateShort(weekStart)} — {fmtDateShort(weekEnd)}</span></div>
        <div>ISO tydzień: <span className="font-semibold">#{weekNo}</span></div>
        <div>Łącznie: <span className="font-mono">{msToHMS(weekTotal)}</span></div>
      </div>

      <div className="flex flex-row flex-wrap gap-4 items-stretch">
        {days.map((d,i)=>{
          const dateStr = fmtDateShort(d.dayStart);
          const dayLabel = new Date(d.dayStart).toLocaleDateString(undefined, { weekday: 'long' });
          if (collapsedDays.has(i)) { return <CollapsedDay key={i} label={dayLabel} onExpand={()=>toggleDay(i)} />; }
          return (
            <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm flex-[1_1_280px] min-w-[260px]">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between cursor-pointer select-none" onDoubleClick={()=>toggleDay(i)} onClick={()=>toggleDay(i)}>
                <div className="font-semibold">{dayLabel}</div>
                <div className="text-xs text-slate-500">{dateStr}</div>
              </div>
              <div className="p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-2 py-1 w-[45%]">Zadanie</th>
                      <th className="px-2 py-1 w-[35%]">Od — do</th>
                      <th className="px-2 py-1 w-[20%] text-right">Czas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.length ? d.rows.map(r => (
                      <tr key={r.id} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1">
                          <div className="line-clamp-2">{r.title}</div>
                        </td>
                        <td className="px-2 py-1 font-mono whitespace-nowrap">{fmtHHMM(r.from)} — {fmtHHMM(r.to)}</td>
                        <td className="px-2 py-1 text-right font-mono">{msToHMS(r.dur)}</td>
                      </tr>
                    )) : (
                      <tr><td className="px-2 py-2 text-slate-400 text-center" colSpan={3}>Brak wpisów</td></tr>
                    )}
                    {d.total > 0 && (
                      <tr className="border-t-2 border-slate-200 font-semibold">
                        <td className="px-2 py-2">Suma dnia</td>
                        <td></td>
                        <td className="px-2 py-2 text-right font-mono">{msToHMS(d.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



// -------------------------
// Reusable components
// -------------------------
function TopBar({
  view, setView, query, setQuery,
  project, setProject, projects,
  statusFilter, setStatusFilter, priorityFilter, setPriorityFilter, labelFilter, setLabelFilter,
  sortBy, setSortBy, statuses, hiddenCols, showToday,
  onAdd, onExport, onImport, onOpenSettings, onOpenColumns, onOpenProjects,
  notifGranted, onAskNotifications, onQuickAddToday
}){
  const fileRef = useRef(null);
  return (
    <div className="sticky top-0 z-20">
      <div className="backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="max-w-full px-5 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <Layers className="h-5 w-5" />
            <div className="font-semibold text-lg">TaskFlow (offline)</div>
          </div>

          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="pl-8 pr-2 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/40" placeholder="Szukaj…" value={query} onChange={e=>setQuery(e.target.value)} style={{width: 220}} />
          </div>

          <select className="px-2 py-1.5 rounded-xl border border-slate-300" value={project} onChange={e=>setProject(e.target.value)} title="Projekt">
            <option value="all">Wszystkie projekty</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="px-2 py-2 rounded-lg border border-slate-300 hover:bg-slate-100" title="Zarządzaj projektami" onClick={onOpenProjects}>
            <FolderClosed className="h-4 w-4" />
          </button>
          <button className="px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-2" onClick={()=>setView("calendar")} onClick={()=>setView("calendar")} title="Kalendarz">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Kalendarz</span>
          </button>

          <select className="px-2 py-1.5 rounded-xl border border-slate-300" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} title="Filtr statusu">
            <option value="all">Wszystkie statusy</option>
            {statuses.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
          </select>

          <select className="px-2 py-1.5 rounded-xl border border-slate-300" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} title="Filtr priorytetu">
            <option value="all">Wszystkie priorytety</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <Tag className="h-4 w-4 text-slate-400" />
            <input className="px-2 py-1.5 rounded-xl border border-slate-300" placeholder="Filtr etykiet…" value={labelFilter} onChange={e=>setLabelFilter(e.target.value)} style={{width:160}} />
          </div>

          <select className="px-2 py-1.5 rounded-xl border border-slate-300" value={sortBy} onChange={e=>setSortBy(e.target.value)} title="Sortuj">
            <option value="dueAsc">Termin ↑</option>
            <option value="updatedDesc">Aktualizacja ↓</option>
            <option value="priorityDesc">Priorytet ↓</option>
          </select>

          <button className={classNames("px-2 py-2 rounded-lg border", notifGranted ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-slate-300 hover:bg-slate-100")} title="Powiadomienia lokalne" onClick={onAskNotifications}>
            <Bell className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1 rounded-xl border border-slate-300 p-1">
            <button className={classNames("px-2 py-1 rounded-lg", view==='board' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')} onClick={()=>setView('board')} title="Tablica">Tablica</button>
            <button className={classNames("px-2 py-1 rounded-lg", view==='table' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')} onClick={()=>setView('table')} title="Tabela">Tabela</button>
            <button className={classNames("px-2 py-1 rounded-lg", view==='today' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')} onClick={()=>setView('today')} title="Dziś">Dziś</button>
            <button className={classNames("px-2 py-1 rounded-lg", view==='report' ? 'bg-slate-800 text-white' : 'hover:bg-slate-100')} onClick={()=>setView('report')} title="Raport">Raport</button>
          </div>

          <button className="inline-flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl shadow hover:opacity-90" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Nowe zadanie
          </button>
          <button className="inline-flex items-center gap-2 bg-emerald-700 text-white px-3 py-2 rounded-xl shadow hover:opacity-90" onClick={onQuickAddToday} title="Dodaj zadanie 'Dziś' (z auto-startem timera)">
            <Plus className="h-4 w-4" /> Dodaj dziś
          </button>

          <button className="px-2 py-2 rounded-lg border border-slate-300 hover:bg-slate-100" title="Ustawienia statusów" onClick={onOpenSettings}><Settings className="h-4 w-4" /></button>
          <button className="px-2 py-2 rounded-lg border border-slate-300 hover:bg-slate-100" title="Widoczne kolumny" onClick={onOpenColumns}><ColumnsIcon className="h-4 w-4" /></button>

          <div className="flex items-center gap-1 ml-1">
            <button className="px-2 py-2 rounded-lg border border-slate-300 hover:bg-slate-100" title="Eksportuj JSON" onClick={onExport}><Download className="h-4 w-4" /></button>
            <button className="px-2 py-2 rounded-lg border border-slate-300 hover:bg-slate-100" title="Importuj JSON" onClick={()=>fileRef.current?.click()}><Upload className="h-4 w-4" /></button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={e=>{ if(e.target.files?.[0]) onImport(e.target.files[0]); e.target.value=""; }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Due badge
function dueBadge(dueAt){ if(!dueAt) return null; const now=Date.now(); const day=24*3600*1000; const diff=dueAt-now; const cls=diff<0?"bg-rose-100 text-rose-700 border-rose-200": diff<day*2?"bg-amber-100 text-amber-700 border-amber-200":"bg-emerald-100 text-emerald-700 border-emerald-200"; const label=diff<0?"Po terminie": diff<day*2?"Wkrótce":"OK"; return <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>; }

function TaskCard({ t, timelogs, onOpen, statuses, dragOverlay }){
  const commentsArr = useLiveQuery(async()=> await db.comments.where("taskId").equals(t.id).toArray(), [t.id]) || [];
  const [showComments, setShowComments] = useState(false);
  const [miniText, setMiniText] = useState("");
  const commentsCount = commentsArr.length;
  const lastComment = commentsArr.length ? commentsArr.reduce((acc,c)=>!acc||(c.at>acc.at)?c:acc,null) : null;
  async function quickAddComment(){ const txt=prompt("Nowy komentarz:"); if(!txt) return; await db.comments.add({ id: Date.now(), taskId: t.id, text: txt.trim(), at: Date.now(), author: "You" }); await db.tasks.update(t.id, { updatedAt: Date.now() }); }
const task = t;
  const total = useTotalTimeForTask(t.id, timelogs);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title || "");
  useEffect(()=>{ setTitle(t.title || ""); }, [t.title]);
  async function save(){ setEditing(false); await db.tasks.update(t.id, { title, updatedAt: Date.now() }); }

  return (
    <div data-task-card onDoubleClick={(e)=>e.stopPropagation()} className={classNames(
      "rounded-xl border border-slate-200 bg-white p-3 transition relative",
      dragOverlay ? "shadow-2xl scale-[1.02] opacity-90" : "shadow-sm hover:shadow"
    )}>
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl" style={{backgroundColor: t.color}} />

      <div className="flex items-start gap-2">
        {!editing ? (
          <button className="text-left font-semibold leading-tight hover:underline flex-1" onDoubleClick={()=>setEditing(true)} onClick={onOpen} title="Kliknij, aby otworzyć; podwójny klik — edycja tytułu">
            {t.title || "(bez nazwy)"}
          </button>
        ) : (
          <input className="px-2 py-1 rounded-md border border-slate-300 flex-1" value={title} onChange={e=>setTitle(e.target.value)} onBlur={save} onKeyDown={e=>{ if(e.key==='Enter') save(); if(e.key==='Escape'){ setEditing(false); setTitle(t.title||""); } }} autoFocus />
        )}
        {!dragOverlay && <button className="p-1 rounded hover:bg-slate-100" title="Edytuj tytuł" onClick={()=>setEditing(true)}><Pencil className="h-4 w-4 text-slate-500" /></button>}
        <div className="ml-auto flex items-center gap-2">
          {dueBadge(t.dueAt)}
          <TimerMini taskId={t.id} />
        </div>
      </div>

      {t.description && !dragOverlay && <div className="text-xs text-slate-600 mt-1" style={{display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{t.description}</div>}

      {!dragOverlay && (
        <>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-slate-600"><CalendarDays className="h-3.5 w-3.5" /> {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "brak terminu"}</span>
              <span className="text-[11px] text-slate-500">⏱ {msToHMS(total)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded border border-slate-300">{t.priority || "Normal"}</span>
              <ColorDot task={t} />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1">
            
            <button className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1" onClick={()=>toggleTimerQuick(t.id)} title="Start/Stop licznika"><TimerIcon className="h-3.5 w-3.5" /> Timer</button>
            <button className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1" onClick={()=>{ if (!dragOverlay) setShowComments(v=>!v); }} title={lastComment ? (`${new Date(lastComment.at).toLocaleString()}:\n` + (lastComment.text || "")).slice(0,220) : "Pokaż/ukryj komentarze"}><MessageSquare className="h-3.5 w-3.5" /> {commentsCount}</button>
<button className="px-2 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1" onClick={()=>moveNextStatus(t.id, statuses)} title="Następny status"><CheckSquare className="h-3.5 w-3.5" /> Następny</button>
          </div>
        </>
      )}

          {/* always mounted to avoid DnD measurements flicker */(
            
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 transition-all duration-200" style={{maxHeight: (showComments && !dragOverlay) ? 220 : 0, opacity: (showComments && !dragOverlay) ? 1 : 0, overflow: "hidden"}}>
              <div className="space-y-1 max-h-40 overflow-auto pr-1">
                {commentsArr.slice(-5).map((c)=> (
                  <div key={c.id} className="text-[12px] text-slate-700">
                    <span className="text-slate-500">{new Date(c.at||Date.now()).toLocaleString()} — </span>
                    <span>{c.text}</span>
                  </div>
                ))}
                {!commentsArr.length && <div className="text-[12px] text-slate-500">Brak komentarzy</div>}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <input
                  className="flex-1 px-2 py-1 rounded-md border border-slate-300 text-sm"
                  placeholder="Napisz komentarz…"
                  value={miniText}
                  onChange={e=>setMiniText(e.target.value)}
                  onKeyDown={async e=>{
                    if(e.key==='Enter' && (miniText||'').trim()){
                      await db.comments.add({ id: Date.now(), taskId: t.id, text: miniText.trim(), at: Date.now(), author: "You" });
                      await db.tasks.update(t.id, { updatedAt: Date.now() });
                      setMiniText("");
                    }
                  }}
                />
                <button
                  className="px-2 py-1 rounded-md border border-slate-300 hover:bg-white text-xs"
                  onClick={async ()=>{
                    const v=(miniText||'').trim(); if(!v) return;
                    await db.comments.add({ id: Date.now(), taskId: t.id, text: v, at: Date.now(), author: "You" });
                    await db.tasks.update(t.id, { updatedAt: Date.now() });
                    setMiniText("");
                  }}
                >Dodaj</button>
              </div>
            </div>
          )}
    </div>
  );
}

async function quickAddChecklist(taskId){ const txt=prompt("Tekst pozycji checklisty:"); if(!txt) return; const t=await db.tasks.get(taskId); if(!t) return; const cl=Array.isArray(t.checklist)?[...t.checklist]:[]; cl.push({id:Date.now(), text:txt, done:false, at:Date.now(), children:[]}); await db.tasks.update(taskId, { checklist: cl, updatedAt: Date.now() }); }
async function toggleTimerQuick(taskId){ const open=await db.timelogs.where('taskId').equals(taskId).and(l => l.end == null).toArray(); if(open.length){ for(const l of open) await db.timelogs.update(l.id,{end:Date.now()}); } else { await db.timelogs.add({taskId, start:Date.now(), end:null}); } }
async function moveNextStatus(taskId, statuses){ const t=await db.tasks.get(taskId); if(!t) return; const idx=Math.max(0, statuses.findIndex(s=>s.key===t.status)); const next=statuses[Math.min(idx+1, statuses.length-1)]?.key || t.status; await updateStatus(taskId, next); }

function ColorDot({ task }){
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  useEffect(()=>{ function onDoc(e){ if(!popRef.current) return; if(!popRef.current.contains(e.target)) setOpen(false); } if(open) document.addEventListener("mousedown", onDoc); return ()=>document.removeEventListener("mousedown", onDoc); }, [open]);
  function onKey(e){ if(e.key==="Escape") setOpen(false); }
  return (
    <div className="relative" ref={popRef} onKeyDown={onKey}>
      <button className="h-6 w-6 rounded-md border border-slate-300 flex items-center justify-center hover:bg-slate-50" onClick={()=>setOpen(o=>!o)} title="Kolor zadania"><Palette className="h-4 w-4" /></button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-md shadow p-2 z-10">
          <input type="color" defaultValue={task.color || "#7c3aed"} onChange={e=>db.tasks.update(task.id, { color: e.target.value, updatedAt: Date.now() })} onBlur={()=>setOpen(false)} autoFocus />
        </div>
      )}
    </div>
  );
}

// -------------------------
// Task Modal (details, checklist, labels, timers)
// -------------------------
function TaskModal({ taskId, onClose, statuses, projects }){
  const task = useLiveQuery(()=>db.tasks.get(taskId), [taskId]);
  const logs = useLiveQuery(()=>db.timelogs.where('taskId').equals(taskId).toArray(), [taskId]) || [];
  const total = useTotalTimeForTask(taskId, logs);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [due, setDue] = useState(""); const [remind, setRemind] = useState(""); const [status, setStatus] = useState(""); const [color, setColor] = useState("#7c3aed");
  const [priority, setPriority] = useState("Normal"); const [labelText, setLabelText] = useState(""); const [projectId, setProjectId] = useState("default");
  const [clCollapsed, setClCollapsed] = useState(false);
  const [cmCollapsed, setCmCollapsed] = useState(false);
  const [clText, setClText] = useState("");
  const commentsCount = useLiveQuery(()=> db.comments.where('taskId').equals(taskId).count(), [taskId]) || 0;

  useEffect(()=>{
    if(task){
      setTitle(task.title||""); setDesc(task.description||"");
      setDue(ymd(task.dueAt)); setRemind(dtLocal(task.remindAt)); setStatus(task.status||"Backlog"); setColor(task.color||"#7c3aed");
      setPriority(task.priority||"Normal"); setProjectId(task.projectId || "default");
    }
  }, [taskId, task?.updatedAt]);

  if(!task) return null;

  async function saveBasic(fields){ await db.tasks.update(taskId, { ...fields, updatedAt: Date.now() }); }
  async function saveTitle(){ await saveBasic({ title }); }
  async function saveDesc(){ await saveBasic({ description: desc }); }
  async function saveDue(val){ setDue(val); await saveBasic({ dueAt: fromYmd(val) }); }
  async function saveRemind(val){ setRemind(val); await saveBasic({ remindAt: fromLocalDT(val), lastRemindedAt: null }); }
  async function saveColor(val){ setColor(val); await saveBasic({ color: val }); }
  async function changeStatus(val){ await updateStatus(taskId, val); setStatus(val); }
  async function changePriority(val){ setPriority(val); await saveBasic({ priority: val }); }
  async function changeProject(val){ setProjectId(val); await saveBasic({ projectId: val }); }

  async function removeTask(){ if(!confirm("Usunąć to zadanie i powiązane dane?")) return; await db.comments.where('taskId').equals(taskId).delete(); await db.timelogs.where('taskId').equals(taskId).delete(); await db.tasks.delete(taskId); onClose(); }

  async function addLabel(){ const v=labelText.trim(); if(!v) return; const current=task.labels||[]; await saveBasic({ labels: Array.from(new Set([...current, v])) }); setLabelText(""); }
  async function removeLabel(v){ const current=task.labels||[]; await saveBasic({ labels: current.filter(x=>x!==v) }); }

  async function addChecklistItem(parentId=null){
    const txt = (clText||"").trim(); if(!txt) return;
    const cl = deepClone(task.checklist || []);
    const item = { id: Date.now(), text: txt, done: false, at: Date.now(), children: [] };
    if(parentId){ insertChild(cl, parentId, item); } else { cl.push(item); }
    await saveBasic({ checklist: cl });
    setClText("");
  }
  
  async function addChecklistChild(parentId, txt){
    const t = (txt||"").trim(); if(!t) return;
    const cl = deepClone(task.checklist || []);
    const item = { id: Date.now(), text: t, done: false, at: Date.now(), children: [] };
    insertChild(cl, parentId, item);
    await saveBasic({ checklist: cl });
  }
async function toggleChecklist(id, done){ const cl=deepClone(task.checklist||[]); toggleItem(cl, id, done); await saveBasic({ checklist: cl }); }
  async function removeChecklist(id){ const cl=deepClone(task.checklist||[]); removeItem(cl, id); await saveBasic({ checklist: cl }); }

  const doneCount=countDone(task.checklist||[]); const totalCount=countTotal(task.checklist||[]); const progress=totalCount?Math.round(100*doneCount/totalCount):0;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <div className="h-3 w-3 rounded-full" style={{backgroundColor: color}} />
          <input className="flex-1 text-lg font-semibold bg-transparent focus:outline-none" value={title} onChange={e=>setTitle(e.target.value)} onBlur={saveTitle} placeholder="Tytuł zadania" />
          <button className="p-2 rounded-md hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-100">
          <label className="text-sm text-slate-600 flex flex-col gap-1"><span>Status</span><StatusSelect value={status} onChange={changeStatus} statuses={statuses} /></label>
          <label className="text-sm text-slate-600 flex flex-col gap-1"><span>Projekt</span>
            <select className="px-2 py-1 rounded-md border border-slate-300" value={projectId} onChange={e=>changeProject(e.target.value)}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600 flex flex-col gap-1"><span>Termin</span>
            <div className="flex items-center gap-2"><input type="date" value={due} onChange={e=>saveDue(e.target.value)} className="px-2 py-1 rounded-md border border-slate-300" />{dueBadge(fromYmd(due))}</div>
          </label>
          <label className="text-sm text-slate-600 flex flex-col gap-1"><span>Przypomnienie</span><input type="datetime-local" value={remind} onChange={e=>saveRemind(e.target.value)} className="px-2 py-1 rounded-md border border-slate-300" /></label>
          <label className="text-sm text-slate-600 flex flex-col gap-1"><span>Kolor</span>
            <div className="flex items-center gap-2"><input type="color" value={color} onChange={e=>saveColor(e.target.value)} /><span className="text-xs text-slate-500">{color}</span></div>
          </label>
          <label className="text-sm text-slate-600 flex flex-col gap-1"><span>Priorytet</span>
            <select className="px-2 py-1 rounded-md border border-slate-300" value={priority} onChange={e=>changePriority(e.target.value)}>{PRIORITIES.map(p=><option key={p} value={p}>{p}</option>)}</select>
          </label>
          <div className="text-sm text-slate-600"><div className="mb-1">Czas (łącznie)</div><div className="flex items-center gap-2"><TimerControls taskId={taskId} /><span className="font-mono text-slate-800">{msToHMS(total)}</span></div></div>
          <div className="text-sm text-slate-600"><div className="mb-1">Etykiety</div><LabelEditor task={task} labelText={labelText} setLabelText={setLabelText} addLabel={addLabel} removeLabel={removeLabel} /></div>
        </div>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
          <div>
            <div className="text-sm text-slate-600 mb-1">Opis</div>
            <textarea className="w-full h-36 rounded-lg border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-slate-400/30" value={desc} onChange={e=>setDesc(e.target.value)} onBlur={saveDesc} placeholder="Szczegóły, checklisty, linki…" />
            <div className="mt-6 text-sm text-slate-600 mb-2">Historia statusów</div>
        <div className="mt-3">
  <div className="text-sm text-slate-600 mb-1 px-0 flex items-center justify-between">
    <div className="inline-flex items-center gap-2">
      <button className="p-1 rounded hover:bg-slate-100" onClick={()=>setCmCollapsed(v=>!v)} title="Zwiń/rozwiń komentarze">
        <ChevronDown className={classNames("h-4 w-4 transition-transform", cmCollapsed ? "-rotate-90" : "rotate-0")} />
      </button>
      <MessageSquare className="h-4 w-4 text-slate-400" />
      <span>Komentarze</span>
      <span className="text-xs text-slate-400">{commentsCount}</span>
    </div>
  </div>
  <div className={cmCollapsed ? "hidden" : "px-0"}>
    <CommentsPanel taskId={taskId} hideHeader />
  </div>
</div>
            <StatusHistory entries={task.statusHistory || []} statuses={statuses} />
          </div>
          <div>
            <div className="text-sm text-slate-600 mb-1 flex items-center justify-between"><span>Checklist (z podzadaniami)</span></div>
              <div className="mt-2 flex items-center gap-2"><input className="flex-1 px-2 py-1 rounded-md border border-slate-300" placeholder="Tekst pozycji…" value={clText} onChange={e=>setClText(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addChecklistItem(null); } }} /><button className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50 text-sm" onClick={()=>addChecklistItem(null)} title="Dodaj pozycję"><Send className="h-4 w-4" /> Dodaj</button></div><div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2"><div className="h-full bg-emerald-500" style={{width:`${progress}%`}} /></div>
            <ChecklistTree items={task.checklist || []} onToggle={toggleChecklist} onRemove={removeChecklist} onAddChild={(id, txt)=>addChecklistChild(id, txt)} />
          </div>
        </div>


<div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4"><div>Utworzone: <span className="font-medium text-slate-700">{fmtDate(task.createdAt)}</span></div><div>Aktualizacja: <span className="font-medium text-slate-700">{fmtDate(task.updatedAt)}</span></div></div>
          <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={removeTask}><Trash2 className="h-4 w-4" /> Usuń</button>
        </div>
      </div>
    </div>
  );
}

function StatusSelect({ value, onChange, statuses }){ return (<select className="text-xs bg-white/80 border border-slate-300 rounded-md px-2 py-1" value={value} onChange={e=>onChange(e.target.value)}>{statuses.map(s=><option key={s.key} value={s.key}>{s.key}</option>)}</select>); }

function LabelEditor({ task, labelText, setLabelText, addLabel, removeLabel }){
  return (
    <div>
      <div className="flex items-center gap-2">
        <input className="flex-1 px-2 py-1 rounded-md border border-slate-300" placeholder="np. frontend, klient, pilne" value={labelText} onChange={e=>setLabelText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addLabel(); } }} />
        <button className="px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50" onClick={addLabel}>Dodaj</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {(task.labels||[]).map(l => (
          <span key={l} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-slate-100 border-slate-300 text-slate-600">
            {l}<button className="ml-1 text-slate-500 hover:text-slate-800" onClick={()=>removeLabel(l)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

async function updateStatus(taskId, newStatus){
  const t=await db.tasks.get(taskId); if(!t) return;
  const now=Date.now(); const hist=Array.isArray(t.statusHistory)?[...t.statusHistory]:[]; hist.push({status:newStatus, at:now});
  await db.tasks.update(taskId, { status:newStatus, statusHistory:hist, updatedAt: now });
  const open=await db.timelogs.where('taskId').equals(taskId).and(l => l.end == null).toArray(); for(const l of open) await db.timelogs.update(l.id, { end: Date.now() });
}

function StatusHistory({ entries, statuses }){ if(!entries?.length) return <div className="text-xs text-slate-500">Brak danych</div>; return (<div className="space-y-1 text-xs">{[...entries].reverse().map((e,i)=>(<div key={i} className="flex items-center gap-2"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{backgroundColor: statuses.find(s=>s.key===e.status)?.color}} /><span className="font-medium">{e.status}</span></span><span className="text-slate-500">{fmtDate(e.at)}</span></div>))}</div>); }

function TimerControls({ taskId }){
  const openLog = useLiveQuery(async()=>{ const arr=await db.timelogs.where('taskId').equals(taskId).and(l => l.end == null).toArray(); return arr[0]||null; }, [taskId]);
  async function start(){ const opens=await db.timelogs.where('taskId').equals(taskId).and(l => l.end == null).toArray(); for(const l of opens) await db.timelogs.update(l.id, { end: Date.now() }); await db.timelogs.add({ taskId, start: Date.now(), end: null }); }
  async function stop(){ const open=await db.timelogs.where('taskId').equals(taskId).and(l => l.end == null).toArray(); for(const l of open) await db.timelogs.update(l.id, { end: Date.now() }); }
  return (<div className="inline-flex items-center gap-2">{openLog ? (<button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50" onClick={stop} title="Zatrzymaj licznik"><Square className="h-3.5 w-3.5" /> Stop</button>) : (<button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50" onClick={start} title="Start licznika"><Play className="h-3.5 w-3.5" /> Start</button>)}</div>);
}
function TimerMini({ taskId }){ const open=useLiveQuery(async()=>{ const arr=await db.timelogs.where('taskId').equals(taskId).and(l => l.end == null).toArray(); return arr[0]||null; }, [taskId]); return (<div className={classNames("inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border", open ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-slate-300 text-slate-500 bg-slate-50")} title={open ? "Licznik włączony" : "Licznik wyłączony"}><TimerIcon className="h-3.5 w-3.5" /> {open ? "ON" : "OFF"}</div>); }

// -------------------------
// Checklist helpers
// -------------------------
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
function toggleItem(arr, id, done){ for(const it of arr){ if(it.id===id){ it.done=done; if(Array.isArray(it.children)) for(const ch of it.children) toggleItem([ch], ch.id, done); } else if(it.children?.length) toggleItem(it.children, id, done); } function fixParent(a){ for(const it of a){ if(it.children?.length){ fixParent(it.children); const all=it.children.every(c=>c.done); const none=it.children.every(c=>!c.done); if(all) it.done=true; else if(none) it.done=false; } } } fixParent(arr); }
function removeItem(arr, id){ const idx=arr.findIndex(i=>i.id===id); if(idx>=0){ arr.splice(idx,1); return true; } for(const it of arr) if(it.children?.length && removeItem(it.children, id)) return true; return false; }
function insertChild(arr, parentId, child){ for(const it of arr){ if(it.id===parentId){ it.children=it.children||[]; it.children.push(child); return true; } if(it.children?.length && insertChild(it.children, parentId, child)) return true; } return false; }
function countTotal(arr){ let n=0; for(const it of arr){ n++; if(it.children?.length) n+=countTotal(it.children); } return n; }
function countDone(arr){ let n=0; for(const it of arr){ if(it.done) n++; if(it.children?.length) n+=countDone(it.children); } return n; }
function ChecklistTree({ items, onToggle, onRemove, onAddChild }){
  const [open, setOpen] = useState({});
  const [textById, setTextById] = useState({});
  function setOpenFor(id, val){ setOpen(o=>({ ...o, [id]: !!val })); }
  function setTextFor(id, v){ setTextById(m=>({ ...m, [id]: v })); }
  function submit(id){ const t=(textById[id]||"").trim(); if(!t) return; onAddChild(id, t); setTextFor(id,""); setOpenFor(id,false); }
  if(!Array.isArray(items) || items.length===0) return (<div className="text-xs text-slate-500">Brak pozycji</div>);
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id}>
          <div className={"flex items-center gap-2" + (item.done?" opacity-60":"")}>
            <input type="checkbox" className="rounded" checked={!!item.done} onChange={e=>onToggle(item.id, e.target.checked)} />
            <div className={"flex-1" + (item.done?" line-through text-slate-400":"")}>{item.text}</div>
            <button className="px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50 text-xs" onClick={()=>setOpenFor(item.id, !open[item.id])}>Dodaj podzadanie</button>
            <button className="px-2 py-1 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs" onClick={()=>onRemove(item.id)}>Usuń</button>
          </div>
          {open[item.id] && (
            <div className="flex items-center gap-2 ml-6 mt-1">
              <input className="flex-1 px-2 py-1 rounded-md border border-slate-300" placeholder="Tekst podzadania…" value={textById[item.id]||""} onChange={e=>setTextFor(item.id, e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); submit(item.id); } }} />
              <button className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50 text-sm" onClick={()=>submit(item.id)}>
                <Send className="h-4 w-4" /> Dodaj
              </button>
            </div>
          )}
          {!!(item.children||[]).length && (
            <div className="border-l border-slate-200 ml-6 pl-2 mt-1">
              <ChecklistTree items={item.children} onToggle={onToggle} onRemove={onRemove} onAddChild={onAddChild} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// -------------------------

// Modals: Settings / Columns / Projects
// -------------------------
function SettingsModal({ statuses, onClose }){
  const [list, setList] = useState(statuses);
  function update(i, patch){ const next=[...list]; next[i] = { ...next[i], ...patch }; setList(next); }
  async function save(){ await setStatuses(list.filter(s=>s.key.trim())); onClose(); }
  function add(){ setList([...list, { key: "New", color: "#64748b" }]); }
  function remove(i){ const next=[...list]; next.splice(i,1); setList(next); }
  function up(i){ if(i<=0) return; const next=[...list]; [next[i-1], next[i]]=[next[i], next[i-1]]; setList(next); }
  function down(i){ if(i>=list.length-1) return; const next=[...list]; [next[i+1], next[i]]=[next[i], next[i+1]]; setList(next); }
  return (
    <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={onClose} /><div className="absolute inset-0 flex items-center justify-center p-4"><div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200"><div className="p-4 border-b border-slate-200 flex items-center justify-between"><div className="font-semibold">Ustawienia statusów</div><button className="p-2 rounded-md hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button></div><div className="p-4 space-y-2 max-h-[60vh] overflow-auto">{list.map((s,i)=>(<div key={i} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2"><button onClick={()=>up(i)} title="w górę">↑</button><button onClick={()=>down(i)} title="w dół">↓</button><input className="px-2 py-1 rounded-md border border-slate-300 flex-1" value={s.key} onChange={e=>update(i,{key:e.target.value})} /><input type="color" value={s.color} onChange={e=>update(i,{color:e.target.value})} /><button className="px-2 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={()=>remove(i)}>Usuń</button></div>))}<button className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={add}>Dodaj status</button></div><div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2"><button className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={onClose}>Anuluj</button><button className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:opacity-90" onClick={save}>Zapisz</button></div></div></div></div>
  );
}

function ColumnsModal({ statuses, onClose }){
  const hiddenColsDoc = useLiveQuery(() => db.settings.get("hiddenColumns"), []);
  const showTodayDoc = useLiveQuery(() => db.settings.get("showToday"), []);
  const [enabledToday, setEnabledToday] = useState(!!(showTodayDoc?.value ?? true));
  const [hidden, setHidden] = useState(new Set(hiddenColsDoc?.value || []));
  function toggle(k){ const n=new Set(hidden); if(n.has(k)) n.delete(k); else n.add(k); setHidden(n); }
  async function save(){ await setHiddenCols([...hidden]); await setShowToday(enabledToday); onClose(); }
  return (
    <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={onClose} /><div className="absolute inset-0 flex items-center justify-center p-4"><div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200"><div className="p-4 border-b border-slate-200 flex items-center justify-between"><div className="font-semibold">Widoczność kolumn</div><button className="p-2 rounded-md hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button></div><div className="p-4 space-y-2"><label className="flex items-center gap-2"><input type="checkbox" checked={enabledToday} onChange={e=>setEnabledToday(e.target.checked)} /> Pokaż kolumnę „Dzisiaj”</label><div className="text-xs text-slate-500">Odznacz kolumny, które chcesz ukryć:</div>{statuses.map(s=>(<label key={s.key} className="flex items-center gap-2"><input type="checkbox" checked={!hidden.has(s.key)} onChange={()=>toggle(s.key)} /> {s.key}</label>))}</div><div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2"><button className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={onClose}>Anuluj</button><button className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:opacity-90" onClick={save}>Zapisz</button></div></div></div></div>
  );
}

function ProjectsModal({ projects, onClose }){
  const [list, setList] = useState(projects);
  const [newName, setNewName] = useState("");
  function setItem(i, patch){ const next=[...list]; next[i]={...next[i], ...patch}; setList(next); }
  function add(){ const name=newName.trim(); if(!name) return; const id = name.toLowerCase().replace(/\s+/g,'-') + "-" + Date.now().toString(36); setList([...list, { id, name, color: "#0ea5e9" }]); setNewName(""); }
  function remove(i){ const next=[...list]; next.splice(i,1); setList(next); }
  async function save(){ await setProjects(list); onClose(); }
  return (
    <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/40" onClick={onClose} /><div className="absolute inset-0 flex items-center justify-center p-4"><div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200"><div className="p-4 border-b border-slate-200 flex items-center justify-between"><div className="font-semibold">Projekty</div><button className="p-2 rounded-md hover:bg-slate-100" onClick={onClose}><X className="h-5 w-5" /></button></div><div className="p-4 space-y-3 max-h-[60vh] overflow-auto">{list.map((p,i)=>(<div key={p.id} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2"><input className="px-2 py-1 rounded-md border border-slate-300 flex-1" value={p.name} onChange={e=>setItem(i,{name:e.target.value})} /><input type="color" value={p.color} onChange={e=>setItem(i,{color:e.target.value})} /><button className="px-2 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50" onClick={()=>remove(i)}>Usuń</button></div>))}<div className="flex items-center gap-2"><input className="px-2 py-1 rounded-md border border-slate-300 flex-1" placeholder="Nazwa nowego projektu" value={newName} onChange={e=>setNewName(e.target.value)} /><button className="px-2 py-1 rounded-md border border-slate-300 hover:bg-slate-50" onClick={add}><FolderPlus className="h-4 w-4" /> Dodaj</button></div></div><div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2"><button className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={onClose}>Anuluj</button><button className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:opacity-90" onClick={save}>Zapisz</button></div></div></div></div>
  );
}


// -------------------------
// Comments Panel

function CollapsedDay({ label, onExpand }){
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-center hover:bg-slate-50 cursor-pointer flex-[0_0_40px] w-[40px] min-w-[40px] max-w-[40px] select-none"
         onClick={onExpand} title={label}>
      <div className="text-slate-400 text-xs font-medium" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
        {label}
      </div>
    </div>
  );
}

// -------------------------
function CommentsPanel({ taskId, hideHeader=false }){
  const comments = useLiveQuery(async () => {
    const arr = await db.comments.where('taskId').equals(taskId).toArray();
    return arr.sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0) || (b.at||0)-(a.at||0));
  }, [taskId]) || [];

  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState("");

  function fmt(ts){ try { return new Date(ts).toLocaleString(); } catch { return ""; } }

  async function add(){
    const t = text.trim(); if(!t) return;
    await db.comments.add({ id: Date.now(), taskId, text: t, at: Date.now(), author: "You", pinned: false });
    setText("");
    await db.tasks.update(taskId, { updatedAt: Date.now() });
  }
  async function remove(id){ if(!confirm("Usunąć komentarz?")) return; await db.comments.delete(id); }
  async function togglePin(id, val){ await db.comments.update(id, { pinned: !!val }); }
  function startEdit(c){ setEditingId(c.id); setEditVal(c.text || ""); }
  async function saveEdit(){ const v = (editVal||"").trim(); if(!v) return; await db.comments.update(editingId, { text: v, at: Date.now() }); setEditingId(null); setEditVal(""); }
  function onKey(e){ if ((e.key === "Enter") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }
  function renderText(t){ const parts = String(t||"").split(/(\B@[a-zA-Z0-9._-]+)/g); return parts.map((p,i)=> p.startsWith("@") ? <span key={i} className="bg-yellow-100 px-0.5 rounded">{p}</span> : <span key={i}>{p}</span> ); }

  
return (
  <div className="w-full">
    {/* input first */}
    <div className="mb-2">
      <textarea
        value={text}
        onChange={e=>setText(e.target.value)}
        onKeyDown={onKey}
        className="w-full max-w-none h-20 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/30 text-sm"
        placeholder="Napisz komentarz… (Ctrl/⌘+Enter – dodaj)"
      />
      <div className="mt-1 flex items-center justify-end">
        <button
          className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50 text-sm"
          onClick={add}
          title="Dodaj komentarz"
        >
          <Send className="h-4 w-4" /> Dodaj
        </button>
      </div>
    </div>

    {/* list below; scrollable so input stays in place */}
    <div className="space-y-2 pr-1 h-96 overflow-auto" id="comments-list">
      {comments.length === 0 && (<div className="text-xs text-slate-500">Brak komentarzy</div>)}
      {comments.map(c => (
        <div key={c.id} className={"w-full rounded-md p-2 " + (c.pinned ? "bg-amber-50" : "bg-transparent")}>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
            <span className="font-medium text-slate-700">{c.author || "—"}</span>
            <span>•</span>
            <span>{fmt(c.at)}</span>
            {c.pinned && <span className="ml-2 text-amber-600">przypięty</span>}
            <span className="ml-auto flex items-center gap-2">
              {editingId === c.id ? (
                <>
                  <button className="text-emerald-600 hover:text-emerald-800" onClick={saveEdit} title="Zapisz">Zapisz</button>
                  <button className="text-slate-500 hover:text-slate-800" onClick={()=>setEditingId(null)} title="Anuluj">Anuluj</button>
                </>
              ) : (
                <>
                  <button className="text-slate-600 hover:text-slate-800" onClick={()=>startEdit(c)} title="Edytuj">Edytuj</button>
                  <button className="text-rose-600 hover:text-rose-800" onClick={()=>remove(c.id)} title="Usuń">Usuń</button>
                </>
              )}
            </span>
          </div>

          {editingId === c.id ? (
            <textarea className="w-full rounded border border-slate-300 text-sm" value={editVal} onChange={e=>setEditVal(e.target.value)} rows={3} />
          ) : (
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{renderText(c.text || "")}</div>
          )}
        </div>
      ))}
    </div>
  </div>
);
}