const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');
const requireStaffAuth = require('../middleware/staffAuth');
const requireAnyAuth = require('../middleware/anyAuth');
const { deductForOrderItems, restockForOrderItems } = require('./inventory');
const { broadcast } = require('../realtime');

const router = express.Router();

const VALID_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'];
const VALID_TYPES = ['dine-in', 'delivery', 'takeaway', 'pos'];

/**
 * رقم الطلب: تاريخ اليوم + رقم متسلسل لهاد اليوم — مثلاً 1106-023 = ٦ نوفمبر، الطلب رقم 23.
 * اليوم = يوم العمل حسب توقيت المطعم وساعات الدوام (مش توقيت السيرفر ولا نص الليل)، وبيبلّش من 001 كل يوم.
 * العدّاد بنفس معاملة حفظ الطلب: لو الحفظ فشل، العدّاد بيرجع معه — فما في أرقام ناقصة.
 * طلب بدون نت بياخد رقم من يوم البيعة الحقيقي (مش يوم الإرسال).
 */
const businessDay = require('../businessDay');
async function nextOrderNo(client, createdAt) {
  // يوم العمل: بيخلص مع انتهاء الدوام (من الإعدادات) — طلب بعد نص الليل وقبل الفتحة الجاية بيتبع يوم امبارح
  const cutoff = await businessDay.getCutoff();
  // العدّاد ما بينزل أبداً تحت أعلى رقم موجود فعلاً لهاد اليوم (احتياط لو العدّاد انمسح أو انعمل بنسخة قديمة)
  const { rows } = await client.query(
    `WITH d AS (SELECT (((COALESCE($1::timestamptz, now()) AT TIME ZONE $2) - make_interval(mins => $3))::date) AS day),
          m AS (SELECT COALESCE(MAX(daily_seq), 0) AS mx FROM orders, d WHERE orders.order_day = d.day)
     INSERT INTO order_counters (day, last)
       SELECT d.day, m.mx + 1 FROM d, m
     ON CONFLICT (day) DO UPDATE SET last = GREATEST(order_counters.last, (SELECT mx FROM m)) + 1
     RETURNING to_char(day, 'YYYY-MM-DD') AS day, to_char(day, 'MMDD') AS mmdd, last`,
    [createdAt || null, businessDay.TZ, cutoff]
  );
  const { day, mmdd, last } = rows[0];
  return { orderNo: `${mmdd}-${String(last).padStart(3, '0')}`, orderDay: day, dailySeq: last };
}

async function insertOrderItems(client, orderId, preparedItems) {
  for (const item of preparedItems) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, included_ingredients, line_total, item_meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.included_ingredients, item.line_total, item.item_meta]
    );
  }
}

