// ============================================================
// Supabase client + data layer
// ============================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://dktavgoiovrzimthxftr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGF2Z29pb3ZyemltdGh4ZnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjEyNzQsImV4cCI6MjA5NjA5NzI3NH0.qqBtUYOU34yTZpkoh2OdLqqPQ4HseA3M8dTdistvQTw";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: {
    params: {
      eventsPerSecond: 40,
    },
    timeout: 10000,
  },
  db: { schema: "public" },
  global: {
    headers: { "x-my-custom-header": "pizza-time-pos" },
  },
});

// Realtime client configured above

// ── SETTINGS ─────────────────────────────────────────────────
export async function loadSettings() {
  const { data } = await sb.from("settings").select("*").eq("id", 1).single();
  if (!data) return null;
  return {
    taxRate:            data.tax_rate,
    cardSurcharge:      data.card_surcharge,
    onlineOrdering:     data.online_ordering,
    onlinePickup:       data.online_pickup,
    onlineDelivery:     data.online_delivery,
    onlineAsap:         data.online_asap,
    onlinePrepTime:     data.online_prep_time,
    onlineMaxPizzasPerSlot: data.online_max_pizzas,
    onlineCutoffMins:   data.online_cutoff_mins,
    onlineHours:        data.online_hours,
    onlineBlackouts:    data.online_blackouts,
    deliveryReimbRate:  data.delivery_reimb_rate,
    deliveryMinOrder:   data.delivery_min_order,
  };
}

export async function saveSettings(s) {
  await sb.from("settings").upsert({
    id: 1,
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
    updated_at: new Date().toISOString(),
  });
}

// ── EMPLOYEES ────────────────────────────────────────────────
export async function loadEmployees() {
  const { data } = await sb.from("employees").select("*").order("id");
  return (data || []).map(dbToEmployee);
}

export async function saveEmployee(emp) {
  const row = employeeToDb(emp);
  if (emp.id && typeof emp.id === "number") {
    await sb.from("employees").update(row).eq("id", emp.id);
    return emp;
  } else {
    const { data } = await sb.from("employees").insert(row).select().single();
    return dbToEmployee(data);
  }
}

export async function deleteEmployee(id) {
  await sb.from("employees").delete().eq("id", id);
}

function dbToEmployee(r) {
  return { id: r.id, name: r.name, pin: r.pin, role: r.role, payRate: Number(r.pay_rate), phone: r.phone, email: r.email, active: r.active, permissions: r.permissions || {} };
}
function employeeToDb(e) {
  return { name: e.name, pin: e.pin, role: e.role, pay_rate: e.payRate, phone: e.phone || "", email: e.email || "", active: e.active, permissions: e.permissions };
}

// ── CUSTOMERS ────────────────────────────────────────────────
export async function loadCustomers() {
  const { data } = await sb.from("customers").select("*").order("name");
  return (data || []).map(dbToCustomer);
}

export async function saveCustomer(c) {
  const row = { name: c.name, phone: c.phone, address: c.address || "", notes: c.notes || "", points: c.points || 0, order_count: c.orderCount || 0 };
  if (c.id && typeof c.id === "number" && c.id < 1000000) {
    const { data, error } = await sb.from("customers").update(row).eq("id", c.id).select();
    if (error) { console.error("customer update error:", error); throw error; }
    return data && data[0] ? dbToCustomer(data[0]) : c;
  } else {
    const clean = (c.phone || "").replace(/\D/g, "");
    const { data: existing } = await sb.from("customers").select("id").ilike("phone", "%" + clean + "%").maybeSingle();
    if (existing) {
      const { data } = await sb.from("customers").update(row).eq("id", existing.id).select().single();
      return dbToCustomer(data);
    } else {
      const { data } = await sb.from("customers").insert(row).select().single();
      return dbToCustomer(data);
    }
  }
}

function dbToCustomer(r) {
  return { id: r.id, name: r.name, phone: r.phone, address: r.address, notes: r.notes, points: r.points, orderCount: r.order_count };
}

