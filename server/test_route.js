const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://pizzapos:pizzapos@localhost/pizzapos' });

async function test() {
  const { rows: settingsRows } = await pool.query("SELECT * FROM settings WHERE id=1");
  const s = settingsRows[0];
  const storeTimezone = s.timezone || "America/New_York";
  const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: storeTimezone }));
  const todayStr = nowLocal.getFullYear() + "-" + String(nowLocal.getMonth()+1).padStart(2,"0") + "-" + String(nowLocal.getDate()).padStart(2,"0");
  const date = '2026-06-12';
  const isToday = date === todayStr;
  const targetDate = new Date(date + "T00:00:00");
  
  console.log('nowLocal:', nowLocal.toString());
  console.log('todayStr:', todayStr, 'isToday:', isToday);
  
  const fromH = 11, fromM = 0, toH = 19, toM = 0, prepMins = 30, cutoff = 30;
  const start = new Date(targetDate);
  start.setHours(fromH, fromM, 0, 0);
  const close = new Date(targetDate);
  close.setHours(toH, toM, 0, 0);
  const cutoffTime = new Date(close.getTime() - cutoff * 60000);
  
  console.log('start:', start.toISOString(), 'cutoff:', cutoffTime.toISOString());
  
  let count = 0, pastCount = 0;
  let cur = new Date(start);
  while (cur <= cutoffTime) {
    const isPast = isToday && cur < new Date(nowLocal.getTime() + prepMins * 60000 - 2 * 60000);
    if (isPast) pastCount++;
    count++;
    cur = new Date(cur.getTime() + 15 * 60000);
  }
  console.log('total slots:', count, 'past:', pastCount, 'available:', count - pastCount);
  pool.end();
}
test().catch(console.error);
