-- ============================================================
-- Pizza Time POS — Local PostgreSQL Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  pin         TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'employee',
  pay_rate    NUMERIC(8,2) NOT NULL DEFAULT 0,
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL,
  address     TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  points      INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_idx 
  ON customers (REGEXP_REPLACE(phone, '[^0-9]', '', 'g'));

CREATE TABLE IF NOT EXISTS menu_categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id               SERIAL PRIMARY KEY,
  category_id      INTEGER REFERENCES menu_categories(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  base_price       NUMERIC(8,2) NOT NULL DEFAULT 0,
  stock            INTEGER,
  available_online BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id           SERIAL PRIMARY KEY,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  min_select   INTEGER NOT NULL DEFAULT 0,
  max_select   INTEGER NOT NULL DEFAULT 99,
  allow_sides  BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modifiers (
  id                SERIAL PRIMARY KEY,
  modifier_group_id INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  price             NUMERIC(8,2) NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  order_num         INTEGER NOT NULL UNIQUE,
  type              TEXT NOT NULL DEFAULT 'Dine In',
  source            TEXT NOT NULL DEFAULT 'pos',
  status            TEXT NOT NULL DEFAULT 'In Kitchen',
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_snapshot JSONB,
  subtotal          NUMERIC(8,2) NOT NULL DEFAULT 0,
  tax               NUMERIC(8,2) NOT NULL DEFAULT 0,
  total             NUMERIC(8,2) NOT NULL DEFAULT 0,
  slot_key          TEXT,
  slot_label        TEXT,
  split_slots       JSONB,
  pizza_count       INTEGER DEFAULT 0,
  driver_id         INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  placed_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  base_price   NUMERIC(8,2) NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 1,
  selections   JSONB DEFAULT '{}',
  notes        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shifts (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  clock_in    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  tax_rate            NUMERIC(6,4) NOT NULL DEFAULT 0.06,
  card_surcharge      NUMERIC(6,4) NOT NULL DEFAULT 0.04,
  online_ordering     BOOLEAN NOT NULL DEFAULT true,
  online_pickup       BOOLEAN NOT NULL DEFAULT true,
  online_delivery     BOOLEAN NOT NULL DEFAULT true,
  online_asap         BOOLEAN NOT NULL DEFAULT true,
  online_prep_time    INTEGER NOT NULL DEFAULT 30,
  online_max_pizzas   INTEGER NOT NULL DEFAULT 4,
  online_cutoff_mins  INTEGER NOT NULL DEFAULT 30,
  online_hours        JSONB DEFAULT '{}',
  online_blackouts    JSONB DEFAULT '[]',
  delivery_reimb_rate NUMERIC(6,2) NOT NULL DEFAULT 0.67,
  delivery_min_order  NUMERIC(8,2) NOT NULL DEFAULT 15.00,
  store_name          TEXT DEFAULT 'Pizza Time',
  store_tagline       TEXT DEFAULT 'Point of Sale',
  store_logo          TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS orders_placed_at_idx    ON orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx       ON orders(status);
CREATE INDEX IF NOT EXISTS order_items_order_idx   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS shifts_employee_idx     ON shifts(employee_id);
CREATE INDEX IF NOT EXISTS shifts_clock_in_idx     ON shifts(clock_in DESC);
CREATE INDEX IF NOT EXISTS menu_items_category_idx ON menu_items(category_id);
