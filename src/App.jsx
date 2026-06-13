import { useState, useEffect, useCallback, useRef } from "react";
import * as DB from "./api.js";

// ---------------------------------------------------------------------------
// DATA MODEL
// ModifierGroup: { id, name, min, max, allowSides, modifiers: [{id,name,price}] }
// MenuItem:      { id, name, base, modifierGroups: [...] }
// ---------------------------------------------------------------------------

const mk = (() => { let n = 0; return () => "id_" + (++n); })();

const FULL_TOPPINGS = [
  { id: mk(), name: "Pepperoni",    price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Sausage",      price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Mushroom",     price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Onion",        price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Pepper",       price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Olive",        price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Jalapeno",     price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Bacon",        price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Chicken",      price: 1.5, halfPrice: 0.75 },
  { id: mk(), name: "Anchovy",      price: 1.5 },
  { id: mk(), name: "Extra Cheese", price: 2.0 },
  { id: mk(), name: "Extra Sauce",  price: 0.5 },
];

const SAUCE_OPTIONS = [
  { id: mk(), name: "Tomato",    price: 0 },
  { id: mk(), name: "White",     price: 0 },
  { id: mk(), name: "BBQ",       price: 0 },
  { id: mk(), name: "No Sauce",  price: 0 },
];

const WING_SAUCES = [
  { id: mk(), name: "Buffalo",    price: 0 },
  { id: mk(), name: "Honey BBQ",  price: 0 },
  { id: mk(), name: "Plain",      price: 0 },
  { id: mk(), name: "Garlic Parm",price: 0 },
];

const DRINK_SIZES = [
  { id: mk(), name: "Small",  price: 0 },
  { id: mk(), name: "Medium", price: 0.5 },
  { id: mk(), name: "Large",  price: 1.0 },
];

function makeGroup(name, modifiers, min, max, allowSides) {
  return { id: mk(), name, min: min || 0, max: max || 99, allowSides: !!allowSides, modifiers };
}


const INITIAL_MENU = {
  Pizzas: [
    {
      id: "p1", name: '20" Pizza', base: 21.0,
      modifierGroups: [
        makeGroup("Sauce", SAUCE_OPTIONS, 1, 1, false),
        makeGroup("Toppings", FULL_TOPPINGS, 0, 99, true),
      ],
      availableOnline: true,
    },
    {
      id: "p2", name: '16" Pizza', base: 17.0,
      modifierGroups: [
        makeGroup("Sauce", SAUCE_OPTIONS, 1, 1, false),
        makeGroup("Toppings", FULL_TOPPINGS, 0, 99, true),
      ],
      availableOnline: true,
    },
    {
      id: "p3", name: 'Sicilian', base: 24.0,
      modifierGroups: [
        makeGroup("Sauce", SAUCE_OPTIONS, 1, 1, false),
        makeGroup("Toppings (max 1)", FULL_TOPPINGS.slice(0, 6), 0, 1, false),
      ],
      availableOnline: true,
    },
  ],
  Slices: [
    { id: "s1", name: "Cheese Slice",     base: 3.5, modifierGroups: [] , availableOnline: true },
    { id: "s2", name: "Pepperoni Slice",  base: 4.0, modifierGroups: [] , availableOnline: true },
    { id: "s3", name: "Specialty Slice",  base: 4.5, modifierGroups: [] , availableOnline: true },
  ],
  Sides: [
    { id: "g1", name: "Garlic Knots (6)",    base: 5.0,  modifierGroups: [] , availableOnline: true },
    { id: "g2", name: "Pepperoni Roll",       base: 4.5,  modifierGroups: [] , availableOnline: true },
    {
      id: "g3", name: "Buffalo Wings (8)", base: 12.0,
      modifierGroups: [makeGroup("Sauce", WING_SAUCES, 1, 1, false)],
      availableOnline: true,
    },
    { id: "g4", name: "Mozzarella Sticks",    base: 7.0,  modifierGroups: [] , availableOnline: true },
  ],
  Drinks: [
    {
      id: "d1", name: "Soda", base: 2.5,
      modifierGroups: [makeGroup("Size", DRINK_SIZES, 1, 1, false)],
      availableOnline: true,
    },
    { id: "d2", name: "Bottled Water", base: 2.0, modifierGroups: [] , availableOnline: true },
    { id: "d3", name: "Juice Box",     base: 1.5, modifierGroups: [] , availableOnline: true },
  ],
};

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DEFAULT_HOURS = DAYS.reduce((acc, d) => ({
  ...acc,
  [d]: { open: true, from: "11:00", to: "21:00" }
}), {});

const DEFAULT_SETTINGS = {
  taxRate: 0.06,
  cardSurcharge: 0.04,
  onlineOrdering: true,
  onlinePickup: true,
  onlineDelivery: true,
  posEnableDineIn: true,
  posEnableTakeOut: true,
  posEnableDelivery: true,
  onlinePrepTime: 30,
  onlineAsap: true,
  onlineMaxPizzasPerSlot: 4,
  onlineCutoffMins: 30,
  onlineHours: DEFAULT_HOURS,
  onlineBlackouts: [],
  onlineClosedDates: [],
  deliveryReimbRate: 0.67,
  deliveryReimbEnabled: false,
  deliveryMinOrder: 15.00,
};
let orderCounter = Math.floor(Date.now() / 1000) % 100000; // unique starting point
const nextOrderNum = () => ++orderCounter;
let idGen = 500;
const newId = () => "x" + (++idGen);

let custIdGen = 10;
const newCustId = () => ++custIdGen;

const SEED_CUSTOMERS = [
  { id: 1, name: "Maria Rossi",   phone: "4125551234", address: "123 Main St, Monroeville PA 15146", notes: "", points: 340, orderCount: 12 },
  { id: 2, name: "Joe Caruso",    phone: "4125559876", address: "456 Oak Ave, Monroeville PA 15146", notes: "Allergic to anchovies", points: 120, orderCount: 5 },
  { id: 3, name: "Linda Ferraro", phone: "4125552222", address: "789 Pine Rd, Monroeville PA 15146", notes: "", points: 55, orderCount: 2 },
];

const STATUS_COLOR = { "Pending": "#f77f00", "In Kitchen": "#3a86ff", "Ready": "#06d6a0", "Delivered": "#888", "Completed": "#888" };

function fmt(n) { return "$" + Number(n).toFixed(2); }

function moveArr(arr, idx, dir) {
  const next = idx + dir;
  if (next < 0 || next >= arr.length) return arr;
  const a = [...arr];
  [a[idx], a[next]] = [a[next], a[idx]];
  return a;
}

function calcModifierCost(selections) {
  // selections: { groupId: [{modifierId, side, price}] }
  let total = 0;
  Object.values(selections).forEach(mods => mods.forEach(m => { const base = (m.side && m.side !== "whole" ? (m.halfPrice ?? m.price / 2) : m.price) || 0; total += m.extra ? base * 2 : base; }));
  return total;
}

function calcItemTotal(item) {
  const modCost = calcModifierCost(item.selections || {});
  return (item.base + modCost) * item.qty;
}

