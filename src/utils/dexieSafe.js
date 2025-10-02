
export function isValidKey(key) {
  const t = typeof key;
  return key instanceof Date || t === 'string' || t === 'number' || Array.isArray(key) && key.every(isValidKey);
}

// Use ONLY when you're sure 'key' is valid (string | number | Date | array of those).
// Otherwise, call .filter(...) instead of .equals(...).
export async function safeEquals(collection, key) {
  if (!isValidKey(key)) return [];
  return collection.equals(key).toArray();
}
