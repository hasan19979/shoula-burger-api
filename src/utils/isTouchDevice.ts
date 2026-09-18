/** بتتأكد إذا الجهاز عنده لمس حقيقي (تاچ سكرين) — مش بس شاشة صغيرة. لابتوب بشاشة صغيرة بس
 * بماوس وكيبورد حقيقيين لازم يضل يقدر يكتب عادي، الكيبورد الداخلي بس للأجهزة يلي فعلاً بتعتمد لمس */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