// ── MENU ─────────────────────────────────────────────────────
export async function loadMenu() {
  const { data: cats }   = await sb.from("menu_categories").select("*").order("sort_order");
  const { data: items }  = await sb.from("menu_items").select("*").order("sort_order");
  const { data: groups } = await sb.from("modifier_groups").select("*").order("sort_order");
  const { data: mods }   = await sb.from("modifiers").select("*").order("sort_order");

  const menu = {};
  for (const cat of (cats || [])) {
    const catItems = (items || []).filter(i => i.category_id === cat.id).map(item => {
      const itemGroups = (groups || []).filter(g => g.menu_item_id === item.id).map(g => ({
        id: String(g.id), name: g.name, min: g.min_select, max: g.max_select,
        allowSides: g.allow_sides,
        modifiers: (mods || []).filter(m => m.modifier_group_id === g.id).map(m => ({
          id: String(m.id), name: m.name, price: Number(m.price)
        }))
      }));
      return {
        id: String(item.id), name: item.name, base: Number(item.base_price),
        stock: item.stock, availableOnline: item.available_online,
        modifierGroups: itemGroups
      };
    });
    menu[cat.name] = catItems;
  }
  return menu;
}

export async function saveMenuCategory(name, sortOrder) {
  const { data } = await sb.from("menu_categories").upsert({ name, sort_order: sortOrder }, { onConflict: "name" }).select().single();
  return data;
}

export async function saveMenuItem(item, categoryId, sortOrder) {
  const row = { category_id: categoryId, name: item.name, base_price: item.base, stock: item.stock ?? null, available_online: item.availableOnline !== false, sort_order: sortOrder };
  if (item.id && !item.id.startsWith("x")) {
    await sb.from("menu_items").update(row).eq("id", item.id);
  } else {
    const { data } = await sb.from("menu_items").insert(row).select().single();
    return String(data.id);
  }
  return item.id;
}

export async function deleteMenuItem(id) {
  await sb.from("menu_items").delete().eq("id", id);
}

export async function deleteMenuCategory(name) {
  await sb.from("menu_categories").delete().eq("name", name);
}

// ── ORDERS ───────────────────────────────────────────────────
export async function loadOrders(limitDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - limitDays);
  const { data: orders } = await sb
    .from("orders")
    .select("*, order_items(*)")
    .gte("placed_at", since.toISOString())
    .order("placed_at", { ascending: false });
  return (orders || []).map(dbToOrder);
}

// Load a single order with its items by order_num
export async function loadOrderByNum(orderNum) {
  const { data } = await sb
    .from("orders")
    .select("*, order_items(*)")
    .eq("order_num", orderNum)
    .single();
  return data ? dbToOrder(data) : null;
}

export async function saveOrder(order) {
  const subtotal = order.items.reduce((a, i) => {
    const modCost = Object.values(i.selections || {}).flat().reduce((x, m) => x + (m.price || 0), 0);
    return a + (i.base + modCost) * i.qty;
  }, 0);

  const row = {
    order_num:         order.num,
    type:              order.type,
    source:            order.source || "pos",
    status:            order.status,
    customer_id:       (order.customer && typeof order.customer.id === "number") ? order.customer.id : null,
    customer_snapshot: order.customer || null,
    subtotal,
    tax:               order.total - subtotal,
    total:             order.total,
    slot_key:          order.slotKey || null,
    slot_label:        order.slotLabel || null,
    split_slots:       order.splitSlots || null,
    pizza_count:       order.pizzaCount || 0,
    driver_id:         order.driverId || null,
    placed_at:         order.placedAt ? new Date(order.placedAt).toISOString() : new Date().toISOString(),
  };

  // Check if order_num already exists (avoid duplicate on retry)
  const { data: existing } = await sb.from("orders").select("id, order_num").eq("order_num", row.order_num).maybeSingle();
  if (existing) {
    console.log("Order already in Supabase, skipping insert:", row.order_num);
    return { ...order, dbId: existing.id };
  }
  const { data: savedOrder, error: orderError } = await sb.from("orders").insert(row).select().single();
  if (orderError) {
    console.error("Supabase order insert error:", orderError);
    throw orderError;
  }

  if (savedOrder && order.items && order.items.length > 0) {
    for (const item of order.items) {
      try {
        const resp = await fetch(
          "https://dktavgoiovrzimthxftr.supabase.co/rest/v1/order_items",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGF2Z29pb3ZyemltdGh4ZnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjEyNzQsImV4cCI6MjA5NjA5NzI3NH0.qqBtUYOU34yTZpkoh2OdLqqPQ4HseA3M8dTdistvQTw",
              "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGF2Z29pb3ZyemltdGh4ZnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjEyNzQsImV4cCI6MjA5NjA5NzI3NH0.qqBtUYOU34yTZpkoh2OdLqqPQ4HseA3M8dTdistvQTw",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({
              order_id:     savedOrder.id,
              menu_item_id: (item.id && !String(item.id).startsWith("x") && !String(item.id).startsWith("id_") && !isNaN(Number(item.id))) ? parseInt(item.id) : null,
              name:         String(item.name),
              base_price:   Number(item.base),
              qty:          Number(item.qty),
              selections:   item.selections || {},
              notes:        String(item.notes || ""),
            }),
          }
        );
        if (!resp.ok) {
          const err = await resp.text();
          console.error("order_item insert failed:", resp.status, err);
        }
      } catch (e) {
        console.error("order_item fetch error:", e);
      }
    }
  }

  return savedOrder ? { ...order, dbId: savedOrder.id } : order;
}

