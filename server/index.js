// ============================================================
// Pizza Time POS — Local Backend
// Express + PostgreSQL + Socket.io
// ============================================================
require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const { Pool }   = require("pg");
const cors       = require("cors");
const path       = require("path");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST","PATCH","DELETE"] }
});

const PORT = process.env.PORT || 3001;
const DB   = process.env.DATABASE_URL || "postgresql://pizzapos:pizzapos@localhost/pizzapos";

const pool = new Pool({ connectionString: DB });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api/menuboard", require("./routes/menuboard"));

// Serve frontend from /var/www/pizza-time-pos
app.use(express.static("/var/www/pizza-time-pos"));

// ── Helpers ─────────────────────────────────────────────────
const q = (text, params) => pool.query(text, params);

const emit = (event, data) => io.emit(event, data);

// ── SETTINGS ────────────────────────────────────────────────
app.get("/api/settings", async (req, res) => {
  try {
    const { rows } = await q("SELECT * FROM settings WHERE id = 1");
    res.json(rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/settings", async (req, res) => {
  try {
    const s = req.body;
    // Build dynamic update — only update fields that are provided
    const fieldMap = {
      tax_rate: s.tax_rate,
      card_surcharge: s.card_surcharge,
      online_ordering: s.online_ordering,
      online_pickup: s.online_pickup,
      online_delivery: s.online_delivery,
      online_asap: s.online_asap,
      online_prep_time: s.online_prep_time,
      online_max_pizzas: s.online_max_pizzas,
      online_cutoff_mins: s.online_cutoff_mins,
      online_hours: s.online_hours !== undefined ? JSON.stringify(s.online_hours||{}) : undefined,
      online_blackouts: s.online_blackouts !== undefined ? JSON.stringify(s.online_blackouts||[]) : undefined,
      delivery_reimb_rate: s.delivery_reimb_rate,
      delivery_min_order: s.delivery_min_order,
      store_name: s.store_name,
      store_tagline: s.store_tagline,
      store_logo: s.store_logo !== undefined ? (s.store_logo || null) : undefined,
      hidden_nav_items: s.hidden_nav_items !== undefined ? s.hidden_nav_items : undefined,
      pos_enable_dine_in: s.posEnableDineIn !== undefined ? s.posEnableDineIn : undefined,
      pos_enable_take_out: s.posEnableTakeOut !== undefined ? s.posEnableTakeOut : undefined,
      pos_enable_delivery: s.posEnableDelivery !== undefined ? s.posEnableDelivery : undefined,
    };
    const updates = [];
    const params = [];
    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        params.push(val);
        updates.push(`${col}=$${params.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });
    params.push(1);
    await q(`UPDATE settings SET ${updates.join(", ")}, updated_at=NOW() WHERE id=$${params.length}`, params);
    const { rows } = await q("SELECT * FROM settings WHERE id=1");
    emit("settings:updated", rows[0]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── EMPLOYEES ────────────────────────────────────────────────
app.get("/api/employees", async (req, res) => {
  try {
    const { rows } = await q("SELECT * FROM employees ORDER BY id");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/employees", async (req, res) => {
  try {
    const e = req.body;
    const { rows } = await q(
      `INSERT INTO employees (name,pin,role,pay_rate,phone,email,active,permissions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [e.name, e.pin, e.role, e.pay_rate||0, e.phone||"", e.email||"", e.active!==false, JSON.stringify(e.permissions||{})]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/employees/:id", async (req, res) => {
  try {
    const e = req.body;
    const { rows } = await q(
      `UPDATE employees SET name=$1,pin=$2,role=$3,pay_rate=$4,phone=$5,
       email=$6,active=$7,permissions=$8 WHERE id=$9 RETURNING *`,
      [e.name, e.pin, e.role, e.pay_rate||0, e.phone||"", e.email||"",
       e.active!==false, JSON.stringify(e.permissions||{}), req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/employees/:id", async (req, res) => {
  try {
    await q("DELETE FROM employees WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMERS ────────────────────────────────────────────────
app.get("/api/customers", async (req, res) => {
  try {
    const { rows } = await q("SELECT * FROM customers ORDER BY name");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/customers", async (req, res) => {
  try {
    const c = req.body;
    // Upsert by phone
    const { rows } = await q(
      `INSERT INTO customers (name,phone,address,notes,points,order_count)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (phone)
       DO UPDATE SET name=EXCLUDED.name, address=COALESCE(NULLIF(EXCLUDED.address,''), customers.address),
       notes=COALESCE(NULLIF(EXCLUDED.notes,''), customers.notes),
       order_count=customers.order_count+1
       RETURNING *`,
      [c.name||"", c.phone, c.address||"", c.notes||"", c.points||0, c.order_count||0]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/customers/:id", async (req, res) => {
  try {
    const c = req.body;
    const { rows } = await q(
      `UPDATE customers SET name=$1,phone=$2,address=$3,notes=$4,
       points=$5,order_count=$6 WHERE id=$7 RETURNING *`,
      [c.name, c.phone, c.address||"", c.notes||"", c.points||0, c.order_count||0, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MENU ─────────────────────────────────────────────────────
app.get("/api/menu", async (req, res) => {
  try {
    const cats   = await q("SELECT * FROM menu_categories ORDER BY sort_order");
    const items  = await q("SELECT * FROM menu_items ORDER BY sort_order");
    const groups = await q("SELECT * FROM modifier_groups ORDER BY sort_order");
    const mods   = await q("SELECT * FROM modifiers ORDER BY sort_order");

    const menu = {};
    for (const cat of cats.rows) {
      menu[cat.name] = items.rows
        .filter(i => i.category_id === cat.id)
        .map(item => ({
          id: String(item.id),
          name: item.name,
          base: Number(item.base_price),
          stock: item.stock,
          availableOnline: item.available_online,
          modifierGroups: groups.rows
            .filter(g => g.menu_item_id === item.id)
            .map(g => ({
              id: String(g.id), name: g.name,
              min: g.min_select, max: g.max_select,
              allowSides: g.allow_sides,
              modifiers: mods.rows
                .filter(m => m.modifier_group_id === g.id)
                .map(m => ({ id: String(m.id), name: m.name, price: Number(m.price) }))
            }))
        }));
    }
    res.json(menu);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/menu/category", async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const { rows } = await q(
      `INSERT INTO menu_categories (name, sort_order) VALUES ($1,$2)
       ON CONFLICT (name) DO UPDATE SET sort_order=$2 RETURNING *`,
      [name, sort_order||0]
    );
    emit("menu:updated", {});
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/menu/category/:name", async (req, res) => {
  try {
    await q("DELETE FROM menu_categories WHERE name=$1", [req.params.name]);
    emit("menu:updated", {});
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/menu/item", async (req, res) => {
  try {
    const item = req.body;
    const { rows } = await q(
      `INSERT INTO menu_items (category_id,name,base_price,stock,available_online,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [item.category_id, item.name, item.base, item.stock||null, item.availableOnline!==false, item.sort_order||0]
    );
    emit("menu:updated", {});
    res.json({ ...rows[0], id: String(rows[0].id) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/menu/item/:id", async (req, res) => {
  try {
    const item = req.body;
    await q(
      `UPDATE menu_items SET name=$1,base_price=$2,stock=$3,
       available_online=$4,sort_order=$5 WHERE id=$6`,
      [item.name, item.base, item.stock??null, item.availableOnline!==false, item.sort_order||0, req.params.id]
    );
    emit("menu:updated", {});
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/menu/item/:id", async (req, res) => {
  try {
    await q("DELETE FROM menu_items WHERE id=$1", [req.params.id]);
    emit("menu:updated", {});
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ORDERS ───────────────────────────────────────────────────
app.get("/api/orders", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { rows: orders } = await q(
      "SELECT * FROM orders WHERE placed_at >= $1 ORDER BY placed_at DESC",
      [since.toISOString()]
    );
    const { rows: items } = await q(
      "SELECT * FROM order_items WHERE order_id = ANY($1)",
      [orders.map(o => o.id)]
    );
    const result = orders.map(o => ({
      ...o,
      order_items: items.filter(i => i.order_id === o.id)
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders", async (req, res) => {
  try {
    const order = req.body;
    console.log("ORDER RECEIVED scheduledTime:", order.scheduledTime, "source:", order.source);

    // Save customer first if provided
    let customerId = null;
    if (order.customer && order.customer.phone) {
      const { rows: custRows } = await q(
        `INSERT INTO customers (name,phone,address,notes,points,order_count)
         VALUES ($1,$2,$3,$4,0,1)
         ON CONFLICT (phone)
         DO UPDATE SET order_count=customers.order_count+1,
         name=CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE customers.name END,
         address=CASE WHEN EXCLUDED.address != '' THEN EXCLUDED.address ELSE customers.address END
         RETURNING id`,
        [order.customer.name||"", order.customer.phone,
         order.customer.address||"", order.customer.notes||""]
      );
      customerId = custRows[0].id;
    }

    const subtotal = (order.items||[]).reduce((a, item) => {
      const modCost = Object.values(item.selections||{}).flat().reduce((x,m) => x+(m.price||0), 0);
      return a + (item.base + modCost) * item.qty;
    }, 0);

    const { rows: orderRows } = await q(
      `INSERT INTO orders (order_num,type,source,status,customer_id,customer_snapshot,
       subtotal,tax,total,slot_key,slot_label,split_slots,pizza_count,placed_at,scheduled_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (order_num) DO NOTHING RETURNING *`,
      [order.num, order.type, order.source||"pos", order.status||"In Kitchen",
       customerId, JSON.stringify(order.customer||null),
       subtotal, order.total-subtotal, order.total,
       order.slotKey||null, order.slotLabel||null,
       JSON.stringify(order.splitSlots||null), order.pizzaCount||0,
       order.placedAt ? new Date(order.placedAt).toISOString() : new Date().toISOString(),
       order.scheduledTime||null]
    );

    if (!orderRows[0]) {
      return res.status(409).json({ error: "Order num already exists" });
    }

    const savedOrder = orderRows[0];

    // Save order items
    for (const item of (order.items||[])) {
      const menuItemId = (item.id && !String(item.id).startsWith("x") &&
        !String(item.id).startsWith("id_") && !isNaN(Number(item.id)))
        ? parseInt(item.id) : null;
      await q(
        `INSERT INTO order_items (order_id,menu_item_id,name,base_price,qty,selections,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [savedOrder.id, menuItemId, item.name, item.base, item.qty,
         JSON.stringify(item.selections||{}), item.notes||""]
      );
    }

    // Fetch full order with items
    const { rows: itemRows } = await q(
      "SELECT * FROM order_items WHERE order_id=$1", [savedOrder.id]
    );
    const fullOrder = { ...savedOrder, order_items: itemRows };

    // Emit to all connected devices
    emit("order:new", fullOrder);
    res.json(fullOrder);
  } catch(e) {
    console.error("Order save error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/orders/:num/status", async (req, res) => {
  try {
    const { status, driver_id } = req.body;
    const updates = [];
    const params = [];
    // Only update fields that are provided
    if (status !== undefined) { updates.push(`status=$${params.length+1}`); params.push(status); }
    if (driver_id !== undefined) { updates.push(`driver_id=$${params.length+1}`); params.push(driver_id); }
    if (updates.length === 0) return res.status(400).json({ error: "Nothing to update" });
    params.push(req.params.num);
    await q(`UPDATE orders SET ${updates.join(",")} WHERE order_num=$${params.length}`, params);
    const { rows } = await q("SELECT * FROM orders WHERE order_num=$1", [req.params.num]);
    emit("order:updated", { ...rows[0], order_items: [] });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SHIFTS ───────────────────────────────────────────────────
app.get("/api/shifts", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { rows } = await q(
      "SELECT * FROM shifts WHERE clock_in >= $1 ORDER BY clock_in DESC",
      [since.toISOString()]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/shifts/clockin", async (req, res) => {
  try {
    const { employee_id } = req.body;
    // Check already clocked in
    const { rows: existing } = await q(
      "SELECT * FROM shifts WHERE employee_id=$1 AND clock_out IS NULL",
      [employee_id]
    );
    if (existing[0]) return res.json(existing[0]);
    const { rows } = await q(
      "INSERT INTO shifts (employee_id, clock_in) VALUES ($1, NOW()) RETURNING *",
      [employee_id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/shifts/:id/clockout", async (req, res) => {
  try {
    const { rows } = await q(
      "UPDATE shifts SET clock_out=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── CFD STATE ────────────────────────────────────────────────
let cfdState = { items: [], orderNum: null, payment: { method: null, tip: 0, tipMode: null, tendered: "", change: 0 } };

app.post("/api/cfd", (req, res) => {
  cfdState = req.body;
  emit("cfd:update", cfdState);
  res.json({ ok: true });
});

app.get("/api/cfd", (req, res) => {
  res.json(cfdState);
});

// ── SOCKET.IO ────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Device connected:", socket.id);
  // Send current CFD state to newly connected device
  socket.emit("cfd:update", cfdState);
  socket.on("disconnect", () => {
    console.log("Device disconnected:", socket.id);
  });
});


// Save entire menu as JSON blob
app.post("/api/menu/save", async (req, res) => {
  try {
    const menu = req.body.menu;
    if (!menu) return res.status(400).json({ error: "No menu data" });
    await q("DELETE FROM modifiers");
    await q("DELETE FROM modifier_groups");
    await q("DELETE FROM menu_items");
    await q("DELETE FROM menu_categories");
    let catOrder = 0;
    for (const [catName, items] of Object.entries(menu)) {
      const catRes = await q("INSERT INTO menu_categories (name, sort_order) VALUES ($1,$2) RETURNING id", [catName, catOrder++]);
      const catId = catRes.rows[0].id;
      let itemOrder = 0;
      for (const item of (items || [])) {
        const itemRes = await q("INSERT INTO menu_items (category_id, name, base_price, stock, available_online, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [catId, item.name, item.base||0, (!item.stock || item.stock === "unlimited") ? null : Number(item.stock), item.availableOnline||false, itemOrder++]);
        const itemId = itemRes.rows[0].id;
        let grpOrder = 0;
        for (const grp of (item.modifierGroups||[])) {
          const grpRes = await q("INSERT INTO modifier_groups (menu_item_id, name, min_select, max_select, allow_sides, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [itemId, grp.name, grp.min||0, grp.max||99, grp.allowSides||false, grpOrder++]);
          const grpId = grpRes.rows[0].id;
          let modOrder = 0;
          for (const mod of (grp.modifiers||[])) {
            await q("INSERT INTO modifiers (modifier_group_id, name, price, sort_order) VALUES ($1,$2,$3,$4)", [grpId, mod.name, mod.price||0, modOrder++]);
          }
        }
      }
    }
    emit("menu:updated", menu);
    res.json({ ok: true });
  } catch(e) { console.error("saveMenu error:", e); res.status(500).json({ error: e.message }); }
});


app.delete('/api/customers/:id', async (req, res) => {
  try {
    await q('DELETE FROM customers WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ONLINE ORDERING ────────────────────────────────────────────
app.use("/api/online", require("./routes/online"));

// ── SPA FALLBACK ─────────────────────────────────────────────
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
    res.sendFile("/var/www/pizza-time-pos/index.html");
  }
});

// ── START ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Pizza Time POS Server running on port ${PORT}`);
  console.log(`Database: ${DB.replace(/:\/\/.*@/, "://***@")}`);
});

