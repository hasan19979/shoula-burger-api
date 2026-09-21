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
  tagline_image TEXT NOT NULL DEFAULT '',
  receipt_item_font_size INT NOT NULL DEFAULT 14,
  receipt_col_qty_width INT NOT NULL DEFAULT 7,
  receipt_col_price_width INT NOT NULL DEFAULT 9,
  receipt_col_total_width INT NOT NULL DEFAULT 10,
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
  print_order INT NOT NULL DEFAULT 999, -- ترتيب الطباعة على الفاتورة — منفصل تماماً عن ترتيب عرض المنيو (sort_order)
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
  sort_order INT NOT NULL DEFAULT 0,
  default_included BOOLEAN NOT NULL DEFAULT true -- true = مكوّن أساسي (يبلش مفعّل، الزبون يقدر يشيله) | false = إضافة اختيارية (تبلش مطفية، الزبون يقدر يضيفها)
);

-- خيارات نوع/حجم الصنف (زي عادي/دبل/تربل) بسعر مختلف لكل خيار — منفصل تماماً عن نظام المكونات
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0, -- فرق السعر عن السعر الأساسي للصنف (٠ للخيار الافتراضي عادةً)
  is_default BOOLEAN NOT NULL DEFAULT false,
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
  loyalty_points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL DEFAULT 'dine-in', -- dine-in | delivery | takeaway | pos
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | preparing | ready | delivered | cancelled
  payment_method TEXT NOT NULL DEFAULT 'cash', -- cash | card (يستخدم بشكل أساسي لطلبات الكاشير)
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

CREATE TABLE IF NOT EXISTS banners (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_shifts (
  id SERIAL PRIMARY KEY,
  opened_by INT REFERENCES admins(id) ON DELETE SET NULL,
  opened_by_name TEXT NOT NULL DEFAULT '',
  opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_cash_expected NUMERIC(10,2),
  closing_cash_actual NUMERIC(10,2),
  difference NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'open', -- open | closed
  notes TEXT NOT NULL DEFAULT '',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- تحديث آمن للجداول الموجودة مسبقاً (ما بأثر على البيانات الحالية، بس بيضيف العمود الجديد لو ناقص)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

-- ============================================================
-- إضافات نظام الكاشير (POS) — الموظفين، Modifiers، المخزون، الطاولات
-- ============================================================

-- الموظفين وأدوارهم (تسجيل دخول بـ PIN، منفصل عن حسابات admins القديمة اللي بتستخدم إيميل/كلمة سر)
CREATE TABLE IF NOT EXISTS staff_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- admin | manager | cashier | kitchen | waiter
  pin_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  hourly_rate NUMERIC(10,2), -- أجر الساعة (اختياري) — يستخدم لحساب الأجر التقريبي من ساعات الحضور
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- حضور وانصراف
CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  staff_id INT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ, -- فاضي = لسا بالدوام
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_staff ON time_entries(staff_id);

-- مجموعات التعديلات (Modifiers)
CREATE TABLE IF NOT EXISTS modifier_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'multiple', -- single | multiple
  required BOOLEAN NOT NULL DEFAULT false,
  min_select INT NOT NULL DEFAULT 0,
  max_select INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_included BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0
);

-- ربط منتج بمجموعة تعديلات (منتج ممكن يرتبط بأكتر من مجموعة، ومجموعة ممكن تتربط بأكتر من منتج)
CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  modifier_group_id INT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, modifier_group_id)
);

-- المخزون (مواد خام)
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece', -- g | kg | ml | l | piece
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_threshold NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(10,4)
);

-- الوصفة: كمية من مادة خام تُستهلك عند بيع وحدة واحدة من منتج معيّن
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(10,3) NOT NULL,
  PRIMARY KEY (product_id, inventory_item_id)
);

-- الموردين
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  inventory_item_id INT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL, -- فاضي إذا الحركة مش شراء (هدر، تعديل، خصم بيع)
  type TEXT NOT NULL, -- purchase | sale-deduction | waste | adjustment
  quantity NUMERIC(12,2) NOT NULL, -- موجب = زيادة، سالب = نقصان
  unit_cost NUMERIC(10,4), -- تكلفة الوحدة وقت الشراء (اختياري، لتتبع تغيّر الأسعار عبر الزمن)
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الطاولات
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  seats INT NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available', -- available | occupied | reserved | needs-cleaning
  party_size INT,
  opened_at TIMESTAMPTZ,
  cashier_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true
);

-- توسيع جدول المنتجات ليدعم حقول الكاشير (تكلفة، SKU، باركود)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- توسيع جدول الطلبات: حالة تحضير بالمطبخ، مصدر الطلب، رقم طاولة
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_status TEXT NOT NULL DEFAULT 'served'; -- new | preparing | ready | served
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'online'; -- online | pos
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashier_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product ON recipe_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id);

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INT NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,4);

