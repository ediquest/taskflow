// src/db.js
import Dexie from 'dexie';

export const db = new Dexie('TaskDB');

// Zwiększ wersję przy zmianach indeksów
db.version(3).stores({
  // najczęściej używane pola dodane do indeksów dla where() / sortowania
  tasks: '++id, status, dueAt, createdAt, updatedAt, color, order, projectId, todayDate',
  comments: '++id, taskId, at',
  timelogs: '++id, taskId, end',
  settings: 'key'
});

export default db;
