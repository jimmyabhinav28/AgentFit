// Calendar helpers. All dates are local calendar dates as 'YYYY-MM-DD' strings.
// Shared by the PWA and the Worker, so no DOM or Node APIs here.

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const WEEKDAY_NAMES = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
export const WEEKDAY_SHORT = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = n => String(n).padStart(2, '0');

export function toIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}
export function todayIso(now = new Date()) { return toIso(now); }
export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}
export function daysBetween(a, b) {
  // whole days from a to b (b - a)
  return Math.round((fromIso(b) - fromIso(a)) / 86400000);
}
export function weekdayOf(iso) {
  return WEEKDAYS[(fromIso(iso).getDay() + 6) % 7];
}
export function weekdayIndex(code) { return WEEKDAYS.indexOf(code); }

// Start of the week containing `iso`, for a week that starts on `startsOn` (e.g. 'MON').
export function weekStart(iso, startsOn = 'MON') {
  const offset = (weekdayIndex(weekdayOf(iso)) - weekdayIndex(startsOn) + 7) % 7;
  return addDays(iso, -offset);
}
export function weekDates(iso, startsOn = 'MON') {
  const s = weekStart(iso, startsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}
// 1-based week number of `iso` counted from the week containing `startIso`.
export function weekNumber(startIso, iso, startsOn = 'MON') {
  return Math.floor(daysBetween(weekStart(startIso, startsOn), weekStart(iso, startsOn)) / 7) + 1;
}

export function longDate(iso) {
  const d = fromIso(iso);
  return `${WEEKDAY_NAMES[weekdayOf(iso)]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function shortDate(iso) {
  const d = fromIso(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
export function ageOn(dobIso, iso) {
  const a = fromIso(dobIso), b = fromIso(iso);
  let age = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) age--;
  return age;
}
export function relativeDays(fromMs, nowMs = Date.now()) {
  const days = Math.floor((nowMs - fromMs) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days >= 30) return '30+ days ago';
  return `${days} days ago`;
}
