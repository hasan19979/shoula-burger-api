const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/auth');

const router = express.Router();

async function attachIngredients(products) {
  if (products.length === 0) return products;
  const ids = products.map(p => p.id);
  const { rows } = await pool.query(
    'SELECT product_id, name FROM product_ingredients WHERE product_id = ANY($1) ORDER BY sort_order',
    [ids]
  );
  const byProduct = {};
  for (const row of rows) {
    (byProduct[row.product_id] ||= []).push(row.name);
  }
  return products.map(p => ({ ...p, ingredients: byProduct[p.id] || [] }));
}

// GET /api/products — عام. فلاتر اختيارية: ?category=slug&inStockOnly=true
router.get('/', asyncHandler(async (req, res) => {
  const { category, inStockOnly } = req.query;
  const conditions = [];
  const params = [];

  let sql = `SELECT p.*, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id`;
  if (category) { params.push(category); conditions.push(`c.slug = $${params.length}`); }
  if (inStockOnly === 'true') { conditions.push('p.in_stock = true'); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.sort_order, p.id';

  const result = await pool.query(sql, params);
  const withIngredients = await attachIngredients(result.rows);
  res.json(withIngredients);
}));

// GET /api/products/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'الصنف مش موجود' });
  const [withIngredients] = await attachIngredients(result.rows);
  res.json(withIngredients);
}));

// POST /api/products — محمي
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const {
    category_id, name, description, price, icon, image_url,
    start_mode, is_featured, is_popular, in_stock, stock_quantity,
    sort_order, ingredients
  } = req.body || {};

  if (!category_id || !name || price === undefined) {
    return res.status(400).json({ error: 'الفئة، الاسم، والسعر مطلوبين' });
  }
  if (Number(price) < 0) return res.status(400).json({ error: 'السعر لازم يكون رقم موجب' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productRes = await client.query(
      `INSERT INTO products
        (category_id, name, description, price, icon, image_url, start_mode, is_featured, is_popular, in_stock, stock_quantity, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [category_id, name, description || '', price, icon || 'ti-circle-dot', image_url || '',
       start_mode || 'pick', !!is_featured, !!is_popular, in_stock !== false, stock_quantity ?? null, sort_order || 0]
    );
    const product = productRes.rows[0];

    if (Array.isArray(ingredients)) {
      for (let i = 0; i < ingredients.length; i++) {
        await client.query(
          'INSERT INTO product_ingredients (product_id, name, sort_order) VALUES ($1, $2, $3)',
          [product.id, ingredients[i], i]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...product, ingredients: ingredients || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// PUT /api/products/:id — محمي، بيحدّث الحقول المرسلة بس + المكونات كاملة لو انبعتت
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const fields = req.body || {};
  const allowed = ['category_id','name','description','price','icon','image_url','start_mode','is_featured','is_popular','in_stock','stock_quantity','sort_order'];

  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  sets.push(`updated_at = now()`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (sets.length) {
      params.push(id);
      const result = await client.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'الصنف مش موجود' });
      }
    }

    if (Array.isArray(fields.ingredients)) {
      await client.query('DELETE FROM product_ingredients WHERE product_id = $1', [id]);
      for (let i = 0; i < fields.ingredients.length; i++) {
        await client.query(
          'INSERT INTO product_ingredients (product_id, name, sort_order) VALUES ($1, $2, $3)',
          [id, fields.ingredients[i], i]
        );
      }
    }

    await client.query('COMMIT');
    const finalRes = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    const [withIngredients] = await attachIngredients(finalRes.rows);
    res.json(withIngredients);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// PATCH /api/products/:id/stock — محمي، تحديث سريع لحالة التوفر (يستخدم من زر "نفذت الكمية" باللوحة)
router.patch('/:id/stock', requireAuth, asyncHandler(async (req, res) => {
  const { in_stock, stock_quantity } = req.body || {};
  const result = await pool.query(
    `UPDATE products SET in_stock = COALESCE($1, in_stock), stock_quantity = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [in_stock, stock_quantity ?? null, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'الصنف مش موجود' });
  res.json(result.rows[0]);
}));

// DELETE /api/products/:id — محمي
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'الصنف مش موجود' });
  res.json({ success: true });
}));

module.exports = router;
