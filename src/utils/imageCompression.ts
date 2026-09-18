/**
 * بتاخذ ملف صورة (من الكاميرا أو معرض الصور)، بتصغّرها لعرض معقول، وبتضغطها لـ JPEG
 * بجودة أقل — حتى الصورة النهائية (Base64) تضل صغيرة بالحجم وما تبطّئ التطبيق أو تتعدى
 * حد حجم الطلبات بالسيرفر.
 */
export function compressImageFile(file: File, maxWidth = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف مش صورة صالحة'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذّر تجهيز الصورة'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
