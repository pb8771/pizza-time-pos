const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "pizza-time-secret-change-me";

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
};

// Register
router.post("/register", async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) return res.status(400).json({ error: "All fields required" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO online_customers (name, email, phone, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, name, email, phone`,
      [name, email, phone, hashed]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user });
  } catch (e) {
    if (e.code === "23505") return res.status(400).json({ error: "Email already registered" });
    res.status(500).json({ error: e.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM online_customers WHERE email=$1`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: "Invalid email or password" });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: "Invalid email or password" });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, addresses: user.addresses } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get profile
router.get("/me", auth, async (req, res) => {
  const result = await pool.query(`SELECT id, name, email, phone, addresses FROM online_customers WHERE id=$1`, [req.user.id]);
  res.json(result.rows[0]);
});

// Update profile
router.patch("/me", auth, async (req, res) => {
  const { name, phone, addresses } = req.body;
  const result = await pool.query(
    `UPDATE online_customers SET name=$1, phone=$2, addresses=$3 WHERE id=$4 RETURNING id, name, email, phone, addresses`,
    [name, phone, JSON.stringify(addresses || []), req.user.id]
  );
  res.json(result.rows[0]);
});

// Place order helper (called after payment succeeds - from frontend)
router.post("/place-order", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT COALESCE(MAX(order_num),1000)+1 AS next FROM orders");
    const num = rows[0].next;
    res.json({ num });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get available slots for a given date
router.get("/slots", async (req, res) => {
  try {
    const { date, pizzas, tz } = req.query;
    const pizzaCount = Math.max(parseInt(pizzas) || 1, 1);

    // Get settings
    const { rows: settingsRows } = await pool.query("SELECT * FROM settings WHERE id=1");
    const s = settingsRows[0];
    const settings = {
      onlineHours: s.online_hours || {},
      onlineBlackouts: s.online_blackouts || [],
      onlineClosedDates: s.online_closed_dates || [],
      onlinePrepTime: s.online_prep_time || 30,
      onlineCutoffMins: s.online_cutoff_mins || 30,
      onlineMaxPizzasPerSlot: s.online_max_pizzas || 4,
      onlineAsap: s.online_asap !== false,
    };

    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    // Use store timezone for all date/time calculations
    const storeTimezone = settings.timezone || "America/New_York";
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: storeTimezone }));
    const todayStr = nowLocal.getFullYear() + "-" + String(nowLocal.getMonth()+1).padStart(2,"0") + "-" + String(nowLocal.getDate()).padStart(2,"0");
    const targetDate = date ? new Date(date + "T00:00:00") : nowLocal;
    const isToday = !date || date === todayStr;
    const dayName = dayNames[targetDate.getDay()];

    // Check if date is closed
    const closedDates = settings.onlineClosedDates || [];
    if (date && closedDates.includes(date)) {
      return res.json({ closed: true, slots: [], reason: "closed_date" });
    }

    // Get hours for this day
    const onlineHours = settings.onlineHours && Object.keys(settings.onlineHours).length > 0
      ? settings.onlineHours
      : dayNames.reduce((acc, d) => ({ ...acc, [d]: { open: true, from: "11:00", to: "21:00" } }), {});
    const hours = onlineHours[dayName];
    if (!hours || !hours.open) return res.json({ closed: true, slots: [], reason: "closed_day" });

    const [fromH, fromM] = hours.from.split(":").map(Number);
    const [toH, toM] = hours.to.split(":").map(Number);
    const cutoff = settings.onlineCutoffMins || 30;
    const maxPizzas = settings.onlineMaxPizzasPerSlot || 4;
    const prepMins = settings.onlinePrepTime || 30;
    const blackouts = settings.onlineBlackouts || [];

    // Get existing orders for this date to check capacity
    const dateStr = date || todayStr;
    const { rows: orders } = await pool.query(
      `SELECT scheduled_time, pizza_count, slot_key FROM orders 
       WHERE status NOT IN ('Cancelled') 
       AND scheduled_time::text LIKE $1`,
      [dateStr + "%"]
    );

    // Use store timezone from settings
    
    const rawSlots = [];
    const start = new Date(targetDate);
    start.setHours(fromH, fromM, 0, 0);
    const close = new Date(targetDate);
    close.setHours(toH, toM, 0, 0);
    const cutoffTime = new Date(close.getTime() - cutoff * 60000);
    
    let cur = new Date(start);
    while (cur <= cutoffTime) {
      const h = cur.getHours();
      const m = String(cur.getMinutes()).padStart(2, "0");
      const slotKey = h + ":" + m;
      const slotDatetime = date + "T" + h + ":" + m;

      // Count pizzas in this slot from existing orders
      const pizzasUsed = orders.reduce((a, o) => {
        if (o.scheduled_time && o.scheduled_time.startsWith(slotDatetime)) return a + (o.pizza_count || 1);
        if (o.slot_key === slotKey && !o.scheduled_time) return a + (o.pizza_count || 0);
        return a;
      }, 0);

      const isPast = isToday && cur < new Date(nowLocal.getTime() + prepMins * 60000 - 2 * 60000);
      // Support both old format "13:15" and new format "2026-06-12T13:15"
      const isBlackedOut = blackouts.some(b => b === slotKey || b === slotDatetime);

      rawSlots.push({
        key: slotKey,
        datetime: slotDatetime,
        label: cur.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        pizzasUsed,
        remaining: Math.max(0, maxPizzas - pizzasUsed),
        isPast,
        isBlackedOut,
      });
      cur = new Date(cur.getTime() + 15 * 60000);
    }

    // Build available slots with capacity simulation
    const slots = rawSlots.map((raw, idx) => {
      if (raw.isPast || raw.isBlackedOut) return { ...raw, isFull: true };
      let remaining = pizzaCount;
      for (let i = idx; i < rawSlots.length && remaining > 0; i++) {
        if (rawSlots[i].isBlackedOut) break;
        const cap = rawSlots[i].remaining;
        remaining -= Math.min(cap, remaining);
      }
      return { ...raw, isFull: remaining > 0 };
    }).filter(s => !s.isPast && !s.isBlackedOut);

    console.log("SLOTS DEBUG rawSlots:", rawSlots.length, "mapped:", slots.length, "first raw:", rawSlots[0] && rawSlots[0].key, "first slot:", slots[0] && slots[0].key);
    res.json({ closed: false, slots });
  } catch(e) {
    console.error("Slots error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create Stripe payment intent
router.post("/payment-intent", async (req, res) => {
  const { amount } = req.body;
  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
