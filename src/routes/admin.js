const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const requireStaffAuth = require('../middleware/staffAuth');
const { requireStaffRole } = require('../middleware/staffAuth');

const router = express.Router();

/**
 * مسح بيانات (تصفير) — للمدير العام (admin) بس، وبعد إعادة إدخال رمزه السري.
 * كل نوع بيانات إله جداوله بالترتيب الصح. قبل المسح بنقرأ كل الصفوف ومنرجّعها بالرد كنسخة احتياطية.
 * الأصناف والتصنيفات والموظفين والإعدادات ما بتنمسح من هون أبداً (النظام ما بيشتغل بدونها).
 */
const TARGETS = {
  sales: { label: 'المبيعات (الطلبات)', tables: ['order_items', 'orders'] },
  customers: { label: 'العملاء ونقاطهم', tables: ['customers'] },
  suppliers: { label: 'الموردين', tables: ['suppliers'] },
  withdrawals: { label: 'السحوبات', tables: ['cash_withdrawals'] },
  cash_audits: { label: 'جرد الصندوق', tables: ['cash_register_audits'] },
  attendance: { label: 'سجل الحضور', tables: ['time_entries'] },
  stock_movements: { label: 'حركات المخزون', tables: ['stock_movements'] },
};

// GET /api/admin/reset-targets — الأنواع المتاحة مع عدد السجلات بكل نوع
router.get('/reset-targets', requireStaffAuth, requireStaffRole('admin'), asyncHandler(async (req, res) => {
  const out = [];
  for (const [id, t] of Object.entries(TARGETS)) {
    const main = t.tables[t.tables.length - 1];
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${main}`);
    out.push({ id, label: t.label, count: rows[0].n });
  }
  res.json(out);
}));

// POST /api/admin/reset { targets: [...], pin, confirm: 'مسح' }
router.post('/reset', requireStaffAuth, requireStaffRole('admin'), asyncHandler(async (req, res) => {
  const { targets, pin, confirm } = req.body || {};
  if (confirm !== 'مسح') return res.status(400).json({ error: 'لازم تكتبي كلمة "مسح" للتأكيد' });
  const list = Array.isArray(targets) ? [...new Set(targets)].filter((t) => TARGETS[t]) : [];
  if (list.length === 0) return res.status(400).json({ error: 'اختاري شو بدك تمسحي' });

  const { rows: me } = await pool.query('SELECT pin_hash FROM staff_users WHERE id = $1 AND active = true AND role = $2', [req.staff.staffId, 'admin']);
  if (!me[0] || !(await bcrypt.compare(String(pin || ''), me[0].pin_hash))) {
    return res.status(403).json({ error: 'الرمز السري غلط — المسح بيحتاج رمز المدير العام المسجّل حالياً' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const backup = {};
    const deleted = {};
    for (const id of list) {
      for (const table of TARGETS[id].tables) {
        const { rows } = await client.query(`SELECT * FROM ${table}`);
        backup[table] = rows;
      }
      for (const table of TARGETS[id].tables) {
        const r = await client.query(`DELETE FROM ${table}`);
        if (table === TARGETS[id].tables[TARGETS[id].tables.length - 1]) deleted[id] = r.rowCount;
      }
    }
    await client.query('COMMIT');
    console.log(`[reset] ${req.staff.name} مسح:`, deleted);
    res.json({ deleted, backup, at: new Date().toISOString(), by: req.staff.name });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
