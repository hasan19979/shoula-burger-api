import type { Category, ModifierGroup, Product } from '../types';

export const RESTAURANT_NAME = 'مطعم البرجر الذهبي';
export const CURRENCY = '₪';

// ============================================================
// المستخدمون التجريبيون — كل واحد بدوره ورمزه السري الخاص (PIN)
// ============================================================
export const staffUsers: import('../types').StaffUser[] = [
  { id: 'u-admin', name: 'سامر (مدير عام)', role: 'admin', pin: '1111' },
  { id: 'u-manager', name: 'ليلى (مديرة شفت)', role: 'manager', pin: '2222' },
  { id: 'u-cashier1', name: 'أحمد (كاشير)', role: 'cashier', pin: '3333' },
  { id: 'u-cashier2', name: 'رنا (كاشير)', role: 'cashier', pin: '4444' },
  { id: 'u-kitchen', name: 'خالد (مطبخ)', role: 'kitchen', pin: '5555' },
  { id: 'u-waiter', name: 'مريم (نادلة)', role: 'waiter', pin: '6666' },
];

// ============================================================
// المخزون — مواد خام تجريبية
// ============================================================
export const inventoryItems: import('../types').InventoryItem[] = [
  { id: 'inv-bread', name: 'خبز برجر', unit: 'piece', quantity: 120, minThreshold: 30, costPerUnit: 1.2 },
  { id: 'inv-beef', name: 'لحم برجر', unit: 'g', quantity: 15000, minThreshold: 3000, costPerUnit: 0.045 },
  { id: 'inv-chicken', name: 'صدر دجاج', unit: 'g', quantity: 8000, minThreshold: 2000, costPerUnit: 0.035 },
  { id: 'inv-cheese', name: 'جبنة شرائح', unit: 'piece', quantity: 200, minThreshold: 50, costPerUnit: 0.8 },
  { id: 'inv-lettuce', name: 'خس', unit: 'g', quantity: 3000, minThreshold: 500, costPerUnit: 0.01 },
  { id: 'inv-tomato', name: 'بندورة', unit: 'g', quantity: 4000, minThreshold: 800, costPerUnit: 0.008 },
  { id: 'inv-onion', name: 'بصل', unit: 'g', quantity: 2500, minThreshold: 500, costPerUnit: 0.006 },
  { id: 'inv-sauce', name: 'صوص خاص', unit: 'ml', quantity: 5000, minThreshold: 1000, costPerUnit: 0.015 },
  { id: 'inv-fries', name: 'بطاطا مجمدة', unit: 'g', quantity: 20000, minThreshold: 4000, costPerUnit: 0.007 },
  { id: 'inv-nuggets', name: 'ناجتس دجاج', unit: 'piece', quantity: 400, minThreshold: 80, costPerUnit: 0.9 },
  { id: 'inv-cola-can', name: 'علبة كولا', unit: 'piece', quantity: 150, minThreshold: 40, costPerUnit: 3 },
];

export const categories: Category[] = [
  { id: 'all', name: 'الكل', icon: 'LayoutGrid' },
  { id: 'burgers', name: 'برجر', icon: 'Beef' },
  { id: 'sandwiches', name: 'ساندويتشات', icon: 'Sandwich' },
  { id: 'meals', name: 'وجبات', icon: 'UtensilsCrossed' },
  { id: 'grills', name: 'مشاوي', icon: 'Flame' },
  { id: 'appetizers', name: 'مقبلات', icon: 'Soup' },
  { id: 'salads', name: 'سلطات', icon: 'Salad' },
  { id: 'drinks', name: 'مشروبات', icon: 'CupSoda' },
  { id: 'desserts', name: 'حلويات', icon: 'IceCreamCone' },
];

// ============================================================
// مجموعات التعديلات (Modifier Groups) — نظام مستقل قابل للربط بأي منتج
// ============================================================
export const modifierGroups: ModifierGroup[] = [
  {
    id: 'base-ingredients',
    name: 'المكونات الأساسية',
    selectionType: 'multiple',
    required: false,
    min: 0,
    max: 5,
    options: [
      { id: 'lettuce', name: 'خس', price: 0, defaultIncluded: true },
      { id: 'tomato', name: 'بندورة', price: 0, defaultIncluded: true },
      { id: 'onion', name: 'بصل', price: 0, defaultIncluded: true },
      { id: 'special-sauce', name: 'صوص خاص', price: 0, defaultIncluded: true },
      { id: 'cheese', name: 'جبنة', price: 0, defaultIncluded: true },
    ],
  },
  {
    id: 'extras',
    name: 'الإضافات',
    selectionType: 'multiple',
    required: false,
    min: 0,
    max: 6,
    options: [
      { id: 'bacon', name: 'بيكون', price: 4, defaultIncluded: false },
      { id: 'mushroom', name: 'مشروم', price: 3, defaultIncluded: false },
      { id: 'jalapeno', name: 'هالبينو', price: 2, defaultIncluded: false },
      { id: 'egg', name: 'بيض', price: 2, defaultIncluded: false },
      { id: 'extra-cheese', name: 'جبنة إضافية', price: 5, defaultIncluded: false },
      { id: 'extra-sauce', name: 'صوص إضافي', price: 2, defaultIncluded: false },
    ],
  },
  {
    id: 'burger-type',
    name: 'نوع البرجر',
    selectionType: 'single',
    required: true,
    min: 1,
    max: 1,
    options: [
      { id: 'classic', name: 'برجر كلاسيك', price: 0 },
      { id: 'deluxe', name: 'برجر ديلوكس', price: 4 },
      { id: 'chicken', name: 'برجر تشيكن', price: 0 },
      { id: 'spicy', name: 'برجر سبايسي', price: 2 },
    ],
  },
  {
    id: 'fries-type',
    name: 'نوع البطاطا',
    selectionType: 'single',
    required: true,
    min: 1,
    max: 1,
    options: [
      { id: 'regular-fries', name: 'عادية', price: 0 },
      { id: 'wedges', name: 'ودجز', price: 2 },
      { id: 'spicy-fries', name: 'بطاطا حارة', price: 2 },
    ],
  },
  {
    id: 'drink-type',
    name: 'اختر المشروب',
    selectionType: 'single',
    required: true,
    min: 1,
    max: 1,
    options: [
      { id: 'cola', name: 'كولا', price: 0 },
      { id: 'sprite', name: 'سبرايت', price: 0 },
      { id: 'fanta', name: 'فانتا', price: 0 },
      { id: 'water', name: 'ماء', price: 0 },
    ],
  },
];

