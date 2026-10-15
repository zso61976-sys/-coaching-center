// The backend splits days in its own time zone (TZ=Asia/Karachi). Dates sent to it
// must use the same zone, or a browser elsewhere (e.g. Dubai) or a UTC date asks
// for the wrong day around midnight and fresh punches disappear.
export const SERVER_TIME_ZONE = 'Asia/Karachi';

/** YYYY-MM-DD of today (minus daysAgo) in the server's time zone */
export function serverDateKey(daysAgo = 0) {
  // en-CA formats as YYYY-MM-DD
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: SERVER_TIME_ZONE }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD of this week's Sunday in the server's time zone */
export function serverWeekStartKey() {
  const today = serverDateKey(0);
  return serverDateKey(new Date(`${today}T12:00:00Z`).getUTCDay());
}

/** YYYY-MM-DD of the first day of this month in the server's time zone */
export function serverMonthStartKey() {
  return `${serverDateKey(0).slice(0, 8)}01`;
}