function selectionSummary(item) {
  const lines = [];
  if (item.modifierGroups && item.modifierGroups.length > 0) {
    item.modifierGroups.forEach(g => {
      const sel = (item.selections || {})[g.id] || [];
      sel.forEach(m => {
        const side = m.side && m.side !== "whole" ? " (" + m.side + ")" : "";
        const price = m.price > 0 ? " +" + fmt(m.price) : "";
        const xtra = m.extra ? " [xtra]" : "";
        lines.push(m.name + side + xtra + price);
      });
    });
  } else {
    // Fallback for online orders without modifierGroups attached
    Object.values(item.selections || {}).forEach(mods => {
      (mods || []).forEach(m => {
        const side = m.side && m.side !== "whole" ? " (" + m.side + ")" : "";
        const price = m.price > 0 ? " +" + fmt(m.price) : "";
        const xtra = m.extra ? " [xtra]" : "";
        lines.push(m.name + side + xtra + price);
      });
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Modifier Modal
// ---------------------------------------------------------------------------
function ModifierModal({ item, onConfirm, onCancel }) {
  // selections: { [groupId]: [{modifierId, name, price, side}] }
  const initSelections = () => {
    const sel = {};
    (item.modifierGroups || []).forEach(g => { sel[g.id] = []; });
    return sel;
  };
  const [selections, setSelections] = useState(initSelections);
  const [notes, setNotes] = useState("");
  const groups = item.modifierGroups || [];

  const SIDES = ["whole", "left", "right"];
  const sideColor = { whole: "#e85d04", left: "#f77f00", right: "#fcbf49" };

  const getSelected = (gid, mid) => (selections[gid] || []).find(m => m.modifierId === mid);

  const toggleModifier = (g, mod) => {
    setSelections(prev => {
      const cur = prev[g.id] || [];
      const existing = cur.find(m => m.modifierId === mod.id);
      if (existing) {
        // deselect
        return { ...prev, [g.id]: cur.filter(m => m.modifierId !== mod.id) };
      }
      // select — enforce max
      if (g.max === 1) {
        return { ...prev, [g.id]: [{ modifierId: mod.id, name: mod.name, price: mod.price, halfPrice: mod.halfPrice ?? mod.price / 2, side: "whole" }] };
      }
      if (cur.length >= g.max) return prev;
      return { ...prev, [g.id]: [...cur, { modifierId: mod.id, name: mod.name, price: mod.price, halfPrice: mod.halfPrice ?? mod.price / 2, side: "whole" }] };
    });
  };

  const cycleSide = (g, mod) => {
    setSelections(prev => {
      const cur = prev[g.id] || [];
      return {
        ...prev,
        [g.id]: cur.map(m => {
          if (m.modifierId !== mod.id) return m;
          const idx = SIDES.indexOf(m.side);
          return { ...m, side: SIDES[(idx + 1) % SIDES.length] };
        }),
      };
    });
  };

  const groupValid = (g) => {
    const sel = (selections[g.id] || []);
    return sel.length >= g.min;
  };

  const allValid = groups.every(g => groupValid(g));

  const modCost = calcModifierCost(selections);
  const total = item.base + modCost;



  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.modalHead}>
          <div>
            <div style={s.modalTitle}>{item.name}</div>

          </div>
          <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, color: "#e85d04" }}>{fmt(total)}</div>
        </div>

        {/* All groups stacked */}
        <div style={{ overflowY: "auto", maxHeight: "60vh" }}>
        {groups.map(group => (
          <div key={group.id} style={{ padding: "10px 18px", borderBottom: "1px solid #1a1a1a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "baseline" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{group.name}</span>
              <span style={{ color: "#999", fontSize: 11 }}>
                {group.min > 0 ? "Required · " : "Optional · "}
                {group.max === 1 ? "Choose 1" : group.max >= 99 ? "Any amount" : "Up to " + group.max}
              </span>
            </div>

            {/* Three-column layout for groups with sides (toppings) */}
            {group.allowSides ? (
              <>
              <div style={{ display: "flex", gap: 8 }}>
                {["whole", "left", "right"].map(side => (
                  <div key={side} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    {/* Column header */}
                    <div style={{
                      textAlign: "center", padding: "6px 0", borderRadius: 6, marginBottom: 4,
                      background: side === "whole" ? "#e85d0422" : side === "left" ? "#f77f0022" : "#fcbf4922",
                      border: "1px solid " + (side === "whole" ? "#e85d0444" : side === "left" ? "#f77f0044" : "#fcbf4944"),
                      color: side === "whole" ? "#e85d04" : side === "left" ? "#f77f00" : "#fcbf49",
                      fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                    }}>
                      {side === "whole" ? "Whole" : side === "left" ? "Left Half" : "Right Half"}
                    </div>
                    {/* Topping buttons for this column */}
                    {group.modifiers.map(mod => {
                      const sel = getSelected(group.id, mod.id);
                      const isThisSide = sel && sel.side === side;
                      const isOtherSide = sel && sel.side !== side;
                      const colColor = side === "whole" ? "#e85d04" : side === "left" ? "#f77f00" : "#fcbf49";
                      return (
                        <button
                          key={mod.id + side}
                          onClick={() => {
                            if (isThisSide) {
                              if (sel.extra) {
                                // Extra -> Deselect
                                setSelections(prev => ({
                                  ...prev,
                                  [group.id]: (prev[group.id] || []).filter(m => m.modifierId !== mod.id)
                                }));
                              } else {
                                // Normal -> Extra
                                setSelections(prev => ({
                                  ...prev,
                                  [group.id]: (prev[group.id] || []).map(m => m.modifierId === mod.id ? { ...m, extra: true } : m)
                                }));
                              }
                            } else {
                              // Unselected -> Select normal
                              setSelections(prev => {
                                const cur = (prev[group.id] || []).filter(m => m.modifierId !== mod.id);
                                if (group.max !== 99 && cur.length >= group.max) return prev;
                                return { ...prev, [group.id]: [...cur, { modifierId: mod.id, name: mod.name, price: mod.price, halfPrice: mod.halfPrice ?? mod.price / 2, noHalf: mod.noHalf, side: mod.noHalf ? "whole" : side }] };
                              });
                            }
                          }}
                          style={{
                            padding: "10px 8px",
                            borderRadius: 7,
                            border: "1px solid " + (sel && sel.extra ? colColor : isThisSide ? colColor + "99" : isOtherSide ? "#2a2a2a" : "#2a2a2a"),
                            background: sel && sel.extra ? colColor + "66" : isThisSide ? colColor + "33" : "#1a1a1a",
                            color: isThisSide ? colColor : isOtherSide ? "#333" : "#bbb",
                            fontSize: 12,
                            cursor: isOtherSide ? "default" : "pointer",
                            textAlign: "center",
                            minHeight: 44,
                            touchAction: "manipulation",
                            fontWeight: isThisSide ? 700 : 400,
                            opacity: isOtherSide ? 0.4 : 1,
                          }}
                        >
                          <div style={{ fontWeight: isThisSide ? 700 : 400 }}>{mod.name}{isThisSide && sel && sel.extra ? <span style={{ fontSize: 9, marginLeft: 4, background: colColor, color: "#fff", borderRadius: 3, padding: "1px 4px" }}>2x</span> : null}</div>
                          {(() => {
                            const p = side === "whole" ? mod.price : (mod.halfPrice ?? mod.price / 2);
                            const displayP = isThisSide && sel && sel.extra ? p * 2 : p;
                            return displayP > 0
                              ? <div style={{ fontSize: 10, color: isThisSide ? colColor : "#555", marginTop: 2 }}>+{fmt(displayP)}</div>
                              : <div style={{ fontSize: 9, color: "#333", marginTop: 1 }}>free</div>;
                          })()}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {(selections[group.id] || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {(selections[group.id] || []).map(m => {
                    const basePrice = m.side && m.side !== "whole" ? (m.halfPrice ?? m.price / 2) : m.price;
                    const sideLabel = m.side && m.side !== "whole" ? " (" + m.side + ")" : "";
                    return (
                      <button key={m.modifierId + "-extra"} onClick={() => setSelections(prev => ({
                        ...prev,
                        [group.id]: (prev[group.id] || []).map(x => x.modifierId === m.modifierId ? { ...x, extra: !x.extra } : x)
                      }))} style={{
                        background: m.extra ? "#e85d04" : "#1a1a1a",
                        border: "1px solid " + (m.extra ? "#e85d04" : "#333"),
                        color: m.extra ? "#fff" : "#666",
                        borderRadius: 20,
                        padding: "5px 14px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontWeight: m.extra ? 700 : 400,
                        display: "flex", alignItems: "center", gap: 4
                      }}>
                        <span>2x</span><span>{m.name}{sideLabel}{m.extra && basePrice > 0 ? " +" + fmt(basePrice) : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              </>
            ) : (
              /* Standard grid for non-sides groups (sauce, size etc) */
              <div style={s.toppingGrid}>
                {group.modifiers.map(mod => {
                  const sel = getSelected(group.id, mod.id);
                  const isSelected = !!sel;
                  const sCol = isSelected ? "#e85d04" : null;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModifier(group, mod)}
                      style={{
                        ...s.toppingBtn,
                        background: isSelected ? "#e85d0422" : "#1a1a1a",
                        border: "1px solid " + (isSelected ? "#e85d04" : "#2a2a2a"),
                        color: isSelected ? "#e85d04" : "#777",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{mod.name}</span>
                      {mod.price > 0 && <span style={{ fontSize: 10, opacity: 0.8 }}>+{fmt(mod.price)}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selection summary tags */}
            {(selections[group.id] || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                {(selections[group.id] || []).map(m => {
                  const tagColor = m.side === "whole" ? "#e85d04" : m.side === "left" ? "#f77f00" : "#fcbf49";
                  return (
                    <span key={m.modifierId} style={{ ...s.toppingTag, borderColor: tagColor + "66", color: tagColor, background: tagColor + "22" }}>
                      {m.name}{m.side && m.side !== "whole" ? " (" + m.side + ")" : ""}{m.extra ? <span style={{ background: "#e85d04", color: "#fff", borderRadius: 4, fontSize: 9, padding: "1px 4px", marginLeft: 3, fontWeight: 700 }}>2x</span> : null}
                      {m.price > 0 ? " +" + fmt(m.extra ? (m.side && m.side !== "whole" ? (m.halfPrice ?? m.price / 2) : m.price) * 2 : (m.side && m.side !== "whole" ? (m.halfPrice ?? m.price / 2) : m.price)) : ""}
                    </span>
                  );
                })}
              </div>
            )}
          {(selections[group.id] || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {(selections[group.id] || []).map(m => (
                  <button key={m.modifierId + "-extra"} onClick={() => setSelections(prev => ({
                    ...prev,
                    [group.id]: (prev[group.id] || []).map(x => x.modifierId === m.modifierId ? { ...x, extra: !x.extra } : x)
                  }))} style={{
                    background: m.extra ? "#e85d04" : "#1a1a1a",
                    border: "1px solid " + (m.extra ? "#e85d04" : "#333"),
                    color: m.extra ? "#fff" : "#666",
                    borderRadius: 20,
                    padding: "4px 12px",
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: m.extra ? 700 : 400,
                    display: "flex", alignItems: "center", gap: 4
                  }}>
                    <span>2x</span><span>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        </div>

        {/* Notes */}
        <div style={{ padding: "0 18px 12px" }}>
          <textarea placeholder="Special instructions..." value={notes} onChange={e => setNotes(e.target.value)} style={s.notesInput} />
        </div>

        {/* Footer nav */}
        <div style={s.modalFoot}>
          <button onClick={onCancel} style={s.cancelBtn}>Cancel</button>
          <button onClick={() => onConfirm(selections, notes)} disabled={!allValid} style={{ ...s.confirmBtn, opacity: allValid ? 1 : 0.4 }}>
            Add to Order  {fmt(total)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer Database View
// ---------------------------------------------------------------------------
function CustomerDatabase({ customers, orders, onDelete }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.address?.toLowerCase().includes(q);
  });

  const customerOrders = selected ? orders.filter(o => o.customer && (o.customer.phone === selected.phone || o.customer.id === selected.id)) : [];

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left: customer list */}
      <div style={{ width: 320, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 8px" }}>
          <div style={{ color: "#e85d04", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>CUSTOMERS ({filtered.length})</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, address..."
            style={{ width: "100%", padding: "10px 14px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 && <div style={{ color: "#555", padding: 20, fontSize: 13 }}>No customers found</div>}
          {filtered.map(c => {
            const custOrders = orders.filter(o => o.customer && (o.customer.phone === c.phone || o.customer.id === c.id));
            const isSelected = selected && selected.phone === c.phone;
            return (
              <div key={c.id || c.phone} onClick={() => setSelected(c)}
                style={{ padding: "12px 16px", borderBottom: "1px solid #111", cursor: "pointer", background: isSelected ? "#e85d0411" : "transparent", borderLeft: isSelected ? "3px solid #e85d04" : "3px solid transparent" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.name || "No Name"}</div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>{c.phone}</div>
                <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{custOrders.length} order{custOrders.length !== 1 ? "s" : ""} · ${custOrders.reduce((a, o) => a + (o.total || 0), 0).toFixed(2)} total</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: customer detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {!selected ? (
          <div style={{ color: "#555", fontSize: 14, textAlign: "center", marginTop: 60 }}>Select a customer to view details</div>
        ) : (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><div style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{selected.name || "No Name"}</div><button onClick={() => { if (window.confirm("Delete " + selected.name + "?")) { onDelete && onDelete(selected); setSelected(null); } }} style={{ background: "#c0392b22", border: "1px solid #c0392b44", borderRadius: 6, color: "#c0392b", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>Delete</button></div>
              <div style={{ color: "#888", fontSize: 14, marginBottom: 2 }}>📞 {selected.phone || "—"}</div>
              {selected.address && <div style={{ color: "#888", fontSize: 14, marginBottom: 2 }}>📍 {selected.address}</div>}
              {selected.notes && <div style={{ color: "#888", fontSize: 14 }}>📝 {selected.notes}</div>}
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "14px 20px", flex: 1, textAlign: "center" }}>
                <div style={{ color: "#e85d04", fontSize: 22, fontWeight: 700 }}>{customerOrders.length}</div>
                <div style={{ color: "#888", fontSize: 11, letterSpacing: 1 }}>ORDERS</div>
              </div>
              <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "14px 20px", flex: 1, textAlign: "center" }}>
                <div style={{ color: "#06d6a0", fontSize: 22, fontWeight: 700 }}>${customerOrders.reduce((a, o) => a + (o.total || 0), 0).toFixed(2)}</div>
                <div style={{ color: "#888", fontSize: 11, letterSpacing: 1 }}>TOTAL SPENT</div>
              </div>
              <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "14px 20px", flex: 1, textAlign: "center" }}>
                <div style={{ color: "#3a86ff", fontSize: 22, fontWeight: 700 }}>${customerOrders.length ? (customerOrders.reduce((a, o) => a + (o.total || 0), 0) / customerOrders.length).toFixed(2) : "0.00"}</div>
                <div style={{ color: "#888", fontSize: 11, letterSpacing: 1 }}>AVG ORDER</div>
              </div>
            </div>

            <div style={{ color: "#e85d04", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>ORDER HISTORY</div>
            {customerOrders.length === 0 && <div style={{ color: "#555", fontSize: 13 }}>No orders found</div>}
            {[...customerOrders].reverse().map(o => (
              <div key={o.num} style={{ background: "#1a1a1a", borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#fff", fontWeight: 700 }}>#{o.num} — {o.type}</span>
                  <span style={{ color: "#e85d04", fontWeight: 700 }}>${(o.total || 0).toFixed(2)}</span>
                </div>
                <div style={{ color: "#666", fontSize: 11 }}>{o.time} · {o.status}</div>
                {(o.items || []).map((it, i) => (
                  <div key={i} style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{it.qty}x {it.name}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer Panel — phone lookup, new customer form
// ---------------------------------------------------------------------------
function CustomerPanel({ selected, onSelect, onClear, customers, onAddCustomer, onUpdateCustomer, orderType }) {
  const [phone, setPhone] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [mode, setMode] = useState("phone"); // phone | name | new
  const [newForm, setNewForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [notFound, setNotFound] = useState(false);

  const fmtPhone = raw => raw.replace(/\D/g, "").slice(0, 10);

  // Show suggestions as user types, but never auto-select
  const phoneSuggestions = phone.length >= 3
    ? customers.filter(c => c.phone.replace(/\D/g,"").includes(phone)).slice(0, 5)
    : [];

  const handlePhoneChange = (val) => {
    const cleaned = fmtPhone(val);
    setPhone(cleaned);
    setNotFound(false);
  };

  const handlePhoneSearch = () => {
    if (!phone) return;
    const match = customers.find(c => c.phone.replace(/\D/g,"") === phone);
    if (match) {
      onSelect(match);
      setPhone("");
    } else {
      setNotFound(true);
      setNewForm(f => ({ ...f, phone }));
    }
  };

  const handleNameSearch = (q) => {
    setNameQuery(q);
  };

  const nameResults = nameQuery.length >= 2
    ? customers.filter(c => c.name.toLowerCase().includes(nameQuery.toLowerCase()))
    : [];

  const saveNewCustomer = () => {
    if (!newForm.name.trim() || !newForm.phone.trim()) return;
    const addressParts = [newForm.street.trim(), newForm.city.trim(), newForm.zip.trim()].filter(Boolean);
    const address = addressParts.join(", ");
    const c = { id: newCustId(), name: newForm.name.trim(), phone: newForm.phone.trim(), address, notes: newForm.notes.trim(), points: 0, orderCount: 0 };
    onAddCustomer(c);
    onSelect(c);
    setPhone(""); setNotFound(false); setMode("phone");
    setNewForm({ name: "", phone: "", street: "", city: "", zip: "", notes: "" });
  };

  // Display card for selected customer
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");

  const startAddressEdit = () => {
    setAddressDraft(selected.address || "");
    setEditingAddress(true);
  };

  const saveAddress = () => {
    const updated = { ...selected, address: addressDraft.trim() };
    onUpdateCustomer(updated);
    onSelect(updated);
    setEditingAddress(false);
  };

  if (selected) return (
    <div style={s.customerCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
          <div style={{ color: "#bbb", fontSize: 12, marginTop: 2 }}>{selected.phone}</div>
          {selected.address && !editingAddress && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <div style={{ color: "#999", fontSize: 12 }}>{selected.address}</div>
              <button onClick={startAddressEdit} style={{ background: "none", border: "none", color: "#888", fontSize: 10, cursor: "pointer", padding: 0, textDecoration: "underline" }}>edit</button>
            </div>
          )}
          {selected.notes && (
            <div style={{ color: "#f77f00", fontSize: 11, marginTop: 3 }}>Note: {selected.notes}</div>
          )}
          <div style={{ color: "#999", fontSize: 11, marginTop: 3 }}>{selected.orderCount || 0} orders</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={s.pointsBadge}>* {selected.points} pts</div>
          <button onClick={onClear} style={s.clearCust}>x Clear</button>
        </div>
      </div>

      {/* Inline address editor */}
      {editingAddress && (
        <div style={{ marginTop: 10 }}>
          <input
            autoFocus
            placeholder="Enter delivery address..."
            value={addressDraft}
            onChange={e => setAddressDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveAddress(); if (e.key === "Escape") setEditingAddress(false); }}
            style={{ ...s.editInput, width: "100%", boxSizing: "border-box", fontSize: 13 }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => setEditingAddress(false)} style={s.cancelBtn2}>Cancel</button>
            <button onClick={saveAddress} style={{ ...s.saveBtn, flex: 1, padding: "7px 0" }}>Save Address</button>
          </div>
        </div>
      )}

      {/* No address warning with add button */}
      {!selected.address && !editingAddress && (
        <button
          onClick={startAddressEdit}
          style={{ marginTop: 8, width: "100%", background: "#c0392b11", border: "1px solid #c0392b44", borderRadius: 6, padding: "8px 10px", color: "#c0392b", fontSize: 12, cursor: "pointer", textAlign: "left" }}
        >
          No address on file — tap to add
        </button>
      )}

      {/* Delivery address block */}
      {orderType === "Delivery" && selected.address && !editingAddress && (
        <div style={{ marginTop: 8, background: "#3a86ff11", border: "1px solid #3a86ff33", borderRadius: 6, padding: "6px 10px" }}>
          <div style={{ color: "#3a86ff", fontSize: 10, letterSpacing: 1, marginBottom: 2 }}>DELIVER TO</div>
          <div style={{ color: "#ccc", fontSize: 13 }}>{selected.address}</div>
        </div>
      )}
    </div>
  );

  // New customer form
  if (mode === "new") return (
    <div style={{ padding: "10px 12px", borderBottom: "1px solid #1a1a1a", background: "#0f0f0f" }}>
      <div style={{ color: "#e85d04", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>New Customer</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <input
          placeholder="Full name *"
          value={newForm.name}
          onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
          style={{ ...s.editInput, width: "100%", boxSizing: "border-box" }}
        />
        <input
          placeholder="Phone number *"
          value={newForm.phone}
          onChange={e => setNewForm(f => ({ ...f, phone: fmtPhone(e.target.value) }))}
          type="tel" inputMode="numeric"
          style={{ ...s.editInput, width: "100%", boxSizing: "border-box" }}
        />
        <input
          placeholder="Street address"
          value={newForm.street}
          onChange={e => setNewForm(f => ({ ...f, street: e.target.value }))}
          style={{ ...s.editInput, width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="City"
            value={newForm.city}
            onChange={e => setNewForm(f => ({ ...f, city: e.target.value }))}
            style={{ ...s.editInput, flex: 1, boxSizing: "border-box" }}
          />
          <input
            placeholder="Zip"
            value={newForm.zip}
            onChange={e => setNewForm(f => ({ ...f, zip: e.target.value.replace(/\D/g,"").slice(0,5) }))}
            inputMode="numeric"
            style={{ ...s.editInput, width: 70, boxSizing: "border-box" }}
          />
        </div>
        <input
          placeholder="Notes (allergies, preferences...)"
          value={newForm.notes}
          onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
          style={{ ...s.editInput, width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button onClick={() => { setMode("phone"); setNotFound(false); }} style={s.cancelBtn2}>Cancel</button>
          <button
            onClick={saveNewCustomer}
            disabled={!newForm.name.trim() || !newForm.phone.trim()}
            style={{ ...s.saveBtn, flex: 1, padding: "8px 0", opacity: (!newForm.name.trim() || !newForm.phone.trim()) ? 0.4 : 1 }}
          >
            Save Customer
          </button>
        </div>
      </div>
    </div>
  );

  // Search panel
  return (
    <div style={{ borderBottom: "1px solid #1a1a1a" }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
        <button onClick={() => { setMode("phone"); setNotFound(false); }} style={{ flex: 1, padding: "7px 0", background: "none", border: "none", color: mode === "phone" ? "#e85d04" : "#444", fontSize: 12, cursor: "pointer", borderBottom: mode === "phone" ? "2px solid #e85d04" : "none" }}>
          By Phone
        </button>
        <button onClick={() => setMode("name")} style={{ flex: 1, padding: "7px 0", background: "none", border: "none", color: mode === "name" ? "#e85d04" : "#444", fontSize: 12, cursor: "pointer", borderBottom: mode === "name" ? "2px solid #e85d04" : "none" }}>
          By Name
        </button>
        <button onClick={() => { setMode("new"); setNewForm({ name: "", phone: "", street: "", city: "", zip: "", notes: "" }); }} style={{ flex: 1, padding: "7px 0", background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}>
          + New
        </button>
      </div>

      <div style={{ padding: "8px 12px" }}>
        {mode === "phone" && (
          <>
            <div style={s.searchBox}>
              <span style={{ color: "#999", marginRight: 6, fontSize: 14 }}>#</span>
              <input
                placeholder="Enter phone number..."
                value={phone}
                onChange={e => handlePhoneChange(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePhoneSearch()}
                type="tel"
                inputMode="numeric"
                style={{ ...s.searchInput, fontSize: 16, letterSpacing: 2 }}
              />
              {phone && <span style={{ color: "#888", fontSize: 11 }}>{phone.length}/10</span>}
              {phone && (
                <button onClick={handlePhoneSearch} style={{ background: "#e85d04", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 700, marginLeft: 4, minHeight: 32, touchAction: "manipulation" }}>
                  Find
                </button>
              )}
            </div>
            {/* Suggestions dropdown */}
            {phoneSuggestions.length > 0 && !notFound && (
              <div style={{ marginTop: 4, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden" }}>
                {phoneSuggestions.map(c => (
                  <div key={c.id} onClick={() => { onSelect(c); setPhone(""); setNotFound(false); }}
                    style={{ padding: "10px 12px", borderBottom: "1px solid #111", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 48, touchAction: "manipulation" }}>
                    <div>
                      <div style={{ color: "#ddd", fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      <div style={{ color: "#888", fontSize: 11 }}>{c.phone}</div>
                    </div>
                    <span style={{ color: "#e85d04", fontSize: 11 }}>★ {c.points || 0}</span>
                  </div>
                ))}
              </div>
            )}
            {notFound && (
              <div style={{ marginTop: 8, background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ color: "#888", fontSize: 13, marginBottom: 8 }}>
                  No customer found for <strong style={{ color: "#fff" }}>{phone}</strong>
                </div>
                <button
                  onClick={() => { setMode("new"); setNewForm(f => ({ ...f, phone })); }}
                  style={{ ...s.addBtn, width: "100%", padding: "8px 0", textAlign: "center" }}
                >
                  + Add New Customer
                </button>
              </div>
            )}
          </>
        )}

        {mode === "name" && (
          <>
            <div style={s.searchBox}>
              <span style={{ color: "#999", marginRight: 6 }}>A</span>
              <input
                placeholder="Search by name..."
                value={nameQuery}
                onChange={e => handleNameSearch(e.target.value)}
                style={s.searchInput}
              />
            </div>
            <div style={{ maxHeight: 140, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {nameResults.map(c => (
                <div key={c.id} onClick={() => { onSelect(c); setNameQuery(""); }} style={s.customerResult}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: "#ddd", fontSize: 13 }}>{c.name}</strong>
                    <span style={{ color: "#999", marginLeft: 8, fontSize: 11 }}>{c.phone}</span>
                    {c.address && <div style={{ color: "#999", fontSize: 11 }}>{c.address}</div>}
                  </div>
                  <span style={{ color: "#e85d04", fontSize: 12 }}>* {c.points}</span>
                </div>
              ))}
              {nameQuery.length >= 2 && nameResults.length === 0 && (
                <div style={{ color: "#888", fontSize: 12, padding: "8px 0" }}>No results</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// NumpadInput — reusable tap-to-edit numeric input with numpad popup
// ---------------------------------------------------------------------------
function NumpadInput({ value, onChange, label, prefix, suffix, style, placeholder, decimals = true }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(String(value || ""));
  useEffect(() => { setLocal(String(value || "")); }, [value]);
  const commit = () => { setOpen(false); onChange(parseFloat(local) || 0); };
  return (
    <>
      <div onClick={() => { setLocal(String(value || "")); setOpen(true); }}
        style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, minWidth: 80, ...style }}>
        {prefix && <span style={{ color: "#888", fontSize: 14 }}>{prefix}</span>}
        <span style={{ color: local ? "#fff" : "#555", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{local || placeholder || "0"}</span>
        {suffix && <span style={{ color: "#888", fontSize: 14 }}>{suffix}</span>}
      </div>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "#000000dd", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }} onClick={commit}>
          <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 380, padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#999", fontSize: 12, letterSpacing: 2 }}>{label || "ENTER VALUE"}</span>
              <button onClick={commit} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 16px", marginBottom: 14, textAlign: "right" }}>
              <span style={{ color: "#fff", fontSize: 32, fontWeight: 700, fontFamily: "monospace" }}>{prefix}{local || "0"}{suffix}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {["7","8","9","4","5","6","1","2","3", decimals ? "." : "00", "0", "back"].map(k => (
                <button key={k} onClick={() => {
                  if (k === "back") { setLocal(l => l.slice(0,-1)); return; }
                  if (k === "." && !decimals) { setLocal(l => l + "00"); return; }
                  if (k === "." && local.includes(".")) return;
                  if (k === "." && local === "") { setLocal("0."); return; }
                  if (local.length >= 8) return;
                  setLocal(l => l + k);
                }} style={{ padding: "18px 0", borderRadius: 10, border: "1px solid #2a2a2a", background: k === "back" ? "#c0392b22" : "#1a1a1a", color: k === "back" ? "#c0392b" : "#fff", fontSize: k === "back" ? 18 : 22, fontWeight: 700, cursor: "pointer", minHeight: 60, touchAction: "manipulation" }}>
                  {k === "back" ? "⌫" : k}
                </button>
              ))}
            </div>
            <button onClick={commit} style={{ width: "100%", marginTop: 10, padding: "16px 0", background: "#e85d04", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}

// Numpad Component
// ---------------------------------------------------------------------------
function Numpad({ value, onChange, onClose, label }) {
  const press = (k) => {
    if (k === "back") { onChange(value.slice(0, -1)); return; }
    if (k === "." && value.includes(".")) return;
    if (k === "." && value === "") { onChange("0."); return; }
    if (value.length >= 8) return;
    onChange(value + k);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000dd", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}
      onClick={onClose}>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 380, padding: 16 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: "#999", fontSize: 12, letterSpacing: 2 }}>{label || "ENTER AMOUNT"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 16px", marginBottom: 14, textAlign: "right" }}>
          <span style={{ color: "#fff", fontSize: 32, fontWeight: 700, fontFamily: "monospace" }}>
            ${value || "0"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {["7","8","9","4","5","6","1","2","3",".","0","back"].map(k => (
            <button key={k} onClick={() => press(k)}
              style={{ padding: "18px 0", borderRadius: 10, border: "1px solid #2a2a2a", background: k === "back" ? "#c0392b22" : "#1a1a1a", color: k === "back" ? "#c0392b" : "#fff", fontSize: k === "back" ? 18 : 22, fontWeight: 700, cursor: "pointer", minHeight: 60, touchAction: "manipulation" }}>
              {k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cash Numpad — with change display and complete button
// ---------------------------------------------------------------------------
function CashNumpad({ value, onChange, onClose, onComplete, cashTotal }) {
  const press = (k) => {
    if (k === "back") { onChange(value.slice(0, -1)); return; }
    if (k === "." && value.includes(".")) return;
    if (k === "." && value === "") { onChange("0."); return; }
    // Limit to 2 decimal places
    if (value.includes(".") && value.split(".")[1]?.length >= 2) return;
    if (value.length >= 8) return;
    onChange(value + k);
  };

  const tendered = parseFloat(value) || 0;
  const change = Math.max(0, tendered - cashTotal);
  const sufficient = tendered >= cashTotal && cashTotal > 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000ee", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }}
      onClick={onClose}>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 420, padding: 16 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: "#999", fontSize: 12, letterSpacing: 2 }}>CASH TENDERED</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Total due */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#888", fontSize: 14 }}>Total Due</span>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{fmt(cashTotal)}</span>
        </div>

        {/* Tendered display */}
        <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 16px", marginBottom: 8, textAlign: "right" }}>
          <span style={{ color: "#fff", fontSize: 36, fontWeight: 700, fontFamily: "monospace" }}>
            ${value || "0"}
          </span>
        </div>

        {/* Change display */}
        {tendered > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, marginBottom: 10, background: sufficient ? "#06d6a022" : "#c0392b11", border: "1px solid " + (sufficient ? "#06d6a044" : "#c0392b33") }}>
            <span style={{ color: sufficient ? "#06d6a0" : "#c0392b", fontSize: 15 }}>
              {sufficient ? "Change Due" : "Amount Short"}
            </span>
            <span style={{ color: sufficient ? "#06d6a0" : "#c0392b", fontWeight: 700, fontSize: 20 }}>
              {sufficient ? fmt(change) : fmt(cashTotal - tendered)}
            </span>
          </div>
        )}

        {/* Quick amounts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          {[Math.ceil(cashTotal), Math.ceil(cashTotal / 5) * 5, Math.ceil(cashTotal / 10) * 10].filter((v, i, a) => a.indexOf(v) === i && v >= cashTotal).slice(0, 3).map(amt => (
            <button key={amt} onClick={() => onChange(String(amt.toFixed(2)))}
              style={{ padding: "10px 0", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#aaa", fontSize: 13, cursor: "pointer", touchAction: "manipulation" }}>
              {fmt(amt)}
            </button>
          ))}
        </div>

        {/* Numpad */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {["7","8","9","4","5","6","1","2","3",".","0","back"].map(k => (
            <button key={k} onClick={() => press(k)}
              style={{ padding: "16px 0", borderRadius: 10, border: "1px solid #2a2a2a", background: k === "back" ? "#c0392b22" : "#1a1a1a", color: k === "back" ? "#c0392b" : "#fff", fontSize: k === "back" ? 18 : 22, fontWeight: 700, cursor: "pointer", minHeight: 56, touchAction: "manipulation" }}>
              {k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>

        {/* Complete button */}
        <button
          onClick={sufficient ? onComplete : null}
          disabled={!sufficient}
          style={{ width: "100%", padding: "16px 0", borderRadius: 12, border: "none", background: sufficient ? "#06d6a0" : "#2a2a2a", color: sufficient ? "#000" : "#555", fontWeight: 700, fontSize: 18, cursor: sufficient ? "pointer" : "default", minHeight: 60, touchAction: "manipulation" }}>
          {sufficient ? "Complete Sale — Change " + fmt(change) : "Enter Amount"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket (with payment panel)
// ---------------------------------------------------------------------------

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{time}</div>
      <div style={{ color: '#888', fontSize: 11, letterSpacing: 1 }}>{date.toUpperCase()}</div>
    </div>
  );
}

function TimeNumpad({ onSet, onClose }) {
  const [hrs, setHrs] = useState("");
  const [mins, setMins] = useState("");
  const [ampm, setAmpm] = useState("PM");
  const [phase, setPhase] = useState("hrs"); // hrs | mins

  const press = (n) => {
    if (phase === "hrs") {
      const next = hrs + n;
      // Auto-advance to mins if: 2 digits entered, or first digit > 1 (so 2-9 auto-advances)
      if (next.length === 2 || (next.length === 1 && parseInt(next) >= 2)) {
        setHrs(next);
        setPhase("mins");
      } else {
        setHrs(next);
      }
    } else {
      const next = (mins + n).slice(-2);
      setMins(next);
    }
  };

  const confirm = () => {
    const h = parseInt(hrs) || 12;
    const m = parseInt(mins) || 0;
    let h24 = ampm === "PM" ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
    const label = h + ":" + String(m).padStart(2,"0") + " " + ampm;
    onSet(label);
  };

  const btnStyle = { width: 70, height: 56, borderRadius: 10, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer", touchAction: "manipulation" };

  return (
    <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: 16, marginTop: 8 }}>
      <div style={{ textAlign: "center", fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 12, letterSpacing: 4 }}>
        <span style={{ color: phase === "hrs" ? "#e85d04" : "#fff" }}>{hrs || "--"}</span>
        <span style={{ color: "#555" }}>:</span>
        <span style={{ color: phase === "mins" ? "#e85d04" : "#fff" }}>{mins ? mins.padStart(2,"0") : "--"}</span>
        <span style={{ fontSize: 18, marginLeft: 8 }}>
          {["AM","PM"].map(a => (
            <button key={a} onClick={() => setAmpm(a)} style={{ ...btnStyle, width: 44, height: 36, fontSize: 13, background: ampm === a ? "#e85d04" : "#1a1a1a", color: ampm === a ? "#fff" : "#666", marginLeft: 4 }}>{a}</button>
          ))}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
        {[1,2,3,4,5,6,7,8,9,"←",0,"OK"].map(n => (
          <button key={n} onClick={() => {
            if (n === "←") { if (phase === "mins") { setMins(""); setPhase("hrs"); } else setHrs(h => h.slice(0,-1)); }
            else if (n === "OK") confirm();
            else press(String(n));
          }}
          style={{ ...btnStyle, background: n === "OK" ? "#e85d04" : n === "←" ? "#2a2a2a" : "#1a1a1a" }}>
            {n}
          </button>
        ))}
      </div>
      <button onClick={onClose} style={{ width: "100%", padding: 10, background: "none", border: "1px solid #2a2a2a", borderRadius: 8, color: "#888", cursor: "pointer" }}>Cancel</button>
    </div>
  );
}

function Ticket({ items, orderType, orderNum, onRemove, onPlace, onClear, settings, payment, setPayment, scheduledTime, setScheduledTime, discount, setDiscount, requirePermission }) {
  const taxRate = (settings && settings.taxRate) || 0.06;
  const cardSurcharge = (settings && settings.cardSurcharge) || 0.04;
  const subtotal = items.reduce((a, i) => a + calcItemTotal(i), 0);
  const discountAmt = discount ? (discount.type === "%" ? subtotal * discount.value / 100 : Math.min(discount.value, subtotal)) : 0;
  const discountedSubtotal = subtotal - discountAmt;
  const tax = discountedSubtotal * taxRate;
  const cashBase = discountedSubtotal + tax;
  const cardBase = cashBase * (1 + cardSurcharge);
  const tip = payment ? payment.tip : 0;
  const cashTotal = cashBase + tip;
  const cardTotal = cardBase + tip;
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountType, setDiscountType] = useState("%");
  const [showNumpad, setShowNumpad] = useState(false);

  const tendered = payment ? parseFloat(payment.tendered) || 0 : 0;
  const change = Math.max(0, tendered - cashTotal);

  const hasItems = items.length > 0;
  const method = payment ? payment.method : null;

  return (
    <div style={s.ticket}>
      <div style={s.ticketHead}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>#{orderNum}</div>
          <div style={{ fontSize: 11, color: "#e85d04", letterSpacing: 1 }}>{orderType}</div>
        </div>
        {hasItems && <button onClick={onClear} style={s.clearBtn}>Clear</button>}
      </div>
      {orderType === "Take Out" && hasItems && (
        <div style={{ padding: "0 14px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#888", fontSize: 12 }}>Ready at:</span>
            <button onClick={() => setScheduledTime && setScheduledTime("__:__")}
              style={{ flex: 1, padding: "8px 12px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: scheduledTime && scheduledTime !== "__:__" ? "#fff" : "#555", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
              {scheduledTime && scheduledTime !== "__:__" ? scheduledTime : "Tap to set time"}
            </button>
            {scheduledTime && <button onClick={() => setScheduledTime && setScheduledTime("")} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18 }}>x</button>}
          </div>
          {scheduledTime === "__:__" && (
            <TimeNumpad onSet={t => setScheduledTime && setScheduledTime(t)} onClose={() => setScheduledTime && setScheduledTime("")} />
          )}
        </div>
      )}

      <div style={s.ticketItems}>
        {items.length === 0
          ? <div style={{ color: "#aaa", textAlign: "center", padding: 30, fontSize: 13 }}>No items yet</div>
          : items.map((item, idx) => (
            <div key={idx} style={s.ticketItem}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#ddd", fontWeight: 600, fontSize: 13 }}>{item.qty}x {item.name}</span>
                <span style={{ color: "#e85d04", fontWeight: 700 }}>{fmt(calcItemTotal(item))}</span>
              </div>
              {selectionSummary(item).map((line, i) => (
                <div key={i} style={{ color: "#999", fontSize: 11 }}>+ {line}</div>
              ))}
              {item.notes ? <div style={{ color: "#888", fontSize: 11 }}>Note: {item.notes}</div> : null}
              <button onClick={() => onRemove(idx)} style={s.removeBtn}>Remove</button>
            </div>
          ))
        }
      </div>

      {hasItems && (
        <div style={s.totals}>
          <div style={s.totalRow}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          {discountAmt > 0 && <div style={{ ...s.totalRow, color: "#06d6a0" }}><span>Discount {discount.type === "%" ? `(${discount.value}%)` : ""}</span><span>-{fmt(discountAmt)}</span></div>}
          <div style={s.totalRow}><span>Tax ({(taxRate*100).toFixed(0)}%)</span><span>{fmt(tax)}</span></div>
          {tip > 0 && <div style={{ ...s.totalRow, color: "#06d6a0" }}><span>Tip</span><span>{fmt(tip)}</span></div>}
          <div style={{ ...s.totalBig, color: "#06d6a0", fontSize: 16, marginTop: 6, paddingTop: 6 }}>
            <span>Cash</span><span>{fmt(cashTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#3a86ff", fontSize: 14, fontWeight: 700 }}>
            <span>Card (+{(cardSurcharge*100).toFixed(0)}%)</span><span>{fmt(cardTotal)}</span>
          </div>
        </div>
      )}

      {/* Discount */}
      {hasItems && (
        <div style={{ padding: "0 14px 6px", flexShrink: 0 }}>
          {!showDiscount ? (
            <button onClick={() => { if (requirePermission) { requirePermission("discounts", "Applying discounts requires manager approval.", () => setShowDiscount(true)); } else { setShowDiscount(true); } }} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid #2a2a2a", background: discountAmt > 0 ? "#06d6a022" : "#111", color: discountAmt > 0 ? "#06d6a0" : "#666", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {discountAmt > 0 ? `Discount Applied: -${fmt(discountAmt)}` : "Add Discount"}
            </button>
          ) : (
            <DiscountPanel subtotal={subtotal} onApply={d => { setDiscount(d); setShowDiscount(false); }} onClear={() => { setDiscount(null); setShowDiscount(false); }} />
          )}
        </div>
      )}
      {/* Payment method selector */}
      {hasItems && (
        <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setPayment(p => ({ ...p, method: p.method === "cash" ? null : "cash", tip: 0, tipMode: null, tendered: "" }))}
              style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "2px solid " + (method === "cash" ? "#06d6a0" : "#2a2a2a"), background: method === "cash" ? "#06d6a022" : "#111", color: method === "cash" ? "#06d6a0" : "#777", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 48, touchAction: "manipulation" }}>
              CASH
            </button>
            <button onClick={() => setPayment(p => ({ ...p, method: p.method === "card" ? null : "card", tendered: "" }))}
              style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "2px solid " + (method === "card" ? "#3a86ff" : "#2a2a2a"), background: method === "card" ? "#3a86ff22" : "#111", color: method === "card" ? "#3a86ff" : "#777", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 48, touchAction: "manipulation" }}>
              CARD
            </button>
          </div>

          {/* Card — tip is selected on CFD by customer */}
          {method === "card" && (
            <div style={{ marginBottom: 8, padding: "8px 10px", background: "#3a86ff11", border: "1px solid #3a86ff33", borderRadius: 8 }}>
              <div style={{ color: "#3a86ff", fontSize: 12, textAlign: "center" }}>
                {payment.tip > 0 ? "Tip selected: " + fmt(payment.tip) : "Customer selecting tip on display..."}
              </div>
            </div>
          )}

          {/* Cash — just show a button to open numpad */}
          {method === "cash" && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setShowNumpad(true)}
                style={{ width: "100%", padding: "12px 0", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#aaa", fontSize: 15, fontWeight: 700, cursor: "pointer", minHeight: 48, touchAction: "manipulation" }}>
                Enter Cash Amount
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "0 14px 14px", flexShrink: 0 }}>
        {/* Cash: hidden once numpad is open — auto-completes on sufficient tender */}
        {/* Card: visible — cashier taps after card reader approves */}
        {/* No method: standard place order */}
        {method !== "cash" && (
          <button onClick={onPlace} disabled={items.length === 0 || !method}
            style={{ ...s.placeBtn, opacity: (items.length === 0 || !method) ? 0.4 : 1, background: method === "card" ? "#3a86ff" : "#e85d04", color: "#fff" }}>
            {method === "card" ? "Complete Card Sale" : method ? "Place Order" : "Select Payment Method"}
          </button>
        )}
        {method === "cash" && (
          <button onClick={() => setShowNumpad(true)} disabled={items.length === 0}
            style={{ ...s.placeBtn, opacity: items.length === 0 ? 0.4 : 1, background: "#e85d04", color: "#fff" }}>
            Enter Cash Amount
          </button>
        )}
      </div>

      {showNumpad && (
        <CashNumpad
          value={payment.tendered}
          onChange={v => setPayment(p => ({ ...p, tendered: v }))}
          cashTotal={cashTotal}
          onClose={() => setShowNumpad(false)}
          onComplete={() => { setShowNumpad(false); onPlace(); }}
        />
      )}

    </div>
  );
}


// ---------------------------------------------------------------------------
// Orders View
// ---------------------------------------------------------------------------
function OrdersView({ orders, onUpdateStatus }) {
  const active = orders.filter(o => o.status !== "Completed" && o.status !== "Delivered");
  const done   = orders.filter(o => o.status === "Completed" || o.status === "Delivered");
  return (
    <div style={{ flex: 1, padding: 20, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={s.sectionTitle}>ACTIVE ORDERS</div>
      {active.length === 0 && <div style={{ color: "#777", fontSize: 13, marginBottom: 20 }}>No active orders.</div>}
      {[...active].reverse().map(o => (
        <div key={o.num} style={s.orderCard}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>#{o.num}</span>
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[o.status] || "#888") + "22", color: STATUS_COLOR[o.status] || "#888" }}>
              {o.status}
            </span>
          </div>
          <div style={{ color: "#999", fontSize: 12, marginBottom: 4 }}>{o.type}{o.customer ? " - " + o.customer.name : ""}</div>
            {(o.slotLabel || o.scheduledTime || o.source === "online") && (
              <div style={{ marginBottom: 6, background: "#3a86ff11", border: "1px solid #3a86ff33", borderRadius: 6, padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#3a86ff", fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>
                  {o.type === "Delivery" ? "DELIVER BY" : "PICKUP AT"}
                </span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{o.slotLabel || (o.scheduledTime ? (o.scheduledTime.includes("T") ? new Date(o.scheduledTime).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : o.scheduledTime) : "ASAP")}</span>
              </div>
            )}
          {o.items.map((it, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <div style={{ color: "#999", fontSize: 12 }}>{it.qty}x {it.name}</div>
              {selectionSummary(it).map((line, j) => <div key={j} style={{ color: "#888", fontSize: 11, paddingLeft: 10 }}>+ {line}</div>)}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ color: "#e85d04", fontWeight: 700 }}>{fmt(o.total)}</span>
            <span style={{ color: "#888", fontSize: 11 }}>{o.time}</span>
          </div>
          {/* Complete button for Take Out orders that are Ready */}
          {o.status === "Ready" && o.type !== "Delivery" && (
            <button
              onClick={() => onUpdateStatus && onUpdateStatus(o.num, "Completed")}
              style={{ marginTop: 10, width: "100%", padding: "10px 0", background: "#06d6a0", border: "none", borderRadius: 8, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", letterSpacing: 1, touchAction: "manipulation" }}
            >
              ✓ MARK PICKED UP / COMPLETE
            </button>
          )}
        </div>
      ))}
      {done.length > 0 && (
        <div>
          <div style={{ ...s.sectionTitle, marginTop: 24, color: "#555" }}>COMPLETED TODAY</div>
          {[...done].reverse().map(o => (
            <div key={o.num} style={{ ...s.orderCard, opacity: 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#888", fontWeight: 700, fontSize: 14 }}>#{o.num} — {o.type}</span>
                <span style={{ color: "#555", fontSize: 11 }}>{o.status}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#666", fontWeight: 700, fontSize: 13 }}>{fmt(o.total)}</span>
                <span style={{ color: "#555", fontSize: 11 }}>{o.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPORTS VIEW
// ---------------------------------------------------------------------------
function ReportsView({ orders, shifts, employees, settings }) {
  const [range, setRange] = useState("today");
  const [tab, setTab] = useState("summary");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const taxRate = settings ? settings.taxRate : 0.06;

  // Date range filter
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

  const getRangeBounds = () => {
    switch(range) {
      case "today":
        return [startOfDay(now), endOfDay(now)];
      case "yesterday": {
        const y = new Date(now); y.setDate(y.getDate()-1);
        return [startOfDay(y), endOfDay(y)];
      }
      case "week": {
        const w = new Date(now); w.setDate(w.getDate() - w.getDay());
        return [startOfDay(w), endOfDay(now)];
      }
      case "lastweek": {
        const lws = new Date(now); lws.setDate(lws.getDate() - lws.getDay() - 7);
        const lwe = new Date(lws); lwe.setDate(lws.getDate() + 6);
        return [startOfDay(lws), endOfDay(lwe)];
      }
      case "month": {
        const ms = new Date(now.getFullYear(), now.getMonth(), 1);
        return [ms, endOfDay(now)];
      }
      case "lastmonth": {
        const lms = new Date(now.getFullYear(), now.getMonth()-1, 1);
        const lme = new Date(now.getFullYear(), now.getMonth(), 0);
        return [lms, endOfDay(lme)];
      }
      case "custom":
        if (customFrom && customTo) return [startOfDay(new Date(customFrom)), endOfDay(new Date(customTo))];
        return [startOfDay(now), endOfDay(now)];
      default:
        return [startOfDay(now), endOfDay(now)];
    }
  };

  const [fromDate, toDate] = getRangeBounds();

  const filteredOrders = orders.filter(o => {
    const t = o.placedAt ? new Date(o.placedAt) : new Date();
    return t >= fromDate && t <= toDate;
  });

  const filteredShifts = (shifts || []).filter(s => {
    const t = new Date(s.clockIn);
    return t >= fromDate && t <= toDate;
  });

  // Core calculations
  const subtotalSum = filteredOrders.reduce((a, o) => {
    const sub = o.items.reduce((x, i) => x + calcItemTotal(i), 0);
    return a + sub;
  }, 0);
  const taxSum = subtotalSum * taxRate;
  const totalSales = filteredOrders.reduce((a, o) => a + o.total, 0);
  const avgTicket = filteredOrders.length ? totalSales / filteredOrders.length : 0;
  const deliveryOrders = filteredOrders.filter(o => o.type === "Delivery");
  const onlineOrders = filteredOrders.filter(o => o.source === "online");

  // Labor
  const laborHours = filteredShifts.reduce((a, s) => {
    const ms = (s.clockOut || Date.now()) - s.clockIn;
    return a + ms / 3600000;
  }, 0);
  const laborCost = filteredShifts.reduce((a, s) => {
    const emp = (employees || []).find(e => e.id === s.employeeId);
    const rate = emp ? emp.payRate : 0;
    const hrs = ((s.clockOut || Date.now()) - s.clockIn) / 3600000;
    return a + hrs * rate;
  }, 0);
  const laborPct = totalSales > 0 ? (laborCost / totalSales) * 100 : 0;

  // Item sales
  const itemSales = {};
  filteredOrders.forEach(o => {
    o.items.forEach(it => {
      if (!itemSales[it.name]) itemSales[it.name] = { qty: 0, revenue: 0 };
      itemSales[it.name].qty += it.qty;
      itemSales[it.name].revenue += calcItemTotal(it);
    });
  });
  const itemList = Object.entries(itemSales).sort((a,b) => b[1].revenue - a[1].revenue);

  // Daily breakdown (for week/month view)
  const dailyMap = {};
  filteredOrders.forEach(o => {
    const d = o.placedAt ? new Date(o.placedAt).toLocaleDateString() : "Unknown";
    if (!dailyMap[d]) dailyMap[d] = { orders: 0, total: 0, tax: 0 };
    dailyMap[d].orders++;
    const sub = o.items.reduce((x,i) => x + calcItemTotal(i), 0);
    dailyMap[d].total += o.total;
    dailyMap[d].tax += sub * taxRate;
  });
  const dailyList = Object.entries(dailyMap).sort((a,b) => new Date(a[0]) - new Date(b[0]));

  // Order type breakdown
  const byType = ["Dine In","Take Out","Delivery"].map(type => {
    const os = filteredOrders.filter(o => o.type === type);
    return { type, count: os.length, total: os.reduce((a,o) => a+o.total, 0) };
  });

  const rangeOptions = [
    ["today","Today"], ["yesterday","Yesterday"],
    ["week","This Week"], ["lastweek","Last Week"],
    ["month","This Month"], ["lastmonth","Last Month"],
    ["custom","Custom"],
  ];

  const tabs = [
    ["summary","Summary"],
    ["sales","Sales"],
    ["items","Items"],
    ["labor","Labor"],
    ["tax","Tax"],
  ];

  const statCard = (label, value, sub, color) => (
    <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: "#999", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ color: color || "#fff", fontWeight: 700, fontSize: 22 }}>{value}</div>
      {sub && <div style={{ color: "#777", fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  const tableRow = (cols, isHeader) => (
    <div style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #1a1a1a" }}>
      {cols.map((c, i) => (
        <div key={i} style={{ flex: c.flex || 1, color: isHeader ? "#999" : (c.color || "#ccc"), fontSize: isHeader ? 11 : 13, fontWeight: isHeader ? 700 : (c.bold ? 700 : 400), textAlign: c.right ? "right" : "left", letterSpacing: isHeader ? 1 : 0, textTransform: isHeader ? "uppercase" : "none" }}>
          {c.val}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header with range selector */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#111", flexShrink: 0 }}>
        <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, flexShrink: 0 }}>REPORTS</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {rangeOptions.map(([id, label]) => (
            <button key={id} onClick={() => setRange(id)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid " + (range===id ? "#e85d04" : "#2a2a2a"), background: range===id ? "#e85d0422" : "none", color: range===id ? "#e85d04" : "#aaa", fontSize: 12, cursor: "pointer", fontWeight: range===id ? 700 : 400 }}>
              {label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "5px 8px", fontSize: 13, outline: "none" }} />
            <span style={{ color: "#777" }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "5px 8px", fontSize: 13, outline: "none" }} />
          </div>
        )}
        <div style={{ marginLeft: "auto", color: "#777", fontSize: 12 }}>
          {filteredOrders.length} orders · {fromDate.toLocaleDateString()} {range !== "today" && range !== "yesterday" ? "— " + toDate.toLocaleDateString() : ""}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", background: "#0f0f0f" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "10px 0", background: "none", border: "none", borderBottom: tab===id ? "2px solid #e85d04" : "none", color: tab===id ? "#e85d04" : "#aaa", fontSize: 12, fontWeight: tab===id ? 700 : 400, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20, minHeight: 0, WebkitOverflowScrolling: "touch" }}>

        {/* SUMMARY TAB */}
        {tab === "summary" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 24 }}>
              {statCard("Total Sales", fmt(totalSales), filteredOrders.length + " orders", "#e85d04")}
              {statCard("Avg Ticket", fmt(avgTicket), "per order")}
              {statCard("Sales Tax", fmt(taxSum), (taxRate*100).toFixed(0) + "% rate", "#3a86ff")}
              {statCard("Labor Cost", fmt(laborCost), laborPct.toFixed(1) + "% of sales", laborPct > 35 ? "#c0392b" : "#06d6a0")}
              {statCard("Online Orders", onlineOrders.length, fmt(onlineOrders.reduce((a,o) => a+o.total, 0)))}
              {statCard("Deliveries", deliveryOrders.length, fmt(deliveryOrders.reduce((a,o) => a+o.total, 0)))}
            </div>

            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>BY ORDER TYPE</div>
            {tableRow([{val:"Type"},{val:"Orders",right:true},{val:"Revenue",right:true,flex:1}], true)}
            {byType.map(({type,count,total}) => tableRow([
              {val:type},
              {val:count,right:true,color:"#aaa"},
              {val:fmt(total),right:true,color:"#e85d04",bold:true},
            ]))}

            {dailyList.length > 1 && (
              <>
                <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>DAILY BREAKDOWN</div>
                {tableRow([{val:"Date"},{val:"Orders",right:true},{val:"Sales",right:true},{val:"Tax",right:true}], true)}
                {dailyList.map(([date, d]) => tableRow([
                  {val:date},
                  {val:d.orders,right:true,color:"#aaa"},
                  {val:fmt(d.total),right:true,color:"#e85d04",bold:true},
                  {val:fmt(d.tax),right:true,color:"#3a86ff"},
                ]))}
              </>
            )}
          </div>
        )}

        {/* SALES TAB */}
        {tab === "sales" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 24 }}>
              {statCard("Gross Sales", fmt(totalSales), "incl. tax", "#e85d04")}
              {statCard("Net Sales", fmt(subtotalSum), "excl. tax")}
              {statCard("Tax Collected", fmt(taxSum), (taxRate*100).toFixed(0)+"%", "#3a86ff")}
              {statCard("Orders", filteredOrders.length, "avg " + fmt(avgTicket) + " each")}
            </div>

            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>SALES BY ORDER TYPE</div>
            {tableRow([{val:"Type"},{val:"Count",right:true},{val:"Net",right:true},{val:"Tax",right:true},{val:"Total",right:true}], true)}
            {byType.map(({type,count,total}) => {
              const sub = filteredOrders.filter(o=>o.type===type).reduce((a,o)=>a+o.items.reduce((x,i)=>x+calcItemTotal(i),0),0);
              return tableRow([
                {val:type},
                {val:count,right:true,color:"#aaa"},
                {val:fmt(sub),right:true},
                {val:fmt(sub*taxRate),right:true,color:"#3a86ff"},
                {val:fmt(total),right:true,color:"#e85d04",bold:true},
              ]);
            })}

            {dailyList.length > 0 && (
              <>
                <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>DAILY SALES</div>
                {tableRow([{val:"Date"},{val:"Orders",right:true},{val:"Net Sales",right:true},{val:"Tax",right:true},{val:"Total",right:true}], true)}
                {dailyList.map(([date, d]) => tableRow([
                  {val:date},
                  {val:d.orders,right:true,color:"#aaa"},
                  {val:fmt(d.total - d.tax),right:true},
                  {val:fmt(d.tax),right:true,color:"#3a86ff"},
                  {val:fmt(d.total),right:true,color:"#e85d04",bold:true},
                ]))}
              </>
            )}
          </div>
        )}

        {/* ITEMS TAB */}
        {tab === "items" && (
          <div>
            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>SALES BY ITEM</div>
            {itemList.length === 0 && <div style={{ color: "#777", fontSize: 13 }}>No items sold in this period.</div>}
            {tableRow([{val:"Item",flex:2},{val:"Qty",right:true},{val:"Revenue",right:true},{val:"% of Sales",right:true}], true)}
            {itemList.map(([name, data]) => tableRow([
              {val:name,flex:2},
              {val:data.qty,right:true,color:"#aaa"},
              {val:fmt(data.revenue),right:true,color:"#e85d04",bold:true},
              {val:totalSales > 0 ? (data.revenue/totalSales*100).toFixed(1)+"%" : "0%",right:true,color:"#777"},
            ]))}
          </div>
        )}

        {/* LABOR TAB */}
        {tab === "labor" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 24 }}>
              {statCard("Total Labor", fmt(laborCost), laborHours.toFixed(1) + " hrs worked", "#06d6a0")}
              {statCard("Labor %", laborPct.toFixed(1) + "%", "of gross sales", laborPct > 35 ? "#c0392b" : "#06d6a0")}
              {statCard("Hours Worked", laborHours.toFixed(1), "across all staff")}
              {statCard("Avg Hourly Cost", laborHours > 0 ? fmt(laborCost/laborHours) : "$0.00", "blended rate")}
            </div>

            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>LABOR BY EMPLOYEE</div>
            {filteredShifts.length === 0 && <div style={{ color: "#777", fontSize: 13 }}>No shifts recorded in this period.</div>}
            {tableRow([{val:"Employee",flex:2},{val:"Shifts",right:true},{val:"Hours",right:true},{val:"Rate",right:true},{val:"Cost",right:true}], true)}
            {(employees || []).map(emp => {
              const empShifts = filteredShifts.filter(s => s.employeeId === emp.id);
              if (empShifts.length === 0) return null;
              const hrs = empShifts.reduce((a,s)=>a+((s.clockOut||Date.now())-s.clockIn)/3600000,0);
              const cost = hrs * emp.payRate;
              return tableRow([
                {val:emp.name,flex:2},
                {val:empShifts.length,right:true,color:"#aaa"},
                {val:hrs.toFixed(2),right:true},
                {val:emp.payRate > 0 ? fmt(emp.payRate)+"/hr" : "N/A",right:true,color:"#aaa"},
                {val:emp.payRate > 0 ? fmt(cost) : "—",right:true,color:"#06d6a0",bold:true},
              ]);
            }).filter(Boolean)}

            <div style={{ marginTop: 24, background: "#141414", border: "1px solid #1a1a1a", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "#aaa" }}>Total Hours</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>{laborHours.toFixed(2)} hrs</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "#aaa" }}>Total Labor Cost</span>
                <span style={{ color: "#06d6a0", fontWeight: 700 }}>{fmt(laborCost)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #1a1a1a" }}>
                <span style={{ color: "#aaa" }}>Labor as % of Sales</span>
                <span style={{ color: laborPct > 35 ? "#c0392b" : "#06d6a0", fontWeight: 700 }}>{laborPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* TAX TAB */}
        {tab === "tax" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 24 }}>
              {statCard("Tax Collected", fmt(taxSum), "total for period", "#3a86ff")}
              {statCard("Net Sales", fmt(subtotalSum), "taxable amount")}
              {statCard("Tax Rate", (taxRate*100).toFixed(1)+"%", "current rate")}
              {statCard("Gross Sales", fmt(totalSales), "net + tax")}
            </div>

            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>TAX BREAKDOWN BY DAY</div>
            {dailyList.length === 0 && <div style={{ color: "#777", fontSize: 13 }}>No sales in this period.</div>}
            {tableRow([{val:"Date"},{val:"Net Sales",right:true},{val:"Tax Rate",right:true},{val:"Tax Collected",right:true}], true)}
            {dailyList.map(([date, d]) => tableRow([
              {val:date},
              {val:fmt(d.total - d.tax),right:true},
              {val:(taxRate*100).toFixed(1)+"%",right:true,color:"#aaa"},
              {val:fmt(d.tax),right:true,color:"#3a86ff",bold:true},
            ]))}

            <div style={{ marginTop: 24, background: "#141414", border: "1px solid #1a1a1a", borderRadius: 10, padding: 16 }}>
              <div style={{ color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 14 }}>PERIOD TOTAL</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "#aaa" }}>Net Sales (taxable)</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(subtotalSum)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "#aaa" }}>Tax Rate</span>
                <span style={{ color: "#aaa" }}>{(taxRate*100).toFixed(1)}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #1a1a1a" }}>
                <span style={{ color: "#ccc", fontWeight: 700 }}>Total Tax Owed</span>
                <span style={{ color: "#3a86ff", fontWeight: 700, fontSize: 18 }}>{fmt(taxSum)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Menu Manager
// ---------------------------------------------------------------------------
function MenuManager({ menu, setMenu }) {
  const [activeCat, setActiveCat] = useState(Object.keys(menu)[0]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Group editing state
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupMin, setNewGroupMin] = useState("0");
  const [newGroupMax, setNewGroupMax] = useState("99");
  const [newGroupSides, setNewGroupSides] = useState(false);
  const [newModName, setNewModName] = useState("");
  const [newModPrice, setNewModPrice] = useState("0");

  const cats = Object.keys(menu);

  const itemsInCat = (menu[activeCat] || []);
  const item = selectedItem ? itemsInCat.find(i => i.id === selectedItem) : null;

  const updateItem = (updater) => {
    setMenu(prev => ({
      ...prev,
      [activeCat]: prev[activeCat].map(i => i.id === selectedItem ? updater(i) : i),
    }));
  };

  const addItem = () => {
    const name = newItemName.trim();
    const price = parseFloat(newItemPrice);
    if (!name || isNaN(price)) return;
    const newItem = { id: newId(), name, base: price, modifierGroups: [], availableOnline: true };
    setMenu(prev => ({ ...prev, [activeCat]: [...(prev[activeCat] || []), newItem] }));
    setNewItemName(""); setNewItemPrice("");
  };

  const removeItem = (id) => {
    setMenu(prev => ({ ...prev, [activeCat]: prev[activeCat].filter(i => i.id !== id) }));
    if (selectedItem === id) setSelectedItem(null);
    setConfirmDelete(null);
  };

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name || menu[name]) return;
    setMenu(prev => ({ ...prev, [name]: [] }));
    setActiveCat(name); setNewCatName("");
  };

  const removeCategory = (cat) => {
    if (cats.length <= 1) return;
    setMenu(prev => { const n = { ...prev }; delete n[cat]; return n; });
    setActiveCat(cats.filter(c => c !== cat)[0]);
    setConfirmDelete(null);
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const group = { id: newId(), name, min: parseInt(newGroupMin) || 0, max: parseInt(newGroupMax) || 99, allowSides: newGroupSides, modifiers: [] };
    updateItem(i => ({ ...i, modifierGroups: [...i.modifierGroups, group] }));
    setNewGroupName(""); setNewGroupMin("0"); setNewGroupMax("99"); setNewGroupSides(false);
  };

  const removeGroup = (gid) => {
    updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.filter(g => g.id !== gid) }));
    if (editingGroup === gid) setEditingGroup(null);
  };

  const updateGroup = (gid, changes) => {
    updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(g => g.id === gid ? { ...g, ...changes } : g) }));
  };

  const addModifier = (gid) => {
    const name = newModName.trim();
    const price = parseFloat(newModPrice) || 0;
    if (!name) return;
    const mod = { id: newId(), name, price };
    updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(g => g.id === gid ? { ...g, modifiers: [...g.modifiers, mod] } : g) }));
    setNewModName(""); setNewModPrice("0");
  };

  const removeModifier = (gid, mid) => {
    updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(g => g.id === gid ? { ...g, modifiers: g.modifiers.filter(m => m.id !== mid) } : g) }));
  };

  const moveItem = (id, dir) => {
    setMenu(prev => {
      const arr = prev[activeCat] || [];
      const idx = arr.findIndex(i => i.id === id);
      return { ...prev, [activeCat]: moveArr(arr, idx, dir) };
    });
  };

  const moveGroup = (gid, dir) => {
    updateItem(i => {
      const idx = i.modifierGroups.findIndex(g => g.id === gid);
      return { ...i, modifierGroups: moveArr(i.modifierGroups, idx, dir) };
    });
  };

  const moveModifier = (gid, mid, dir) => {
    updateItem(i => ({
      ...i,
      modifierGroups: i.modifierGroups.map(g => {
        if (g.id !== gid) return g;
        const idx = g.modifiers.findIndex(m => m.id === mid);
        return { ...g, modifiers: moveArr(g.modifiers, idx, dir) };
      }),
    }));
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

      {/* Col 1: Categories + Items */}
      <div style={{ width: 260, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* Categories */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #1a1a1a" }}>
          <div style={s.sectionTitle}>CATEGORIES</div>
          {cats.map(cat => (
            <div key={cat} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <button onClick={() => { setActiveCat(cat); setSelectedItem(null); }} style={{
                flex: 1, textAlign: "left", background: activeCat === cat ? "#1a1a1a" : "none",
                border: "1px solid " + (activeCat === cat ? "#e85d04" : "#2a2a2a"),
                color: activeCat === cat ? "#e85d04" : "#888", padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
              }}>
                {cat} <span style={{ color: "#888", fontSize: 11 }}>({(menu[cat] || []).length})</span>
              </button>
              {cats.length > 1 && (
                <button onClick={() => setConfirmDelete({ type: "category", value: cat })} style={{ ...s.dangerBtn, marginLeft: 4, padding: "6px 8px" }}>x</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            <input placeholder="New category" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategory()} style={{ ...s.editInput, flex: 1 }} />
            <button onClick={addCategory} style={s.addBtn}>+</button>
          </div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, padding: "10px 12px", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={s.sectionTitle}>ITEMS</div>
          {itemsInCat.map(it => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              {editingItem === it.id ? (
                <div style={{ flex: 1, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <input value={it.name} onChange={e => updateItem(i => ({ ...i, name: e.target.value }))} style={{ ...s.editInput, flex: 1 }} />
                  <input type="number" value={it.base} onChange={e => updateItem(i => ({ ...i, base: parseFloat(e.target.value) || 0 }))} style={{ ...s.editInput, width: 60 }} />
                  <input
                    type="number"
                    placeholder="Stock"
                    value={it.stock == null ? "" : it.stock}
                    onChange={e => updateItem(i => ({ ...i, stock: e.target.value === "" ? null : parseInt(e.target.value) || 0 }))}
                    title="Leave blank for unlimited"
                    style={{ ...s.editInput, width: 60 }}
                  />
                  <button onClick={() => setEditingItem(null)} style={s.saveBtn}>OK</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setSelectedItem(it.id)} style={{
                    flex: 1, textAlign: "left", background: selectedItem === it.id ? "#1a1a1a" : "none",
                    border: "1px solid " + (selectedItem === it.id ? "#3a86ff" : "#2a2a2a"),
                    color: selectedItem === it.id ? "#fff" : "#888", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span>{it.name}</span>
                      {it.availableOnline && <span style={{ fontSize: 9, background: "#06d6a022", color: "#06d6a0", borderRadius: 3, padding: "1px 4px", letterSpacing: 0.5 }}>WEB</span>}
                      {it.stock === 0 && <span style={{ fontSize: 9, background: "#c0392b22", color: "#c0392b", borderRadius: 3, padding: "1px 4px", letterSpacing: 0.5 }}>OUT</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ color: "#e85d04", fontSize: 11 }}>{fmt(it.base)}</span>
                      {it.stock != null && <span style={{ color: it.stock === 0 ? "#c0392b" : it.stock <= 3 ? "#f77f00" : "#555", fontSize: 10 }}>{it.stock === 0 ? "sold out" : it.stock + " left"}</span>}
                    </div>
                  </button>
                  <button
                    onClick={() => setMenu(prev => ({ ...prev, [activeCat]: prev[activeCat].map(i => i.id === it.id ? { ...i, availableOnline: !i.availableOnline } : i) }))}
                    title={it.availableOnline ? "Available online — click to hide" : "Hidden online — click to show"}
                    style={{ background: it.availableOnline ? "#06d6a022" : "none", border: "1px solid " + (it.availableOnline ? "#06d6a044" : "#2a2a2a"), color: it.availableOnline ? "#06d6a0" : "#333", padding: "4px 6px", borderRadius: 5, cursor: "pointer", fontSize: 10, marginLeft: 2, flexShrink: 0 }}
                  >
                    {it.availableOnline ? "ON" : "OFF"}
                  </button>
                  <div style={{ display: "flex", flexDirection: "column", marginLeft: 2 }}>
                    <button onClick={() => moveItem(it.id, -1)} style={s.reorderBtn}>^</button>
                    <button onClick={() => moveItem(it.id, 1)} style={s.reorderBtn}>v</button>
                  </div>
                  <button onClick={() => setEditingItem(it.id)} style={{ ...s.editBtn, marginLeft: 2, padding: "6px 8px" }}>e</button>
                  <button onClick={() => setConfirmDelete({ type: "item", value: it.id })} style={{ ...s.dangerBtn, marginLeft: 2, padding: "6px 8px" }}>x</button>
                </>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            <input placeholder="Item name" value={newItemName} onChange={e => setNewItemName(e.target.value)} style={{ ...s.editInput, flex: 1, minWidth: 100 }} />
            <input type="number" placeholder="Price" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} style={{ ...s.editInput, width: 60 }} />
            <button onClick={addItem} style={s.addBtn}>+ Add</button>
          </div>
        </div>
      </div>

      {/* Col 2: Modifier Groups */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {!item ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#777", fontSize: 13 }}>
            Select an item to manage its modifier groups
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{item.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#999", fontSize: 12 }}>Stock:</span>
                <input
                  type="number"
                  placeholder="unlimited"
                  value={item.stock == null ? "" : item.stock}
                  onChange={e => updateItem(i => ({ ...i, stock: e.target.value === "" ? null : parseInt(e.target.value) || 0 }))}
                  style={{ ...s.editInput, width: 90, fontSize: 13, textAlign: "center" }}
                />
                {item.stock != null && (
                  <button onClick={() => updateItem(i => ({ ...i, stock: null }))} style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer" }}>unlimited</button>
                )}
              </div>
            </div>
            <div style={{ color: "#e85d04", marginBottom: 14 }}>{fmt(item.base)} base price</div>
            <div style={s.sectionTitle}>MODIFIER GROUPS</div>

            {item.modifierGroups.map(g => (
              <div key={g.id} style={{ background: "#141414", border: "1px solid " + (editingGroup === g.id ? "#e85d04" : "#1a1a1a"), borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                {/* Group header */}
                <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: "#ddd", fontWeight: 700 }}>{g.name}</span>
                    <span style={{ color: "#999", fontSize: 11, marginLeft: 8 }}>
                      min {g.min} / max {g.max === 99 ? "any" : g.max}
                      {g.allowSides ? " / sides" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => moveGroup(g.id, -1)} style={s.reorderBtn}>^</button>
                    <button onClick={() => moveGroup(g.id, 1)} style={s.reorderBtn}>v</button>
                  </div>
                  <button onClick={() => setEditingGroup(editingGroup === g.id ? null : g.id)} style={s.editBtn}>
                    {editingGroup === g.id ? "Done" : "Edit"}
                  </button>
                  <button onClick={() => removeGroup(g.id)} style={s.dangerBtn}>x</button>
                </div>

                {/* Group edit panel */}
                {editingGroup === g.id && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #1a1a1a" }}>
                    {/* Group settings */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Group Name</div>
                        <input value={g.name} onChange={e => updateGroup(g.id, { name: e.target.value })} style={{ ...s.editInput, width: "100%" }} />
                      </div>
                      <div style={{ width: 60 }}>
                        <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Min</div>
                        <input type="number" value={g.min} onChange={e => updateGroup(g.id, { min: parseInt(e.target.value) || 0 })} style={{ ...s.editInput, width: "100%" }} />
                      </div>
                      <div style={{ width: 60 }}>
                        <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Max</div>
                        <input type="number" value={g.max} onChange={e => updateGroup(g.id, { max: parseInt(e.target.value) || 99 })} style={{ ...s.editInput, width: "100%" }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                        <label style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", paddingBottom: 6 }}>
                          <input type="checkbox" checked={g.allowSides} onChange={e => updateGroup(g.id, { allowSides: e.target.checked })} />
                          Allow L/R sides
                        </label>
                      </div>
                    </div>

                    {/* Bulk price setter */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", background: "#111", borderRadius: 7, border: "1px solid #2a2a2a" }}>
                      <span style={{ color: "#888", fontSize: 12, flex: 1 }}>Set all to same price:</span>
                      <span style={{ color: "#888", fontSize: 12 }}>$</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        step="0.25"
                        style={{ ...s.editInput, width: 70 }}
                        onChange={e => {
                          const price = parseFloat(e.target.value) || 0;
                          const halfPrice = Math.round(price / 2 * 100) / 100;
                          updateItem(i => ({
                            ...i,
                            modifierGroups: i.modifierGroups.map(gg =>
                              gg.id !== g.id ? gg : {
                                ...gg,
                                modifiers: gg.modifiers.map(mm => ({ ...mm, price, halfPrice }))
                              }
                            )
                          }));
                        }}
                      />
                    </div>
                    {/* Modifiers */}
                    <div style={{ color: "#999", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Modifiers</div>
                    {g.modifiers.map(m => (
                      <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px auto auto", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
                        {/* Name */}
                        <input
                          value={m.name}
                          onChange={e => updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(gg => gg.id !== g.id ? gg : { ...gg, modifiers: gg.modifiers.map(mm => mm.id === m.id ? { ...mm, name: e.target.value } : mm) }) }))}
                          style={{ ...s.editInput, width: "100%", minWidth: 0 }}
                        />
                        {/* Whole price */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ color: "#e85d04", fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>WHOLE</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, width: "100%" }}>
                            <span style={{ color: "#888", fontSize: 12 }}>$</span>
                            <input
                              type="number"
                              value={m.price}
                              placeholder="0.00"
                              step="0.25"
                              onChange={e => updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(gg => gg.id !== g.id ? gg : { ...gg, modifiers: gg.modifiers.map(mm => mm.id === m.id ? { ...mm, price: parseFloat(e.target.value) || 0 } : mm) }) }))}
                              style={{ ...s.editInput, flex: 1, minWidth: 0, textAlign: "right", fontSize: 15, fontWeight: 700, color: "#e85d04" }}
                            />
                          </div>
                        </div>
                        {/* Half price */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ color: "#f77f00", fontSize: 9, letterSpacing: 1, fontWeight: 700 }}>HALF</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, width: "100%" }}>
                            <span style={{ color: "#888", fontSize: 12 }}>$</span>
                            <input
                              type="number"
                              value={m.halfPrice ?? (m.price / 2)}
                              placeholder="0.00"
                              step="0.25"
                              disabled={m.noHalf}
                              onChange={e => updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(gg => gg.id !== g.id ? gg : { ...gg, modifiers: gg.modifiers.map(mm => mm.id === m.id ? { ...mm, halfPrice: parseFloat(e.target.value) || 0 } : mm) }) }))}
                              style={{ ...s.editInput, flex: 1, minWidth: 0, textAlign: "right", fontSize: 15, fontWeight: 700, color: "#f77f00", opacity: m.noHalf ? 0.3 : 1 }}
                            />
                          </div>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: m.noHalf ? "#e85d04" : "#666", cursor: "pointer", whiteSpace: "nowrap" }}>
                            <input type="checkbox" checked={!!m.noHalf} onChange={e => updateItem(i => ({ ...i, modifierGroups: i.modifierGroups.map(gg => gg.id !== g.id ? gg : { ...gg, modifiers: gg.modifiers.map(mm => mm.id === m.id ? { ...mm, noHalf: e.target.checked } : mm) }) }))} />
                            No Half
                          </label>
                        </div>
                        {/* Reorder */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <button onClick={() => moveModifier(g.id, m.id, -1)} style={s.reorderBtn}>^</button>
                          <button onClick={() => moveModifier(g.id, m.id, 1)} style={s.reorderBtn}>v</button>
                        </div>
                        {/* Delete */}
                        <button onClick={() => removeModifier(g.id, m.id)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 16, padding: "0 4px", minHeight: 36, touchAction: "manipulation" }}>x</button>
                      </div>
                    ))}
                    {/* Add modifier */}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <input placeholder="Modifier name" value={newModName} onChange={e => setNewModName(e.target.value)} onKeyDown={e => e.key === "Enter" && addModifier(g.id)} style={{ ...s.editInput, flex: 1, minWidth: 120 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ color: "#888", fontSize: 12 }}>$</span>
                        <input type="number" placeholder="0.00" value={newModPrice} onChange={e => setNewModPrice(e.target.value)} style={{ ...s.editInput, width: 70 }} />
                      </div>
                      <button onClick={() => addModifier(g.id)} style={s.addBtn}>+ Add</button>
                    </div>
                  </div>
                )}

                {/* Modifier chips when collapsed */}
                {editingGroup !== g.id && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 14px 12px" }}>
                    {g.modifiers.map(m => (
                      <span key={m.id} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#777", borderRadius: 20, padding: "2px 8px", fontSize: 11 }}>
                        {m.name}{m.price > 0 ? " +" + fmt(m.price) : ""}
                      </span>
                    ))}
                    {g.modifiers.length === 0 && <span style={{ color: "#777", fontSize: 11 }}>No modifiers yet</span>}
                  </div>
                )}
              </div>
            ))}

            {/* Add Group */}
            <div style={{ background: "#141414", border: "1px dashed #2a2a2a", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#999", fontSize: 12, marginBottom: 10 }}>Add Modifier Group</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Group name (e.g. Toppings)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} style={{ ...s.editInput, flex: 1, minWidth: 140 }} />
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="number" placeholder="Min" value={newGroupMin} onChange={e => setNewGroupMin(e.target.value)} style={{ ...s.editInput, width: 55 }} />
                  <input type="number" placeholder="Max" value={newGroupMax} onChange={e => setNewGroupMax(e.target.value)} style={{ ...s.editInput, width: 55 }} />
                </div>
                <label style={{ color: "#888", fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={newGroupSides} onChange={e => setNewGroupSides(e.target.checked)} />
                  L/R sides
                </label>
                <button onClick={addGroup} style={s.addBtn}>+ Add Group</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div style={s.overlay}>
          <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, padding: 24, width: 300, textAlign: "center" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Confirm Delete</div>
            <div style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
              {confirmDelete.type === "category" ? "Delete category \"" + confirmDelete.value + "\" and all its items?" : "Remove this item?"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={s.cancelBtn}>Cancel</button>
              <button onClick={() => { confirmDelete.type === "category" ? removeCategory(confirmDelete.value) : removeItem(confirmDelete.value); }} style={{ ...s.confirmBtn, background: "#c0392b" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// EMPLOYEE DATA & PERMISSIONS
// ---------------------------------------------------------------------------

const ALL_PERMISSIONS = [
  { key: "pos",        label: "POS — Take Orders" },
  { key: "kds",        label: "KDS — Kitchen Display" },
  { key: "cfd",        label: "Customer Display" },
  { key: "orders",     label: "View Orders" },
  { key: "reports",    label: "View Reports" },
  { key: "menu",       label: "Menu Manager" },
  { key: "settings",   label: "Store Settings" },
  { key: "employees",  label: "Employee Management" },
  { key: "drawer",     label: "Cash Drawer / Voids" },
  { key: "discounts",  label: "Apply Discounts" },
  { key: "stock",       label: "Edit Stock Quantities" },
  { key: "driver",      label: "Delivery Driver" },
];

const ROLE_DEFAULTS = {
  owner:    Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, true])),
  manager:  { pos: true, kds: true, cfd: true, orders: true, reports: true, menu: true, settings: false, employees: false, drawer: true, discounts: true, stock: true, driver: true },
  employee: { pos: true, kds: true, cfd: true, orders: false, reports: false, menu: false, settings: false, employees: false, drawer: false, discounts: false, stock: false, driver: false },
  foh:      { pos: true, kds: false, cfd: true, orders: true, reports: false, menu: false, settings: false, employees: false, drawer: false, discounts: false, stock: false, driver: false },
  boh:      { pos: false, kds: true, cfd: false, orders: true, reports: false, menu: false, settings: false, employees: false, drawer: false, discounts: false, stock: true, driver: false },
  driver:   { pos: false, kds: false, cfd: false, orders: false, reports: false, menu: false, settings: false, employees: false, drawer: false, discounts: false, stock: false, driver: true },
  maker:    { pos: false, kds: true, cfd: false, orders: false, reports: false, menu: false, settings: false, employees: false, drawer: false, discounts: false, stock: true, driver: false },
};

let empIdGen = 100;
const newEmpId = () => ++empIdGen;

const SEED_EMPLOYEES = [
  { id: 1, name: "Josh DeFelice",    pin: "9808", role: "owner", payRate: 0, phone: "", email: "", active: true, permissions: { ...ROLE_DEFAULTS.owner } },
  { id: 2, name: "Rocco Pifferetti", pin: "3177", role: "owner", payRate: 0, phone: "", email: "", active: true, permissions: { ...ROLE_DEFAULTS.owner } },
];

// ---------------------------------------------------------------------------
// PIN LOGIN SCREEN
// ---------------------------------------------------------------------------
function PinScreen({ employees, onLogin }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const attempt = (p) => {
    const emp = employees.find(e => e.active && e.pin === p);
    if (emp) {
      setPin("");
      setError(false);
      onLogin(emp);
    } else {
      setShake(true);
      setError(true);
      setTimeout(() => { setShake(false); setPin(""); setError(false); }, 800);
    }
  };

  const press = (d) => {
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) attempt(next);
  };

  const del = () => setPin(p => p.slice(0, -1));

  const dots = [0,1,2,3].map(i => (
    <div key={i} style={{
      width: 16, height: 16, borderRadius: "50%",
      background: i < pin.length ? (error ? "#c0392b" : "#e85d04") : "#2a2a2a",
      transition: "background 0.15s",
    }} />
  ));

  const keys = [
    ["1","2","3"],["4","5","6"],["7","8","9"],["","0","<"]
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#080808", gap: 24, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "20px 0" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#e85d04", letterSpacing: 3 }}>PIZZA TIME</div>
        <div style={{ color: "#777", fontSize: 12, letterSpacing: 4, marginTop: 6 }}>ENTER YOUR PIN</div>
      </div>

      <div style={{ display: "flex", gap: 14, transform: shake ? "translateX(8px)" : "none", transition: "transform 0.1s" }}>
        {dots}
      </div>

      {error && <div style={{ color: "#c0392b", fontSize: 13, marginTop: -16 }}>Invalid PIN</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {keys.map((row, r) => (
          <div key={r} style={{ display: "flex", gap: 10 }}>
            {row.map((k, i) => (
              <button
                key={i}
                onClick={() => k === "<" ? del() : k ? press(k) : null}
                style={{
                  width: 88, height: 88, borderRadius: 14,
                  background: k ? "#141414" : "none",
                  border: k ? "1px solid #2a2a2a" : "none",
                  color: k === "<" ? "#666" : "#fff",
                  fontSize: k === "<" ? 20 : 26,
                  fontWeight: 600, cursor: k ? "pointer" : "default",
                }}
              >
                {k === "<" ? "⌫" : k}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ color: "#888", fontSize: 12 }}>
        {employees.filter(e => e.active).map(e => e.name.split(" ")[0]).join("  ·  ")}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TIMECLOCK VIEW
// ---------------------------------------------------------------------------
function TimeclockView({ session, employees, shifts, onClockIn, onClockOut, onEditShift, canManage }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const activeShifts = shifts.filter(s => !s.clockOut);
  const todayShifts = shifts.filter(s => {
    const d = new Date(s.clockIn);
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  });

  const elapsed = (ms) => {
    const secs = Math.floor((now - ms) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h + ":" + String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
  };

  const hoursWorked = (s) => {
    const ms = (s.clockOut || now) - s.clockIn;
    return (ms / 3600000).toFixed(2);
  };

  const pay = (s) => {
    const emp = employees.find(e => e.id === s.employeeId);
    return emp ? (parseFloat(hoursWorked(s)) * emp.payRate).toFixed(2) : "0.00";
  };

  const myShift = shifts.find(s => s.employeeId === session.id && !s.clockOut);

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Left: my clock */}
      <div style={{ width: 280, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", padding: 20, gap: 16 }}>
        <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3 }}>MY TIMECLOCK</div>
        <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{session.name}</div>
          <div style={{ color: "#999", fontSize: 12, marginBottom: 16 }}>{session.role}</div>
          {myShift ? (
            <>
              <div style={{ color: "#06d6a0", fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>CLOCKED IN</div>
              <div style={{ color: "#06d6a0", fontSize: 28, fontWeight: 700, fontFamily: "monospace", marginBottom: 4 }}>{elapsed(myShift.clockIn)}</div>
              <div style={{ color: "#999", fontSize: 11, marginBottom: 16 }}>since {new Date(myShift.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              <button onClick={() => onClockOut(myShift.id, session.id)} style={{ width: "100%", padding: "18px 0", background: "#c0392b", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", minHeight: 60, touchAction: "manipulation" }}>
                Clock Out
              </button>
            </>
          ) : (
            <>
              <div style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>Not clocked in</div>
              <button onClick={() => onClockIn(session.id)} style={{ width: "100%", padding: "18px 0", background: "#06d6a0", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, fontSize: 16, cursor: "pointer", minHeight: 60, touchAction: "manipulation" }}>
                Clock In
              </button>
            </>
          )}
        </div>

        {/* Today totals for this employee */}
        {(() => {
          const myToday = todayShifts.filter(s => s.employeeId === session.id);
          const totalMs = myToday.reduce((a, s) => a + ((s.clockOut || now) - s.clockIn), 0);
          const totalHrs = (totalMs / 3600000).toFixed(2);
          const totalPay = (parseFloat(totalHrs) * session.payRate).toFixed(2);
          return myToday.length > 0 ? (
            <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 10, padding: 14 }}>
              <div style={{ color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>TODAY</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#888", fontSize: 13 }}>Hours</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>{totalHrs} hrs</span>
              </div>
              {session.payRate > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888", fontSize: 13 }}>Est. Pay</span>
                  <span style={{ color: "#e85d04", fontWeight: 700 }}>${totalPay}</span>
                </div>
              )}
            </div>
          ) : null;
        })()}
      </div>

      {/* Right: all shifts (managers/owners only) */}
      {canManage && (
        <div style={{ flex: 1, overflowY: "auto", padding: 20, minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>TODAY'S SHIFTS</div>

          {/* Active clocked-in employees */}
          {activeShifts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "#06d6a0", fontSize: 11, marginBottom: 10 }}>CURRENTLY CLOCKED IN</div>
              {activeShifts.map(s => {
                const emp = employees.find(e => e.id === s.employeeId);
                return (
                  <div key={s.id} style={{ background: "#141414", border: "1px solid #06d6a033", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 700 }}>{emp ? emp.name : "Unknown"}</div>
                      <div style={{ color: "#999", fontSize: 12 }}>In at {new Date(s.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#06d6a0", fontFamily: "monospace", fontWeight: 700 }}>{elapsed(s.clockIn)}</div>
                      <div style={{ color: "#999", fontSize: 11 }}>{hoursWorked(s)} hrs · ${pay(s)}</div>
                    </div>
                    <button onClick={() => onClockOut(s.id, s.employeeId)} style={{ background: "#c0392b22", border: "1px solid #c0392b44", color: "#c0392b", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Out</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed shifts today */}
          {todayShifts.filter(s => s.clockOut).length > 0 && (
            <div>
              <div style={{ color: "#999", fontSize: 11, marginBottom: 10 }}>COMPLETED SHIFTS</div>
              {todayShifts.filter(s => s.clockOut).map(s => {
                const emp = employees.find(e => e.id === s.employeeId);
                return (
                  <div key={s.id} style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#aaa", fontWeight: 600 }}>{emp ? emp.name : "Unknown"}</div>
                      <div style={{ color: "#999", fontSize: 12 }}>
                        {new Date(s.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {new Date(s.clockOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#888", fontWeight: 700 }}>{hoursWorked(s)} hrs</div>
                      <div style={{ color: "#e85d04", fontSize: 12 }}>${pay(s)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {todayShifts.length === 0 && <div style={{ color: "#777", fontSize: 13 }}>No shifts recorded today.</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMPLOYEE MANAGER VIEW
// ---------------------------------------------------------------------------
function EmployeeManager({ employees, setEmployees, saveEmployee, deleteEmployee, session }) {
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [pinConflict, setPinConflict] = useState(false);

  const emp = selected ? employees.find(e => e.id === selected) : null;

  const startEdit = (e) => {
    setForm({ ...e, payRateStr: e.payRate.toFixed(2) });
    setEditMode(true);
    setPinConflict(false);
  };

  const startNew = () => {
    const blank = { id: "new", name: "", pin: "", role: "employee", payRate: 0, payRateStr: "0.00", phone: "", email: "", active: true, permissions: { ...ROLE_DEFAULTS.employee } };
    setForm(blank);
    setSelected(null);
    setEditMode(true);
    setPinConflict(false);
  };

  const saveForm = () => {
    if (!form.name.trim() || form.pin.length !== 4) return;
    const conflict = employees.find(e => e.pin === form.pin && e.id !== form.id);
    if (conflict) { setPinConflict(true); return; }
    const saved = { ...form, payRate: parseFloat(form.payRateStr) || 0 };
    if (saveEmployee) {
      saveEmployee(saved).then(dbEmp => {
        const final = dbEmp || saved;
        setEmployees(prev => prev.find(e => e.id === final.id) ? prev.map(e => e.id === final.id ? final : e) : [...prev, final]);
        setSelected(final.id);
      }).catch(console.error);
    } else {
      setEmployees(prev => prev.find(e => e.id === saved.id) ? prev.map(e => e.id === saved.id ? saved : e) : [...prev, saved]);
      setSelected(saved.id);
    }
    setEditMode(false);
  };

  const togglePermission = (key) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const applyRoleDefaults = (role) => {
    setForm(f => ({ ...f, role, permissions: { ...ROLE_DEFAULTS[role] } }));
  };

  const roleColor = { owner: "#e85d04", manager: "#3a86ff", employee: "#06d6a0" };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Employee list */}
      <div style={{ width: 240, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "14px 12px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3 }}>EMPLOYEES</div>
          <button onClick={startNew} style={{ background: "#e85d04", border: "none", color: "#fff", padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ New</button>
        </div>
        {employees.map(e => (
          <div key={e.id} onClick={() => { setSelected(e.id); setEditMode(false); }} style={{ padding: "12px 14px", borderBottom: "1px solid #1a1a1a", cursor: "pointer", background: selected === e.id ? "#1a1a1a" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ color: selected === e.id ? "#fff" : "#aaa", fontWeight: 600, fontSize: 13 }}>{e.name}</div>
              {!e.active && <span style={{ color: "#888", fontSize: 10 }}>inactive</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
              <span style={{ color: roleColor[e.role] || "#888", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{e.role.toUpperCase()}</span>
              {e.payRate > 0 && <span style={{ color: "#999", fontSize: 11 }}>${e.payRate.toFixed(2)}/hr</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Detail / edit panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {!emp && !editMode && (
          <div style={{ color: "#777", fontSize: 13, textAlign: "center", marginTop: 60 }}>Select an employee or create a new one</div>
        )}

        {emp && !editMode && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 22 }}>{emp.name}</div>
                <div style={{ color: roleColor[emp.role], fontSize: 12, fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>{emp.role.toUpperCase()}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => startEdit(emp)} style={{ background: "#1a1a1a", border: "1px solid #333", color: "#ccc", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>Edit</button>
                {emp.id !== session.id && (
                  <>
                    <button onClick={() => setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, active: !e.active } : e))} style={{ background: "none", border: "1px solid #333", color: emp.active ? "#f77f00" : "#06d6a0", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                      {emp.active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button onClick={() => setConfirmDel({ id: emp.id, name: emp.name })} style={{ background: "none", border: "1px solid #c0392b44", color: "#c0392b", padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                ["Phone", emp.phone || "—"],
                ["Email", emp.email || "—"],
                ["Pay Rate", emp.payRate > 0 ? "$" + emp.payRate.toFixed(2) + "/hr" : "Salaried / N/A"],
                ["PIN", "****"],
                ["Status", emp.active ? "Active" : "Inactive"],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ color: "#999", fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>{label.toUpperCase()}</div>
                  <div style={{ color: "#ccc", fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>PERMISSIONS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALL_PERMISSIONS.map(p => (
                <div key={p.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#141414", border: "1px solid #1a1a1a", borderRadius: 8, padding: "10px 14px" }}>
                  <span style={{ color: emp.permissions[p.key] ? "#ccc" : "#444", fontSize: 13 }}>{p.label}</span>
                  <span style={{ color: emp.permissions[p.key] ? "#06d6a0" : "#333", fontSize: 16 }}>{emp.permissions[p.key] ? "●" : "○"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {editMode && form && (
          <div>
            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 20 }}>{employees.find(e => e.id === form.id) ? "EDIT EMPLOYEE" : "NEW EMPLOYEE"}</div>

            {/* Basic info */}
            <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 14 }}>BASIC INFO</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Full Name *</div>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...eStyle.input, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>4-Digit PIN *</div>
                  <input value={form.pin} maxLength={4} onChange={e => { setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g,"").slice(0,4) })); setPinConflict(false); }} style={{ ...eStyle.input, width: "100%", boxSizing: "border-box", letterSpacing: 8, fontSize: 18 }} />
                  {pinConflict && <div style={{ color: "#c0392b", fontSize: 11, marginTop: 3 }}>PIN already in use</div>}
                </div>
                <div>
                  <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Phone</div>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={{ ...eStyle.input, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Email</div>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ ...eStyle.input, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Pay Rate ($/hr)</div>
                  <input type="number" value={form.payRateStr} onChange={e => setForm(f => ({ ...f, payRateStr: e.target.value }))} style={{ ...eStyle.input, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ color: "#999", fontSize: 11, marginBottom: 4 }}>Role</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["owner","manager","employee","foh","boh","driver","maker"].map(r => (
                      <button key={r} onClick={() => applyRoleDefaults(r)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid " + (form.role === r ? roleColor[r] : "#2a2a2a"), background: form.role === r ? roleColor[r] + "22" : "none", color: form.role === r ? roleColor[r] : "#555", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ color: "#999", fontSize: 11, letterSpacing: 2 }}>PERMISSIONS</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["owner","manager","employee","foh","boh","driver","maker"].map(r => (
                    <button key={r} onClick={() => applyRoleDefaults(r)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #2a2a2a", background: "none", color: "#999", fontSize: 10, cursor: "pointer" }}>
                      Reset to {r}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {ALL_PERMISSIONS.map(p => {
                  const on = form.permissions[p.key];
                  const locked = form.role === "owner";
                  return (
                    <button key={p.key} onClick={() => !locked && togglePermission(p.key)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: on ? "#06d6a011" : "#1a1a1a", border: "1px solid " + (on ? "#06d6a044" : "#2a2a2a"), borderRadius: 8, padding: "10px 14px", cursor: locked ? "default" : "pointer", opacity: locked ? 0.6 : 1 }}>
                      <span style={{ color: on ? "#ccc" : "#555", fontSize: 12 }}>{p.label}</span>
                      <span style={{ color: on ? "#06d6a0" : "#333", fontSize: 18, lineHeight: 1 }}>{on ? "●" : "○"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEditMode(false); if (!employees.find(e => e.id === form.id)) setSelected(null); }} style={eStyle.cancelBtn}>Cancel</button>
              <button onClick={saveForm} disabled={!form.name.trim() || form.pin.length !== 4} style={{ ...eStyle.saveBtn, opacity: (!form.name.trim() || form.pin.length !== 4) ? 0.4 : 1 }}>Save Employee</button>
            </div>
          </div>
        )}
      </div>

      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, padding: 28, width: 320, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Delete {confirmDel.name}?</div>
            <div style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>
              <strong style={{ color: "#c0392b" }}>Delete</strong> permanently removes the employee and all their data.
            </div>
            <div style={{ color: "#999", fontSize: 12, marginBottom: 24 }}>
              If you just want to stop them logging in, use <strong style={{ color: "#f77f00" }}>Deactivate</strong> instead — their shift history is preserved.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => { if (deleteEmployee) deleteEmployee(confirmDel.id).catch(console.error); setEmployees(prev => prev.filter(e => e.id !== confirmDel.id)); setConfirmDel(null); setSelected(null); }}
                style={{ padding: "11px 0", background: "#c0392b", border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 14, fontWeight: 700 }}
              >
                Permanently Delete
              </button>
              <button
                onClick={() => { setEmployees(prev => prev.map(e => e.id === confirmDel.id ? { ...e, active: false } : e)); setConfirmDel(null); }}
                style={{ padding: "11px 0", background: "none", border: "1px solid #f77f0055", color: "#f77f00", borderRadius: 7, cursor: "pointer", fontSize: 13 }}
              >
                Deactivate Instead
              </button>
              <button onClick={() => setConfirmDel(null)} style={{ padding: "9px 0", background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const eStyle = {
  input: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#ddd", padding: "12px 14px", fontSize: 16, outline: "none" },
  cancelBtn: { flex: 1, padding: "14px 0", background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 7, cursor: "pointer", fontSize: 15, minHeight: 52, touchAction: "manipulation" },
  saveBtn: { flex: 2, padding: "14px 0", background: "#e85d04", border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 15, fontWeight: 700, minHeight: 52, touchAction: "manipulation" },
};


// ---------------------------------------------------------------------------
// Customer Facing Display (CFD)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// CFD Device — subscribes to server for live order state
// ---------------------------------------------------------------------------
function CFDDevice({ settings }) {
  const [state, setState] = useState({ items: [], orderNum: null, payment: { method: null, tip: 0, tipMode: null, tendered: "" } });

  useEffect(() => {
    DB.loadCFD().then(s => { if (s) setState(s); }).catch(() => {});
    const sub = DB.subscribeCFD(s => {
      if (s) setState(prev => ({
        ...s,
        // Preserve tip selection made on CFD unless POS reset it
        payment: s.payment && s.payment.method !== prev.payment?.method
          ? s.payment  // payment method changed on POS — reset tip
          : { ...s.payment, tip: prev.payment?.tip || s.payment?.tip || 0, tipMode: prev.payment?.tipMode || s.payment?.tipMode }
      }));
    });
    return () => sub.unsubscribe();
  }, []);

  // CFD selects tip and pushes back to server so POS sees it
  const selectTip = (tip, tipMode) => {
    const next = { ...state, payment: { ...state.payment, tip, tipMode } };
    setState(next);
    DB.pushCFD(next).catch(() => {});
  };

  return <CFD items={state.items || []} orderNum={state.orderNum} settings={settings} payment={state.payment} onSelectTip={selectTip} />;
}

function CFD({ items, orderNum, settings, payment, onSelectTip }) {
  const taxRate = (settings && settings.taxRate) || 0.06;
  const cardSurcharge = (settings && settings.cardSurcharge) || 0.04;

  const subtotal = items.reduce((a, i) => a + calcItemTotal(i), 0);
  const tax = subtotal * taxRate;
  const cashBase = subtotal + tax;
  const cardBase = cashBase * (1 + cardSurcharge);
  const tip = payment ? payment.tip : 0;
  const cashTotal = cashBase + tip;
  const cardTotal = cardBase + tip;
  const method = payment ? payment.method : null;
  const tendered = payment ? parseFloat(payment.tendered) || 0 : 0;
  const change = Math.max(0, tendered - cashTotal);
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [customTipVal, setCustomTipVal] = useState("");

  const handleTipPct = (pct) => {
    if (!onSelectTip) return;
    const t = parseFloat((cashBase * pct / 100).toFixed(2));
    if (payment && payment.tipMode === pct) {
      onSelectTip(0, null); // deselect
    } else {
      onSelectTip(t, pct);
    }
  };

  const handleCustomTip = (val) => {
    setCustomTipVal(val);
    if (onSelectTip) onSelectTip(parseFloat(val) || 0, "custom");
  };

  const empty = items.length === 0;

  return (
    <div style={{ flex: 1, background: "#080808", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Store header */}
      <div style={{ background: "#111", borderBottom: "2px solid #e85d04", padding: "18px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {settings && settings.storeLogo && <img src={settings.storeLogo} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10 }} />}
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#e85d04", letterSpacing: 2 }}>{(settings ? (settings.storeName || "") : "").toUpperCase()}</div>
            <div style={{ fontSize: 12, color: "#999", letterSpacing: 4, marginTop: 2 }}>{(settings && settings.storeTagline || "CUSTOMER DISPLAY").toUpperCase()}</div>
          </div>
        </div>
        {!empty && <div style={{ fontSize: 18, color: "#999" }}>Order <span style={{ color: "#fff", fontWeight: 700 }}>#{orderNum}</span></div>}
      </div>

      {empty ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ color: "#e85d04", fontSize: 64 }}>🍕</div>
          <div style={{ color: "#888", fontSize: 20, letterSpacing: 4 }}>WELCOME</div>
          <div style={{ color: "#555", fontSize: 13, letterSpacing: 2 }}>YOUR ORDER WILL APPEAR HERE</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: item list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", WebkitOverflowScrolling: "touch" }}>
            <div style={{ color: "#999", fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>YOUR ORDER</div>
            {items.map((item, i) => (
              <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #1a1a1a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <span style={{ color: "#e85d04", fontWeight: 700, fontSize: 16, marginRight: 8 }}>{item.qty}x</span>
                    <span style={{ color: "#fff", fontWeight: 600, fontSize: 16 }}>{item.name}</span>
                  </div>
                  <span style={{ color: "#ccc", fontSize: 15, fontWeight: 600 }}>{fmt(calcItemTotal(item))}</span>
                </div>
                {selectionSummary(item).map((line, j) => (
                  <div key={j} style={{ color: "#999", fontSize: 13, paddingLeft: 28, marginTop: 3 }}>+ {line}</div>
                ))}
                {item.notes ? <div style={{ color: "#f77f00", fontSize: 12, paddingLeft: 28, marginTop: 3 }}>* {item.notes}</div> : null}
              </div>
            ))}
          </div>

          {/* Right: totals panel — changes based on payment state */}
          <div style={{ width: 340, background: "#0f0f0f", borderLeft: "1px solid #1a1a1a", display: "flex", flexDirection: "column", padding: "24px 20px" }}>

            {/* Subtotal / Tax */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 14, marginBottom: 6 }}>
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 14, marginBottom: 6 }}>
                <span>Tax ({(taxRate*100).toFixed(0)}%)</span><span>{fmt(tax)}</span>
              </div>
              {tip > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#06d6a0", fontSize: 14, marginBottom: 6 }}>
                  <span>Tip</span><span>{fmt(tip)}</span>
                </div>
              )}
            </div>

            {/* No payment method selected — show both totals */}
            {!method && (
              <>
                <div style={{ background: "#06d6a011", border: "1px solid #06d6a033", borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
                  <div style={{ color: "#06d6a0", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>CASH TOTAL</div>
                  <div style={{ color: "#fff", fontSize: 36, fontWeight: 700 }}>{fmt(cashTotal)}</div>
                </div>
                <div style={{ background: "#3a86ff11", border: "1px solid #3a86ff33", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ color: "#3a86ff", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>CARD TOTAL (+{(cardSurcharge*100).toFixed(0)}%)</div>
                  <div style={{ color: "#fff", fontSize: 36, fontWeight: 700 }}>{fmt(cardTotal)}</div>
                </div>
              </>
            )}

            {/* Card payment — customer selects tip */}
            {method === "card" && (
              <>
                <div style={{ color: "#3a86ff", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>ADD A TIP?</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {[10, 15, 18, 20].map(pct => {
                    const tipAmt = parseFloat((cashBase * pct / 100).toFixed(2));
                    const isSelected = payment && payment.tipMode === pct;
                    return (
                      <button key={pct} onClick={() => handleTipPct(pct)}
                        style={{ background: isSelected ? "#06d6a022" : "#1a1a1a", border: "2px solid " + (isSelected ? "#06d6a0" : "#2a2a2a"), borderRadius: 12, padding: "16px 8px", textAlign: "center", cursor: onSelectTip ? "pointer" : "default", minHeight: 80, touchAction: "manipulation" }}>
                        <div style={{ color: isSelected ? "#06d6a0" : "#ccc", fontWeight: 700, fontSize: 22 }}>{pct}%</div>
                        <div style={{ color: isSelected ? "#06d6a0" : "#777", fontSize: 15, marginTop: 4 }}>{fmt(tipAmt)}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button onClick={() => setShowCustomTip(true)}
                    style={{ flex: 1, padding: "14px 0", background: payment && payment.tipMode === "custom" ? "#06d6a022" : "#1a1a1a", border: "2px solid " + (payment && payment.tipMode === "custom" ? "#06d6a0" : "#2a2a2a"), borderRadius: 10, color: payment && payment.tipMode === "custom" ? "#06d6a0" : "#aaa", fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 52, touchAction: "manipulation" }}>
                    {payment && payment.tipMode === "custom" && tip > 0 ? "Custom: " + fmt(tip) : "Custom Amount"}
                  </button>
                  <button onClick={() => onSelectTip && onSelectTip(0, "notip")}
                    style={{ flex: 1, padding: "14px 0", background: payment && payment.tipMode === "notip" ? "#c0392b22" : "#1a1a1a", border: "2px solid " + (payment && payment.tipMode === "notip" ? "#c0392b" : "#2a2a2a"), borderRadius: 10, color: payment && payment.tipMode === "notip" ? "#c0392b" : "#aaa", fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 52, touchAction: "manipulation" }}>
                    No Tip
                  </button>
                </div>
                <div style={{ background: "#3a86ff11", border: "2px solid #3a86ff", borderRadius: 12, padding: "16px 18px", marginTop: "auto" }}>
                  <div style={{ color: "#3a86ff", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>TOTAL DUE</div>
                  <div style={{ color: "#fff", fontSize: 40, fontWeight: 700 }}>{fmt(cardTotal)}</div>
                  <div style={{ color: "#3a86ff", fontSize: 12, marginTop: 6 }}>Please tap or insert card</div>
                </div>
                {showCustomTip && (
                  <Numpad value={customTipVal} onChange={handleCustomTip} onClose={() => setShowCustomTip(false)} label="ENTER TIP AMOUNT" />
                )}
              </>
            )}

            {/* Cash payment selected */}
            {method === "cash" && (
              <>
                <div style={{ color: "#06d6a0", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>CASH PAYMENT</div>
                <div style={{ background: "#06d6a011", border: "2px solid #06d6a0", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ color: "#06d6a0", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>TOTAL DUE</div>
                  <div style={{ color: "#fff", fontSize: 40, fontWeight: 700 }}>{fmt(cashTotal)}</div>
                </div>
                {tendered > 0 && (
                  <div style={{ background: change > 0 ? "#06d6a022" : "#1a1a1a", border: "1px solid " + (change > 0 ? "#06d6a0" : "#2a2a2a"), borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ color: "#999", fontSize: 13 }}>Tendered</span>
                      <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{fmt(tendered)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#06d6a0", fontSize: 16, fontWeight: 700 }}>Change Due</span>
                      <span style={{ color: "#06d6a0", fontSize: 28, fontWeight: 700 }}>{fmt(change)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function getSlots(settings, existingOrders, cartPizzaCount) {
  // If no pizzas in cart, use 1 as minimum so slots aren't all marked full
  const effectiveCartCount = Math.max(cartPizzaCount, 1);
  cartPizzaCount = effectiveCartCount;
  const now = new Date();
  const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()];
  const onlineHours = settings.onlineHours && Object.keys(settings.onlineHours).length > 0
    ? settings.onlineHours
    : DAYS.reduce((acc, d) => ({ ...acc, [d]: { open: true, from: "11:00", to: "21:00" } }), {});
  const hours = onlineHours[dayName];
  if (!hours || !hours.open) return { closed: true, slots: [] };

  const [fromH, fromM] = hours.from.split(":").map(Number);
  const [toH, toM]     = hours.to.split(":").map(Number);
  const cutoff  = settings.onlineCutoffMins || 30;
  const maxPizzas = settings.onlineMaxPizzasPerSlot || 4;
  const prepMins  = settings.onlinePrepTime || 30;
  const blackouts = settings.onlineBlackouts || [];

  // 1. Build raw slot list with current usage
  const rawSlots = [];
  let cur = new Date(now);
  cur.setHours(fromH, fromM, 0, 0);
  const close = new Date(now);
  close.setHours(toH, toM, 0, 0);
  const cutoffTime = new Date(close.getTime() - cutoff * 60000);

  while (cur <= cutoffTime) {
    const slotKey = cur.getHours() + ":" + String(cur.getMinutes()).padStart(2,"0");
    // Sum pizzas across all split assignments in this slot
    const pizzasUsed = existingOrders
      .filter(o => {
        if (o.slotKey === slotKey) return true;
        if (o.splitSlots) return o.splitSlots.some(s => s.key === slotKey);
        return false;
      })
      .reduce((a, o) => {
        if (o.slotKey === slotKey) return a + (o.pizzaCount || 0);
        if (o.splitSlots) {
          const s = o.splitSlots.find(s => s.key === slotKey);
          return a + (s ? s.count : 0);
        }
        return a;
      }, 0);
    const isPast = cur < new Date(now.getTime() + prepMins * 60000 - 2 * 60000);
    const isBlackedOut = blackouts.includes(slotKey);
    rawSlots.push({
      key: slotKey,
      time: new Date(cur),
      pizzasUsed,
      remaining: Math.max(0, maxPizzas - pizzasUsed),
      isPast,
      isBlackedOut,
    });
    cur = new Date(cur.getTime() + 15 * 60000);
  }

  // 2. For each slot, simulate filling the cart by consuming capacity
  //    sequentially from that slot forward. The slot shown to the customer
  //    is the LAST slot needed to complete their order.
  //    Carry-over: unused capacity from slot N flows into slot N+1.

  const slots = rawSlots.map((raw, idx) => {
    const label = raw.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (raw.isPast || raw.isBlackedOut) {
      return { key: raw.key, label, remaining: raw.remaining, maxPizzas, isPast: raw.isPast, isBlackedOut: raw.isBlackedOut, isFull: true, carryLabel: raw.isBlackedOut ? "Unavailable" : "Passed" };
    }

    // Simulate filling cartPizzaCount starting from this slot
    let remaining = cartPizzaCount;
    let lastSlotIdx = idx;
    let carryOver = 0; // unused capacity from previous slot carries forward

    for (let i = idx; i < rawSlots.length && remaining > 0; i++) {
      if (rawSlots[i].isBlackedOut) break; // can't use a blacked-out slot
      const slotCap = rawSlots[i].remaining + carryOver;
      const used = Math.min(slotCap, remaining);
      remaining -= used;
      carryOver = Math.max(0, slotCap - used); // unused cap carries to next
      lastSlotIdx = i;
    }

    // If we couldn't fill the whole order within available slots
    const canFill = remaining === 0;

    // The slot shown to customer is the last one needed — that's when they pick up
    const deliverySlot = rawSlots[lastSlotIdx];
    const deliveryLabel = deliverySlot
      ? deliverySlot.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : label;

    // What's left in this slot for display
    const slotAvail = raw.remaining;
    const carryLabel = slotAvail + "/" + maxPizzas + " avail";

    return {
      key: raw.key,              // customer selects this slot (start slot)
      label,                     // start slot label (shown to customer as pickup time = deliveryLabel)
      pickupLabel: deliveryLabel, // actual ready time = last slot needed
      pickupSlotIdx: lastSlotIdx,
      remaining: slotAvail,
      maxPizzas,
      carryLabel,
      isBlackedOut: false,
      isPast: false,
      isFull: !canFill,           // only full if can't fill across all remaining slots
    };
  });

  // 3. ASAP — first non-past, non-full slot at or after now+prepMins
  const asapEnabled = settings.onlineAsap !== false;
  const asapTarget = new Date(now.getTime() + prepMins * 60000);
  const asapSlot = asapEnabled ? slots.find(s => {
    if (s.isFull || s.isPast || s.isBlackedOut) return false;
    const [h, m] = s.key.split(":").map(Number);
    const slotTime = new Date(now);
    slotTime.setHours(h, m, 0, 0);
    return slotTime >= asapTarget;
  }) : null;

  return { closed: false, slots, asapSlot, prepMins, rawSlots, maxPizzas };
}

// Given a starting slot index, compute the split distribution across slots
function computeSplitSlots(rawSlots, startIdx, cartPizzaCount, maxPizzas) {
  const splits = [];
  let remaining = cartPizzaCount;
  let carryOver = 0;
  for (let i = startIdx; i < rawSlots.length && remaining > 0; i++) {
    if (rawSlots[i].isBlackedOut) break;
    const slotCap = rawSlots[i].remaining + carryOver;
    const used = Math.min(slotCap, remaining);
    if (used > 0) splits.push({ key: rawSlots[i].key, label: rawSlots[i].time.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }), count: used });
    remaining -= used;
    carryOver = Math.max(0, slotCap - used);
  }
  return splits;
}

function countPizzas(cart, menu) {
  const pizzaCat = Object.keys(menu).find(k => k.toLowerCase() === "pizzas");
  if (!pizzaCat) return 0;
  const pizzaIds = new Set((menu[pizzaCat] || []).map(i => i.id));
  return cart.reduce((a, item) => a + (pizzaIds.has(item.id) ? item.qty : 0), 0);
}

// ---------------------------------------------------------------------------
// ONLINE ORDER PAGE
// ---------------------------------------------------------------------------
function OnlineOrderPage({ menu, settings, orders, customers, onOrderPlaced }) {
  const [step, setStep] = useState("menu");
  const [orderType, setOrderType] = useState("Pickup");
  const [cart, setCart] = useState([]);
  const [modTarget, setModTarget] = useState(null);
  const [info, setInfo] = useState({ name: "", phone: "", street: "", city: "", zip: "", notes: "" });

  // Pre-fill info from customer DB when phone matches
  const lookupCustomer = (phone) => {
    if (!customers) return;
    const clean = phone.replace(/\D/g,"");
    if (clean.length < 7) return;
    const found = customers.find(c => c.phone.replace(/\D/g,"").includes(clean));
    if (found) {
      const parts = (found.address || "").split(", ");
      setInfo(f => ({
        ...f,
        name: found.name || f.name,
        phone: found.phone || f.phone,
        street: parts[0] || f.street,
        city: parts[1] || f.city,
        zip: parts[2] || f.zip,
        notes: found.notes || f.notes,
      }));
    }
  };
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedSlot, setSubmittedSlot] = useState(null);
  const [activeCategory, setActiveCategory] = useState(Object.keys(menu)[0]);

  const taxRate = settings.taxRate || 0.06;
  const cardSurcharge = settings.cardSurcharge || 0.04;
  const subtotal = cart.reduce((a, i) => a + calcItemTotal(i), 0);
  const tax = subtotal * taxRate;
  const cashTotal = subtotal + tax;
  const cardTotal = cashTotal * (1 + cardSurcharge);
  const cartPizzaCount = countPizzas(cart, menu);
  const { closed, slots, asapSlot, prepMins, rawSlots, maxPizzas } = getSlots(settings, orders, cartPizzaCount);

  // Build online-enabled menu from item.availableOnline flag
  const onlineMenuFiltered = {};
  Object.entries(menu).forEach(([cat, items]) => {
    const filtered = items.filter(item => item.availableOnline !== false);
    if (filtered.length > 0) onlineMenuFiltered[cat] = filtered;
  });

  const visibleCats = Object.keys(onlineMenuFiltered);
  const activeCat = visibleCats.includes(activeCategory) ? activeCategory : (visibleCats[0] || "");

  const addToCart = (item) => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      setModTarget(item);
    } else {
      setCart(prev => {
        const idx = prev.findIndex(i => i.id === item.id && Object.keys(i.selections || {}).length === 0);
        if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qty: i.qty + 1 } : i);
        return [...prev, { ...item, qty: 1, selections: {}, notes: "" }];
      });
    }
  };

  const confirmMods = (selections, notes) => {
    setCart(prev => [...prev, { ...modTarget, qty: 1, selections, notes }]);
    setModTarget(null);
  };

  const removeFromCart = (idx) => setCart(prev => prev.filter((_, i) => i !== idx));
  const updateQty = (idx, delta) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const qty = item.qty + delta;
      return qty <= 0 ? null : { ...item, qty };
    }).filter(Boolean));
  };

  const submitOrder = () => {
    const addressParts = [info.street.trim(), info.city.trim(), info.zip.trim()].filter(Boolean);
    const address = addressParts.join(", ");
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const slot = selectedSlot === "asap" ? (asapSlot || slots[0]) : slots.find(s => s.key === selectedSlot);
    const startIdx = rawSlots ? rawSlots.findIndex(r => r.key === (slot ? slot.key : "")) : -1;
    const splitSlots = (startIdx >= 0 && cartPizzaCount > 0 && rawSlots)
      ? computeSplitSlots(rawSlots, startIdx, cartPizzaCount, maxPizzas)
      : [];
    const pickupLabel = slot ? slot.pickupLabel || slot.label : null;
    const order = {
      num: nextOrderNum(),
      type: orderType,
      source: "online",
      customer: { name: info.name.trim(), phone: info.phone.trim(), address, notes: info.notes.trim() },
      items: [...cart],
      total: cashTotal,
      status: "In Kitchen",
      time,
      placedAt: Date.now(),
      slotKey: slot ? slot.key : null,
      slotLabel: pickupLabel,
      splitSlots,
      pizzaCount: cartPizzaCount,
    };
    onOrderPlaced(order);
    setSubmittedSlot({ ...slot, label: pickupLabel || (slot ? slot.label : "") });
    setSubmitted(true);
  };

  const canSubmit = info.name.trim() && info.phone.trim() &&
    (orderType === "Pickup" || info.street.trim()) && selectedSlot;

  // Closed / outside hours
  if (closed || !settings.onlineOrdering) return (
    <div style={ol.root}>
      <div style={ol.header}>
        <div><div style={ol.storeName}>{(settings ? (settings.storeName || "") : "").toUpperCase()}</div><div style={ol.storeTag}>ONLINE ORDERING</div></div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🍕</div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 24 }}>We're Closed</div>
        <div style={{ color: "#999", fontSize: 15 }}>Online ordering is not available right now. Please check back during our hours!</div>
      </div>
    </div>
  );

  // Confirmation
  if (submitted) return (
    <div style={ol.root}>
      <div style={ol.header}>
        <div><div style={ol.storeName}>{(settings ? (settings.storeName || "") : "").toUpperCase()}</div><div style={ol.storeTag}>ONLINE ORDERING</div></div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 32, textAlign: "center" }}>
        <div style={{ color: "#06d6a0", fontSize: 56, fontWeight: 700 }}>✓</div>
        <div style={{ color: "#06d6a0", fontWeight: 700, fontSize: 28 }}>Order Placed!</div>
        <div style={{ color: "#888", fontSize: 15, maxWidth: 360 }}>
          {orderType === "Pickup" ? "Come pick up your order at the store." : "Your order is on its way!"}
        </div>
        <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px 32px", marginTop: 8 }}>
          <div style={{ color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>READY AT</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 26 }}>{submittedSlot ? submittedSlot.label : "ASAP"}</div>
        </div>
        <button onClick={() => { setCart([]); setInfo({ name: "", phone: "", street: "", city: "", zip: "", notes: "" }); setStep("menu"); setSubmitted(false); setSelectedSlot(null); }}
          style={{ marginTop: 16, padding: "12px 32px", background: "#e85d04", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          Place Another Order
        </button>
      </div>
    </div>
  );

  return (
    <div style={ol.root}>
      {modTarget && <ModifierModal item={modTarget} onConfirm={confirmMods} onCancel={() => setModTarget(null)} />}

      {/* Header */}
      <div style={ol.header}>
        <div><div style={ol.storeName}>{(settings ? (settings.storeName || "") : "").toUpperCase()}</div><div style={ol.storeTag}>ONLINE ORDERING</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          {[settings.onlinePickup && "Pickup", settings.onlineDelivery && "Delivery"].filter(Boolean).map(t => (
            <button key={t} onClick={() => setOrderType(t)} style={{ padding: "8px 18px", borderRadius: 20, border: "2px solid " + (orderType === t ? "#e85d04" : "#2a2a2a"), background: orderType === t ? "#e85d04" : "none", color: orderType === t ? "#fff" : "#666", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        {cart.length > 0 && (
          <button onClick={() => setStep("info")} style={{ background: "#e85d04", border: "none", borderRadius: 20, color: "#fff", fontWeight: 700, fontSize: 13, padding: "8px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#fff", color: "#e85d04", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{cart.reduce((a, i) => a + i.qty, 0)}</span>
            Checkout — {fmt(cashTotal)}
          </button>
        )}
      </div>

      {/* Menu step */}
      {step === "menu" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Category sidebar */}
          <div style={{ width: 160, borderRight: "1px solid #1a1a1a", overflowY: "auto", padding: "16px 0" }}>
            {visibleCats.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 18px", background: activeCat === cat ? "#e85d0411" : "none", border: "none", borderLeft: "3px solid " + (activeCat === cat ? "#e85d04" : "transparent"), color: activeCat === cat ? "#e85d04" : "#666", fontSize: 13, fontWeight: activeCat === cat ? 700 : 400, cursor: "pointer" }}>{cat}</button>
            ))}
          </div>

          {/* Items */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20, minHeight: 0, WebkitOverflowScrolling: "touch" }}>
            <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3, marginBottom: 16 }}>{activeCat.toUpperCase()}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {(onlineMenuFiltered[activeCat] || []).map(item => {
                const soldOut = item.stock === 0;
                return (
                  <div key={item.id} style={{ background: "#141414", border: "1px solid " + (soldOut ? "#c0392b33" : "#1a1a1a"), borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8, opacity: soldOut ? 0.6 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ color: soldOut ? "#555" : "#fff", fontWeight: 700, fontSize: 15 }}>{item.name}</div>
                      {soldOut && <span style={{ color: "#c0392b", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>SOLD OUT</span>}
                    </div>
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: soldOut ? "#444" : "#e85d04", fontWeight: 700, fontSize: 18 }}>{fmt(item.base)}</span>
                      <button onClick={() => !soldOut && addToCart(item)} disabled={soldOut} style={{ background: soldOut ? "#2a2a2a" : "#e85d04", border: "none", borderRadius: 6, color: soldOut ? "#555" : "#fff", fontWeight: 700, fontSize: 13, padding: "6px 14px", cursor: soldOut ? "default" : "pointer" }}>
                        {soldOut ? "Sold Out" : "+ Add"}
                      </button>
                    </div>
                    {item.stock != null && !soldOut && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: Math.min(100, (item.stock / Math.max(item.stock, 10)) * 100) + "%", background: item.stock <= 3 ? "#c0392b" : item.stock <= 6 ? "#f77f00" : "#06d6a0", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: item.stock <= 3 ? "#c0392b" : item.stock <= 6 ? "#f77f00" : "#666", fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: "right" }}>
                          {item.stock} left
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mini cart */}
          {cart.length > 0 && (
            <div style={{ width: 280, borderLeft: "1px solid #1a1a1a", display: "flex", flexDirection: "column", background: "#0d0d0d" }}>
              <div style={{ padding: "16px 16px 0", color: "#999", fontSize: 11, letterSpacing: 2 }}>YOUR ORDER</div>
              <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                {cart.map((item, idx) => (
                  <div key={idx} style={{ padding: "10px 0", borderBottom: "1px solid #1a1a1a" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ddd", fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                        {selectionSummary(item).map((l, i) => <div key={i} style={{ color: "#999", fontSize: 11 }}>+ {l}</div>)}
                      </div>
                      <span style={{ color: "#e85d04", fontWeight: 700, fontSize: 13, marginLeft: 8 }}>{fmt(calcItemTotal(item))}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <button onClick={() => updateQty(idx, -1)} style={ol.qtyBtn}>-</button>
                      <span style={{ color: "#fff", fontSize: 13, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
                      <button onClick={() => updateQty(idx, 1)} style={ol.qtyBtn}>+</button>
                      <button onClick={() => removeFromCart(idx)} style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer", marginLeft: "auto" }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 14, borderTop: "1px solid #1a1a1a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 13, marginBottom: 4 }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 13, marginBottom: 10 }}><span>Tax</span><span>{fmt(tax)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 12 }}><span>Total</span><span>{fmt(cashTotal)}</span></div>
                <button onClick={() => setStep("info")} style={{ width: "100%", padding: "12px 0", background: "#e85d04", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Checkout</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info + slot step */}
      {step === "info" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
          <div style={{ width: "100%", maxWidth: 520 }}>
            <button onClick={() => setStep("menu")} style={ol.backBtn}>← Back to Menu</button>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 6 }}>Your Details</div>
            <div style={{ color: "#999", fontSize: 13, marginBottom: 24 }}>{orderType === "Pickup" ? "We'll have it ready at your chosen time." : "Enter your delivery address."}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              <div><div style={ol.label}>Full Name *</div><input value={info.name} onChange={e => setInfo(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" style={ol.input} /></div>
              <div><div style={ol.label}>Phone Number *</div><input value={info.phone} onChange={e => { setInfo(f => ({ ...f, phone: e.target.value })); lookupCustomer(e.target.value); }} onBlur={e => lookupCustomer(e.target.value)} placeholder="412-555-0000" type="tel" style={ol.input} /></div>
              {orderType === "Delivery" && (
                <>
                  <div><div style={ol.label}>Street Address *</div><input value={info.street} onChange={e => setInfo(f => ({ ...f, street: e.target.value }))} placeholder="123 Main St" style={ol.input} /></div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}><div style={ol.label}>City</div><input value={info.city} onChange={e => setInfo(f => ({ ...f, city: e.target.value }))} placeholder="Monroeville" style={ol.input} /></div>
                    <div style={{ width: 100 }}><div style={ol.label}>Zip</div><input value={info.zip} onChange={e => setInfo(f => ({ ...f, zip: e.target.value.replace(/[^0-9]/g,"").slice(0,5) }))} placeholder="15146" style={ol.input} /></div>
                  </div>
                </>
              )}
              <div><div style={ol.label}>Special Instructions</div><textarea value={info.notes} onChange={e => setInfo(f => ({ ...f, notes: e.target.value }))} placeholder="Allergies, gate codes, etc." style={{ ...ol.input, height: 70, resize: "none" }} /></div>
            </div>

            {/* Time slot picker */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "#ccc", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Choose a Time</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {/* ASAP button */}
                {asapSlot && (
                  <button
                    onClick={() => setSelectedSlot("asap")}
                    style={{ padding: "12px 8px", borderRadius: 8, border: "2px solid " + (selectedSlot === "asap" ? "#06d6a0" : "#2a2a2a"), background: selectedSlot === "asap" ? "#06d6a022" : "#141414", color: selectedSlot === "asap" ? "#06d6a0" : "#ccc", cursor: "pointer", textAlign: "center" }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>ASAP</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      ~{prepMins} min ({asapSlot.pickupLabel || asapSlot.label})
                    </div>
                  </button>
                )}
                {slots.map(slot => {
                  const isSelected = selectedSlot === slot.key;
                  const disabled = slot.isFull || slot.isPast;
                  return (
                    <button
                      key={slot.key}
                      onClick={() => !disabled && setSelectedSlot(slot.key)}
                      style={{ padding: "12px 8px", borderRadius: 8, border: "2px solid " + (isSelected ? "#e85d04" : disabled ? "#1a1a1a" : "#2a2a2a"), background: isSelected ? "#e85d0422" : disabled ? "#0d0d0d" : "#141414", color: isSelected ? "#e85d04" : disabled ? "#333" : "#ccc", cursor: disabled ? "default" : "pointer", textAlign: "center", opacity: disabled ? 0.5 : 1 }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {slot.pickupLabel && slot.pickupLabel !== slot.label ? slot.pickupLabel : slot.label}
                      </div>
                      {slot.pickupLabel && slot.pickupLabel !== slot.label && (
                        <div style={{ fontSize: 9, color: "#777", marginTop: 1 }}>starts {slot.label}</div>
                      )}
                      <div style={{ fontSize: 10, marginTop: 2, color: slot.isFull ? "#c0392b" : "#777" }}>
                        {slot.isBlackedOut ? "Unavailable" : slot.isFull ? "Full" : slot.isPast ? "Passed" : slot.carryLabel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Order summary */}
            <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>ORDER SUMMARY</div>
              {cart.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "#888", fontSize: 13, marginBottom: 4 }}>
                  <span>{item.qty}x {item.name}</span><span>{fmt(calcItemTotal(item))}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #1a1a1a", marginTop: 10, paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 13, marginBottom: 4 }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 13, marginBottom: 8 }}><span>Tax ({(taxRate*100).toFixed(0)}%)</span><span>{fmt(tax)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}><span>Cash Total</span><span>{fmt(cashTotal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#3a86ff", fontSize: 13 }}><span>Card Total (+{(cardSurcharge*100).toFixed(0)}%)</span><span>{fmt(cardTotal)}</span></div>
              </div>
            </div>

            <button onClick={submitOrder} disabled={!canSubmit} style={{ width: "100%", padding: "15px 0", background: canSubmit ? "#e85d04" : "#2a2a2a", border: "none", borderRadius: 10, color: canSubmit ? "#fff" : "#555", fontWeight: 700, fontSize: 16, cursor: canSubmit ? "pointer" : "default", letterSpacing: 1 }}>
              Place Order
            </button>
            {!canSubmit && <div style={{ color: "#999", fontSize: 12, textAlign: "center", marginTop: 8 }}>Please fill in your details and choose a time</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const ol = {
  root: { flex: 1, display: "flex", flexDirection: "column", background: "#0d0d0d", overflow: "hidden", minHeight: 0, fontFamily: "'Courier New', monospace", color: "#fff" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", background: "#111", borderBottom: "2px solid #e85d04", flexWrap: "wrap", gap: 12 },
  storeName: { color: "#e85d04", fontWeight: 700, fontSize: 20, letterSpacing: 3 },
  storeTag: { color: "#999", fontSize: 10, letterSpacing: 4, marginTop: 2 },
  qtyBtn: { background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#ccc", width: 26, height: 26, borderRadius: 5, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
  backBtn: { background: "none", border: "none", color: "#999", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 20, display: "block" },
  label: { color: "#999", fontSize: 12, marginBottom: 5 },
  input: { width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
};


// ---------------------------------------------------------------------------
// Online Menu Manager
// ---------------------------------------------------------------------------
function OnlineMenuManager({ menu, onlineMenu, setOnlineMenu }) {
  const toggle = (key, field, val) => setOnlineMenu(prev => ({
    ...prev,
    [key]: { ...(prev[key] || {}), [field]: val }
  }));

  return (
    <div style={{ marginTop: 0 }}>
      {Object.entries(menu).map(([cat, items]) => {
        const catKey = "cat_" + cat;
        const catEnabled = onlineMenu[catKey] !== false;
        return (
          <div key={cat} style={{ background: "#1a1a1a", border: "1px solid #222", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
            {/* Category header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: catEnabled ? "1px solid #222" : "none" }}>
              <span style={{ color: catEnabled ? "#fff" : "#444", fontWeight: 700, fontSize: 14 }}>{cat}</span>
              <button onClick={() => toggle(catKey, "enabled", !catEnabled)} style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: catEnabled ? "#06d6a0" : "#2a2a2a", position: "relative" }}>
                <div style={{ position: "absolute", top: 2, left: catEnabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
            {/* Items */}
            {catEnabled && items.map(item => {
              const cfg = onlineMenu[item.id] || {};
              const enabled = cfg.enabled !== false;
              const price = cfg.price != null ? cfg.price : item.base;
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #1a1a1a" }}>
                  <button onClick={() => toggle(item.id, "enabled", !enabled)} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: enabled ? "#06d6a0" : "#2a2a2a", position: "relative", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 2, left: enabled ? 17 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                  </button>
                  <span style={{ flex: 1, color: enabled ? "#ccc" : "#444", fontSize: 13 }}>{item.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "#999", fontSize: 11 }}>$</span>
                    <input
                      type="number"
                      value={price}
                      onChange={e => toggle(item.id, "price", parseFloat(e.target.value) || item.base)}
                      disabled={!enabled}
                      style={{ width: 70, background: "#111", border: "1px solid #2a2a2a", borderRadius: 5, color: enabled ? "#e85d04" : "#333", padding: "4px 6px", fontSize: 13, fontWeight: 700, outline: "none", textAlign: "right" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings View
// ---------------------------------------------------------------------------
function DeliveryRadiusMap({ settings, apiKey }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const circleRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const lat = settings.storeLat || 40.2978;
    const lng = settings.storeLng || -79.5422;
    const radiusMiles = settings.deliveryRadiusMiles || 2;
    const radiusMeters = radiusMiles * 1609.34;

    const loadMap = () => {
      if (!window.google) return;
      const center = { lat, lng };
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          center, zoom: 12,
          styles: [{ elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#888" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] }],
          disableDefaultUI: true, zoomControl: true,
        });
        markerRef.current = new window.google.maps.Marker({ position: center, map: mapInstanceRef.current, title: "Store Location" });
        circleRef.current = new window.google.maps.Circle({
          map: mapInstanceRef.current, center, radius: radiusMeters,
          fillColor: "#e85d04", fillOpacity: 0.15,
          strokeColor: "#e85d04", strokeOpacity: 0.8, strokeWeight: 2,
        });
      } else {
        mapInstanceRef.current.setCenter(center);
        markerRef.current.setPosition(center);
        circleRef.current.setCenter(center);
        circleRef.current.setRadius(radiusMeters);
      }
    };

    if (window.google) { loadMap(); return; }
    if (document.getElementById("gmaps-script")) { window.initGMap = loadMap; return; }
    window.initGMap = loadMap;
    const script = document.createElement("script");
    script.id = "gmaps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGMap`;
    script.async = true;
    document.head.appendChild(script);
  }, [settings.storeLat, settings.storeLng, settings.deliveryRadiusMiles, settings.storeAddress]);

  return (
    <div>
      <div style={{ color: "#777", fontSize: 12, marginBottom: 8 }}>Delivery radius preview</div>
      <div ref={mapRef} style={{ width: "100%", height: 280, borderRadius: 10, overflow: "hidden", border: "1px solid #2a2a2a" }} />
    </div>
  );
}

function PrimaryColorPicker({ settings, setSettings }) {
  const [color, setColor] = useState(settings.primaryColor || "#c8102e");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="color" value={color}
        onChange={e => setColor(e.target.value)}
        onBlur={e => { const v = e.target.value; setSettings(s => { const next = {...s, primaryColor: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
        style={{ width: 48, height: 40, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }} />
      <span style={{ color: "#888", fontSize: 13 }}>{color}</span>
    </div>
  );
}

function HeroTextInput({ settingsKey, value, placeholder, setSettings }) {
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <input value={val} placeholder={placeholder}
      onChange={e => setVal(e.target.value)}
      onBlur={e => { const v = e.target.value; setSettings(s => { const next = {...s, [settingsKey]: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
      style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", marginBottom: 14 }} />
  );
}

function DiscountsManager() {
  const [discounts, setDiscounts] = useState([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("%");
  const [value, setValue] = useState("");
  const [showNumpad, setShowNumpad] = useState(false);

  const load = () => fetch("/api/discounts").then(r => r.json()).then(d => setDiscounts(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = () => {
    const v = parseFloat(value);
    if (!name || isNaN(v) || v <= 0) return;
    fetch("/api/discounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, value: v }) })
      .then(() => { setName(""); setValue(""); load(); }).catch(() => {});
  };

  const remove = (id) => {
    fetch(`/api/discounts/${id}`, { method: "DELETE" }).then(load).catch(() => {});
  };

  return (
    <div>
      <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
        <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Preset Discounts</div>
        {discounts.length === 0 && <div style={{ color: "#777", fontSize: 13, marginBottom: 16 }}>No preset discounts yet.</div>}
        {discounts.map(d => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, background: "#1a1a1a", borderRadius: 8, padding: "10px 14px" }}>
            <div>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{d.name}</span>
              <span style={{ color: "#e85d04", fontSize: 13, marginLeft: 10 }}>{d.type === "%" ? d.value + "% off" : fmt(d.value) + " off"}</span>
            </div>
            <button onClick={() => remove(d.id)} style={{ background: "none", border: "1px solid #c0392b44", borderRadius: 6, color: "#c0392b", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>Remove</button>
          </div>
        ))}
      </div>
      <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
        <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Add Discount</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Employee Discount"
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setType("%")} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "2px solid " + (type === "%" ? "#e85d04" : "#2a2a2a"), background: type === "%" ? "#e85d0422" : "#111", color: type === "%" ? "#e85d04" : "#888", fontWeight: 700, cursor: "pointer" }}>% Off</button>
          <button onClick={() => setType("$")} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "2px solid " + (type === "$" ? "#e85d04" : "#2a2a2a"), background: type === "$" ? "#e85d0422" : "#111", color: type === "$" ? "#e85d04" : "#888", fontWeight: 700, cursor: "pointer" }}>$ Off</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Value</div>
          <div onClick={() => setShowNumpad(true)} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: value ? "#fff" : "#555", padding: "10px 14px", fontSize: 18, fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>
            {value || (type === "%" ? "0%" : "$0.00")}
          </div>
        </div>
        <button onClick={add} style={{ width: "100%", padding: "12px 0", background: "#e85d04", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Add Discount</button>
        {showNumpad && <Numpad value={value} label={type === "%" ? "DISCOUNT %" : "DISCOUNT $"} onChange={setValue} onClose={() => setShowNumpad(false)} />}
      </div>
    </div>
  );
}

function DiscountPanel({ subtotal, onApply, onClear }) {
  const [presets, setPresets] = useState([]);
  const [discountType, setDiscountType] = useState("%");
  const [discountInput, setDiscountInput] = useState("");
  const [showNumpad, setShowNumpad] = useState(false);
  useEffect(() => {
    fetch("/api/discounts").then(r => r.json()).then(d => setPresets(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  const apply = (type, value) => { const v = parseFloat(value); if (!isNaN(v) && v > 0) onApply({ type, value: v }); };
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: 12 }}>
      {presets.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#888", fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>QUICK DISCOUNTS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presets.map(p => (
              <button key={p.id} onClick={() => apply(p.type, p.value)}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e85d0444", background: "#e85d0411", color: "#e85d04", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {p.name} ({p.type === "%" ? p.value + "%" : fmt(p.value)})
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ color: "#888", fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>MANUAL</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={() => setDiscountType("%")} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "2px solid " + (discountType === "%" ? "#e85d04" : "#2a2a2a"), background: discountType === "%" ? "#e85d0422" : "#111", color: discountType === "%" ? "#e85d04" : "#888", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>% Off</button>
        <button onClick={() => setDiscountType("$")} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "2px solid " + (discountType === "$" ? "#e85d04" : "#2a2a2a"), background: discountType === "$" ? "#e85d0422" : "#111", color: discountType === "$" ? "#e85d04" : "#888", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>$ Off</button>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <div onClick={() => setShowNumpad(true)} style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 6, color: discountInput ? "#fff" : "#555", padding: "8px 10px", fontSize: 14, cursor: "pointer", fontFamily: "monospace", minHeight: 36, display: "flex", alignItems: "center" }}>
          {discountInput || (discountType === "%" ? "0%" : "$0.00")}
        </div>
        <button onClick={() => apply(discountType, discountInput)} style={{ padding: "8px 14px", borderRadius: 6, background: "#e85d04", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Apply</button>
        <button onClick={onClear} style={{ padding: "8px 10px", borderRadius: 6, background: "none", border: "1px solid #c0392b44", color: "#c0392b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Clear</button>
      </div>
      {showNumpad && <Numpad value={discountInput} label={discountType === "%" ? "DISCOUNT %" : "DISCOUNT $"} onChange={setDiscountInput} onClose={() => setShowNumpad(false)} />}
    </div>
  );
}

function LogoSizeSlider({ settings, setSettings }) {
  const [size, setSize] = useState(settings.onlineLogoSize || 120);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <input type="range" min="40" max="300" step="10"
        value={size}
        onChange={e => setSize(parseInt(e.target.value))}
        onMouseUp={e => { const v = parseInt(e.target.value); setSettings(s => { const next = {...s, onlineLogoSize: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
        onTouchEnd={e => { const v = parseInt(e.target.value); setSettings(s => { const next = {...s, onlineLogoSize: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
        style={{ flex: 1, accentColor: "#e85d04" }} />
      <span style={{ color: "#888", fontSize: 13, minWidth: 40 }}>{size}px</span>
      {settings.storeLogo && <img src={settings.storeLogo} alt="preview" style={{ height: Math.min(60, size), maxWidth: 120, objectFit: "contain", background: "#000", borderRadius: 4, padding: 4 }} />}
    </div>
  );
}

function SettingsView({ settings, setSettings }) {
  const [form, setForm] = useState({
    taxRate: (settings.taxRate * 100).toFixed(1),
    cardSurcharge: (settings.cardSurcharge * 100).toFixed(1),
  });
  const [saved, setSaved] = useState(false);
  const [settingsSection, setSettingsSection] = useState("store");
  const [onlineTab, setOnlineTab] = useState("general"); // general | hours | throttle | menu | blackout
  const [newBlackout, setNewBlackout] = useState("");
  const [newBlackoutEnd, setNewBlackoutEnd] = useState("");
  const [newBlackoutDate, setNewBlackoutDate] = useState("");

  const save = () => {
    const taxRate = Math.max(0, Math.min(30, parseFloat(form.taxRate) || 0)) / 100;
    const cardSurcharge = Math.max(0, Math.min(20, parseFloat(form.cardSurcharge) || 0)) / 100;
    setSettings(s => {
      const next = { ...s, taxRate, cardSurcharge };
      DB.saveSettings(next).catch(console.error);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setOnline = (key, val) => {
    setSettings(s => {
      const next = { ...s, [key]: val };
      DB.saveSettings(next).catch(console.error);
      return next;
    });
  };

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));

  const toggleSwitch = (key, val) => (
    <button onClick={() => toggle(key)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: val ? "#06d6a0" : "#2a2a2a", position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: val ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
    </button>
  );

  const field = (label, key, desc) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: "#ccc", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{label}</div>
      {desc && <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>{desc}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="number" value={form[key]} onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setSaved(false); }}
          style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 18, fontWeight: 700, width: 100, outline: "none", textAlign: "center" }} />
        <span style={{ color: "#999", fontSize: 18 }}>%</span>
        <span style={{ color: "#999", fontSize: 13 }}>= {fmt((parseFloat(form[key]) || 0) / 100 * 25)} on a $25 order</span>
      </div>
    </div>
  );

  const numInput = (val, onChange, width) => (
    <input type="number" value={val} onChange={e => onChange(parseInt(e.target.value) || 0)}
      style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, color: "#fff", padding: "7px 10px", fontSize: 15, fontWeight: 700, width: width || 70, outline: "none", textAlign: "center" }} />
  );

  const onlineTabs = [
    ["general", "General"],
    ["hours",   "Hours"],
    ["throttle","Throttle"],
    ["blackout","Blackouts"],
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* Settings Nav */}
      <div style={{ display: "flex", gap: 4, padding: "12px 16px", borderBottom: "1px solid #1a1a1a", flexShrink: 0, overflowX: "auto" }}>
        {[["store","Store"],["online","Online"],["menu","Menu"],["delivery","Delivery"],["discounts","Discounts"],["employees","Employees"]].map(([id,label]) => (
          <button key={id} onClick={() => setSettingsSection(id)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: settingsSection === id ? "#e85d04" : "#1a1a1a", color: settingsSection === id ? "#fff" : "#888", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 520 }}>

        {/* ── STORE ── */}
        {settingsSection === "store" && (<>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Branding</div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Primary Color</div>
                <PrimaryColorPicker settings={settings} setSettings={setSettings} />
              </div>
              <div>
                <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Store Logo</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {settings.storeLogo && <img src={settings.storeLogo} alt="logo" style={{ height: 48, borderRadius: 6, background: "#000", padding: 4, objectFit: "contain" }} />}
                  <label style={{ cursor: "pointer", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 14px", color: "#ccc", fontSize: 13 }}>
                    {settings.storeLogo ? "Change Logo" : "Upload Logo"}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const logo = ev.target.result; setSettings(s => { const next = {...s, storeLogo: logo}; DB.saveSettings(next).catch(console.error); return next; }); };
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  {settings.storeLogo && <button onClick={() => setSettings(s => { const next = {...s, storeLogo: null}; DB.saveSettings(next).catch(console.error); return next; })} style={{ background: "none", border: "1px solid #c0392b44", borderRadius: 8, color: "#c0392b", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>Remove</button>}
                </div>
              </div>
            </div>
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Logo Size</div>
            <LogoSizeSlider settings={settings} setSettings={setSettings} />
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Online Ordering Hero Title</div>
            <HeroTextInput settingsKey="onlineHeroTitle" value={settings.onlineHeroTitle || ""} placeholder="Order Online" setSettings={setSettings} />
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Online Ordering Subtitle</div>
            <HeroTextInput settingsKey="onlineHeroSubtitle" value={settings.onlineHeroSubtitle || ""} placeholder="Fresh, made to order — pick up or delivery" setSettings={setSettings} />
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Timezone</div>
            <select defaultValue={settings.timezone || "America/New_York"} key={settings.timezone}
              onChange={e => { const v = e.target.value; setSettings(s => { const next = {...s, timezone: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", marginBottom: 14 }}>
              <option value="America/New_York">Eastern (ET)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Los_Angeles">Pacific (PT)</option>
              <option value="America/Anchorage">Alaska (AKT)</option>
              <option value="Pacific/Honolulu">Hawaii (HT)</option>
            </select>
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Store Name</div>
            <input defaultValue={settings.storeName || ""} key={settings.storeName}
              onBlur={e => { const v = e.target.value; setSettings(s => { const next = {...s, storeName: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", marginBottom: 14 }} />
            <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Store Tagline</div>
            <input defaultValue={settings.storeTagline || ""} key={settings.storeTagline}
              onBlur={e => { const v = e.target.value; setSettings(s => { const next = {...s, storeTagline: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none", marginBottom: 14 }} />
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>Tax & Fees</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Sales Tax Rate (%)</div>
              <NumpadInput value={(settings.taxRate||0.06)*100} label="SALES TAX RATE (%)" suffix="%" decimals={true}
                onChange={v => { const next = {...settings, taxRate: v/100}; setSettings(next); DB.saveSettings(next).catch(console.error); setForm(f=>({...f,taxRate:v})); }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Credit Card Surcharge (%)</div>
              <NumpadInput value={(settings.cardSurcharge||0.04)*100} label="CARD SURCHARGE (%)" suffix="%" decimals={true}
                onChange={v => { const next = {...settings, cardSurcharge: v/100}; setSettings(next); DB.saveSettings(next).catch(console.error); setForm(f=>({...f,cardSurcharge:v})); }} />
            </div>
            <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 16 }}>
              <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>PREVIEW ($25 ORDER)</div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: 13, marginBottom: 4 }}><span>Tax ({form.taxRate}%)</span><span>{fmt(25*(parseFloat(form.taxRate)||0)/100)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#06d6a0", fontSize: 14, marginBottom: 4, paddingTop: 6, borderTop: "1px solid #2a2a2a" }}><span>Cash total</span><span style={{ fontWeight: 700 }}>{fmt(25*(1+(parseFloat(form.taxRate)||0)/100))}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#3a86ff", fontSize: 13 }}><span>Card total (+{form.cardSurcharge}%)</span><span style={{ fontWeight: 700 }}>{fmt(25*(1+(parseFloat(form.taxRate)||0)/100)*(1+(parseFloat(form.cardSurcharge)||0)/100))}</span></div>
            </div>
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>Navigation Visibility</div>
            <div style={{ color: "#777", fontSize: 12, marginBottom: 14 }}>Hide buttons from the top nav bar.</div>
            {[["cfd","Customer Display"],["kds","KDS"],["online","Online Orders"],["delivery","Dispatch"],["timeclock","Timeclock"],["customers","Customers"],["orders","Orders"]].map(([id, label]) => {
              const hidden = (settings.hiddenNavItems || []).includes(id);
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: hidden ? "#555" : "#ccc", fontSize: 13 }}>{label}</span>
                  <div onClick={() => {
                    const current = settings.hiddenNavItems || [];
                    const next = hidden ? current.filter(x => x !== id) : [...current, id];
                    setSettings(s => { const updated = {...s, hiddenNavItems: next}; DB.saveSettings(updated).catch(console.error); return updated; });
                  }} style={{ width: 44, height: 24, borderRadius: 12, background: hidden ? "#2a2a2a" : "#e85d04", cursor: "pointer", position: "relative" }}>
                    <div style={{ position: "absolute", top: 3, left: hidden ? 3 : 23, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>Order Types</div>
            {[["posEnableDineIn","Dine In"],["posEnableTakeOut","Take Out"],["posEnableDelivery","Delivery"]].map(([key,label]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ color: "#ccc", fontSize: 13 }}>{label}</span>
                <div onClick={() => setOnline(key, !settings[key])} style={{ width: 44, height: 24, borderRadius: 12, background: settings[key] ? "#e85d04" : "#2a2a2a", cursor: "pointer", position: "relative" }}>
                  <div style={{ position: "absolute", top: 3, left: settings[key] ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ── ONLINE ── */}
        {settingsSection === "online" && (<>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Online Ordering</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Enable Online Ordering</span>
              {toggleSwitch("onlineOrdering", settings.onlineOrdering)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Enable Pickup</span>
              {toggleSwitch("onlinePickup", settings.onlinePickup)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Enable Delivery</span>
              {toggleSwitch("onlineDelivery", settings.onlineDelivery)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Allow ASAP Orders</span>
              {toggleSwitch("onlineAsap", settings.onlineAsap)}
            </div>
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Store Hours</div>
            {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(day => {
              const onlineHours = settings.onlineHours || {};
              const h = onlineHours[day] || { open: false, from: "11:00", to: "21:00" };
              return (
                <div key={day} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: h.open ? 8 : 0 }}>
                    <span style={{ color: h.open ? "#ccc" : "#555", fontSize: 13, width: 90 }}>{day}</span>
                    <div onClick={() => { const next = {...(settings.onlineHours||{}), [day]: {...h, open: !h.open}}; setOnline("onlineHours", next); }}
                      style={{ width: 44, height: 24, borderRadius: 12, background: h.open ? "#e85d04" : "#2a2a2a", cursor: "pointer", position: "relative" }}>
                      <div style={{ position: "absolute", top: 3, left: h.open ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                    </div>
                  </div>
                  {h.open && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="time" value={h.from} onChange={e => { const next = {...(settings.onlineHours||{}), [day]: {...h, from: e.target.value}}; setOnline("onlineHours", next); }}
                        style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "6px 10px", fontSize: 13, outline: "none" }} />
                      <span style={{ color: "#888" }}>to</span>
                      <input type="time" value={h.to} onChange={e => { const next = {...(settings.onlineHours||{}), [day]: {...h, to: e.target.value}}; setOnline("onlineHours", next); }}
                        style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "6px 10px", fontSize: 13, outline: "none" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Throttling</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Max Pizzas Per Slot</span>
              <NumpadInput value={settings.onlineMaxPizzasPerSlot||4} label="MAX PIZZAS PER SLOT" decimals={false}
                onChange={v => setOnline("onlineMaxPizzasPerSlot", v)} style={{ width: 80 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Prep Time (mins)</span>
              <NumpadInput value={settings.onlinePrepTime||30} label="PREP TIME (MINS)" decimals={false}
                onChange={v => setOnline("onlinePrepTime", v)} style={{ width: 80 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#ccc", fontSize: 13 }}>Cutoff Before Close (mins)</span>
              <NumpadInput value={settings.onlineCutoffMins||30} label="CUTOFF MINS" decimals={false}
                onChange={v => setOnline("onlineCutoffMins", v)} style={{ width: 80 }} />
            </div>
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Blackouts</div>
            <div style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>Block specific time slots on a specific date.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#888", fontSize: 13 }}>Date</span>
                <input type="date" min={new Date().toISOString().split("T")[0]} value={newBlackoutDate || ""} onChange={e => setNewBlackoutDate(e.target.value)}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "8px 12px", fontSize: 14, outline: "none" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#888", fontSize: 13 }}>From</span>
                <input type="time" value={newBlackout} onChange={e => setNewBlackout(e.target.value)}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "8px 12px", fontSize: 14, outline: "none" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#888", fontSize: 13 }}>To</span>
                <input type="time" value={newBlackoutEnd || ""} onChange={e => setNewBlackoutEnd(e.target.value)}
                  style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "8px 12px", fontSize: 14, outline: "none" }} />
              </div>
              <button onClick={() => {
                if (!newBlackout || !newBlackoutDate) return;
                const toMins = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
                const fmtSlot = (date, mins) => { const h = Math.floor(mins/60); const m = mins%60; return date + "T" + h + ":" + String(m).padStart(2,"0"); };
                const startMins = toMins(newBlackout);
                const endMins = newBlackoutEnd ? toMins(newBlackoutEnd) : startMins;
                const slots = [];
                for (let t = startMins; t <= endMins; t += 15) slots.push(fmtSlot(newBlackoutDate, t));
                const existing = settings.onlineBlackouts || [];
                const merged = [...new Set([...existing, ...slots])];
                setOnline("onlineBlackouts", merged);
                setNewBlackout(""); setNewBlackoutEnd(""); setNewBlackoutDate("");
              }} style={{ padding: "8px 16px", background: "#e85d04", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Block Range</button>
              <button onClick={() => setOnline("onlineBlackouts", [])} style={{ padding: "8px 16px", background: "none", border: "1px solid #c0392b44", borderRadius: 6, color: "#c0392b", fontWeight: 700, cursor: "pointer" }}>Clear All</button>
            </div>
            {(settings.onlineBlackouts || []).length === 0 && <div style={{ color: "#777", fontSize: 13 }}>No slots blocked.</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(settings.onlineBlackouts || []).sort().map(slot => (
                <div key={slot} style={{ background: "#c0392b22", border: "1px solid #c0392b44", borderRadius: 6, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#c0392b", fontWeight: 700, fontSize: 13 }}>{slot.includes("T") ? (() => { const [d,t] = slot.split("T"); const [h,m] = t.split(":").map(Number); return new Date(d).toLocaleDateString([],{month:"short",day:"numeric"}) + " " + new Date(0,0,0,h,m).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); })() : slot}</span>
                  <button onClick={() => setOnline("onlineBlackouts", (settings.onlineBlackouts||[]).filter(s => s !== slot))} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 14, padding: 0 }}>x</button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Full Day Closures</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input type="date" min={new Date().toISOString().split("T")[0]} id="closure-date-input"
                style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#fff", padding: "8px 12px", fontSize: 14, outline: "none" }} />
              <button onClick={() => {
                const input = document.getElementById("closure-date-input");
                const d = input.value;
                if (!d) return;
                const existing = settings.onlineClosedDates || [];
                if (!existing.includes(d)) setOnline("onlineClosedDates", [...existing, d]);
                input.value = "";
              }} style={{ padding: "8px 16px", background: "#e85d04", border: "none", borderRadius: 6, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Add Closure</button>
            </div>
            {(settings.onlineClosedDates || []).length === 0 && <div style={{ color: "#777", fontSize: 13 }}>No closures scheduled.</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(settings.onlineClosedDates || []).sort().map(d => (
                <div key={d} style={{ background: "#c0392b22", border: "1px solid #c0392b44", borderRadius: 6, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#c0392b", fontWeight: 700, fontSize: 13 }}>{new Date(d+"T12:00:00").toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}</span>
                  <button onClick={() => setOnline("onlineClosedDates", (settings.onlineClosedDates||[]).filter(x => x !== d))} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 14, padding: 0 }}>x</button>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* ── MENU ── */}
        {settingsSection === "menu" && (
          <div style={{ color: "#888", fontSize: 14, padding: 20 }}>Menu management is available via the Menu button in the main POS view.</div>
        )}

        {/* ── DELIVERY ── */}
        {settingsSection === "delivery" && (<>
          <div style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>Delivery Settings</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Store Address</div>
              <input defaultValue={settings.storeAddress || "720 East Pittsburgh St, Greensburg, PA 15601"} key={settings.storeAddress}
                onBlur={e => { const v = e.target.value; setSettings(s => { const next = {...s, storeAddress: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "10px 14px", fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#ccc", fontSize: 13, marginBottom: 6 }}>Delivery Radius (miles)</div>
              <NumpadInput value={settings.deliveryRadiusMiles || 2} label="DELIVERY RADIUS (MILES)" suffix=" mi" decimals={true}
                onChange={v => { if (v > 0) setSettings(s => { const next = {...s, deliveryRadiusMiles: v}; DB.saveSettings(next).catch(console.error); return next; }); }}
                style={{ width: 120 }} />
            </div>
            <DeliveryRadiusMap settings={settings} apiKey="AIzaSyBIkUWwXSNTOc22dLXwVqynZa8hWyuJITQ" />
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#ccc", fontSize: 13 }}>Mileage Reimbursement</div>
                <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>Track driver reimbursement at {fmt(settings.deliveryReimbRate || 0.67)}/mi</div>
              </div>
              <button onClick={() => setOnline("deliveryReimbEnabled", !settings.deliveryReimbEnabled)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: settings.deliveryReimbEnabled ? "#06d6a0" : "#2a2a2a", position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 3, left: settings.deliveryReimbEnabled ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </button>
            </div>
          </div>
        </>)}

        {/* ── DISCOUNTS ── */}
        {settingsSection === "discounts" && (<DiscountsManager />)}

        {/* ── EMPLOYEES ── */}
        {settingsSection === "employees" && (
          <div style={{ color: "#888", fontSize: 14, padding: 20 }}>Employee management coming soon.</div>
        )}

        </div>
      </div>
    </div>
  );
}
// ---- Dispatch Board (manager view) ----
function DispatchBoard({ orders, employees, shifts, onAssign, onUpdateDeliveryStatus, settings }) {
  const clockedInIds = new Set((shifts || []).filter(s => !s.clockOut).map(s => s.employeeId));
  const drivers = employees.filter(e => e.active && e.permissions && e.permissions.driver && clockedInIds.has(e.id));
  const unassigned = orders.filter(o => o.type === "Delivery" && !o.driverId && o.status !== "Delivered");
  const activeRuns = orders.filter(o => o.type === "Delivery" && o.driverId && o.status !== "Delivered");
  const delivered = orders.filter(o => o.type === "Delivery" && o.status === "Delivered");

  const reimbRate = settings.deliveryReimbRate || 0.67;

  const driverOrders = (driverId) => activeRuns.filter(o => o.driverId === driverId);

  const statusColor = { "In Kitchen": "#3a86ff", "Ready": "#06d6a0", "Out for Delivery": "#f77f00", "Delivered": "#555" };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

      {/* Left: Unassigned queue */}
      <div style={{ width: 280, borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3 }}>UNASSIGNED</div>
          <span style={{ background: unassigned.length > 0 ? "#c0392b22" : "#1a1a1a", color: unassigned.length > 0 ? "#c0392b" : "#555", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
            {unassigned.length}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
          {unassigned.length === 0 && <div style={{ color: "#777", fontSize: 13, padding: 10 }}>No unassigned orders</div>}
          {unassigned.map(o => (
            <div key={o.num} style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>#{o.num}</span>
                <span style={{ color: statusColor[o.status] || "#888", fontSize: 11, fontWeight: 700 }}>{o.status}</span>
              </div>
              {o.customer && (
                <>
                  <div style={{ color: "#ccc", fontSize: 13, fontWeight: 600 }}>{o.customer.name}</div>
                  <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>{o.customer.address}</div>
                </>
              )}
              <div style={{ color: "#999", fontSize: 11, marginBottom: 10 }}>
                {o.items.map((it, i) => <div key={i}>{it.qty}x {it.name}</div>)}
              </div>
              {/* Assign dropdown */}
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) onAssign(o.num, parseInt(e.target.value)); }}
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #e85d04", borderRadius: 8, color: "#e85d04", padding: "14px 12px", fontSize: 15, cursor: "pointer", outline: "none", minHeight: 48, touchAction: "manipulation" }}
              >
                <option value="">Assign to driver...</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name.split(" ")[0]} ({driverOrders(d.id).length} active)</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Active drivers */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a1a" }}>
          <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 3 }}>ACTIVE DRIVERS</div>
        </div>
        <div style={{ padding: 12 }}>
          {drivers.length === 0 && (
            <div style={{ color: "#777", fontSize: 13, padding: 10 }}>No drivers on shift. Add the "Driver" permission to an employee to enable delivery.</div>
          )}
          {drivers.map(driver => {
            const runs = driverOrders(driver.id);
            return (
              <div key={driver.id} style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                {/* Driver header */}
                <div style={{ padding: "12px 16px", background: "#1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{driver.name}</div>
                    <div style={{ color: "#999", fontSize: 11, marginTop: 2 }}>{runs.length} active run{runs.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#e85d04", fontSize: 13, fontWeight: 700 }}>
                      {delivered.filter(o => o.driverId === driver.id).length} delivered today
                    </div>
                  </div>
                </div>
                {/* Driver's runs */}
                {runs.length === 0 && <div style={{ color: "#777", fontSize: 12, padding: "12px 16px" }}>No active runs</div>}
                {runs.map(o => (
                  <div key={o.num} style={{ padding: "12px 16px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: "#fff", fontWeight: 700 }}>#{o.num}</span>
                        <span style={{ color: statusColor[o.status] || "#888", fontSize: 11, fontWeight: 700, background: (statusColor[o.status] || "#888") + "22", padding: "2px 8px", borderRadius: 10 }}>{o.status}</span>
                      </div>
                      {o.customer && <div style={{ color: "#888", fontSize: 12 }}>{o.customer.name} — {o.customer.address}</div>}
                    </div>
                    {/* Status controls */}
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      {o.status === "Ready" && (
                        <button onClick={() => onUpdateDeliveryStatus(o.num, "Out for Delivery")}
                          style={{ background: "#f77f0022", border: "1px solid #f77f0044", color: "#f77f00", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          Picked Up
                        </button>
                      )}
                      {o.status === "Out for Delivery" && (
                        <button onClick={() => onUpdateDeliveryStatus(o.num, "Delivered")}
                          style={{ background: "#06d6a022", border: "1px solid #06d6a044", color: "#06d6a0", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          Delivered
                        </button>
                      )}
                      <button onClick={() => onAssign(o.num, null)}
                        style={{ background: "none", border: "1px solid #2a2a2a", color: "#999", padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
                        Unassign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Today's delivered */}
      <div style={{ width: 220, borderLeft: "1px solid #1a1a1a", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a1a" }}>
          <div style={{ color: "#999", fontSize: 11, letterSpacing: 3 }}>DELIVERED TODAY</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
          {delivered.length === 0 && <div style={{ color: "#777", fontSize: 12, padding: 6 }}>None yet</div>}
          {[...delivered].reverse().map(o => {
            const driver = employees.find(e => e.id === o.driverId);
            return (
              <div key={o.num} style={{ padding: "10px 0", borderBottom: "1px solid #1a1a1a" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#999", fontWeight: 700 }}>#{o.num}</span>
                  <span style={{ color: "#e85d04", fontSize: 12, fontWeight: 700 }}>{fmt(o.total)}</span>
                </div>
                {o.customer && <div style={{ color: "#888", fontSize: 11 }}>{o.customer.name}</div>}
                {driver && <div style={{ color: "#999", fontSize: 11 }}>{driver.name.split(" ")[0]}</div>}
              </div>
            );
          })}
        </div>
        {/* Today's delivery summary */}
        {delivered.length > 0 && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid #1a1a1a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#999", fontSize: 12 }}>Orders</span>
              <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{delivered.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#999", fontSize: 12 }}>Revenue</span>
              <span style={{ color: "#e85d04", fontSize: 12, fontWeight: 700 }}>{fmt(delivered.reduce((a, o) => a + o.total, 0))}</span>
            </div>
            {settings.deliveryReimbEnabled && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#999", fontSize: 12 }}>Reimb. ({fmt(reimbRate)}/mi)</span>
              <span style={{ color: "#3a86ff", fontSize: 12, fontWeight: 700 }}>tracked on delivery</span>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Driver View (driver's own screen) ----
function DriverView({ session, orders, onUpdateDeliveryStatus }) {
  const myRuns = orders.filter(o => o.type === "Delivery" && o.driverId === session.id && o.status !== "Delivered");
  const myDelivered = orders.filter(o => o.type === "Delivery" && o.driverId === session.id && o.status === "Delivered");

  const statusColor = { "In Kitchen": "#3a86ff", "Ready": "#06d6a0", "Out for Delivery": "#f77f00" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0a", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", background: "#111", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "#e85d04", fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>MY DELIVERIES</div>
          <div style={{ color: "#999", fontSize: 11, marginTop: 2 }}>{session.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontWeight: 700 }}>{myRuns.length} active</div>
          <div style={{ color: "#999", fontSize: 11 }}>{myDelivered.length} delivered today</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {myRuns.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 60, color: "#777", fontSize: 16 }}>
            No active deliveries.<br />
            <span style={{ fontSize: 13, color: "#888" }}>Waiting for dispatch...</span>
          </div>
        )}
        {myRuns.map(o => (
          <div key={o.num} style={{ background: "#141414", border: "2px solid " + (statusColor[o.status] || "#2a2a2a"), borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
            {/* Order header */}
            <div style={{ padding: "14px 16px", background: "#1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>#{o.num}</div>
              <span style={{ background: (statusColor[o.status] || "#888") + "22", color: statusColor[o.status] || "#888", padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                {o.status}
              </span>
            </div>
            {/* Delivery address — big and easy to read */}
            {o.customer && (
              <div style={{ padding: "16px", borderBottom: "1px solid #1a1a1a" }}>
                <div style={{ color: "#3a86ff", fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>DELIVER TO</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{o.customer.name}</div>
                <div style={{ color: "#ccc", fontSize: 16 }}>{o.customer.address}</div>
                {o.customer.phone && <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>{o.customer.phone}</div>}
                {o.customer.notes && <div style={{ color: "#f77f00", fontSize: 12, marginTop: 6 }}>Note: {o.customer.notes}</div>}
              </div>
            )}
            {/* Order items */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a" }}>
              {o.items.map((it, i) => (
                <div key={i} style={{ color: "#888", fontSize: 13, marginBottom: 3 }}>{it.qty}x {it.name}</div>
              ))}
              <div style={{ color: "#e85d04", fontWeight: 700, fontSize: 16, marginTop: 8 }}>{fmt(o.total)}</div>
            </div>
            {/* Action buttons */}
            <div style={{ padding: "14px 16px", display: "flex", gap: 10 }}>
              {o.status === "Ready" && (
                <button onClick={() => onUpdateDeliveryStatus(o.num, "Out for Delivery")}
                  style={{ flex: 1, padding: "20px 0", background: "#f77f00", border: "none", borderRadius: 12, color: "#000", fontWeight: 700, fontSize: 18, cursor: "pointer", minHeight: 64, touchAction: "manipulation" }}>
                  Picked Up — Leaving Now
                </button>
              )}
              {o.status === "Out for Delivery" && (
                <button onClick={() => onUpdateDeliveryStatus(o.num, "Delivered")}
                  style={{ flex: 1, padding: "20px 0", background: "#06d6a0", border: "none", borderRadius: 12, color: "#000", fontWeight: 700, fontSize: 18, cursor: "pointer", minHeight: 64, touchAction: "manipulation" }}>
                  Mark as Delivered
                </button>
              )}
              {o.status === "In Kitchen" && (
                <div style={{ flex: 1, textAlign: "center", color: "#3a86ff", fontSize: 14, padding: "14px 0" }}>
                  Waiting for kitchen...
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Delivered today */}
        {myDelivered.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#777", fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>COMPLETED TODAY</div>
            {[...myDelivered].reverse().map(o => (
              <div key={o.num} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1a1a1a" }}>
                <div>
                  <span style={{ color: "#888", fontWeight: 700 }}>#{o.num}</span>
                  {o.customer && <span style={{ color: "#777", fontSize: 12, marginLeft: 8 }}>{o.customer.name}</span>}
                </div>
                <span style={{ color: "#999", fontSize: 12 }}>{fmt(o.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// KDS - Kitchen Display System
// ---------------------------------------------------------------------------
function KDS({ orders, onBump, onStartNow, onRecall, setView, session, can, onlineOrderBadge, setOnlineOrderBadge, settingsOpen, setSettingsOpen, visibleMain, visibleSettings, inSettingsArea, menu, customers, addCustomer, updateCustomer, settings, nextOrderNum, calcItemTotal, upsertCustomer, addOrder, decrementStock, requirePermission }) {
  const [now, setNow] = useState(Date.now());
  const [recalled, setRecalled] = useState([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const todayDateStr = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); })();
  const isFutureOrder = (o) => {
    if (!o.scheduledTime) return false;
    // If no "T" it's a time-only string (POS orders) — always today
    if (!o.scheduledTime.includes("T")) return false;
    const orderDate = o.scheduledTime.split("T")[0];
    return orderDate > todayDateStr;
  };
  const allActive = orders.filter(o => o.status === "In Kitchen");
  const active = allActive.filter(o => !isFutureOrder(o)).sort((a, b) => {
    const aTime = a.scheduledTime ? new Date(a.scheduledTime).getTime() : (a.placedAt ? new Date(a.placedAt).getTime() : 0);
    const bTime = b.scheduledTime ? new Date(b.scheduledTime).getTime() : (b.placedAt ? new Date(b.placedAt).getTime() : 0);
    return aTime - bTime;
  });
  const futureOrders = allActive.filter(o => isFutureOrder(o)).sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
  const done   = orders.filter(o => o.status === "Ready");
  const [kdsTab, setKdsTab] = useState("today");

  const prepMinsKds = (settings && (settings.onlinePrepTime || settings.online_prep_time)) || 30;
  const parseScheduled = (s) => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      const [date, time] = s.split("T");
      const [y, mo, d] = date.split("-").map(Number);
      const [h, m] = time.split(":").map(Number);
      return new Date(y, mo - 1, d, h, m).getTime();
    }
    return new Date(s).getTime();
  };
  const cookStart = (o) => {
    if (o.scheduledTime) {
      const t = parseScheduled(o.scheduledTime);
      return t ? t - prepMinsKds * 60000 : (o.placedAt || now);
    }
    return o.placedAt || now;
  };
  const orderElapsed = (o) => {
    const start = cookStart(o);
    if (now < start) {
      const startDate = new Date(start);
      return startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const secs = Math.floor((now - start) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m + ":" + String(s).padStart(2, "0");
  };
  const urgencyStyle = (o) => {
    const start = cookStart(o);
    if (now < start) return { border: "2px solid #2a2a2a", background: "#141414" };
    const mins = (now - start) / 60000;
    if (mins >= 20) return { border: "2px solid #c0392b", background: "#1a0a0a" };
    if (mins >= 12) return { border: "2px solid #f77f00", background: "#1a1200" };
    return { border: "2px solid #2a2a2a", background: "#141414" };
  };
  const timerColor = (o) => {
    const start = cookStart(o);
    if (now < start) return "#444";
    const mins = (now - start) / 60000;
    if (mins >= 20) return "#c0392b";
    if (mins >= 12) return "#f77f00";
    return "#06d6a0";
  };

  const [kdsMode, setKdsMode] = useState("kds");
  const [kdsDiscount, setKdsDiscount] = useState(null);
  const [kdsPayment, setKdsPayment] = useState({ method: null, tip: 0, tipMode: null, tendered: "", change: 0 });
  const [kdsScheduledTime, setKdsScheduledTime] = useState(""); // "kds" | "pos"
  const [kdsSettingsOpen, setKdsSettingsOpen] = useState(false); // slide-out settings

  // POS state local to this KDS tablet
  const [kdsItems, setKdsItems] = useState([]);
  const [kdsOrderType, setKdsOrderType] = useState("Take Out");
  const [kdsCustomer, setKdsCustomer] = useState(null);
  const [kdsOrderNum, setKdsOrderNum] = useState(nextOrderNum ? nextOrderNum() : 200);
  const [kdsCategory, setKdsCategory] = useState(menu ? Object.keys(menu)[0] : "Pizzas");
  const [kdsModTarget, setKdsModTarget] = useState(null);

  const kdsActiveCat = menu && Object.keys(menu).includes(kdsCategory) ? kdsCategory : (menu ? Object.keys(menu)[0] : "");

  const kdsAddItem = (menuItem) => {
    if (menuItem.modifierGroups && menuItem.modifierGroups.length > 0) {
      setKdsModTarget(menuItem);
    } else {
      setKdsItems(prev => {
        const idx = prev.findIndex(i => i.id === menuItem.id && Object.keys(i.selections || {}).length === 0);
        if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qty: i.qty + 1 } : i);
        return [...prev, { ...menuItem, qty: 1, selections: {}, notes: "" }];
      });
    }
  };

  const kdsPlaceOrder = () => {
    if (!kdsItems.length || !addOrder) return;
    const subtotal = kdsItems.reduce((a, i) => a + calcItemTotal(i), 0);
    const tax = subtotal * (settings ? settings.taxRate : 0.06);
    const total = subtotal + tax;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    let savedCustomer = kdsCustomer;
    if (kdsCustomer && kdsCustomer.phone && upsertCustomer) {
      savedCustomer = upsertCustomer(kdsCustomer) || kdsCustomer;
    }
    const order = { num: kdsOrderNum, type: kdsOrderType, customer: savedCustomer, items: [...kdsItems], total, status: "In Kitchen", time, placedAt: Date.now(), discount: kdsDiscount || null, scheduledTime: kdsScheduledTime || null };
    addOrder(order);
    if (decrementStock) decrementStock(kdsItems);
    setKdsItems([]);
    setKdsCustomer(null);
    setKdsOrderNum(n => n + 1);
    setKdsDiscount(null);
    setKdsScheduledTime("");
    setKdsPayment({ method: null, tip: 0, tipMode: null, tendered: "", change: 0 });
    setKdsMode("kds");
  };

  const roleColors = { owner: "#e85d04", manager: "#3a86ff", employee: "#06d6a0" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0a0a0a", overflow: "hidden" }}>
      {kdsModTarget && (
        <ModifierModal item={kdsModTarget} onConfirm={(sel, notes) => { setKdsItems(prev => [...prev, { ...kdsModTarget, qty: 1, selections: sel, notes }]); setKdsModTarget(null); }} onCancel={() => setKdsModTarget(null)} />
      )}

      {/* Unified header */}
      <div style={{ background: "#111", borderBottom: "2px solid #1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, background: settings && settings.storeLogo ? "transparent" : "#e85d04", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {settings && settings.storeLogo ? <img src={settings.storeLogo} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", opacity: 0.9 }} />}
          </div>
          <div>
            <div style={{ color: "#e85d04", fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{settings ? (settings.storeName || "") : ""}</div>
            <div style={{ color: "#666", fontSize: 9, letterSpacing: 2 }}>{(settings && settings.storeTagline || "KITCHEN DISPLAY").toUpperCase()}</div>
          </div>
        </div>

        {/* Mode toggle — the main switch */}
        <div style={{ display: "flex", background: "#1a1a1a", borderRadius: 10, padding: 3, gap: 2 }}>
          <button
            onClick={() => setKdsMode("kds")}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: kdsMode === "kds" ? "#e85d04" : "none", color: kdsMode === "kds" ? "#fff" : "#888", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 44, touchAction: "manipulation", letterSpacing: 1 }}
          >
            KDS
          </button>
          {can && can("pos") && (
            <button
              onClick={() => setKdsMode("pos")}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: kdsMode === "pos" ? "#3a86ff" : "none", color: kdsMode === "pos" ? "#fff" : "#888", fontWeight: 700, fontSize: 14, cursor: "pointer", minHeight: 44, touchAction: "manipulation", letterSpacing: 1 }}
            >
              POS
            </button>
          )}
        </div>

        {/* KDS status — only in KDS mode */}
        {kdsMode === "kds" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ background: "#e85d0422", color: "#e85d04", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 700 }}>
              {active.length} active
            </span>
            <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
              <span style={{ color: "#06d6a0" }}>■ &lt;12m</span>
              <span style={{ color: "#f77f00" }}>■ 12-20m</span>
              <span style={{ color: "#c0392b" }}>■ 20+m</span>
            </div>
          </div>
        )}

        {/* POS order type — only in POS mode */}
        {kdsMode === "pos" && (
          <div style={{ display: "flex", gap: 4 }}>
            {[settings.posEnableDineIn !== false && "Dine In", settings.posEnableTakeOut !== false && "Take Out", settings.posEnableDelivery !== false && "Delivery"].filter(Boolean).map(t => (
              <button key={t} onClick={() => setKdsOrderType(t)} style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid " + (kdsOrderType === t ? "#e85d04" : "#2a2a2a"), background: kdsOrderType === t ? "#e85d0422" : "none", color: kdsOrderType === t ? "#e85d04" : "#888", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>
                {t}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {/* Settings gear — POS mode only */}
          {kdsMode === "pos" && (
            <button
              onClick={() => setKdsSettingsOpen(o => !o)}
              style={{ background: kdsSettingsOpen ? "#e85d0422" : "none", border: "1px solid " + (kdsSettingsOpen ? "#e85d04" : "#2a2a2a"), color: kdsSettingsOpen ? "#e85d04" : "#888", padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, minHeight: 44, touchAction: "manipulation" }}
            >
              Settings
            </button>
          )}
          {/* Clock */}
          <span style={{ color: "#777", fontSize: 13, fontFamily: "monospace" }}>
            {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          {/* Session */}
          {session && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{session.name.split(" ")[0]}</div>
              <div style={{ color: roleColors[session.role] || "#888", fontSize: 9, letterSpacing: 1 }}>{(session.role || "").toUpperCase()}</div>
            </div>
          )}
        </div>
      </div>

      {/* POS mode — full POS UI */}
      {kdsMode === "pos" && menu && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

          {/* Settings slide-out panel */}
          {kdsSettingsOpen && (
            <>
              <div onClick={() => setKdsSettingsOpen(false)} style={{ position: "absolute", inset: 0, background: "#000000aa", zIndex: 40 }} />
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 320, background: "#141414", borderLeft: "1px solid #2a2a2a", zIndex: 50, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 18px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#e85d04", fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>SETTINGS</span>
                  <button onClick={() => setKdsSettingsOpen(false)} style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13, minHeight: 44, touchAction: "manipulation" }}>Close</button>
                </div>
                {/* Settings sub-nav */}
                {visibleSettings && visibleSettings.map(([id, label]) => (
                  <button key={id} onClick={() => { setView(id); setKdsSettingsOpen(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "18px 20px", background: "none", border: "none", borderBottom: "1px solid #1a1a1a", color: "#ccc", fontSize: 15, cursor: "pointer", minHeight: 60, touchAction: "manipulation" }}>
                    {label}
                  </button>
                ))}
                {/* Quick actions */}
                <div style={{ padding: "16px 18px", borderTop: "1px solid #1a1a1a", marginTop: "auto" }}>
                  <div style={{ color: "#777", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>QUICK ACTIONS</div>
                  <button onClick={() => { setView("timeclock"); setKdsSettingsOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#ccc", fontSize: 14, cursor: "pointer", marginBottom: 8, minHeight: 52, touchAction: "manipulation" }}>
                    Timeclock
                  </button>
                  <button onClick={() => { setView("orders"); setKdsSettingsOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#ccc", fontSize: 14, cursor: "pointer", marginBottom: 8, minHeight: 52, touchAction: "manipulation" }}>
                    Orders
                  </button>
                  <button onClick={() => { setView("delivery"); setKdsSettingsOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#ccc", fontSize: 14, cursor: "pointer", minHeight: 52, touchAction: "manipulation" }}>
                    Dispatch
                  </button>
                </div>
              </div>
            </>
          )}

          <div style={s.menuPanel}>
            {customers && (
              <CustomerPanel
                selected={kdsCustomer} onSelect={setKdsCustomer} onClear={() => setKdsCustomer(null)}
                customers={customers} onAddCustomer={addCustomer} onUpdateCustomer={updateCustomer} orderType={kdsOrderType}
              />
            )}
            <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid #1a1a1a" }}>
              {Object.keys(menu).map(cat => (
                <button key={cat} onClick={() => setKdsCategory(cat)} style={{ ...s.catBtn, ...(kdsActiveCat === cat ? s.catActive : {}) }}>{cat}</button>
              ))}
            </div>
            <div style={s.menuGrid}>
              {(menu[kdsActiveCat] || []).map(item => {
                let pressTimer = null;
                const onPressStart = () => { pressTimer = setTimeout(() => {}, 500); };
                const onPressEnd = () => { if (pressTimer) clearTimeout(pressTimer); };
                return (
                  <button key={item.id} onClick={() => item.stock !== 0 && kdsAddItem(item)}
                    onMouseDown={onPressStart} onMouseUp={onPressEnd} onTouchStart={onPressStart} onTouchEnd={onPressEnd}
                    style={{ ...s.menuItem, opacity: item.stock === 0 ? 0.4 : 1, cursor: item.stock === 0 ? "default" : "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ color: item.stock === 0 ? "#999" : "#ddd", fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                      {item.stock === 0 && <span style={{ color: "#c0392b", fontSize: 9, fontWeight: 700 }}>SOLD OUT</span>}
                    </div>
                    <div style={{ color: item.stock === 0 ? "#777" : "#e85d04", fontSize: 18, fontWeight: 700 }}>{fmt(item.base)}</div>
                    {item.stock != null && item.stock > 0 && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ flex: 1, height: 3, background: "#1a1a1a", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: Math.min(100, (item.stock / Math.max(item.stock, 10)) * 100) + "%", background: item.stock <= 3 ? "#c0392b" : item.stock <= 6 ? "#f77f00" : "#06d6a0", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: item.stock <= 3 ? "#c0392b" : item.stock <= 6 ? "#f77f00" : "#888", fontSize: 10, fontWeight: 700, minWidth: 28, textAlign: "right" }}>{item.stock} left</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <Ticket items={kdsItems} orderType={kdsOrderType} orderNum={kdsOrderNum} onRemove={idx => setKdsItems(prev => prev.filter((_, i) => i !== idx))} onPlace={kdsPlaceOrder} onClear={() => setKdsItems([])} settings={settings} payment={kdsPayment} setPayment={setKdsPayment} discount={kdsDiscount} setDiscount={setKdsDiscount} scheduledTime={kdsScheduledTime} setScheduledTime={setKdsScheduledTime} requirePermission={requirePermission} />
        </div>
      )}

      {/* KDS mode content below */}
      {kdsMode === "kds" && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, padding: "8px 12px 0", background: "#0a0a0a", borderBottom: "1px solid #1a1a1a", flexShrink: 0 }}>
          <button onClick={() => setKdsTab("today")} style={{ padding: "8px 20px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: 1, background: kdsTab === "today" ? "#1a1a1a" : "transparent", color: kdsTab === "today" ? "#fff" : "#555", border: "1px solid " + (kdsTab === "today" ? "#2a2a2a" : "transparent"), borderBottom: kdsTab === "today" ? "1px solid #1a1a1a" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: kdsTab === "today" ? -1 : 0 }}>
            TODAY {active.length > 0 && <span style={{ background: "#e85d04", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px" }}>{active.length}</span>}
          </button>
          <button onClick={() => setKdsTab("future")} style={{ padding: "8px 20px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: 1, background: kdsTab === "future" ? "#1a1a1a" : "transparent", color: kdsTab === "future" ? "#fff" : "#555", border: "1px solid " + (kdsTab === "future" ? "#2a2a2a" : "transparent"), borderBottom: kdsTab === "future" ? "1px solid #1a1a1a" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: kdsTab === "future" ? -1 : 0 }}>
            FUTURE {futureOrders.length > 0 && <span style={{ background: "#f77f00", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px" }}>{futureOrders.length}</span>}
          </button>
        </div>
        {/* Active orders */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {kdsTab === "today" && active.length === 0 && (
            <div style={{ color: "#888", textAlign: "center", marginTop: 80, fontSize: 18, letterSpacing: 2 }}>ALL CLEAR</div>
          )}
          {kdsTab === "future" && futureOrders.length === 0 && (
            <div style={{ color: "#888", textAlign: "center", marginTop: 80, fontSize: 18, letterSpacing: 2 }}>NO FUTURE ORDERS</div>
          )}
          {kdsTab === "future" && futureOrders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: "#f77f00", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, padding: "6px 10px", background: "#f77f0011", border: "1px solid #f77f0033", borderRadius: 6, display: "inline-block" }}>
                📅 Future Orders — {futureOrders.length}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {futureOrders.map(o => {
                  const schedDate = new Date(parseScheduled(o.scheduledTime) || o.scheduledTime);
                  const dateLabel = isNaN(schedDate) ? o.scheduledTime : schedDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
                  const timeLabel = isNaN(schedDate) ? "" : schedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={o.num} style={{ background: "#141414", border: "2px solid #f77f0044", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #222" }}>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1 }}>#{o.num}</div>
                          <div style={{ color: "#999", fontSize: 12, marginTop: 2 }}>{o.type}{o.customer ? " — " + o.customer.name : ""}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: "#f77f00", fontWeight: 700, fontSize: 13 }}>{dateLabel}</div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{timeLabel}</div>
                        </div>
                      </div>
                      <div style={{ padding: "10px 14px", flex: 1 }}>
                        {o.items && o.items.map((it, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ color: "#ccc", fontSize: 13 }}>{it.qty}x {it.name}</div>
                            {selectionSummary(it).map((line, j) => <div key={j} style={{ color: "#888", fontSize: 11, paddingLeft: 10 }}>+ {line}</div>)}
                          </div>
                        ))}
                        {o.notes && <div style={{ color: "#f77f00", fontSize: 11, fontStyle: "italic", marginTop: 6 }}>* {o.notes}</div>}
                      </div>
                      <div style={{ padding: "8px 14px", borderTop: "1px solid #222", display: "flex", gap: 8 }}>
                        <button onClick={() => onStartNow(o.num)} style={{ flex: 1, background: "#f77f0022", border: "1px solid #f77f0066", color: "#f77f00", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Start Now</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {kdsTab === "future" && futureOrders.length === 0 && (
            <div style={{ color: "#888", textAlign: "center", marginTop: 80, fontSize: 18, letterSpacing: 2 }}>NO FUTURE ORDERS</div>
          )}
          {kdsTab === "today" && active.length === 0 && (
            <div style={{ color: "#888", textAlign: "center", marginTop: 80, fontSize: 18, letterSpacing: 2 }}>ALL CLEAR</div>
          )}
          {kdsTab === "today" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {active.map(o => (
              <div key={o.num} style={{ ...urgencyStyle(o), borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Card header */}
                <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #222" }}>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1 }}>#{o.num}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: "2px 8px", borderRadius: 4,
                        background: o.type === "Delivery" ? "#3a86ff22" : o.type === "Take Out" ? "#f77f0022" : "#06d6a022",
                        color: o.type === "Delivery" ? "#3a86ff" : o.type === "Take Out" ? "#f77f00" : "#06d6a0",
                      }}>
                        {o.type.toUpperCase()}
                      </span>
                      {o.customer && (
                        <span style={{ color: "#aaa", fontSize: 12, fontWeight: 600 }}>{o.customer.name}</span>
                      )}
                    </div>
                    {o.type === "Delivery" && o.customer && (
                      <div style={{ marginTop: 6, background: "#3a86ff11", border: "1px solid #3a86ff33", borderRadius: 6, padding: "5px 8px" }}>
                        <div style={{ color: "#3a86ff", fontSize: 10, letterSpacing: 1, marginBottom: 2 }}>DELIVER TO</div>
                        <div style={{ color: "#ccc", fontSize: 13, fontWeight: 600 }}>{o.customer.name}</div>
                        <div style={{ color: "#888", fontSize: 12 }}>{o.customer.address}</div>
                        {o.customer.phone && <div style={{ color: "#999", fontSize: 11 }}>{o.customer.phone}</div>}
                      </div>
                    )}
                    {(o.slotLabel || o.scheduledTime || o.source === "online") && (
                      <div style={{ marginTop: 6, background: "#e85d0422", border: "1px solid #e85d0444", borderRadius: 6, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#e85d04", fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>
                          {o.type === "Delivery" ? "DELIVER BY" : "PICKUP AT"}
                        </span>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
                          {o.slotLabel || (o.scheduledTime ? (o.scheduledTime.includes("T") ? new Date(o.scheduledTime).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : o.scheduledTime) : "ASAP")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: timerColor(o), fontFamily: "monospace" }}>
                      {orderElapsed(o)}
                    </div>
                    <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>placed {o.time}</div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ flex: 1, padding: "10px 14px" }}>
                  {o.items.map((item, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span style={{ color: "#e85d04", fontWeight: 700, fontSize: 18, minWidth: 24 }}>{item.qty}x</span>
                        <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                      </div>
                      {/* Modifiers */}
                      {item.modifierGroups && item.modifierGroups.length > 0
                        ? item.modifierGroups.map(g => {
                            const sel = (item.selections || {})[g.id] || [];
                            return sel.map((m, j) => (
                              <div key={j} style={{ paddingLeft: 32, color: "#888", fontSize: 13, lineHeight: 1.6 }}>
                                + {m.name}{m.side && m.side !== "whole" ? " (" + m.side + ")" : ""}{m.extra ? " [XTRA]" : ""}
                              </div>
                            ));
                          })
                        : Object.values(item.selections || {}).flatMap((mods, gi) =>
                            (mods || []).map((m, j) => (
                              <div key={gi+"-"+j} style={{ paddingLeft: 32, color: "#888", fontSize: 13, lineHeight: 1.6 }}>
                                + {m.name}{m.side && m.side !== "whole" ? " (" + m.side + ")" : ""}{m.extra ? " [XTRA]" : ""}
                              </div>
                            ))
                          )
                      }
                      {item.notes ? (
                        <div style={{ paddingLeft: 32, color: "#f77f00", fontSize: 12, fontStyle: "italic" }}>
                          * {item.notes}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* Bump button */}
                <button
                  onClick={() => onBump(o.num)}
                  style={{ margin: "0 14px 14px", padding: "18px 0", background: "#06d6a0", border: "none", borderRadius: 10, color: "#000", fontWeight: 700, fontSize: 16, cursor: "pointer", letterSpacing: 1, minHeight: 60, touchAction: "manipulation" }}
                >
                  BUMP - READY
                </button>
              </div>
            ))}
          </div>}
        </div>

        {/* Done / Recall rail */}
        {done.length > 0 && (
          <div style={{ width: 200, borderLeft: "1px solid #1a1a1a", overflowY: "auto", padding: 10, background: "#0d0d0d" }}>
            <div style={{ color: "#777", fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>BUMPED</div>
            {[...done].reverse().map(o => (
              <div key={o.num} style={{ background: "#141414", border: "1px solid #1a1a1a", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ color: "#999", fontWeight: 700, fontSize: 16 }}>#{o.num}</span>
                  <span style={{ color: "#777", fontSize: 11 }}>{o.time}</span>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>{o.type}</div>
                {o.customer && <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>{o.customer.name}</div>}
                {o.items.map((it, i) => (
                  <div key={i} style={{ color: "#888", fontSize: 12 }}>{it.qty}x {it.name}</div>
                ))}
                <button
                  onClick={() => onBump(o.num, true)}
                  style={{ marginTop: 8, width: "100%", padding: "6px 0", background: "none", border: "1px solid #2a2a2a", borderRadius: 5, color: "#999", fontSize: 11, cursor: "pointer" }}
                >
                  Recall
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  // URL-based device mode: ?mode=kds | ?mode=cfd | ?mode=pos | ?mode=online
  const deviceMode = new URLSearchParams(window.location.search).get("mode");

  const [session, setSession] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [view, setView] = useState(deviceMode || "pos");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [menu, setMenu] = useState(INITIAL_MENU);
  const menuLoaded = useRef(false);
  const [category, setCategory] = useState("Pizzas");
  const [orderType, setOrderType] = useState("Take Out");
  const [discount, setDiscount] = useState(null);
  const [items, setItems] = useState([]);
  const [orderNum, setOrderNum] = useState(nextOrderNum());
  const [customers, setCustomers] = useState(SEED_CUSTOMERS);
  const [customer, setCustomer] = useState(null);
  const [modTarget, setModTarget] = useState(null);
  const [orders, setOrders] = useState([]);
  const [toast, setToast] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stockEditItem, setStockEditItem] = useState(null);
  const [onlineOrderBadge, setOnlineOrderBadge] = useState(0);
  const [payment, setPayment] = useState({ method: null, tip: 0, tipMode: null, tendered: "", change: 0 });
  const [scheduledTime, setScheduledTime] = useState("");
  const resetPayment = () => setPayment({ method: null, tip: 0, tipMode: null, tendered: "", change: 0 });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ── Bootstrap from Supabase ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [dbSettings, dbEmployees, dbCustomers, dbMenu, dbOrders, dbShifts] = await Promise.all([
          DB.loadSettings(),
          DB.loadEmployees(),
          DB.loadCustomers(),
          DB.loadMenu(),
          DB.loadOrders(7),
          DB.loadShifts(7),
        ]);
        if (cancelled) return;
        if (dbSettings) setSettings(dbSettings);
        if (dbEmployees && dbEmployees.length) setEmployees(dbEmployees);
        if (dbCustomers && dbCustomers.length) setCustomers(dbCustomers);
        if (dbMenu && Object.keys(dbMenu).length) {
          setMenu(dbMenu);
          setCategory(Object.keys(dbMenu)[0]);
        }
        menuLoaded.current = true;
        if (dbOrders) setOrders(dbOrders);
        if (dbShifts) setShifts(dbShifts);
        // Set order counter above highest existing order
        if (dbOrders && dbOrders.length) {
          const maxNum = Math.max(...dbOrders.map(o => o.num || 0));
          orderCounter = maxNum + 1; // always start above highest existing
        }
        setDbReady(true);
      } catch (err) {
        console.error("Supabase bootstrap error:", err);
        if (!cancelled) {
          setDbError("Could not connect to database. Running in offline mode.");
          setDbReady(true); // allow offline use
        }
      }
    }
    bootstrap();

    // Realtime subscriptions
    const orderSub = DB.subscribeOrders(
      (newOrder) => {
        setOrders(prev => {
          if (prev.find(o => o.num === newOrder.num)) return prev;
          setOnlineOrderBadge(n => n + 1);
          return [newOrder, ...prev];
        });
      },
      (updatedOrder) => {
        setOrders(prev => prev.map(o => o.num === updatedOrder.num ? { ...o, ...updatedOrder } : o));
      }
    );

    const settingsSub = DB.subscribeSettings((raw) => {
      DB.loadSettings().then(s => { if (s) setSettings(s); });
    });

    return () => {
      cancelled = true;
      orderSub.unsubscribe();
      settingsSub.unsubscribe();
    };
  }, []);

  // Permission helper
  const can = (key) => session && session.permissions && session.permissions[key];
  // Manager override
  const [overrideRequest, setOverrideRequest] = useState(null);
  const requirePermission = (key, reason, onSuccess) => {
    if (can(key)) { onSuccess(); return; }
    setOverrideRequest({ key, reason, onSuccess });
  };

  // Clock in/out — persisted to Supabase
  let shiftIdGen = 9000;
  const clockIn = async (empId) => {
    try {
      const shift = await DB.clockIn(empId);
      setShifts(prev => {
        // Avoid duplicate shift entries
        if (prev.find(s => s.id === shift.id)) return prev;
        return [...prev, shift];
      });
    } catch(e) {
      // Offline fallback or already clocked in
      const existing = shifts.find(s => s.employeeId === empId && !s.clockOut);
      if (!existing) {
        const id = shiftIdGen++;
        setShifts(prev => [...prev, { id, employeeId: empId, clockIn: Date.now(), clockOut: null }]);
      }
    }
  };
  const clockOut = async (shiftId, empId) => {
    try {
      await DB.clockOut(shiftId);
    } catch {}
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, clockOut: Date.now() } : s));
    // Log out if this is the current session's shift
    if (session && session.id === empId) {
      setTimeout(() => {
        setSession(null);
        setView(deviceMode || "pos");
        setItems([]);
        setCustomer(null);
      }, 1500); // brief delay so they see the clock-out confirmation
    }
  };

  // Login / logout
  const handleLogin = (emp) => {
    setSession(emp);
    // Auto clock in if not already clocked in
    const already = shifts.find(s => s.employeeId === emp.id && !s.clockOut);
    if (!already) clockIn(emp.id);
    // Navigate to device mode if set
    if (deviceMode) {
      setView(deviceMode);
    } else {
      setView("pos");
    }
  };
  const handleLogout = () => {
    setSession(null);
    setView(deviceMode || "pos");
    setItems([]);
    setCustomer(null);
  };

  const addCustomer = async (c) => {
    setCustomers(prev => [...prev, c]);
    try {
      const saved = await DB.saveCustomer(c);
      if (saved) setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, id: saved.id } : x));
    } catch {}
  };


  const decrementStock = (orderItems) => {
    setMenu(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(cat => {
        next[cat] = next[cat].map(menuItem => {
          const ordered = orderItems.find(i => i.id === menuItem.id);
          if (!ordered || menuItem.stock == null) return menuItem;
          return { ...menuItem, stock: Math.max(0, menuItem.stock - ordered.qty) };
        });
      });
      return next;
    });
  };

  const assignDriver = (orderNum, driverId) => {
    setOrders(prev => prev.map(o => o.num === orderNum ? { ...o, driverId: driverId || null } : o));
    DB.assignOrderDriver(orderNum, driverId).catch(console.error);
  };

  const updateDeliveryStatus = (orderNum, status) => {
    setOrders(prev => prev.map(o => o.num === orderNum ? { ...o, status } : o));
    DB.updateOrderStatus(orderNum, status).catch(console.error);
  };

  const handleOnlineOrder = (order) => {
    if (order.customer && order.customer.phone) {
      const savedCust = upsertCustomer(order.customer);
      order = { ...order, customer: savedCust || order.customer };
    }
    setOrders(prev => [...prev, order]);
    setOnlineOrderBadge(n => n + 1);
    decrementStock(order.items);
    showToast("New online order #" + order.num + " received!");
    DB.saveOrder(order).then(saved => {
      console.log("Online order saved to Supabase:", saved);
    }).catch(err => {
      console.error("Failed to save online order to Supabase:", err);
    });
  };
  const updateCustomer = (c) => {
    setCustomers(prev => prev.map(x => x.id === c.id ? c : x));
    DB.saveCustomer(c).catch(console.error);
  };

  const upsertCustomer = (custData) => {
    if (!custData || !custData.phone) return null;
    try {
      const cleanPhone = custData.phone.replace(/\D/g,"");
      const existing = customers.find(c => c.phone && c.phone.replace(/\D/g,"") === cleanPhone);
      if (existing) {
        const updated = {
          ...existing,
          address: custData.address || existing.address,
          notes: custData.notes || existing.notes,
          orderCount: (existing.orderCount || 0) + 1,
        };
        updateCustomer(updated);
        return updated;
      } else {
        const newCust = { id: newCustId(), name: custData.name || "", phone: custData.phone, address: custData.address || "", notes: custData.notes || "", points: 0, orderCount: 1 };
        addCustomer(newCust);
        return newCust;
      }
    } catch(e) {
      console.error("upsertCustomer error:", e);
      return custData;
    }
  };


  const bumpOrder = (num, recall) => {
    const newStatus = recall ? "In Kitchen" : "Ready";
    setOrders(prev => prev.map(o => o.num !== num ? o : { ...o, status: newStatus }));
    DB.updateOrderStatus(num, newStatus).catch(console.error);
  };

  const addItem = menuItem => {
    if (menuItem.modifierGroups && menuItem.modifierGroups.length > 0) {
      setModTarget(menuItem);
    } else {
      setItems(prev => {
        const idx = prev.findIndex(i => i.id === menuItem.id);
        if (idx >= 0) return prev.map((i, n) => n === idx ? { ...i, qty: i.qty + 1 } : i);
        return [...prev, { ...menuItem, qty: 1, selections: {}, notes: "" }];
      });
    }
  };

  const confirmModifiers = (selections, notes) => {
    setItems(prev => [...prev, { ...modTarget, qty: 1, selections, notes }]);
    setModTarget(null);
  };

  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx));

  const placeOrder = () => {
    const subtotal = items.reduce((a, i) => a + calcItemTotal(i), 0);
    const tax = subtotal * settings.taxRate;
    const total = subtotal + tax;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    // Save customer to shared database if they have a phone number
    let savedCustomer = customer;
    if (customer && customer.phone && !customer.id) {
      savedCustomer = upsertCustomer(customer);
    } else if (customer && customer.id) {
      // Update order count for existing customer
      updateCustomer({ ...customer, orderCount: (customer.orderCount || 0) + 1 });
    }
    const order = { num: orderNum, type: orderType, customer: savedCustomer, items: [...items], total, status: "In Kitchen", time, placedAt: Date.now(), paymentMethod: payment && payment.method ? payment.method : null, scheduledTime: scheduledTime || null, discount: discount || null };
    setOrders(prev => [...prev, order]);
    setItems([]); setCustomer(null); setOrderNum(nextOrderNum()); setScheduledTime(""); setDiscount(null);
    decrementStock(order.items);
    resetPayment();
    showToast("Order #" + order.num + " sent to kitchen!");
    // Persist to Supabase (non-blocking)
    DB.saveOrder(order).then(saved => {
      console.log("Order saved to Supabase:", saved);
    }).catch(err => {
      console.error("Failed to save order to Supabase:", err);
    });
  };

  const activeCat = Object.keys(menu).includes(category) ? category : Object.keys(menu)[0];

  // Show PIN screen if not logged in
  // Sync POS order state to CFD in real time
  useEffect(() => {
    if (!dbReady) return;
    DB.pushCFD({ items, orderNum, payment }).catch(() => {});
  }, [items, orderNum, payment, dbReady]);

  // Lock viewport to screen — no bounce, no overflow, landscape-optimized
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.height = "100%";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.top = "0";
    body.style.left = "0";
    // Lock to landscape on tablets
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
    return () => {
      html.style.height = "";
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.position = "";
      body.style.width = "";
      body.style.height = "";
    };
  }, []);

  if (!dbReady) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#080808", gap: 20 }}>
      <div style={{ width: 32, height: 32, background: "#e85d04", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
      </div>
      <div style={{ color: "#e85d04", fontWeight: 700, fontSize: 16, letterSpacing: 3 }}>PIZZA TIME</div>
      <div style={{ color: "#555", fontSize: 13, letterSpacing: 2 }}>CONNECTING...</div>
      {dbError && <div style={{ color: "#f77f00", fontSize: 12, maxWidth: 300, textAlign: "center" }}>{dbError}</div>}
    </div>
  );

  // CFD — customer facing, no PIN, subscribes to server for live order state
  if (!session && deviceMode === "cfd") {
    return <CFDDevice settings={settings} />;
  }
  if (!session && deviceMode === "online") {
    return <OnlineOrderPage menu={menu} settings={settings} orders={orders} customers={customers} onOrderPlaced={handleOnlineOrder} />;
  }

  if (!session) return <PinScreen employees={employees} onLogin={handleLogin} />;

  // Main nav items (always in top bar)
  const mainNavItems = [
    ["pos",       "POS",              "pos"],
    ["cfd",       "Customer Display", "cfd"],
    ["kds",       "KDS",              "kds"],
    ["timeclock", "Timeclock",        null],
    ["orders",    "Orders",           "orders"],
    ["customers", "Customers",        "orders"],
    ["online",    "Online Orders",    "orders"],
    ["delivery",  "Dispatch",         "delivery"],
  ];
  // Settings sub-menu items
  const settingsNavItems = [
    ["settings",  "Store Settings",  "settings"],
    ["reports",   "Reports",         "reports"],
    ["menu",      "Menu Manager",    "menu"],
    ["employees", "Employees",       "employees"],
  ];

  const hiddenNav = settings.hiddenNavItems || [];
  const visibleMain = mainNavItems.filter(([id, label, perm]) => {
    if (hiddenNav.includes(id)) return false;
    if (id === "delivery") {
      if (!settings || settings.posEnableDelivery === false || settings.posEnableDelivery === undefined) return false;
      return can("driver") || (session && (session.role === "owner" || session.role === "manager"));
    }
    return perm === null || can(perm);
  });
  const visibleSettings = settingsNavItems.filter(([id, label, perm]) => perm === null || can(perm));

  const settingsViews = settingsNavItems.map(([id]) => id);
  const inSettingsArea = settingsViews.includes(view);

  const roleColors = { owner: "#e85d04", manager: "#3a86ff", employee: "#06d6a0" };

  return (
    <div style={s.root}>
      {toast && <div style={s.toast}>{toast}</div>}
      {modTarget && <ModifierModal item={modTarget} onConfirm={confirmModifiers} onCancel={() => setModTarget(null)} />}

      {/* Settings dropdown backdrop */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
      )}

      {/* Device mode — minimal header */}
      {deviceMode && session && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "#111", borderBottom: "1px solid #1a1a1a", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(settings && settings.storeLogo) ? (
              <img src={settings.storeLogo} style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 6 }} />
            ) : (settings && settings.storeName) ? null : (
              <div style={{ width: 28, height: 28, background: "#e85d04", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff" }} />
              </div>
            )}
            <div>
              {settings && settings.storeName ? <div style={{ color: "#e85d04", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>{settings.storeName}</div> : null}
              {settings && settings.storeTagline ? <div style={{ color: "#888", fontSize: 10, letterSpacing: 2 }}>{settings.storeTagline.toUpperCase()}</div> : null}
            </div>
          </div>
          {/* Essential nav buttons in device mode */}
          <div style={{ display: "flex", gap: 6, flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
            {deviceMode === "pos" && (
              <>
                <button onClick={() => setView("pos")} style={{ ...s.navBtn, ...(view === "pos" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>POS</button>
                <button onClick={() => setView("orders")} style={{ ...s.navBtn, ...(view === "orders" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>Orders</button>
                {(settings && settings.posEnableDelivery && (can("driver") || session.role === "owner" || session.role === "manager")) && <button onClick={() => setView("delivery")} style={{ ...s.navBtn, ...(view === "delivery" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>{can("orders") ? "Dispatch" : "My Deliveries"}</button>}
                <button onClick={() => setView("timeclock")} style={{ ...s.navBtn, ...(view === "timeclock" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>Timeclock</button>
              </>
            )}
            {deviceMode === "kds" && (
              <>
                <button onClick={() => setView("kds")} style={{ ...s.navBtn, ...(view === "kds" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>KDS</button>
                <button onClick={() => setView("orders")} style={{ ...s.navBtn, ...(view === "orders" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>Orders</button>
                {(settings && settings.posEnableDelivery && (can("driver") || session.role === "owner" || session.role === "manager")) && <button onClick={() => setView("delivery")} style={{ ...s.navBtn, ...(view === "delivery" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>{can("orders") ? "Dispatch" : "My Deliveries"}</button>}
                <button onClick={() => setView("timeclock")} style={{ ...s.navBtn, ...(view === "timeclock" ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38 }}>Timeclock</button>
              </>
            )}
            {/* Settings dropdown for device mode */}
            {visibleSettings.length > 0 && (
              <div style={{ position: "relative" }}>
                <button onClick={() => setSettingsOpen(o => !o)} style={{ ...s.navBtn, ...(inSettingsArea ? s.navActive : {}), fontSize: 12, padding: "8px 12px", minHeight: 38, display: "flex", alignItems: "center", gap: 4 }}>
                  Settings {settingsOpen ? "▲" : "▼"}
                </button>
                {settingsOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden", zIndex: 50, minWidth: 180, boxShadow: "0 8px 24px #000a" }}>
                    {visibleSettings.map(([id, label]) => (
                      <button key={id} onClick={() => { setView(id); setSettingsOpen(false); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", background: view === id ? "#e85d0422" : "none", border: "none", borderBottom: "1px solid #2a2a2a", color: view === id ? "#e85d04" : "#aaa", fontSize: 13, cursor: "pointer", minHeight: 48, touchAction: "manipulation" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Clock />
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#aaa", fontSize: 12, fontWeight: 700 }}>{session.name.split(" ")[0]}</div>
              <div style={{ color: "#e85d04", fontSize: 10, letterSpacing: 1 }}>{(session.role||"STAFF").toUpperCase()}</div>
            </div>
            <button onClick={handleLogout} style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, minHeight: 38, touchAction: "manipulation" }}>Lock</button>
          </div>
        </div>
      )}

      {/* Full nav — hidden in device mode */}
      <div style={{ ...s.header, display: deviceMode ? "none" : "flex" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: settings && settings.storeLogo ? "transparent" : "#e85d04", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>{settings && settings.storeLogo ? <img src={settings.storeLogo} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", opacity: 0.9 }} />}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, color: "#e85d04", letterSpacing: 1 }}>{settings ? (settings.storeName || "") : ""}</div>
            <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 3 }}>{(settings ? (settings.storeTagline || "") : "").toUpperCase()}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, justifyContent: "center", alignItems: "center" }}>
          {visibleMain.map(([id, label]) => (
            <button key={id} onClick={() => { setView(id); setSettingsOpen(false); if (id === "online") setOnlineOrderBadge(0); }} style={{ ...s.navBtn, ...(view === id ? s.navActive : {}), position: "relative" }}>
              {id === "delivery" ? (can("orders") ? "Dispatch" : "My Deliveries") : label}
              {id === "online" && onlineOrderBadge > 0 && (
                <span style={{ position: "absolute", top: -6, right: -6, background: "#c0392b", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {onlineOrderBadge}
                </span>
              )}
            </button>
          ))}
          {/* Settings dropdown trigger */}
          {visibleSettings.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSettingsOpen(o => !o)}
                style={{ ...s.navBtn, ...(inSettingsArea ? s.navActive : {}), display: "flex", alignItems: "center", gap: 5 }}
              >
                Settings {settingsOpen ? "▲" : "▼"}
              </button>
              {settingsOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden", zIndex: 50, minWidth: 160, boxShadow: "0 8px 24px #000a" }}>
                  {visibleSettings.map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => { setView(id); setSettingsOpen(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", background: view === id ? "#e85d0422" : "none", border: "none", borderBottom: "1px solid #2a2a2a", color: view === id ? "#e85d04" : "#aaa", fontSize: 13, cursor: "pointer" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Session chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock />
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{session.name.split(" ")[0]}</div>
            <div style={{ color: roleColors[session.role], fontSize: 10, letterSpacing: 1 }}>{session.role.toUpperCase()}</div>
          </div>
          <button onClick={handleLogout} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>
            Lock
          </button>
        </div>
      </div>

      <div style={s.main}>
        {view === "pos" && can("pos") && (
          <>
            <div style={s.menuPanel}>
              <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
                {[settings.posEnableDineIn !== false && "Dine In", settings.posEnableTakeOut !== false && "Take Out", settings.posEnableDelivery !== false && "Delivery"].filter(Boolean).map(t => (
                  <button key={t} onClick={() => setOrderType(t)} style={{ ...s.typeBtn, ...(orderType === t ? s.typeActive : {}) }}>{t}</button>
                ))}
              </div>
              <CustomerPanel selected={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} customers={customers} onAddCustomer={addCustomer} onUpdateCustomer={updateCustomer} orderType={orderType} />
              <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid #1a1a1a" }}>
                {Object.keys(menu).map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)} style={{ ...s.catBtn, ...(activeCat === cat ? s.catActive : {}) }}>{cat}</button>
                ))}
              </div>
              {stockEditItem && (
                <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
                  onClick={() => setStockEditItem(null)}>
                  <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 14, padding: 28, width: 280, textAlign: "center" }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ color: "#e85d04", fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>EDIT STOCK</div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>{stockEditItem.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 }}>
                      <button onClick={() => setStockEditItem(s => ({ ...s, stock: Math.max(0, (s.stock || 0) - 1) }))}
                        style={{ width: 60, height: 60, borderRadius: 12, background: "#111", border: "1px solid #333", color: "#fff", fontSize: 26, cursor: "pointer", touchAction: "manipulation" }}>-</button>
                      <input
                        type="number"
                        value={stockEditItem.stock == null ? "" : stockEditItem.stock}
                        onChange={e => setStockEditItem(s => ({ ...s, stock: e.target.value === "" ? null : parseInt(e.target.value) || 0 }))}
                        style={{ width: 80, background: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 28, fontWeight: 700, textAlign: "center", padding: "8px 0", outline: "none" }}
                      />
                      <button onClick={() => setStockEditItem(s => ({ ...s, stock: (s.stock || 0) + 1 }))}
                        style={{ width: 60, height: 60, borderRadius: 12, background: "#111", border: "1px solid #333", color: "#fff", fontSize: 26, cursor: "pointer", touchAction: "manipulation" }}>+</button>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <button onClick={() => setStockEditItem(s => ({ ...s, stock: null }))}
                        style={{ flex: 1, padding: "9px 0", background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>
                        Unlimited
                      </button>
                      <button onClick={() => setStockEditItem(s => ({ ...s, stock: 0 }))}
                        style={{ flex: 1, padding: "9px 0", background: "none", border: "1px solid #c0392b44", color: "#c0392b", borderRadius: 7, cursor: "pointer", fontSize: 12 }}>
                        Sold Out
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setMenu(prev => ({
                          ...prev,
                          [stockEditItem.cat]: prev[stockEditItem.cat].map(i =>
                            i.id === stockEditItem.id ? { ...i, stock: stockEditItem.stock } : i
                          )
                        }));
                        setStockEditItem(null);
                      }}
                      style={{ width: "100%", padding: "12px 0", background: "#e85d04", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
              <div style={s.menuGrid}>
                {(menu[activeCat] || []).map(item => {
                  let pressTimer = null;
                  const onPressStart = () => {
                    if (!can("stock")) return;
                    pressTimer = setTimeout(() => {
                      setStockEditItem({ id: item.id, name: item.name, stock: item.stock, cat: activeCat });
                    }, 500);
                  };
                  const onPressEnd = () => { if (pressTimer) clearTimeout(pressTimer); };
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.stock !== 0 && addItem(item)}
                      onMouseDown={onPressStart}
                      onMouseUp={onPressEnd}
                      onMouseLeave={onPressEnd}
                      onTouchStart={onPressStart}
                      onTouchEnd={onPressEnd}
                      style={{ ...s.menuItem, opacity: item.stock === 0 ? 0.4 : 1, cursor: item.stock === 0 ? "default" : "pointer" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ color: item.stock === 0 ? "#555" : "#ddd", fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                        {item.stock === 0 && <span style={{ color: "#c0392b", fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>SOLD OUT</span>}
                      </div>
                      <div style={{ color: item.stock === 0 ? "#444" : "#e85d04", fontSize: 18, fontWeight: 700 }}>{fmt(item.base)}</div>
                      {item.modifierGroups && item.modifierGroups.length > 0 && (
                        <div style={{ color: "#888", fontSize: 10, marginTop: 3 }}>
                          
                        </div>
                      )}
                      {item.stock != null && item.stock > 0 && (
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ flex: 1, height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: Math.min(100, (item.stock / Math.max(item.stock, 10)) * 100) + "%", background: item.stock <= 3 ? "#c0392b" : item.stock <= 6 ? "#f77f00" : "#06d6a0", borderRadius: 2 }} />
                          </div>
                          <span style={{ color: item.stock <= 3 ? "#c0392b" : item.stock <= 6 ? "#f77f00" : "#555", fontSize: 10, fontWeight: 700, minWidth: 28, textAlign: "right" }}>
                            {item.stock} left
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <Ticket items={items} orderType={orderType} orderNum={orderNum} onRemove={removeItem} onPlace={placeOrder} onClear={() => setItems([])} settings={settings} payment={payment} setPayment={setPayment} scheduledTime={scheduledTime} setScheduledTime={setScheduledTime} discount={discount} setDiscount={setDiscount} requirePermission={requirePermission} />
          </>
        )}
        {view === "cfd"        && (deviceMode === "cfd" ? <CFDDevice settings={settings} /> : <CFD items={items} orderNum={orderNum} settings={settings} payment={payment} />)}
        {view === "online"     && <OnlineOrderPage menu={menu} settings={settings} orders={orders} customers={customers} onOrderPlaced={handleOnlineOrder} />}
        {view === "delivery" && can("orders") && <DispatchBoard orders={orders} employees={employees} shifts={shifts} onAssign={assignDriver} onUpdateDeliveryStatus={updateDeliveryStatus} settings={settings} />}
        {view === "delivery" && !can("orders") && can("driver") && <DriverView session={session} orders={orders} onUpdateDeliveryStatus={updateDeliveryStatus} />}
        {view === "kds"        && can("kds") && <KDS requirePermission={requirePermission} orders={orders} onBump={bumpOrder} onStartNow={(num) => { setOrders(prev => prev.map(o => o.num === num ? {...o, scheduledTime: null, slotLabel: null, slotKey: null} : o)); fetch(`/api/orders/${num}/status`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({status:"In Kitchen", clearScheduled: true})}).catch(console.error); }} setView={setView} session={session} can={can} onlineOrderBadge={onlineOrderBadge} setOnlineOrderBadge={setOnlineOrderBadge} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} visibleMain={visibleMain} visibleSettings={visibleSettings} inSettingsArea={inSettingsArea} menu={menu} customers={customers} addCustomer={addCustomer} updateCustomer={updateCustomer} settings={settings} nextOrderNum={nextOrderNum} calcItemTotal={calcItemTotal} upsertCustomer={upsertCustomer} addOrder={o => setOrders(prev => [...prev, o])} decrementStock={decrementStock} />}
        {view === "timeclock"  && <TimeclockView session={session} employees={employees} shifts={shifts} onClockIn={clockIn} onClockOut={clockOut} canManage={can("employees")} />}
        {view === "orders"     && can("orders") && <OrdersView orders={orders} onUpdateStatus={updateDeliveryStatus} />}
        {view === "customers"   && can("orders") && <CustomerDatabase customers={customers} orders={orders} onDelete={custToDelete => { DB.deleteCustomer(custToDelete.id).catch(console.error); setCustomers(prev => prev.filter(x => x.id !== custToDelete.id && x.phone !== custToDelete.phone)); }} />}
        {view === "reports"    && can("reports") && <ReportsView orders={orders} shifts={shifts} employees={employees} settings={settings} />}
        {view === "menu"       && can("menu") && <MenuManager menu={menu} setMenu={(updater) => { setMenu(prev => { const next = typeof updater === "function" ? updater(prev) : updater; if (menuLoaded.current && Object.values(next).some(items => items.length > 0)) DB.saveMenu(next).catch(console.error); return next; }); }} />}
        {view === "employees"  && can("employees") && <EmployeeManager employees={employees} setEmployees={(fn) => { setEmployees(fn); }} saveEmployee={DB.saveEmployee} deleteEmployee={DB.deleteEmployee} session={session} />}
        {view === "settings"   && can("settings") && <SettingsView settings={settings} setSettings={setSettings} />}
        {/* Access denied fallback */}
        {!["pos","cfd","timeclock","settings","reports","menu","employees","online","delivery","orders","customers","kds"].includes(view) && !can(view) && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 36 }}>🔒</div>
            <div style={{ color: "#888", fontSize: 16 }}>Access Denied</div>
            <div style={{ color: "#777", fontSize: 13 }}>Ask a manager to grant you permission.</div>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  root: { fontFamily: "'Courier New', monospace", background: "#0d0d0d", height: "100dvh", maxHeight: "100dvh", color: "#fff", display: "flex", flexDirection: "column", touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", background: "#111", borderBottom: "2px solid #e85d04", flexWrap: "nowrap", gap: 12, flexShrink: 0, minHeight: 0 },
  // Nav buttons — tall enough for a thumb tap
  navBtn: { background: "none", border: "1px solid #2a2a2a", color: "#bbb", padding: "9px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13, minHeight: 42, touchAction: "manipulation", whiteSpace: "nowrap" },
  navActive: { background: "#e85d04", border: "1px solid #e85d04", color: "#fff" },
  main: { display: "flex", flex: 1, overflow: "hidden", minHeight: 0 },
  menuPanel: { flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #1a1a1a", overflow: "hidden", minHeight: 0 },
  // Order type tabs — full height tap targets
  typeBtn: { flex: 1, padding: "11px 0", background: "#111", border: "none", color: "#bbb", fontSize: 14, cursor: "pointer", minHeight: 44, touchAction: "manipulation", flexShrink: 0 },
  typeActive: { color: "#e85d04", borderBottom: "3px solid #e85d04", background: "#1a1a1a" },
  customerCard: { padding: "10px 12px", borderBottom: "1px solid #1a1a1a", background: "#141414", flexShrink: 0 },
  searchBox: { display: "flex", alignItems: "center", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 12px" },
  searchInput: { background: "none", border: "none", color: "#ccc", fontSize: 16, outline: "none", flex: 1 },
  // Customer results — tall enough to tap easily
  customerResult: { padding: "14px 0", cursor: "pointer", display: "flex", alignItems: "center", borderBottom: "1px solid #1a1a1a", minHeight: 52 },
  pointsBadge: { background: "#e85d0422", color: "#e85d04", padding: "4px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 },
  clearCust: { background: "none", border: "none", color: "#888", fontSize: 13, cursor: "pointer", marginTop: 6, minHeight: 36, touchAction: "manipulation" },
  // Category tabs — tall tap targets
  catBtn: { flex: 1, padding: "10px 0", background: "none", border: "none", color: "#bbb", fontSize: 12, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1, minHeight: 42, touchAction: "manipulation", flexShrink: 0 },
  catActive: { color: "#e85d04", borderBottom: "3px solid #e85d04" },
  // Menu item grid — larger cards
  menuGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, padding: 12, overflowY: "auto", WebkitOverflowScrolling: "touch", flex: 1, alignContent: "start" },
  menuItem: { background: "#141414", border: "1px solid #222", borderRadius: 12, padding: "16px 14px", cursor: "pointer", textAlign: "left", minHeight: 90, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" },
  // Ticket panel
  ticket: { width: 300, minWidth: 280, background: "#111", display: "flex", flexDirection: "column", borderLeft: "1px solid #1a1a1a", minHeight: 0, overflow: "hidden" },
  ticketHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #1a1a1a" },
  clearBtn: { background: "none", border: "1px solid #2a2a2a", color: "#888", padding: "10px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13, minHeight: 44, touchAction: "manipulation" },
  ticketItems: { flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", minHeight: 0 },
  // Ticket items — taller for easier remove button access
  ticketItem: { padding: "12px 16px", borderBottom: "1px solid #1a1a1a" },
  removeBtn: { background: "none", border: "1px solid #c0392b33", color: "#c0392b", fontSize: 11, cursor: "pointer", marginTop: 8, padding: "6px 12px", borderRadius: 5, minHeight: 36, touchAction: "manipulation" },
  totals: { borderTop: "1px solid #1a1a1a", padding: "10px 14px", flexShrink: 0 },
  totalRow: { display: "flex", justifyContent: "space-between", color: "#bbb", fontSize: 14, marginBottom: 6 },
  totalBig: { display: "flex", justifyContent: "space-between", color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2a2a" },
  // Place order — big thumb-friendly button
  placeBtn: { width: "100%", padding: "14px 0", background: "#e85d04", border: "none", color: "#fff", fontSize: 16, fontWeight: 700, borderRadius: 10, cursor: "pointer", textTransform: "uppercase", letterSpacing: 1, minHeight: 54, touchAction: "manipulation", flexShrink: 0 },
  overlay: { position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#141414", border: "1px solid #2a2a2a", borderRadius: 16, width: "min(580px, 96vw)", maxHeight: "85dvh", overflow: "auto", WebkitOverflowScrolling: "touch" },
  modalHead: { padding: "18px 20px 14px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 },
  modalTitle: { color: "#fff", fontWeight: 700, fontSize: 17 },
  // Topping grid — bigger tap targets
  toppingGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "6px 0 10px" },
  toppingBtn: { padding: "13px 10px", borderRadius: 9, fontSize: 13, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", minHeight: 48, touchAction: "manipulation" },
  toppingTag: { background: "#e85d0422", color: "#e85d04", border: "1px solid #e85d0444", borderRadius: 20, padding: "4px 10px", fontSize: 12 },
  notesInput: { width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#ccc", fontSize: 16, padding: "12px 14px", resize: "none", height: 64, boxSizing: "border-box", outline: "none", fontFamily: "inherit" },
  modalFoot: { display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid #1a1a1a" },
  cancelBtn: { flex: 1, padding: "14px 0", background: "none", border: "1px solid #2a2a2a", color: "#999", borderRadius: 9, cursor: "pointer", fontSize: 15, minHeight: 52, touchAction: "manipulation" },
  confirmBtn: { flex: 2, padding: "14px 0", background: "#e85d04", border: "none", color: "#fff", borderRadius: 9, cursor: "pointer", fontSize: 15, fontWeight: 700, minHeight: 52, touchAction: "manipulation" },
  sectionTitle: { color: "#e85d04", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 },
  orderCard: { background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px", marginBottom: 14 },
  statCard: { background: "#141414", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18, textAlign: "center" },
  toast: { position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: "#06d6a0", color: "#000", padding: "14px 24px", borderRadius: 10, fontWeight: 700, fontSize: 15, zIndex: 200, boxShadow: "0 4px 20px #0004" },
  // Management buttons — all touch-friendly
  editInput: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 7, color: "#ddd", padding: "10px 12px", fontSize: 14, outline: "none" },
  editBtn: { background: "none", border: "1px solid #333", color: "#888", padding: "10px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13, minHeight: 44, touchAction: "manipulation" },
  saveBtn: { background: "#e85d04", border: "none", color: "#fff", padding: "10px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700, minHeight: 44, touchAction: "manipulation" },
  addBtn: { background: "#1a1a1a", border: "1px solid #333", color: "#e85d04", padding: "10px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700, minHeight: 44, touchAction: "manipulation" },
  dangerBtn: { background: "none", border: "1px solid #c0392b44", color: "#c0392b", padding: "10px 14px", borderRadius: 7, cursor: "pointer", fontSize: 13, minHeight: 44, touchAction: "manipulation" },
  reorderBtn: { background: "none", border: "1px solid #2a2a2a", color: "#999", padding: "6px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12, lineHeight: 1.4, display: "block", minHeight: 32, touchAction: "manipulation" },
};
