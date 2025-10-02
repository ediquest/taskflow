import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db.js";
import { MessageSquare, X } from "lucide-react";

/* ---------- utils ---------- */
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dateKeyToTaskId(dateStr) {
  try { return -parseInt(dateStr.replaceAll("-", ""), 10); } catch { return NaN; }
}

/* ---------- panel komentarzy „jak na kafelkach” ale przypięty do dnia ---------- */
function DayCommentsPanel({ dateStr }) {
  const fakeTaskId = dateKeyToTaskId(dateStr);
  const comments = useLiveQuery(async () => {
    if (!fakeTaskId) return [];
    const arr = await db.comments.where("taskId").equals(fakeTaskId).toArray();
    return arr.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.at || 0) - (a.at || 0));
  }, [fakeTaskId]) || [];

  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const fmt = ts => { try { return new Date(ts).toLocaleString(); } catch { return ""; } };

  async function add() {
    const t = text.trim(); if (!t || !fakeTaskId) return;
    await db.comments.add({ id: Date.now(), taskId: fakeTaskId, text: t, at: Date.now(), author: "You", pinned: false });
    setText("");
  }
  async function remove(id) { await db.comments.delete(id); }
  async function togglePin(c) { await db.comments.update(c.id, { pinned: !c.pinned }); }
  async function saveEdit() {
    const v = editVal.trim(); if (!v) { setEditingId(null); return; }
    await db.comments.update(editingId, { text: v });
    setEditingId(null);
  }

  return (
    <div className="w-full">
      <div className="mb-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
          placeholder="Dodaj komentarz do tego dnia…"
          rows={3}
        />
        <div className="mt-1 flex items-center justify-end">
          <button className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50 text-sm" onClick={add}>
            Dodaj
          </button>
        </div>
      </div>

      <div className="space-y-2 pr-1 h-96 overflow-auto">
        {comments.length === 0 && (<div className="text-xs text-slate-500">Brak komentarzy</div>)}
        {comments.map(c => (
          <div key={c.id} className="rounded border border-slate-200 p-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div>{fmt(c.at)}</div>
              <div className="inline-flex items-center gap-2">
                <button
                  className={"text-[10px] px-1.5 py-0.5 rounded border " + (c.pinned ? "bg-amber-100 border-amber-300" : "border-slate-300")}
                  onClick={() => togglePin(c)}
                >
                  {c.pinned ? "Odepnij" : "Przypnij"}
                </button>
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300"
                  onClick={() => { setEditingId(c.id); setEditVal(c.text || ""); }}
                >
                  Edytuj
                </button>
                <button className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300" onClick={() => remove(c.id)}>Usuń</button>
              </div>
            </div>
            {editingId === c.id ? (
              <div className="mt-1">
                <textarea className="w-full rounded border border-slate-300 p-2 text-sm" value={editVal} onChange={e => setEditVal(e.target.value)} rows={3} />
                <div className="mt-1 flex items-center gap-2 justify-end">
                  <button className="text-[12px] px-2 py-1 rounded border border-slate-300" onClick={() => setEditingId(null)}>Anuluj</button>
                  <button className="text-[12px] px-2 py-1 rounded bg-slate-900 text-white" onClick={saveEdit}>Zapisz</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{c.text || ""}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- główny widok kalendarza (z DnD) ---------- */
export default function CalendarPage({ tasks = [], onOpenTask }) {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [commentCounts, setCommentCounts] = useState({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayStr = ymd(new Date());

  const days = useMemo(() => {
    // 6 tygodni (42 komórki), siatka od poniedziałku
    const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const startWeekDay = (firstDay.getDay() + 6) % 7; // Pon=0
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startWeekDay);
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [anchor]);

  // Ładowanie liczby komentarzy per dzień — MUSI być po deklaracji `days`
  useEffect(() => {
    (async () => {
      try {
        const map = {};
        for (const d of days) {
          const key = ymd(d);
          const fakeId = dateKeyToTaskId(key);
          const cnt = await db.comments.where("taskId").equals(fakeId).count();
          map[key] = cnt;
        }
        setCommentCounts(map);
      } catch { }
    })();
  }, [days]);

  function setMonthYear(monthIdx, year) {
    const d = new Date(anchor);
    d.setFullYear(year);
    d.setMonth(monthIdx);
    setAnchor(d);
  }
  function openPanelFor(dateStr) { setSelectedDate(dateStr); setPanelOpen(true); }

  async function moveTaskToDate(taskId, dateStr) {
    if (!taskId || !dateStr) return;
    try {
      const ts = new Date(dateStr + "T00:00:00").getTime();
      await db.tasks.update(taskId, { dueDate: ts });
    } catch { }
  }

  const tasksByDay = useMemo(() => {
    const map = {};
    for (const t of tasks || []) {
      const due = t?.dueDate;
      if (!due) continue;
      let dateStr = null;
      if (typeof due === "number") {
        const d = new Date(due);
        dateStr = ymd(d);
      } else if (typeof due === "string") {
        const d = new Date(due.length <= 10 ? due + "T00:00:00" : due);
        if (!isNaN(+d)) dateStr = ymd(d);
      }
      if (!dateStr) continue;
      (map[dateStr] ||= []).push(t);
    }
    return map;
  }, [tasks]);

  const monthOptions = Array.from({ length: 12 }).map((_, i) => ({ label: new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" }), value: i }));
  const yearNow = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }).map((_, i) => yearNow - 5 + i);

  return (
    <div className="px-4 py-4 relative max-w-6xl mx-auto">
      {/* nagłówek */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <select
            className="px-2 py-1 border rounded-md bg-white"
            value={anchor.getMonth()}
            onChange={(e) => setMonthYear(parseInt(e.target.value, 10), anchor.getFullYear())}
          >
            {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select
            className="px-2 py-1 border rounded-md bg-white"
            value={anchor.getFullYear()}
            onChange={(e) => setMonthYear(anchor.getMonth(), parseInt(e.target.value, 10))}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="opacity-60 text-sm">{monthLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 border rounded-md" onClick={() => setMonthYear(anchor.getMonth() - 1, anchor.getFullYear())}>←</button>
          <button className="px-2 py-1 border rounded-md" onClick={() => setMonthYear(anchor.getMonth() + 1, anchor.getFullYear())}>→</button>
        </div>
      </div>

      {/* grid z numerami tygodni */}
      <div className="grid grid-cols-[3rem,repeat(7,1fr)] gap-2 text-sm select-none">
        <div className="text-center font-medium">#</div>
        {["Pn", "Wt", "Śr", "Czw", "Pt", "So", "Nd"].map(d => (
          <div key={d} className="text-center font-medium">{d}</div>
        ))}

        {Array.from({ length: 6 }).map((_, weekIdx) => {
          const weekDays = days.slice(weekIdx * 7, weekIdx * 7 + 7);
          const wk = isoWeekNumber(weekDays[0]);
          return (
            <React.Fragment key={weekIdx}>
              <div className="text-center font-semibold bg-slate-50 rounded">{wk}</div>
              {weekDays.map((d, i) => {
                const inMonth = d.getMonth() === anchor.getMonth();
                const key = ymd(d);
                const dayTasks = tasksByDay[key] || [];
                const commentsCnt = commentCounts[key] || 0;
                const hasComments = commentsCnt > 0;
                const isToday = key === todayStr;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => openPanelFor(key)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverDate(key); }}
                    onDragLeave={() => setDragOverDate(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = parseInt(e.dataTransfer.getData("text/plain"), 10) || dragTaskId;
                      setDragOverDate(null);
                      moveTaskToDate(id, key);
                    }}
                    className={
                      "group text-left min-h-[120px] p-3 rounded-xl border w-full transition-all duration-150 " +
                      (inMonth ? "bg-gradient-to-b from-white to-slate-50" : "bg-slate-50 opacity-80") + " " +
                      (isToday ? "border-green-500 ring-1 ring-green-300" : "border-slate-200") + " " +
                      (isWeekend ? "bg-slate-50" : "") + " " +
                      (dragOverDate === key ? "ring-2 ring-blue-300 border-blue-400" : "") + " " +
                      "hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300"
                    }
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={"text-lg md:text-xl font-semibold tracking-tight " + (isWeekend ? "text-slate-700" : "text-slate-900")}>{d.getDate()}</span>
                      <div className="flex items-center gap-1">
                        {hasComments && (
                          <div className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 inline-flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" /> {commentsCnt}
                          </div>
                        )}
                        {!!dayTasks.length && (
                          <div className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            zad: {dayTasks.length}
                          </div>
                        )}
                      </div>
                    </div>

                    {!!dayTasks.length && (
                      <ul className="space-y-0.5">
                        {dayTasks.slice(0, 3).map(t => (
                          <li
                            key={t.id}
                            title={t.title}
                            className="text-[11px] truncate group-hover:text-slate-900"
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(t.id)); setDragTaskId(t.id); }}
                          >
                            • {t.title}
                          </li>
                        ))}
                        {dayTasks.length > 3 && (
                          <li className="text-[10px] opacity-60">+ {dayTasks.length - 3} więcej…</li>
                        )}
                      </ul>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {/* panel boczny */}
      {panelOpen && (
        <div className="fixed inset-0 z-[1000]">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPanelOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[380px] bg-white shadow-xl border-l border-slate-200 flex flex-col">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold">Dzień — {selectedDate}</div>
              <button className="p-1 rounded hover:bg-slate-100" onClick={() => setPanelOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 space-y-4 flex-1 overflow-auto">
              <DayCommentsPanel dateStr={selectedDate} />
              <div>
                <div className="text-sm font-medium mb-2">Zadania tego dnia</div>
                <ul className="space-y-1">
                  {(tasksByDay[selectedDate] || []).map(t => (
                    <li
                      key={t.id}
                      className="text-sm flex items-center justify-between gap-2"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(t.id)); setDragTaskId(t.id); }}
                    >
                      <span className="truncate" title={t.title}>• {t.title}</span>
                      {onOpenTask && (
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50"
                          onClick={() => onOpenTask(t.id)}
                        >
                          Otwórz
                        </button>
                      )}
                    </li>
                  ))}
                  {!(tasksByDay[selectedDate] || []).length && (
                    <li className="text-xs text-slate-500">Brak zadań na ten dzień.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}