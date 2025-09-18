export function yyyy_mm_dd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function monthYear(d = new Date()) {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
