export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const inr = (n: number | null | undefined) =>
  n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');

export const duration = (sec: number | null) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const todayKey = () => dayKey(new Date().toISOString());

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const shortDate = (key: string) =>
  new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const relative = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return dateTime(iso);
};

export const callerLabel = (c: { callerName: string | null; companyName: string | null; phone: string | null }) =>
  c.callerName || c.companyName || c.phone || 'Unknown caller';

export const fileSize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
