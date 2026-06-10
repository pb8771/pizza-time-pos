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
