-- ============================================================
-- Rocco's Slice House POS — Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable realtime for key tables
-- (done after table creation below)

-- ── EMPLOYEES ────────────────────────────────────────────────
create table if not exists employees (
  id          bigint primary key generated always as identity,
  name        text not null,
  pin         text not null unique,
  role        text not null default 'employee',
  pay_rate    numeric(8,2) not null default 0,
  phone       text default '',
  email       text default '',
  active      boolean not null default true,
  permissions jsonb not null default '{}',
  created_at  timestamptz default now()
);

-- ── CUSTOMERS ────────────────────────────────────────────────
create table if not exists customers (
  id          bigint primary key generated always as identity,
  name        text not null default '',
  phone       text not null,
  address     text default '',
  notes       text default '',
  points      integer not null default 0,
  order_count integer not null default 0,
  created_at  timestamptz default now()
);
create unique index if not exists customers_phone_idx on customers (replace(phone, '-', ''));

-- ── MENU CATEGORIES ──────────────────────────────────────────
create table if not exists menu_categories (
  id         bigint primary key generated always as identity,
  name       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

-- ── MENU ITEMS ───────────────────────────────────────────────
create table if not exists menu_items (
  id               bigint primary key generated always as identity,
  category_id      bigint references menu_categories(id) on delete cascade,
  name             text not null,
  base_price       numeric(8,2) not null default 0,
  stock            integer,          -- null = unlimited
  available_online boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz default now()
);

-- ── MODIFIER GROUPS ──────────────────────────────────────────
create table if not exists modifier_groups (
  id           bigint primary key generated always as identity,
  menu_item_id bigint references menu_items(id) on delete cascade,
  name         text not null,
  min_select   integer not null default 0,
  max_select   integer not null default 99,
  allow_sides  boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz default now()
);

-- ── MODIFIERS ────────────────────────────────────────────────
create table if not exists modifiers (
  id                bigint primary key generated always as identity,
  modifier_group_id bigint references modifier_groups(id) on delete cascade,
  name              text not null,
  price             numeric(8,2) not null default 0,
  sort_order        integer not null default 0,
  created_at        timestamptz default now()
);

-- ── ORDERS ───────────────────────────────────────────────────
create table if not exists orders (
  id          bigint primary key generated always as identity,
  order_num   integer not null unique,
  type        text not null default 'Dine In',  -- Dine In | Take Out | Delivery
  source      text not null default 'pos',       -- pos | online
  status      text not null default 'In Kitchen',
  customer_id bigint references customers(id),
  customer_snapshot jsonb,   -- name/address at time of order
  subtotal    numeric(8,2) not null default 0,
  tax         numeric(8,2) not null default 0,
  total       numeric(8,2) not null default 0,
  slot_key    text,          -- throttle slot key e.g. "11:0"
  slot_label  text,          -- display e.g. "11:00 AM"
  split_slots jsonb,         -- array of {key, label, count}
  pizza_count integer default 0,
  driver_id   bigint references employees(id),
  placed_at   timestamptz default now(),
  created_at  timestamptz default now()
);

-- ── ORDER ITEMS ──────────────────────────────────────────────
create table if not exists order_items (
  id           bigint primary key generated always as identity,
  order_id     bigint references orders(id) on delete cascade,
  menu_item_id bigint references menu_items(id),
  name         text not null,   -- snapshot at time of order
  base_price   numeric(8,2) not null,
  qty          integer not null default 1,
  selections   jsonb default '{}',  -- {groupId: [{modifierId, name, price, side}]}
  notes        text default '',
  created_at   timestamptz default now()
);

-- ── SHIFTS (TIMECLOCK) ───────────────────────────────────────
create table if not exists shifts (
  id          bigint primary key generated always as identity,
  employee_id bigint references employees(id),
  clock_in    timestamptz not null default now(),
  clock_out   timestamptz,
  created_at  timestamptz default now()
);

-- ── SETTINGS (single row) ────────────────────────────────────
create table if not exists settings (
  id              integer primary key default 1 check (id = 1),  -- enforces single row
  tax_rate        numeric(6,4) not null default 0.06,
  card_surcharge  numeric(6,4) not null default 0.04,
  online_ordering boolean not null default true,
  online_pickup   boolean not null default true,
  online_delivery boolean not null default true,
  online_asap     boolean not null default true,
  online_prep_time    integer not null default 30,
  online_max_pizzas   integer not null default 4,
  online_cutoff_mins  integer not null default 30,
  online_hours        jsonb default '{}',
  online_blackouts    jsonb default '[]',
  delivery_reimb_rate numeric(6,2) not null default 0.67,
  delivery_min_order  numeric(8,2) not null default 15.00,
  updated_at      timestamptz default now()
);

-- Insert default settings row
insert into settings (id) values (1) on conflict (id) do nothing;

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- For now, allow all operations with anon key.
-- Tighten this down when adding auth.
alter table employees       enable row level security;
alter table customers       enable row level security;
alter table menu_categories enable row level security;
alter table menu_items      enable row level security;
alter table modifier_groups enable row level security;
alter table modifiers       enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table shifts          enable row level security;
alter table settings        enable row level security;

-- Permissive policies (anon key can do everything — tighten later)
do $$
declare
  t text;
begin
  foreach t in array array[
    'employees','customers','menu_categories','menu_items',
    'modifier_groups','modifiers','orders','order_items','shifts','settings'
  ] loop
    execute format('create policy "anon_all" on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ── REALTIME ─────────────────────────────────────────────────
-- Enable realtime for tables that need live sync across devices
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table menu_items;
alter publication supabase_realtime add table settings;
alter publication supabase_realtime add table shifts;

-- ── INDEXES ──────────────────────────────────────────────────
create index if not exists orders_placed_at_idx    on orders(placed_at desc);
create index if not exists orders_status_idx       on orders(status);
create index if not exists order_items_order_idx   on order_items(order_id);
create index if not exists shifts_employee_idx     on shifts(employee_id);
create index if not exists shifts_clock_in_idx     on shifts(clock_in desc);
create index if not exists menu_items_category_idx on menu_items(category_id);
create index if not exists modifiers_group_idx     on modifiers(modifier_group_id);