export async function updateOrderStatus(orderNum, status, extraFields = {}) {
  await sb.from("orders").update({ status, ...extraFields }).eq("order_num", orderNum);
}

export async function assignOrderDriver(orderNum, driverId) {
  await sb.from("orders").update({ driver_id: driverId }).eq("order_num", orderNum);
}

function dbToOrder(r) {
  const items = (r.order_items || []).map(i => ({
    id: String(i.menu_item_id || ""),
    name: i.name,
    base: Number(i.base_price),
    qty: i.qty,
    selections: i.selections || {},
    notes: i.notes || "",
    modifierGroups: [],
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
    driverId:   r.driver_id,
    placedAt:   new Date(r.placed_at).getTime(),
    time:       new Date(r.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    dbId:       r.id,
  };
}

// ── SHIFTS ───────────────────────────────────────────────────
export async function loadShifts(limitDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - limitDays);
  const { data } = await sb.from("shifts").select("*").gte("clock_in", since.toISOString()).order("clock_in", { ascending: false });
  return (data || []).map(r => ({
    id: r.id, employeeId: r.employee_id,
    clockIn: new Date(r.clock_in).getTime(),
    clockOut: r.clock_out ? new Date(r.clock_out).getTime() : null,
  }));
}

export async function clockIn(employeeId) {
  // Check if already clocked in
  const { data: existing } = await sb.from("shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .is("clock_out", null)
    .maybeSingle();
  if (existing) {
    return { id: existing.id, employeeId, clockIn: new Date(existing.clock_in).getTime(), clockOut: null };
  }
  const { data, error } = await sb.from("shifts").insert({ employee_id: employeeId, clock_in: new Date().toISOString() }).select().single();
  if (error) throw error;
  return { id: data.id, employeeId, clockIn: new Date(data.clock_in).getTime(), clockOut: null };
}

export async function clockOut(shiftId) {
  await sb.from("shifts").update({ clock_out: new Date().toISOString() }).eq("id", shiftId);
}

// ── REALTIME SUBSCRIPTIONS ───────────────────────────────────
// When an order is inserted, we fetch the full order with items
// since the realtime payload won't include order_items
export function subscribeOrders(onInsert, onUpdate) {
  const channel = sb.channel("realtime:orders:" + Date.now(), {
    config: { broadcast: { ack: false }, presence: { key: "" } }
  });

  channel
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "orders",
    }, async (payload) => {
      // Immediately show order from payload, then enrich with items
      const quick = dbToOrder({ ...payload.new, order_items: [] });
      onInsert(quick);
      // Then fetch full order with items and update
      const full = await loadOrderByNum(payload.new.order_num);
      if (full) onUpdate(full);
    })
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "orders",
    }, async (payload) => {
      // For status updates, use payload directly — no fetch needed
      const updated = dbToOrder({ ...payload.new, order_items: [] });
      onUpdate(updated);
    })
    .subscribe((status) => {
      console.log("Realtime orders subscription:", status);
      if (status === "CHANNEL_ERROR") {
        console.error("Realtime channel error — retrying...");
      }
    });

  return channel;
}

export function subscribeSettings(onChange) {
  return sb.channel("realtime:settings:" + Math.random())
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "settings" }, payload => onChange(payload.new))
    .subscribe();
}

export function subscribeMenuItems(onChange) {
  return sb.channel("realtime:menu:" + Math.random())
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () => onChange())
    .subscribe();
}
