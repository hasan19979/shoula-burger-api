const fs = require('fs');
const path = require('path');
const pool = require('./pool');

// بتحوّل صورة الجملة التسويقية المزخرفة (خط يدوي جاهز) لصيغة data URI وتخزّنها بعمود
// tagline_image بجدول الإعدادات — نفس فكرة set-logo.js بالضبط.
async function setTaglineImage() {
  const imgPath = path.join(__dirname, 'tagline-image.png');
  const imgBuffer = fs.readFileSync(imgPath);
  const dataUri = `data:image/png;base64,${imgBuffer.toString('base64')}`;

  await pool.query('UPDATE settings SET tagline_image = $1 WHERE id = 1', [dataUri]);
  console.log('✅ تم حفظ صورة الجملة التسويقية بإعدادات النظام (tagline_image) بنجاح.');
  await pool.end();
}

setTaglineImage().catch((err) => {
  console.error('❌ صار خطأ:', err.message);
  process.exit(1);
});
