const STORAGE_KEY = 'shoula-pos-is-printer-station';

/** هاد الجهاز بالذات (المتصفح/الجهاز) — مو حساب المستخدم — هل هو "جهاز الطباعة"؟
 * إعداد محلي بالجهاز نفسه، عشان جهاز الكاونتر يضل يطبع حتى لو تسجّل فيه موظف مختلف كل شفت */
export function isPrinterStation(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setPrinterStation(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
}
