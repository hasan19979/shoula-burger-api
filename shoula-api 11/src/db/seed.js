const bcrypt = require('bcryptjs');
const pool = require('./pool');
const menuData = require('./menu-seed-data.json');

const CATEGORIES = [
  { slug: 'chicken', name: 'سندويشات دجاج', icon: 'ti-sandwich', sort_order: 1 },
  { slug: 'burgers', name: 'برجر لحمة', icon: 'ti-tools-kitchen-2', sort_order: 2 },
  { slug: 'sides', name: 'إضافات وبطاطا', icon: 'ti-basket', sort_order: 3 },
  { slug: 'wings', name: 'أجنحة دجاج', icon: 'ti-meat', sort_order: 4 }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ---- حساب المالك الأول ----
    const adminEmail = process.env.ADMIN_EMAIL || 'owner@shoulaburger.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const existingAdmin = await client.query('SELECT id FROM admins WHERE email = $1', [adminEmail]);
    if (existingAdmin.rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 10);
      await client.query(
        'INSERT INTO admins (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
        [adminEmail, hash, 'صاحب المطعم', 'owner']
      );
      console.log(`✅ تم إنشاء حساب الدخول: ${adminEmail} (بكلمة السر اللي حطيتيها بـ ADMIN_PASSWORD أو الافتراضية — غيّريها فوراً بعد أول دخول)`);
    } else {
      console.log('ℹ️  حساب المالك موجود مسبقاً، ما ضفنا واحد جديد.');
    }

    // ---- الفئات ----
    const categoryIdBySlug = {};
    for (const cat of CATEGORIES) {
      const res = await client.query(
        `INSERT INTO categories (slug, name, icon, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon
         RETURNING id`,
        [cat.slug, cat.name, cat.icon, cat.sort_order]
      );
      categoryIdBySlug[cat.slug] = res.rows[0].id;
    }
    console.log(`✅ تم إعداد ${CATEGORIES.length} فئات.`);

    // ---- المنتجات (المنيو الحالي الحقيقي) ----
    const existingProducts = await client.query('SELECT COUNT(*) FROM products');
    if (Number(existingProducts.rows[0].count) === 0) {
      for (const item of menuData) {
        const categoryId = categoryIdBySlug[item.cat];
        if (!categoryId) continue;
        const productRes = await client.query(
          `INSERT INTO products (category_id, name, description, price, icon, start_mode)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [categoryId, item.name, item.desc || '', item.price, item.icon || 'ti-circle-dot', item.startMode || 'pick']
        );
        const productId = productRes.rows[0].id;
        if (Array.isArray(item.ingredients)) {
          for (let i = 0; i < item.ingredients.length; i++) {
            await client.query(
              'INSERT INTO product_ingredients (product_id, name, sort_order) VALUES ($1, $2, $3)',
              [productId, item.ingredients[i], i]
            );
          }
        }
      }
      console.log(`✅ تم إدخال ${menuData.length} صنف من المنيو الحالي.`);
    } else {
      console.log('ℹ️  في منتجات موجودة مسبقاً بقاعدة البيانات، ما أضفنا شي جديد (تجنباً للتكرار).');
    }

    // ---- موظفو الكاشير (PIN) ----
    const existingStaff = await client.query('SELECT id FROM staff_users LIMIT 1');
    if (existingStaff.rows.length === 0) {
      const staff = [
        { name: 'سامر (مدير عام)', role: 'admin', pin: '1111' },
        { name: 'ليلى (مديرة شفت)', role: 'manager', pin: '2222' },
        { name: 'أحمد (كاشير)', role: 'cashier', pin: '3333' },
        { name: 'رنا (كاشير)', role: 'cashier', pin: '4444' },
        { name: 'خالد (مطبخ)', role: 'kitchen', pin: '5555' },
        { name: 'مريم (نادلة)', role: 'waiter', pin: '6666' },
      ];
      for (const s of staff) {
        const hash = await bcrypt.hash(s.pin, 10);
        await client.query('INSERT INTO staff_users (name, role, pin_hash) VALUES ($1,$2,$3)', [s.name, s.role, hash]);
      }
      console.log('✅ تم إنشاء 6 حسابات موظفين تجريبية (أرقام PIN: 1111 لـ6666) — غيّريهم قبل الاستخدام الحقيقي.');
    } else {
      console.log('ℹ️  في موظفين موجودين مسبقاً، ما ضفنا شي جديد.');
    }

    // ---- مجموعات التعديلات (Modifiers) ----
    const existingModGroups = await client.query('SELECT id FROM modifier_groups LIMIT 1');
    if (existingModGroups.rows.length === 0) {
      const groups = [
        { name: 'المكونات الأساسية', selection_type: 'multiple', required: false, min: 0, max: 5,
          options: [
            { name: 'خس', price: 0, default_included: true },
            { name: 'بندورة', price: 0, default_included: true },
            { name: 'بصل', price: 0, default_included: true },
            { name: 'صوص خاص', price: 0, default_included: true },
            { name: 'جبنة', price: 0, default_included: true },
          ] },
        { name: 'الإضافات', selection_type: 'multiple', required: false, min: 0, max: 6,
          options: [
            { name: 'بيكون', price: 4 }, { name: 'مشروم', price: 3 }, { name: 'هالبينو', price: 2 },
            { name: 'بيض', price: 2 }, { name: 'جبنة إضافية', price: 5 }, { name: 'صوص إضافي', price: 2 },
          ] },
      ];
      for (const g of groups) {
        const gRes = await client.query(
          'INSERT INTO modifier_groups (name, selection_type, required, min_select, max_select) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [g.name, g.selection_type, g.required, g.min, g.max]
        );
        for (let i = 0; i < g.options.length; i++) {
          const o = g.options[i];
          await client.query(
            'INSERT INTO modifier_options (group_id, name, price, default_included, sort_order) VALUES ($1,$2,$3,$4,$5)',
            [gRes.rows[0].id, o.name, o.price, !!o.default_included, i]
          );
        }
      }
      console.log('✅ تم إنشاء مجموعات التعديلات الأساسية (مكونات + إضافات).');
    } else {
      console.log('ℹ️  في مجموعات تعديلات موجودة مسبقاً، ما ضفنا شي جديد.');
    }

    // ---- المخزون ----
    const existingInventory = await client.query('SELECT id FROM inventory_items LIMIT 1');
    if (existingInventory.rows.length === 0) {
      const items = [
        { name: 'خبز برجر', unit: 'piece', quantity: 120, min: 30, cost: 1.2 },
        { name: 'لحم برجر', unit: 'g', quantity: 15000, min: 3000, cost: 0.045 },
        { name: 'صدر دجاج', unit: 'g', quantity: 8000, min: 2000, cost: 0.035 },
        { name: 'جبنة شرائح', unit: 'piece', quantity: 200, min: 50, cost: 0.8 },
        { name: 'خس', unit: 'g', quantity: 3000, min: 500, cost: 0.01 },
        { name: 'بندورة', unit: 'g', quantity: 4000, min: 800, cost: 0.008 },
        { name: 'بصل', unit: 'g', quantity: 2500, min: 500, cost: 0.006 },
        { name: 'صوص خاص', unit: 'ml', quantity: 5000, min: 1000, cost: 0.015 },
        { name: 'بطاطا مجمدة', unit: 'g', quantity: 20000, min: 4000, cost: 0.007 },
        { name: 'ناجتس دجاج', unit: 'piece', quantity: 400, min: 80, cost: 0.9 },
        { name: 'علبة كولا', unit: 'piece', quantity: 150, min: 40, cost: 3 },
      ];
      for (const it of items) {
        await client.query(
          'INSERT INTO inventory_items (name, unit, quantity, min_threshold, cost_per_unit) VALUES ($1,$2,$3,$4,$5)',
          [it.name, it.unit, it.quantity, it.min, it.cost]
        );
      }
      console.log(`✅ تم إدخال ${items.length} مادة خام للمخزون.`);
    } else {
      console.log('ℹ️  في مواد مخزون موجودة مسبقاً، ما ضفنا شي جديد.');
    }

    // ---- الطاولات ----
    const existingTables = await client.query('SELECT id FROM restaurant_tables LIMIT 1');
    if (existingTables.rows.length === 0) {
      const seatsPattern = [2, 2, 4, 4, 4, 6, 2, 4, 4, 6, 2, 8];
      for (let i = 0; i < 12; i++) {
        await client.query('INSERT INTO restaurant_tables (number, seats) VALUES ($1,$2)', [String(i + 1), seatsPattern[i]]);
      }
      console.log('✅ تم إنشاء 12 طاولة افتراضية.');
    } else {
      console.log('ℹ️  في طاولات موجودة مسبقاً، ما ضفنا شي جديد.');
    }

    await client.query('COMMIT');
    console.log('🎉 خلصت التهيئة الأولية بنجاح.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ صار خطأ أثناء التهيئة:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