// تسعير أصناف الطلب من قاعدة البيانات — مشترك بين إنشاء طلب جديد وتعديل طلب موجود،
// حتى يستحيل يتسعّر الطلب المعدّل بطريقة مختلفة عن الجديد
// allowPriceOverride: الكاشير بس (طلب من الكاشير أو تعديل طلب) — طلبات الموقع ما بتقدر تغيّر السعر أبداً
async function priceOrderItems(client, items, { allowPriceOverride = false } = {}) {
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

  // أسعار الإضافات الاختيارية (زي "جبنة إضافية +3") — كمان من قاعدة البيانات دايماً، مش من المتصفح
  const productIdsForAddons = [...new Set(items.map(i => Number(i.productId)).filter(Boolean))];
  const addonPriceByKey = {};
  if (productIdsForAddons.length) {
    const { rows: addonRows } = await client.query(
      'SELECT product_id, name, price FROM product_ingredients WHERE product_id = ANY($1) AND default_included = false',
      [productIdsForAddons]
    );
    for (const r of addonRows) addonPriceByKey[`${r.product_id}::${r.name}`] = Number(r.price);
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
    // بنحسب بس الإضافات يلي فعلاً مسجّلة كإضافة اختيارية لهاد الصنف — أي اسم تاني بيتجاهل
    const addedNames = Array.isArray(item.addedIngredients) ? [...new Set(item.addedIngredients)] : [];
    const addonsUnitPrice = addedNames.reduce((sum, n) => sum + (addonPriceByKey[`${product.id}::${n}`] || 0), 0);
    const catalogUnitPrice = Number(product.price) + modifiersUnitPrice + variantUnitPrice + addonsUnitPrice;
    // سعر معدّل لحظياً من الكاشير لهاد السطر بس — بنحفظ السعر الأصلي جنبه حتى يضل واضح بالسجل
    const overrideRaw = item.unitPriceOverride;
    const hasOverride = allowPriceOverride && overrideRaw !== undefined && overrideRaw !== null && overrideRaw !== '';
    if (hasOverride) {
      const v = Number(overrideRaw);
      if (!Number.isFinite(v) || v < 0 || v > 100000) {
        return { error: { status: 400, message: `سعر غير صالح للصنف "${product.name}"` } };
      }
    }
    const unitPrice = hasOverride ? Math.round(Number(overrideRaw) * 100) / 100 : catalogUnitPrice;
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
      category_name: product.category_name,
      item_meta: JSON.stringify({
        variantId: selectedVariant ? selectedVariant.id : null,
        addedIngredients: addedNames,
        removedIngredients: Array.isArray(item.removedIngredients) ? item.removedIngredients : [],
        note: typeof item.itemNote === 'string' ? item.itemNote : '',
        modifierOptionIds: item.modifierOptionIds || [],
        ...(hasOverride ? { priceOverride: unitPrice, originalUnitPrice: catalogUnitPrice } : {}),
      }),
    });
  }

  return { subtotal, preparedItems };
}

/**
 * معلومات طلب انعمل بدون نت: وقت البيعة الحقيقي، ومين عمله، ومعرّفه المحلي (لمنع التكرار).
 * حماية: الوقت لازم يكون بآخر 7 أيام ومش بالمستقبل، والموظف لازم يكون موجود فعلاً بالنظام —
 * وإلا منتجاهلها ومنحفظ الطلب عادي (وقت الإرسال + الموظف الداخل).
 */
async function resolveOfflineMeta(offline, staff) {
  if (!offline || typeof offline !== 'object') return null;
  const out = {};
  if (typeof offline.localId === 'string' && /^[\w-]{3,40}$/.test(offline.localId)) {
    // الجهاز + المعرّف المحلي + وقت البيعة = معرّف فريد للطلب، مهما مين بعته
    const device = typeof offline.deviceId === 'string' ? offline.deviceId.slice(0, 40) : String(staff?.did || 'x');
    out.ref = `${device}:${offline.localId}:${String(offline.createdAt || '').slice(0, 30)}`;
  }
  const t = Date.parse(offline.createdAt);
  const now = Date.now();
  if (Number.isFinite(t) && t <= now + 2 * 60 * 1000 && t >= now - 7 * 24 * 60 * 60 * 1000) {
    out.createdAt = new Date(t).toISOString();
  }
  const id = Number(offline.cashierId);
  if (Number.isInteger(id) && id > 0) {
    const r = await pool.query('SELECT name FROM staff_users WHERE id = $1', [id]);
    if (r.rows.length) out.cashierName = r.rows[0].name;
  }
  if (!out.cashierName && typeof offline.cashierName === 'string' && offline.cashierName.trim()) {
    const r = await pool.query('SELECT name FROM staff_users WHERE name = $1 LIMIT 1', [offline.cashierName.trim()]);
    if (r.rows.length) out.cashierName = r.rows[0].name;
  }
  return out;
}

