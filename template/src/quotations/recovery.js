const prefix = userId => `solarflow:quotation:${userId}:`;
export const recoveryKey = (userId,id) => prefix(userId) + id;
export function readRecovery(userId,id) {
    try { return JSON.parse(localStorage.getItem(recoveryKey(userId,id)) || 'null'); } catch { return null; }
}
export function writeRecovery(userId,id,copy) {
    try { localStorage.setItem(recoveryKey(userId,id),JSON.stringify({ ...copy,saved_locally_at:new Date().toISOString() })); return true; } catch { return false; }
}
export function removeRecovery(userId,id) { try { localStorage.removeItem(recoveryKey(userId,id)); } catch { /* Storage disabled. */ } }
export function recoveries(userId) {
    try { return Object.keys(localStorage).filter(k => k.startsWith(prefix(userId))).map(k => ({ id:k.slice(prefix(userId).length),...JSON.parse(localStorage.getItem(k)) })); } catch { return []; }
}
