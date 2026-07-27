-- ============================================================
-- شعلة برجر — مخطط قاعدة البيانات (PostgreSQL)
-- شغّلي هاد الملف مرة وحدة بس على قاعدة البيانات (شرح الخطوات بالـ README)
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',      -- owner | staff
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  restaurant_name TEXT NOT NULL DEFAULT 'شعلة برجر',
  tagline TEXT NOT NULL DEFAULT '',
  logo_letter TEXT NOT NULL DEFAULT 'ش',
  logo_image TEXT NOT NULL DEFAULT '',
  hours_text TEXT NOT NULL DEFAULT '',
  open_time TEXT NOT NULL DEFAULT '13:00', -- HH:MM 24h
  close_time TEXT NOT NULL DEFAULT '00:00',
  whatsapp_number TEXT NOT NULL DEFAULT '',
  maps_url TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT '₪',
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'ti-circle-dot',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  icon TEXT NOT NULL DEFAULT 'ti-circle-dot',
  image_url TEXT NOT NULL DEFAULT '',
  start_mode TEXT NOT NULL DEFAULT 'pick', -- pick | remove (تخصيص المكونات)
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  stock_quantity INT,                       -- NULL = غير محدود
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_ingredients (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value >= 0),
  min_order NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses INT,                                   -- NULL = بلا حد
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL DEFAULT 'dine-in', -- dine-in | delivery | takeaway
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | preparing | ready | delivered | cancelled
  notes TEXT NOT NULL DEFAULT '',
  coupon_code TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,     -- ننسخ الاسم وقت الطلب حتى يضل صحيح حتى لو تغيّر المنتج بعدين
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  included_ingredients JSONB NOT NULL DEFAULT '[]',
  line_total NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
