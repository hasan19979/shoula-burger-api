const fs = require('fs');
const path = require('path');
const pool = require('./pool');

// بتحوّل ملف الشعار (SVG) لصيغة data URI وتخزّنه بعمود logo_image بجدول الإعدادات —
// هيك الفاتورة (وأي مكان تاني بالنظام بيستخدم شعار المطعم) بيقرا الشعار الحقيقي من قاعدة
// البيانات مباشرة، بدون ما يكون مثبّت جوا كود الفاتورة نفسه.
async function setLogo() {
  const svgPath = path.join(__dirname, 'super-burger-logo.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;

  await pool.query('UPDATE settings SET logo_image = $1 WHERE id = 1', [dataUri]);
  console.log('✅ تم حفظ شعار Super Burger بإعدادات النظام (logo_image) بنجاح.');
  await pool.end();
}

setLogo().catch((err) => {
  console.error('❌ صار خطأ:', err.message);
  process.exit(1);
});
