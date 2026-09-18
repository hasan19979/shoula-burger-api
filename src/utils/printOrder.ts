export interface PrintableLine {
  /** مفتاح تجميع — نفس المنتج + نفس الملاحظات/الإضافات = يندمجوا سوا */
  productKey: string | number;
  productName: string;
  quantity: number;
  /** الملاحظات/المكونات — بتنعرض تحت اسم الصنف مباشرة */
  notes: string[];
  /** ترتيب الطباعة حسب فئة الصنف — 999 افتراضياً لو مش معروف (يطبع بالآخر بدل ما يعمل خطأ) */
  printOrder: number;
  lineTotal: number;
}

/**
 * بترتب أصناف الفاتورة **وقت الطباعة بس** — مو بتغيّر ترتيبها المحفوظ بالطلب نفسه أو بقاعدة البيانات.
 * 1. بتجمع الأصناف المتطابقة (نفس المنتج + نفس الملاحظات بالضبط) وبتجمع كمياتهم.
 * 2. بترتب النتيجة حسب ترتيب طباعة الفئة تصاعدياً (الأصغر أول).
 * نفس الدالة مستخدمة بكل قوالب الطباعة (فاتورة الزبون، تذكرة المطبخ، تذكرة جهاز الطباعة) — نفس الترتيب دايماً بكل مكان.
 */
export function groupAndSortForPrint(lines: PrintableLine[]): PrintableLine[] {
  const groups = new Map<string, PrintableLine>();

  for (const line of lines) {
    // نرتب الملاحظات أبجدياً قبل التجميع حتى "بدون بصل، بدون مخلل" و"بدون مخلل، بدون بصل" يتحسبوا نفس الشي
    const notesSignature = [...line.notes].sort().join('|');
    const key = `${line.productKey}::${notesSignature}`;

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.lineTotal += line.lineTotal;
    } else {
      groups.set(key, { ...line, notes: [...line.notes] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.printOrder - b.printOrder);
}
