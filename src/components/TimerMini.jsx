
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db.js';

function isValidKey(key) {
  return key instanceof Date || ['string', 'number'].includes(typeof key);
}

export default function TimerMini({ taskId }) {
  const openLog = useLiveQuery(async () => {
    if (!isValidKey(taskId)) return null;

    // Query by taskId (valid key), then filter end == null in JS.
    return db.timelogs
      .where('taskId')
      .equals(taskId)
      .filter(r => r.end == null)
      .first();
  }, [taskId]);

  if (!isValidKey(taskId)) return null;

  const running = !!openLog;
  return (
    <span title={running ? 'Timer running' : 'Timer stopped'}>
      {running ? '● rec' : '○ idle'}
    </span>
  );
}