-- ترتيب الطباعة بالفاتورة (منفصل عن ترتيب عرض المنيو) — أي تصنيف بدون قيمة محددة بيضل 999 (آخر شي تلقائياً)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS print_order INT NOT NULL DEFAULT 999;
UPDATE categories SET print_order = 10 WHERE name = 'برجر لحمة';
UPDATE categories SET print_order = 20 WHERE name = 'سندويشات دجاج';
UPDATE categories SET print_order = 30 WHERE name = 'أجنحة دجاج';
UPDATE categories SET print_order = 40 WHERE name = 'إضافات وبطاطا';

-- تحديث لاحق: الدجاج يطبع أول بالفاتورة
UPDATE categories SET print_order = 10 WHERE name = 'سندويشات دجاج';
UPDATE categories SET print_order = 20 WHERE name = 'أجنحة دجاج';
UPDATE categories SET print_order = 30 WHERE name = 'برجر لحمة';

-- صورة زخرفية للشعار/الجملة التسويقية (خط يدوي جاهز كصورة) — تُستخدم بالفاتورة بدل النص العادي
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tagline_image TEXT NOT NULL DEFAULT '';

-- تحديث اسم المطعم
UPDATE settings SET restaurant_name = 'سوبر برجر' WHERE id = 1;

-- إعدادات قابلة للتعديل بشاشة الإعدادات: حجم خط اسم الصنف بالفاتورة، وعرض أعمدة الكمية/السعر/المجموع (بالمليمتر)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_item_font_size INT NOT NULL DEFAULT 14;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_col_qty_width INT NOT NULL DEFAULT 7;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_col_price_width INT NOT NULL DEFAULT 9;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_col_total_width INT NOT NULL DEFAULT 10;

-- إعدادات نقاط الولاء — قابلة للتعديل بشاشة الإعدادات بدل ما تكون ثابتة بالكود
ALTER TABLE settings ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS loyalty_earn_amount NUMERIC(10,2) NOT NULL DEFAULT 10; -- المبلغ اللازم لكسب نقطة وحدة
ALTER TABLE settings ADD COLUMN IF NOT EXISTS loyalty_redeem_value NUMERIC(10,2) NOT NULL DEFAULT 0.5; -- قيمة النقطة الواحدة عند الاستبدال

-- تفعيل/تعطيل طاولة من إعدادات النظام
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

-- مكوّن أساسي (يبلش مفعّل) مقابل إضافة اختيارية (تبلش مطفية) — المكونات القديمة الموجودة تضل "أساسية" بشكل افتراضي، ما بتغيّر سلوكها الحالي
ALTER TABLE product_ingredients ADD COLUMN IF NOT EXISTS default_included BOOLEAN NOT NULL DEFAULT true;

-- سجل السحوبات النقدية من الصندوق
CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  staff_name TEXT,
  recipient_type TEXT, -- 'supplier' | 'staff' | null (سحبة عامة بدون مستلم محدد)
  recipient_id INT,
  recipient_name TEXT, -- نسخة من اسم المستلم وقت السحبة، حتى يضل السجل واضح حتى لو انحذف المورد/الموظف لاحقاً
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- جرد الصندوق — سجل مطابقة يومي بين المتوقع بالصندوق والفعلي. الحقول غير الرصيد الافتتاحي
-- تصير معروفة بس وقت إكمال الجرد الكامل — ممكن نسجّل الرصيد الافتتاحي لحاله الصبح قبل ما نعمل الجرد
CREATE TABLE IF NOT EXISTS cash_register_audits (
  id SERIAL PRIMARY KEY,
  audit_date DATE NOT NULL UNIQUE,
  opening_balance NUMERIC(10,2) NOT NULL,
  orders_total NUMERIC(10,2),
  withdrawals_total NUMERIC(10,2),
  expected_amount NUMERIC(10,2),
  actual_amount NUMERIC(10,2),
  difference NUMERIC(10,2),
  staff_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- سحوبات مرتبطة بمورد أو موظف محدد
ALTER TABLE cash_withdrawals ADD COLUMN IF NOT EXISTS recipient_type TEXT;
ALTER TABLE cash_withdrawals ADD COLUMN IF NOT EXISTS recipient_id INT;
ALTER TABLE cash_withdrawals ADD COLUMN IF NOT EXISTS recipient_name TEXT;

-- السماح بحفظ الرصيد الافتتاحي لحاله (بدون باقي حقول الجرد) لقواعد البيانات الموجودة أصلاً
ALTER TABLE cash_register_audits ALTER COLUMN orders_total DROP NOT NULL;
ALTER TABLE cash_register_audits ALTER COLUMN withdrawals_total DROP NOT NULL;
ALTER TABLE cash_register_audits ALTER COLUMN expected_amount DROP NOT NULL;
ALTER TABLE cash_register_audits ALTER COLUMN actual_amount DROP NOT NULL;
ALTER TABLE cash_register_audits ALTER COLUMN difference DROP NOT NULL;
