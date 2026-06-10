// ============================================================
// Pizza Time POS — Local API Client
// Replaces supabase.js — talks to local Express + Socket.io
// ============================================================
import { io } from "socket.io-client";

// Auto-detect server URL — same host, port 3001
const isLocal = ["localhost","192.168.3.50"].includes(window.location.hostname);
const BASE = isLocal ? `${window.location.protocol}//${window.location.hostname}:3001` : "";

const socket = io(isLocal ? BASE : window.location.origin, { transports: ["polling","websocket"], path: "/socket.io/" });

socket.on("connect", () => console.log("Connected to POS server"));
socket.on("disconnect", () => console.log("Disconnected from POS server"));

// ── HTTP helpers ─────────────────────────────────────────────
async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function patch(path, body) {
  const res = await fetch(BASE + path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `PATCH ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function del(path) {
  const res = await fetch(BASE + path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}

// ── SETTINGS ─────────────────────────────────────────────────
export async function loadSettings() {
  const data = await get("/api/settings");
  if (!data || !data.id) return null;
  return {
    taxRate:            Number(data.tax_rate),
    cardSurcharge:      Number(data.card_surcharge),
    onlineOrdering:     data.online_ordering,
    onlinePickup:       data.online_pickup,
    onlineDelivery:     data.online_delivery,
    onlineAsap:         data.online_asap,
    onlinePrepTime:     data.online_prep_time,
    onlineMaxPizzasPerSlot: data.online_max_pizzas,
    onlineCutoffMins:   data.online_cutoff_mins,
    onlineHours:        data.online_hours || {},
    onlineBlackouts:    data.online_blackouts || [],
    deliveryReimbRate:  Number(data.delivery_reimb_rate),
    deliveryMinOrder:   Number(data.delivery_min_order),
    storeName:          data.store_name ?? "",
    hiddenNavItems:     data.hidden_nav_items ? JSON.parse(data.hidden_nav_items) : [],
    storeTagline:       data.store_tagline ?? "",
    storeLogo:          data.store_logo || null,
    posEnableDineIn:    data.pos_enable_dine_in !== false,
    posEnableTakeOut:   data.pos_enable_take_out !== false,
    posEnableDelivery:  data.pos_enable_delivery !== false,
  };
}

export async function saveSettings(s) {
  return patch("/api/settings", {
    tax_rate:           s.taxRate,
    card_surcharge:     s.cardSurcharge,
    online_ordering:    s.onlineOrdering,
    online_pickup:      s.onlinePickup,
    online_delivery:    s.onlineDelivery,
    online_asap:        s.onlineAsap,
    online_prep_time:   s.onlinePrepTime,
    online_max_pizzas:  s.onlineMaxPizzasPerSlot,
    online_cutoff_mins: s.onlineCutoffMins,
    online_hours:       s.onlineHours,
    online_blackouts:   s.onlineBlackouts,
    delivery_reimb_rate: s.deliveryReimbRate,
    delivery_min_order:  s.deliveryMinOrder,
    store_name:          s.storeName,
    hidden_nav_items:    JSON.stringify(s.hiddenNavItems || []),
    store_tagline:       s.storeTagline,
    store_logo:          s.storeLogo,
    posEnableDineIn:     s.posEnableDineIn,
    posEnableTakeOut:    s.posEnableTakeOut,
    posEnableDelivery:   s.posEnableDelivery,
  });
}

// ── EMPLOYEES ────────────────────────────────────────────────
export async function loadEmployees() {
  const data = await get("/api/employees");
  return data.map(dbToEmployee);
}

export async function saveEmployee(emp) {
  const row = employeeToDb(emp);
  if (emp.id && typeof emp.id === "number") {
    const data = await patch(`/api/employees/${emp.id}`, row);
    return dbToEmployee(data);
  } else {
    const data = await post("/api/employees", row);
    return dbToEmployee(data);
  }
}

export async function deleteEmployee(id) {
  return del(`/api/employees/${id}`);
}

function dbToEmployee(r) {
  return {
    id: r.id, name: r.name, pin: r.pin, role: r.role,
    payRate: Number(r.pay_rate), phone: r.phone || "",
    email: r.email || "", active: r.active,
    permissions: r.permissions || {}
  };
}

function employeeToDb(e) {
  return {
    name: e.name, pin: e.pin, role: e.role, pay_rate: e.payRate || 0,
    phone: e.phone || "", email: e.email || "",
    active: e.active !== false, permissions: e.permissions || {}
  };
}

// ── CUSTOMERS ────────────────────────────────────────────────
export async function loadCustomers() {
  const data = await get("/api/customers");
  return data.map(dbToCustomer);
}

export async function saveCustomer(c) {
  if (c.id && typeof c.id === "number") {
    const data = await patch(`/api/customers/${c.id}`, customerToDb(c));
    return dbToCustomer(data);
  } else {
    const data = await post("/api/customers", customerToDb(c));
    return dbToCustomer(data);
  }
}

function dbToCustomer(r) {
  return {
    id: r.id, name: r.name, phone: r.phone,
    address: r.address || "", notes: r.notes || "",
    points: r.points || 0, orderCount: r.order_count || 0
  };
}

function customerToDb(c) {
  return {
    name: c.name || "", phone: c.phone,
    address: c.address || "", notes: c.notes || "",
    points: c.points || 0, order_count: c.orderCount || 0
  };
}

// ── MENU ─────────────────────────────────────────────────────
export async function loadMenu() {
  return get("/api/menu");
}

export async function saveMenu(menu) {
  return post("/api/menu/save", { menu });
}

export async function saveMenuCategory(name, sortOrder) {
  return post("/api/menu/category", { name, sort_order: sortOrder });
}

export async function deleteMenuCategory(name) {
  return del(`/api/menu/category/${encodeURIComponent(name)}`);
}

export async function saveMenuItem(item, categoryId, sortOrder) {
  if (item.id && !String(item.id).startsWith("x") && !String(item.id).startsWith("id_") && !isNaN(Number(item.id))) {
    await patch(`/api/menu/item/${item.id}`, { ...item, sort_order: sortOrder });
    return item.id;
  } else {
    const data = await post("/api/menu/item", { ...item, category_id: categoryId, sort_order: sortOrder });
    return String(data.id);
  }
}

export async function deleteMenuItem(id) {
  return del(`/api/menu/item/${id}`);
}

// ── ORDERS ───────────────────────────────────────────────────
export async function loadOrders(limitDays = 7) {
  const data = await get(`/api/orders?days=${limitDays}`);
  return data.map(dbToOrder);
}

export async function saveOrder(order) {
  const data = await post("/api/orders", order);
  return dbToOrder(data);
}

export async function updateOrderStatus(orderNum, status, extra = {}) {
  return patch(`/api/orders/${orderNum}/status`, { status, ...extra });
}

export async function assignOrderDriver(orderNum, driverId) {
  // Get current status first so we don't clear it
  return patch(`/api/orders/${orderNum}/status`, { driver_id: driverId });
}

function dbToOrder(r) {
  const items = (r.order_items || []).map(i => ({
    id: String(i.menu_item_id || ""),
    name: i.name, base: Number(i.base_price),
    qty: i.qty, selections: i.selections || {},
    notes: i.notes || "", modifierGroups: [],
  }));
  return {
    num:        r.order_num,
    type:       r.type,
    source:     r.source,
    status:     r.status,
    customer:   r.customer_snapshot,
    items,
    total:      Number(r.total),
    slotKey:    r.slot_key,
    slotLabel:  r.slot_label,
    splitSlots: r.split_slots,
    pizzaCount: r.pizza_count,
    driverId:   r.driver_id,   // always preserve from DB
    placedAt:   new Date(r.placed_at).getTime(),
    time:       new Date(r.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    dbId:       r.id,
    scheduledTime: r.scheduled_time || null,
  };
}

export async function deleteCustomer(id) {
  if (!id) return;
  return del(`/api/customers/${id}`);
}

// ── SHIFTS ───────────────────────────────────────────────────
export async function loadShifts(limitDays = 7) {
  const data = await get(`/api/shifts?days=${limitDays}`);
  return data.map(r => ({
    id: r.id, employeeId: r.employee_id,
    clockIn: new Date(r.clock_in).getTime(),
    clockOut: r.clock_out ? new Date(r.clock_out).getTime() : null,
  }));
}

export async function clockIn(employeeId) {
  const data = await post("/api/shifts/clockin", { employee_id: employeeId });
  return {
    id: data.id, employeeId: data.employee_id,
    clockIn: new Date(data.clock_in).getTime(), clockOut: null,
  };
}

export async function clockOut(shiftId) {
  return patch(`/api/shifts/${shiftId}/clockout`, {});
}

// ── REALTIME SUBSCRIPTIONS (Socket.io) ───────────────────────
export function subscribeOrders(onInsert, onUpdate) {
  socket.on("order:new", (raw) => {
    console.log("Realtime: new order received", raw.order_num);
    onInsert(dbToOrder(raw));
  });
  socket.on("order:updated", (raw) => {
    onUpdate(dbToOrder(raw));
  });
  // Return unsubscribe function
  return {
    unsubscribe: () => {
      socket.off("order:new");
      socket.off("order:updated");
    }
  };
}

export function subscribeSettings(onChange) {
  socket.on("settings:updated", onChange);
  return { unsubscribe: () => socket.off("settings:updated") };
}

export function subscribeMenuItems(onChange) {
  socket.on("menu:updated", onChange);
  return { unsubscribe: () => socket.off("menu:updated") };
}

// ── CFD SYNC ─────────────────────────────────────────────────
export async function pushCFD(state) {
  try {
    await fetch(BASE + "/api/cfd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch(e) { console.error("CFD push error:", e); }
}

export async function loadCFD() {
  try { return await get("/api/cfd"); } catch { return null; }
}

export function subscribeCFD(onChange) {
  socket.on("cfd:update", onChange);
  return { unsubscribe: () => socket.off("cfd:update") };
}