// ============================================================
// المنتجات — بيانات تجريبية واقعية
// ============================================================
export const products: Product[] = [
  {
    id: 'p-classic',
    name: 'برجر كلاسيك',
    description: 'قطعة لحم طازجة، جبنة، خس وبندورة',
    price: 28,
    categoryId: 'burgers',
    available: true,
    modifierGroupIds: ['base-ingredients', 'extras'],
    recipe: [
      { inventoryItemId: 'inv-bread', quantity: 1 },
      { inventoryItemId: 'inv-beef', quantity: 150 },
      { inventoryItemId: 'inv-cheese', quantity: 1 },
      { inventoryItemId: 'inv-lettuce', quantity: 20 },
      { inventoryItemId: 'inv-tomato', quantity: 30 },
      { inventoryItemId: 'inv-sauce', quantity: 20 },
    ],
  },
  {
    id: 'p-deluxe',
    name: 'برجر ديلوكس',
    description: 'قطعتين لحم، جبنة مضاعفة، صوص خاص',
    price: 38,
    categoryId: 'burgers',
    available: true,
    modifierGroupIds: ['base-ingredients', 'extras'],
    recipe: [
      { inventoryItemId: 'inv-bread', quantity: 1 },
      { inventoryItemId: 'inv-beef', quantity: 300 },
      { inventoryItemId: 'inv-cheese', quantity: 2 },
      { inventoryItemId: 'inv-lettuce', quantity: 20 },
      { inventoryItemId: 'inv-tomato', quantity: 30 },
      { inventoryItemId: 'inv-sauce', quantity: 25 },
    ],
  },
  {
    id: 'p-chicken',
    name: 'برجر تشيكن',
    description: 'صدر دجاج مقرمش، خس ومايونيز',
    price: 32,
    categoryId: 'burgers',
    available: true,
    modifierGroupIds: ['base-ingredients', 'extras'],
    recipe: [
      { inventoryItemId: 'inv-bread', quantity: 1 },
      { inventoryItemId: 'inv-chicken', quantity: 150 },
      { inventoryItemId: 'inv-lettuce', quantity: 20 },
      { inventoryItemId: 'inv-sauce', quantity: 15 },
    ],
  },
  {
    id: 'p-spicy',
    name: 'برجر سبايسي',
    description: 'لحم متبل حار، جبنة بيبر جاك',
    price: 34,
    categoryId: 'burgers',
    available: true,
    modifierGroupIds: ['base-ingredients', 'extras'],
  },
  {
    id: 'p-meal',
    name: 'وجبة برجر',
    description: 'برجر من اختيارك + بطاطا + مشروب',
    price: 45,
    categoryId: 'meals',
    available: true,
    modifierGroupIds: ['burger-type', 'fries-type', 'drink-type', 'base-ingredients', 'extras'],
  },
  {
    id: 'p-fries',
    name: 'بطاطا مقلية',
    description: 'بطاطا مقرمشة طازجة',
    price: 14,
    categoryId: 'appetizers',
    available: true,
    modifierGroupIds: [],
    recipe: [{ inventoryItemId: 'inv-fries', quantity: 180 }],
  },
  {
    id: 'p-onion-rings',
    name: 'حلقات بصل',
    description: 'مقرمشة، تُقدم مع صوص',
    price: 16,
    categoryId: 'appetizers',
    available: true,
    modifierGroupIds: [],
  },
  {
    id: 'p-nuggets',
    name: 'ناجتس',
    description: '8 قطع دجاج مقرمش',
    price: 20,
    categoryId: 'appetizers',
    available: true,
    modifierGroupIds: [],
    recipe: [{ inventoryItemId: 'inv-nuggets', quantity: 8 }],
  },
  {
    id: 'p-cola',
    name: 'كولا',
    price: 8,
    categoryId: 'drinks',
    available: true,
    modifierGroupIds: [],
    recipe: [{ inventoryItemId: 'inv-cola-can', quantity: 1 }],
  },
  {
    id: 'p-orange-juice',
    name: 'عصير برتقال',
    price: 12,
    categoryId: 'drinks',
    available: true,
    modifierGroupIds: [],
  },
  {
    id: 'p-brownie',
    name: 'براوني',
    description: 'قطعة شوكولاتة دافئة مع آيس كريم',
    price: 18,
    categoryId: 'desserts',
    available: true,
    modifierGroupIds: [],
  },
];
