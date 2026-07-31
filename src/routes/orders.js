const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'];
const VALID_TYPES = ['dine-in', 'delivery', 'takeaway'];

function generateOrderNo() {
  return 'A' + Math.floor(1000 + Math.random() * 9000);
}

// POST /api/orders — عام (الموقع نفسه بيبعت هون). بنحسب الأسعار من قاعدة البيانات، مش من اللي بعته المتصفح،
// عشان حدا ما يقدر يلعب بالسعر من أدوات المطوّر بالمتصفح ويطلب بسعر مزوّر.
router.post('/', asyncHandler(async (req, res) => {
  const { items, customerName, customerPhone, address, orderType, notes, couponCode } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'السلة فاضية' });
  }
  if (!customerName || !customerPhone) {
    return res.status(400).json({ error: 'الاسم ورقم الجوال مطلوبين' });
  }
  if (orderType && !VALID_TYPES.includes(orderType)) {
    return res.status(400).json({ error: 'نوع طلب غير معروف' });
  }
  if (orderType === 'delivery' && !address) {
    return res.status(400).json({ error: 'عنوان التوصيل مطلوب' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ---- جيبي الأسعار الحقيقية من قاعدة البيانات لكل صنف بالسلة ----
    const productIds = items.map(i => i.productId);
    const { rows: dbProducts } = await client.query(
      'SELECT id, name, price, in_stock FROM products WHERE id = ANY($1)',
      [productIds]
    );
    const productById = Object.fromEntries(dbProducts.map(p => [p.id, p]));

    let subtotal = 0;
    const preparedItems = [];
    for (const item of items) {
      const product = productById[item.productId];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `صنف غير موجود (id: ${item.productId})` });
      }
      if (!product.in_stock) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `الصنف "${product.name}" نفذت كميته حالياً` });
      }
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const lineTotal = Number(product.price) * qty;
      subtotal += lineTotal;
      preparedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: product.price,
        included_ingredients: JSON.stringify(item.includedIngredients || []),
        line_total: lineTotal
      });
    }

    // ---- كوبون الخصم (اختياري) ----
    let discount = 0;
    let appliedCouponCode = null;
    if (couponCode) {
      const { rows: couponRows } = await client.query(
        `SELECT * FROM coupons WHERE code = $1 AND active = true
         AND (expires_at IS NULL OR expires_at > now())
         AND (max_uses IS NULL OR used_count < max_uses)`,
        [couponCode.trim().toUpperCase()]
      );
      const coupon = couponRows[0];
      if (!coupon) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'كود الخصم غير صالح أو منتهي' });
      }
      if (subtotal < Number(coupon.min_order)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `هاد الكود يحتاج طلب بقيمة ${coupon.min_order} على الأقل` });
      }
      discount = coupon.discount_type === 'percent'
        ? subtotal * (Number(coupon.discount_value) / 100)
        : Number(coupon.discount_value);
      discount = Math.min(discount, subtotal);
      appliedCouponCode = coupon.code;
      await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
    }

    // ---- رسوم التوصيل من الإعدادات ----
    const { rows: settingsRows } = await client.query('SELECT delivery_fee, min_order FROM settings WHERE id = 1');
    const deliveryFee = (orderType === 'delivery') ? Number(settingsRows[0]?.delivery_fee || 0) : 0;
    const minOrder = Number(settingsRows[0]?.min_order || 0);

    if (subtotal < minOrder) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `الحد الأدنى للطلب ${minOrder}، سلتك الحالية ${subtotal}` });
    }

    const total = subtotal - discount + deliveryFee;

    // ---- عميل: أضيفي أو حدّثي بيانات العميل حسب رقم الجوال ----
    const customerRes = await client.query(
      `INSERT INTO customers (name, phone, address) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, address = COALESCE(NULLIF(EXCLUDED.address, ''), customers.address)
       RETURNING id`,
      [customerName, customerPhone, address || '']
    );
    const customerId = customerRes.rows[0].id;

    // ---- الطلب نفسه ----
    let orderNo = generateOrderNo();
    let order;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const orderRes = await client.query(
          `INSERT INTO orders
            (order_no, customer_id, customer_name, customer_phone, address, order_type, notes, coupon_code, subtotal, discount, delivery_fee, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [orderNo, customerId, customerName, customerPhone, address || '', orderType || 'dine-in', notes || '', appliedCouponCode, subtotal, discount, deliveryFee, total]
        );
        order = orderRes.rows[0];
        break;
      } catch (err) {
        if (err.code === '23505') { orderNo = generateOrderNo(); continue; } // تصادم رقم طلب نادر جداً، جرّبي رقم تاني
        throw err;
      }
    }
    if (!order) throw new Error('تعذّر إنشاء رقم طلب فريد');

    for (const item of preparedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, included_ingredients, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.included_ingredients, item.line_total]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...order, items: preparedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// GET /api/orders — محمي (لوحة التحكم). فلاتر: ?status=&type=&search=&from=&to=
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { status, type, search, from, to } = req.query;
  const conditions = [];
  const params = [];

  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`order_type = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(customer_name ILIKE $${params.length} OR customer_phone ILIKE $${params.length})`); }
  if (from) { params.push(from); conditions.push(`created_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`created_at <= $${params.length}`); }

  let sql = 'SELECT * FROM orders';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 300';

  const result = await pool.query(sql, params);
  const orders = result.rows;

  if (orders.length) {
    const orderIds = orders.map(o => o.id);
    const itemsRes = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id',
      [orderIds]
    );
    const itemsByOrder = {};
    for (const item of itemsRes.rows) {
      (itemsByOrder[item.order_id] ||= []).push(item);
    }
    for (const order of orders) {
      order.items = itemsByOrder[order.id] || [];
    }
  }

  res.json(orders);
}));

// GET /api/orders/:id — محمي، مع تفاصيل الأصناف
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (orderRes.rows.length === 0) return res.status(404).json({ error: 'الطلب مش موجود' });
  const itemsRes = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
  res.json({ ...orderRes.rows[0], items: itemsRes.rows });
}));

// PATCH /api/orders/:id/status — محمي
router.patch('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `الحالة لازم تكون وحدة من: ${VALID_STATUSES.join(', ')}` });
  }
  const result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'الطلب مش موجود' });
  res.json(result.rows[0]);
}));

module.exports = router;
