const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');
const requireStaffAuth = require('../middleware/staffAuth');
const requireAnyAuth = require('../middleware/anyAuth');
const { deductForOrderItems } = require('./inventory');
const { broadcast } = require('../realtime');

const router = express.Router();

const VALID_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'];
const VALID_TYPES = ['dine-in', 'delivery', 'takeaway', 'pos'];

function generateOrderNo() {
  return 'A' + Math.floor(100000 + Math.random() * 900000);
}

// المنطق المشترك بين الطلب العادي (من الموقع) وطلب الكاشير (POS) —
// بيحسب الأسعار من قاعدة البيانات دايماً، بغض النظر مين بعت الطلب
async function buildAndSaveOrder(client, opts) {
  const {
    items, customerName, customerPhone, address, orderType, notes, couponCode, status, paymentMethod,
    chargeDeliveryFee, enforceMinOrder, tableNumber, cashierName, orderSource, kitchenStatus
  } = opts;

  const productIds = items.map(i => i.productId);
  const { rows: dbProducts } = await client.query(
    `SELECT p.id, p.name, p.price, p.in_stock, COALESCE(c.print_order, 999) AS category_print_order, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = ANY($1)`,
    [productIds]
  );
  const productById = Object.fromEntries(dbProducts.map(p => [p.id, p]));

  // نجيب أسعار كل خيارات التعديلات (Modifiers) المختارة بأي صنف بالطلب دفعة وحدة، من قاعدة البيانات
  // مباشرة — نفس مبدأ عدم الثقة بأي سعر جاي من المتصفح، حتى لإضافات الـ Modifiers
  const allModifierOptionIds = [...new Set(items.flatMap(i => i.modifierOptionIds || []))];
  let modifierOptionsById = {};
  if (allModifierOptionIds.length) {
    const { rows: modOptions } = await client.query(
      'SELECT id, name, price FROM modifier_options WHERE id = ANY($1)',
      [allModifierOptionIds]
    );
    modifierOptionsById = Object.fromEntries(modOptions.map(o => [o.id, o]));
  }

  // نفس المبدأ لخيارات النوع/الحجم (زي عادي/دبل/تربل) — السعر دايماً من قاعدة البيانات، مش من المتصفح
  const allVariantIds = [...new Set(items.map(i => i.variantId).filter(Boolean))];
  let variantsById = {};
  if (allVariantIds.length) {
    const { rows: variantRows } = await client.query(
      'SELECT id, product_id, name, price_delta FROM product_variants WHERE id = ANY($1)',
      [allVariantIds]
    );
    variantsById = Object.fromEntries(variantRows.map(v => [v.id, v]));
  }

  let subtotal = 0;
  const preparedItems = [];
  for (const item of items) {
    const product = productById[item.productId];
    if (!product) return { error: { status: 400, message: `صنف غير موجود (id: ${item.productId})` } };
    if (!product.in_stock) return { error: { status: 409, message: `الصنف "${product.name}" نفذت كميته حالياً` } };
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

    const selectedOptions = (item.modifierOptionIds || []).map(id => modifierOptionsById[id]).filter(Boolean);
    const modifiersUnitPrice = selectedOptions.reduce((sum, o) => sum + Number(o.price), 0);
    const selectedVariant = item.variantId ? variantsById[item.variantId] : null;
    const variantUnitPrice = selectedVariant ? Number(selectedVariant.price_delta) : 0;
    const unitPrice = Number(product.price) + modifiersUnitPrice + variantUnitPrice;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    // بنضيف اسم النوع المختار (زي "دبل") لاسم الصنف نفسه، حتى يبين واضح بكل الفواتير بدون ما نلمس كل قالب طباعة لحاله
    const displayName = selectedVariant ? `${product.name} (${selectedVariant.name})` : product.name;

    // بنخزّن أسماء الإضافات المدفوعة (بسعرها) والمكونات الأساسية المتبقية سوا، لعرضها بالإيصال والمطبخ
    const modifierLabels = selectedOptions.map(o => (Number(o.price) > 0 ? `${o.name} (+${o.price})` : o.name));
    const includedList = item.includedIngredients?.length ? item.includedIngredients : modifierLabels;

    preparedItems.push({
      product_id: product.id, product_name: displayName, quantity: qty,
      unit_price: unitPrice,
      included_ingredients: JSON.stringify(includedList),
      line_total: lineTotal,
      print_order: product.category_print_order,
      category_name: product.category_name
    });
  }

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
    if (!coupon) return { error: { status: 400, message: 'كود الخصم غير صالح أو منتهي' } };
    if (subtotal < Number(coupon.min_order)) {
      return { error: { status: 400, message: `هاد الكود يحتاج طلب بقيمة ${coupon.min_order} على الأقل` } };
    }
    discount = coupon.discount_type === 'percent'
      ? subtotal * (Number(coupon.discount_value) / 100)
      : Number(coupon.discount_value);
    discount = Math.min(discount, subtotal);
    appliedCouponCode = coupon.code;
    await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
  }

  const { rows: settingsRows } = await client.query('SELECT delivery_fee, min_order, loyalty_enabled, loyalty_earn_amount, loyalty_redeem_value FROM settings WHERE id = 1');
  const deliveryFee = chargeDeliveryFee ? Number(settingsRows[0]?.delivery_fee || 0) : 0;
  const minOrder = Number(settingsRows[0]?.min_order || 0);
  const loyaltyEnabled = settingsRows[0]?.loyalty_enabled !== false;
  const loyaltyEarnAmount = Number(settingsRows[0]?.loyalty_earn_amount || 10);
  const loyaltyRedeemValue = Number(settingsRows[0]?.loyalty_redeem_value || 0.5);

  if (enforceMinOrder && subtotal < minOrder) {
    return { error: { status: 400, message: `الحد الأدنى للطلب ${minOrder}، سلتك الحالية ${subtotal}` } };
  }

  // نجيب/ننشئ العميل قبل ما نحسم نقاط الولاء، حتى نتأكد من رصيده الحقيقي بقاعدة البيانات (مش من المتصفح)
  const customerRes = await client.query(
    `INSERT INTO customers (name, phone, address) VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, address = COALESCE(NULLIF(EXCLUDED.address, ''), customers.address)
     RETURNING id, loyalty_points`,
    [customerName, customerPhone, address || '']
  );
  const customerId = customerRes.rows[0].id;
  const currentPoints = customerRes.rows[0].loyalty_points;

  // سياسة الولاء (من الإعدادات — مو ثابتة بالكود): نقطة لكل loyaltyEarnAmount مصروفة، وقيمة النقطة عند الصرف loyaltyRedeemValue
  // ما بنطبقها إطلاقاً لو النظام مطفي، أو لو ما في رقم جوال حقيقي (زبون كاشير عابر بدون رقم) — منعاً لتجميع نقاط وهمية بحساب مشترك
  const hasRealPhone = customerPhone && customerPhone !== '-';
  const loyaltyActive = loyaltyEnabled && hasRealPhone;
  const POINTS_PER_CURRENCY_UNIT = loyaltyEarnAmount > 0 ? 1 / loyaltyEarnAmount : 0;
  const POINT_VALUE = loyaltyRedeemValue;

  const requestedRedeem = loyaltyActive ? Math.max(0, parseInt(opts.redeemPoints, 10) || 0) : 0;
  const redeemedPoints = Math.min(requestedRedeem, currentPoints);
  const pointsDiscount = Math.min(redeemedPoints * POINT_VALUE, subtotal - discount);
  discount += pointsDiscount;

  const total = subtotal - discount + deliveryFee;
  const pointsEarned = loyaltyActive ? Math.floor(total * POINTS_PER_CURRENCY_UNIT) : 0;
  const newPointsBalance = currentPoints - redeemedPoints + pointsEarned;

  if (loyaltyActive) {
    await client.query('UPDATE customers SET loyalty_points = $1 WHERE id = $2', [newPointsBalance, customerId]);
  }

  let orderNo = generateOrderNo();
  let order;
  for (let attempt = 0; attempt < 5; attempt++) {
    // بنحط نقطة استرجاع قبل كل محاولة — لو المحاولة فشلت (رقم مكرر)، بنرجع لهون بس، مش نلغي كل المعاملة
    // (بدون هاد، أي فشل بالإدخال كان "يسمّم" المعاملة كاملة، فأي محاولة تانية بعدها كانت تفشل برسالة عامة غامضة)
    await client.query('SAVEPOINT order_insert_attempt');
    try {
      const orderRes = await client.query(
        `INSERT INTO orders
          (order_no, customer_id, customer_name, customer_phone, address, order_type, status, payment_method, notes, coupon_code, subtotal, discount, delivery_fee, total, table_number, cashier_name, order_source, kitchen_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [orderNo, customerId, customerName, customerPhone, address || '', orderType, status, paymentMethod, notes || '', appliedCouponCode, subtotal, discount, deliveryFee, total,
         tableNumber || null, cashierName || null, orderSource || 'online', kitchenStatus || 'served']
      );
      order = orderRes.rows[0];
      await client.query('RELEASE SAVEPOINT order_insert_attempt');
      break;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT order_insert_attempt');
      if (err.code === '23505') { orderNo = generateOrderNo(); continue; }
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

  return { order: { ...order, items: preparedItems, points_earned: pointsEarned, points_redeemed: redeemedPoints, points_balance: newPointsBalance } };
}

// POST /api/orders — عام (الموقع نفسه بيبعت هون). بنحسب الأسعار من قاعدة البيانات، مش من اللي بعته المتصفح،
// عشان حدا ما يقدر يلعب بالسعر من أدوات المطوّر بالمتصفح ويطلب بسعر مزوّر.
router.post('/', asyncHandler(async (req, res) => {
  const { items, customerName, customerPhone, address, orderType, notes, couponCode, redeemPoints } = req.body || {};

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
    const result = await buildAndSaveOrder(client, {
      items, customerName, customerPhone, address, notes, couponCode, redeemPoints,
      orderType: orderType || 'dine-in',
      status: 'pending',
      paymentMethod: 'cash',
      chargeDeliveryFee: orderType === 'delivery',
      enforceMinOrder: true,
      orderSource: 'online',
      kitchenStatus: 'new'
    });
    if (result.error) { await client.query('ROLLBACK'); return res.status(result.error.status).json({ error: result.error.message }); }
    await client.query('COMMIT');
    broadcast('new-order', result.order); // بث لحظي لشاشة المطبخ فوراً
    res.status(201).json(result.order);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// POST /api/orders/pos — محمي، للكاشير (بيع مباشر بالمحل أو طاولة أو توصيل هاتفي). بيخصم المخزون تلقائياً حسب الوصفات
router.post('/pos', requireStaffAuth, asyncHandler(async (req, res) => {
  const { items, customerName, customerPhone, address, notes, couponCode, paymentMethod, tableNumber, orderType, kitchenStatus, redeemPoints } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'السلة فاضية' });
  }
  const validMethods = ['cash', 'card', 'wallet', 'bank-transfer', 'other', 'pay-later'];
  if (paymentMethod && !validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'طريقة دفع غير معروفة' });
  }
  const resolvedOrderType = orderType || (tableNumber ? 'dine-in' : 'pos');
  if (resolvedOrderType === 'delivery' && !address) {
    return res.status(400).json({ error: 'عنوان التوصيل مطلوب' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await buildAndSaveOrder(client, {
      items,
      customerName: customerName || 'زبون الكاشير',
      customerPhone: customerPhone || '-',
      address: address || '',
      notes,
      couponCode,
      redeemPoints,
      orderType: resolvedOrderType,
      status: 'delivered',
      paymentMethod: paymentMethod || 'cash',
      chargeDeliveryFee: resolvedOrderType === 'delivery',
      tableNumber: tableNumber || null,
      cashierName: req.staff?.name || null,
      orderSource: 'pos',
      kitchenStatus: kitchenStatus || 'served'
    });
    if (result.error) { await client.query('ROLLBACK'); return res.status(result.error.status).json({ error: result.error.message }); }

    await deductForOrderItems(client, items);

    await client.query('COMMIT');
    if (result.order.kitchen_status === 'new') broadcast('new-order', result.order); // بث لحظي بس لو الطلب فعلاً داخل قائمة المطبخ
    broadcast('print-order', result.order); // بث لكل الأجهزة — بس الجهاز المحدد "جهاز الطباعة" رح يطبعه فعلياً
    res.status(201).json(result.order);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// PATCH /api/orders/:id/kitchen-status — محمي: تحديث حالة التحضير بالمطبخ
router.patch('/:id/kitchen-status', requireStaffAuth, asyncHandler(async (req, res) => {
  const { kitchenStatus } = req.body || {};
  const valid = ['new', 'preparing', 'ready', 'served'];
  if (!valid.includes(kitchenStatus)) return res.status(400).json({ error: 'حالة غير معروفة' });
  const result = await pool.query('UPDATE orders SET kitchen_status = $1 WHERE id = $2 RETURNING *', [kitchenStatus, req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'الطلب مش موجود' });
  res.json(result.rows[0]);
}));

// GET /api/orders — محمي (لوحة التحكم). فلاتر: ?status=&type=&search=&from=&to=
router.get('/', requireAnyAuth, asyncHandler(async (req, res) => {
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
      `SELECT oi.*, COALESCE(c.print_order, 999) AS print_order, c.name AS category_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE oi.order_id = ANY($1) ORDER BY oi.id`,
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
  const itemsRes = await pool.query(
    `SELECT oi.*, COALESCE(c.print_order, 999) AS print_order, c.name AS category_name
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE oi.order_id = $1`,
    [req.params.id]
  );
  res.json({ ...orderRes.rows[0], items: itemsRes.rows });
}));

// PATCH /api/orders/:id/status — محمي
router.patch('/:id/status', requireAnyAuth, asyncHandler(async (req, res) => {
  const { status, cancelReason } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `الحالة لازم تكون وحدة من: ${VALID_STATUSES.join(', ')}` });
  }

  const isCancelling = status === 'cancelled';
  // إلغاء طلب مكتمل من طرف موظف كاشير (مو لوحة التحكم) لازم يكون بدور مدير فما فوق
  if (isCancelling && req.staff && !['admin', 'manager'].includes(req.staff.role)) {
    return res.status(403).json({ error: 'إلغاء طلب بيحتاج صلاحية مدير' });
  }

  const actorName = req.staff?.name || req.admin?.email || null;

  const result = await pool.query(
    `UPDATE orders SET status = $1
      ${isCancelling ? ', cancelled_by = $3, cancelled_at = now(), cancel_reason = $4' : ''}
     WHERE id = $2 RETURNING *`,
    isCancelling ? [status, req.params.id, actorName, cancelReason || ''] : [status, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'الطلب مش موجود' });
  res.json(result.rows[0]);
}));

module.exports = router;