// المنطق المشترك بين الطلب العادي (من الموقع) وطلب الكاشير (POS) —
// بيحسب الأسعار من قاعدة البيانات دايماً، بغض النظر مين بعت الطلب
async function buildAndSaveOrder(client, opts) {
  const {
    items, customerName, customerPhone, address, orderType, notes, couponCode, status, paymentMethod,
    chargeDeliveryFee, enforceMinOrder, tableNumber, cashierName, orderSource, kitchenStatus,
    createdAt, offlineRef, awaitingWa
  } = opts;

  const priced = await priceOrderItems(client, items, { allowPriceOverride: orderSource === 'pos' });
  if (priced.error) return priced;
  const { subtotal, preparedItems } = priced;

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

  const { rows: settingsRows } = await client.query('SELECT min_order, loyalty_enabled, loyalty_earn_amount, loyalty_redeem_value FROM settings WHERE id = 1');
  // المطعم ما بياخد رسوم توصيل إطلاقاً — المجموع الكلي = المجموع الفرعي (ناقص الخصم بس)، مهما كانت القيمة القديمة المخزنة بالإعدادات
  const deliveryFee = 0;
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

  let order;
  for (let attempt = 0; attempt < 5; attempt++) {
    // بنحط نقطة استرجاع قبل كل محاولة — لو المحاولة فشلت (رقم مكرر)، بنرجع لهون بس، مش نلغي كل المعاملة
    // (بدون هاد، أي فشل بالإدخال كان "يسمّم" المعاملة كاملة، فأي محاولة تانية بعدها كانت تفشل برسالة عامة غامضة)
    await client.query('SAVEPOINT order_insert_attempt');
    try {
      const { orderNo, orderDay, dailySeq } = await nextOrderNo(client, createdAt);
      const orderRes = await client.query(
        `INSERT INTO orders
          (order_no, customer_id, customer_name, customer_phone, address, order_type, status, payment_method, notes, coupon_code, subtotal, discount, delivery_fee, total, table_number, cashier_name, order_source, kitchen_status, created_at, offline_ref, order_day, daily_seq, awaiting_wa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,COALESCE($19::timestamptz, now()),$20,$21,$22,$23) RETURNING *`,
        [orderNo, customerId, customerName, customerPhone, address || '', orderType, status, paymentMethod, notes || '', appliedCouponCode, subtotal, discount, deliveryFee, total,
         tableNumber || null, cashierName || null, orderSource || 'online', kitchenStatus || 'served', createdAt || null, offlineRef || null, orderDay, dailySeq, !!awaitingWa]
      );
      order = orderRes.rows[0];
      await client.query('RELEASE SAVEPOINT order_insert_attempt');
      break;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT order_insert_attempt');
      if (err.code === '23505' && err.constraint !== 'orders_offline_ref_uniq') continue; // رقم مستخدم (نادر) — العدّاد بيعطي الرقم الجاي
      throw err;
    }
  }
  if (!order) throw new Error('تعذّر إنشاء رقم طلب فريد');

  // منخزّن النقاط على الطلب نفسه — حتى أي طباعة لاحقة (المطبخ، إعادة الطباعة) تعرضها صح
  if (loyaltyActive) {
    const pointsRes = await client.query(
      'UPDATE orders SET points_earned = $1, points_redeemed = $2, points_balance = $3 WHERE id = $4 RETURNING points_earned, points_redeemed, points_balance',
      [pointsEarned, redeemedPoints, newPointsBalance, order.id]
    );
    order = { ...order, ...pointsRes.rows[0] };
  }

  await insertOrderItems(client, order.id, preparedItems);

  // لو الزبون بدون رقم حقيقي أو النظام مطفي، منرجع null (مش صفر) — حتى الفاتورة تخفي قسم النقاط كامل بدل ما تطبع "٠ نقاط"
  return {
    order: {
      ...order,
      items: preparedItems,
      points_earned: loyaltyActive ? pointsEarned : null,
      points_redeemed: loyaltyActive ? redeemedPoints : null,
      points_balance: loyaltyActive ? newPointsBalance : null,
    },
  };
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

  // التأكيد بالواتساب مفعّل؟ الطلب بيستنى (مخفي عن الكاشير) لحد ما توصل رسالة الزبون على واتساب المطعم
  const { rows: cfg } = await pool.query('SELECT wa_require_confirm FROM settings WHERE id = 1');
  const awaitWa = !!cfg[0]?.wa_require_confirm && require('../whatsapp').config().ready;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await buildAndSaveOrder(client, {
      awaitingWa: awaitWa,
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
    if (!awaitWa) broadcast('new-order', result.order); // بث لحظي لشاشة المطبخ فوراً (أو لما توصل رسالة الواتساب)
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
  const { items, customerName, customerPhone, address, notes, couponCode, paymentMethod, tableNumber, orderType, kitchenStatus, redeemPoints, amountPaid, offline } = req.body || {};

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

  // طلب انعمل بدون نت وانبعت هلق: منحفظه بوقت البيعة الحقيقي وباسم الموظف يلي عمله (مش يلي داخل وقت الإرسال)
  const off = await resolveOfflineMeta(offline, req.staff);
  if (off?.ref) {
    // انبعت قبل (مثلاً الرد ضاع بالطريق والجهاز رجع بعته) — منرجّع نفس الطلب وما منكرره
    const dup = await pool.query('SELECT * FROM orders WHERE offline_ref = $1', [off.ref]);
    if (dup.rows.length) return res.status(200).json(dup.rows[0]);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await buildAndSaveOrder(client, {
      createdAt: off?.createdAt || null,
      offlineRef: off?.ref || null,
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
      cashierName: off?.cashierName || req.staff?.name || null,
      orderSource: 'pos',
      kitchenStatus: kitchenStatus || 'served'
    });
    if (result.error) { await client.query('ROLLBACK'); return res.status(result.error.status).json({ error: result.error.message }); }

    // المبلغ المدفوع فعلياً — بينحفظ حتى إعادة الطباعة تطلع زي الفاتورة الأصلية بالضبط (المدفوع والباقي)
    const paid = Number(amountPaid);
    if (Number.isFinite(paid) && paid > 0) {
      await client.query('UPDATE orders SET amount_paid = $1 WHERE id = $2', [paid, result.order.id]);
      result.order.amount_paid = paid.toFixed(2);
    }

    await deductForOrderItems(client, items);

    await client.query('COMMIT');
    if (result.order.kitchen_status === 'new' && !off) broadcast('new-order', result.order); // بث لحظي بس لو الطلب فعلاً داخل قائمة المطبخ
    // طلب بدون نت انطبع وقت البيعة (أو انطبع يدوي) — ما منعيد طباعته على جهاز الطباعة لما يوصل متأخر
    if (!off) broadcast('print-order', result.order); // بث لكل الأجهزة — بس الجهاز المحدد "جهاز الطباعة" رح يطبعه فعلياً
    else broadcast('orders-changed', { id: result.order.id });
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

  // طلبات انتهت وهي بتستنى رسالة الواتساب (الزبون ما بعت) — كأنها ما صارت
  conditions.push(`NOT (awaiting_wa = true AND status = 'cancelled')`);
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

// PUT /api/orders/:id/items — تعديل طلب جاهز/مطبوع (أي كاشير). الطلب بيضل بنفس الرقم.
// بيعيد تسعير الأصناف من قاعدة البيانات، بيرجّع المخزون القديم ويخصم الجديد، وبيعدّل نقاط الزبون بالفرق
router.put('/:id/items', requireStaffAuth, asyncHandler(async (req, res) => {
  const { items, notes } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'الطلب لازم يضل فيه صنف واحد على الأقل' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    const order = orderRows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الطلب مش موجود' }); }
    if (order.status === 'cancelled') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'ما بينفع تعدّلي طلب ملغي' }); }

    const priced = await priceOrderItems(client, items, { allowPriceOverride: true });
    if (priced.error) { await client.query('ROLLBACK'); return res.status(priced.error.status).json({ error: priced.error.message }); }
    const { subtotal, preparedItems } = priced;

    // الخصم الأصلي (كوبون + نقاط مستخدمة) بيضل زي ما هو، بس ما بيزيد عن المجموع الجديد. رسوم التوصيل ما بتتغيّر
    const discount = Math.min(Number(order.discount) || 0, subtotal);
    // بدون رسوم توصيل — حتى لو الطلب القديم كان عليه رسوم، بعد التعديل بتنشال
    const deliveryFee = 0;
    const total = subtotal - discount + deliveryFee;
    const previousTotal = Number(order.total);

    // النقاط: بس لو الطلب الأصلي كان مربوط بنظام النقاط — منعدّل الرصيد بفرق النقاط المكتسبة
    let pointsEarned = order.points_earned;
    let pointsBalance = order.points_balance;
    if (order.points_earned != null && order.customer_phone && order.customer_phone !== '-') {
      const { rows: st } = await client.query('SELECT loyalty_enabled, loyalty_earn_amount FROM settings WHERE id = 1');
      const earnAmount = Number(st[0]?.loyalty_earn_amount || 10);
      const newEarned = st[0]?.loyalty_enabled !== false && earnAmount > 0 ? Math.floor(total / earnAmount) : 0;
      const delta = newEarned - Number(order.points_earned);
      const { rows: cust } = await client.query(
        'UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + $1) WHERE phone = $2 RETURNING loyalty_points',
        [delta, order.customer_phone]
      );
      pointsEarned = newEarned;
      pointsBalance = cust[0] ? cust[0].loyalty_points : order.points_balance;
    }

    // المخزون: منرجّع كل الأصناف القديمة ومنخصم الجديدة
    const { rows: oldItems } = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [order.id]);
    await restockForOrderItems(client, oldItems.map(i => ({ productId: i.product_id, quantity: i.quantity })), `إرجاع للمخزون — تعديل الطلب ${order.order_no}`);
    await deductForOrderItems(client, items);

    await client.query('DELETE FROM order_items WHERE order_id = $1', [order.id]);
    await insertOrderItems(client, order.id, preparedItems);

    const editedBy = req.staff?.name || null;
    const { rows: updatedRows } = await client.query(
      `UPDATE orders SET subtotal = $1, discount = $2, total = $3, delivery_fee = 0, notes = COALESCE($4, notes),
         points_earned = $5, points_balance = $6, edited_at = now(), edited_by = $7
       WHERE id = $8 RETURNING *`,
      [subtotal, discount, total, typeof notes === 'string' ? notes : null, pointsEarned, pointsBalance, editedBy, order.id]
    );
    await client.query('COMMIT');

    const itemsRes = await pool.query(
      `SELECT oi.*, COALESCE(c.print_order, 999) AS print_order, c.name AS category_name
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE oi.order_id = $1 ORDER BY oi.id`,
      [order.id]
    );
    const updated = { ...updatedRows[0], items: itemsRes.rows, previous_total: previousTotal };
    broadcast('print-order', updated); // جهاز الطباعة بيطبع النسخة المعدّلة للمطبخ
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// POST /api/orders/:id/reprint — إعادة طباعة طلب سابق عن طريق جهاز الطباعة نفسه (مش الجهاز يلي كبس الزر)،
// حتى تطلع الفاتورة بنفس الحجم والإعدادات بالضبط زي الطباعة العادية
router.post('/:id/reprint', requireStaffAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'الطلب مش موجود' });
  const itemsRes = await pool.query(
    `SELECT oi.*, COALESCE(c.print_order, 999) AS print_order, c.name AS category_name
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE oi.order_id = $1 ORDER BY oi.id`,
    [req.params.id]
  );
  broadcast('print-order', { ...rows[0], items: itemsRes.rows });
  res.json({ success: true });
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
// للاستعمال من المساعد الذكي (طلبات من محادثة الواتساب) — نفس منطق التسعير والحفظ بالضبط
module.exports.buildAndSaveOrder = buildAndSaveOrder;
module.exports.priceOrderItems = priceOrderItems;
