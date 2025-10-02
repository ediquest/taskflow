
import React from 'react';

export default function TaskCard(props) {
  // Accept either 'task' or legacy 't' prop to avoid 'task is not defined' crashes
  const task = props.task ?? props.t;
  const t = task;
  const { onOpen, onToggle, onStartTimer } = props;

  if (!task) return null; // hard guard – do not render broken card

  const handleOpen = () => onOpen?.(t);
  const handleToggle = () => onToggle?.(t);
  const handleStart = () => onStartTimer?.(t);

  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2 bg-white">
      <div className="flex items-center justify-between">
        <button onClick={handleOpen} className="text-left font-medium truncate">
          {t.title ?? '(bez tytułu)'}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleToggle} title="Toggle done">
            {t.done ? '✅' : '⬜'}
          </button>
          <button onClick={handleStart} title="Start timer">⏱️</button>
        </div>
      </div>
      {t.description && <p className="text-sm text-gray-500 line-clamp-3">{t.description}</p>}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {t.projectId && <span>proj: {String(t.projectId)}</span>}
        {t.status && <span>• {t.status}</span>}
      </div>
    </div>
  );
}
