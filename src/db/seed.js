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
