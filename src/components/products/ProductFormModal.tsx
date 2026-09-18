import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import type { Product, RecipeIngredient } from '../../types';
import { categories, CURRENCY } from '../../data/demoData';
import { useInventoryStore } from '../../store/inventoryStore';
import { useModifierGroupsStore } from '../../store/modifierGroupsStore';
import { useProductsStore } from '../../store/productsStore';
import { compressImageFile } from '../../utils/imageCompression';
import Modal from '../modals/Modal';

interface Props {
  product: Product | null; // null = إضافة صنف جديد
  onClose: () => void;
}

const SELECTABLE_CATEGORIES = categories.filter((c) => c.id !== 'all');

export default function ProductFormModal({ product, onClose }: Props) {
  const { addProduct, updateProduct } = useProductsStore();
  const modifierGroups = useModifierGroupsStore((s) => s.groups);
  const inventoryItems = useInventoryStore((s) => s.items);
  const isEdit = !!product;

  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product?.price ?? 0);
  const [cost, setCost] = useState(product?.cost ?? 0);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? SELECTABLE_CATEGORIES[0]?.id ?? '');
  const [image, setImage] = useState(product?.image ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // حتى تقدري تختاري نفس الملف مرة ثانية لو غيّرتي رأيك
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('لازم تختاري ملف صورة');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const compressed = await compressImageFile(file);
      setImage(compressed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'تعذّر تحميل الصورة');
    } finally {
      setUploading(false);
    }
  }
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [available, setAvailable] = useState(product?.available ?? true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(product?.modifierGroupIds ?? []);
  const [recipe, setRecipe] = useState<RecipeIngredient[]>(product?.recipe ?? []);

  function toggleRecipeItem(inventoryItemId: string) {
    setRecipe((prev) => {
      const existing = prev.find((r) => r.inventoryItemId === inventoryItemId);
      if (existing) return prev.filter((r) => r.inventoryItemId !== inventoryItemId);
      return [...prev, { inventoryItemId, quantity: 1 }];
    });
  }
  function updateRecipeQty(inventoryItemId: string, quantity: number) {
    setRecipe((prev) => prev.map((r) => (r.inventoryItemId === inventoryItemId ? { ...r, quantity } : r)));
  }

  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  }

  function handleSave() {
    if (!name.trim() || !categoryId || price <= 0) return;
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      price,
      cost: cost || undefined,
      categoryId,
      image: image.trim() || undefined,
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      available,
      modifierGroupIds: selectedGroupIds,
      recipe: recipe.length ? recipe : undefined,
    };
    if (isEdit && product) updateProduct(product.id, payload);
    else addProduct(payload);
    onClose();
  }

  return (
    <Modal
      title={isEdit ? `تعديل ${product?.name}` : 'إضافة صنف جديد'}
      onClose={onClose}
      footer={
        <button
          onClick={handleSave}
          disabled={!name.trim() || !categoryId || price <= 0 || uploading}
          className="w-full rounded-xl bg-pos-navy-900 py-3.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {isEdit ? 'حفظ التعديلات' : 'إضافة الصنف'}
        </button>
      }
    >
      <div className="space-y-4">
        <Field label="اسم الصنف *">
          <input value={name} onChange={(e) => setName(e.target.value)} className="pos-input" />
        </Field>

        <Field label="وصف مختصر">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="pos-input resize-none" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`السعر (${CURRENCY}) *`}>
            <input type="number" value={price || ''} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="pos-input" />
          </Field>
          <Field label={`التكلفة (${CURRENCY})`}>
            <input type="number" value={cost || ''} onChange={(e) => setCost(Number(e.target.value) || 0)} className="pos-input" />
          </Field>
        </div>

        {price > 0 && cost > 0 && (
          <p className="text-[11px] text-pos-text-soft">
            الربح المتوقع: <span className="font-bold text-pos-success">{profit.toFixed(2)} {CURRENCY}</span> — هامش {margin.toFixed(0)}%
          </p>
        )}

        <Field label="التصنيف *">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="pos-input">
            {SELECTABLE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="صورة الصنف (اختياري)">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          {image ? (
            <div className="relative">
              <img src={image} alt="معاينة الصنف" className="h-36 w-full rounded-xl border border-pos-border object-cover" />
              <button
                type="button"
                onClick={() => setImage('')}
                className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 w-full rounded-lg border border-pos-border py-2 text-xs font-bold text-pos-text"
              >
                تغيير الصورة
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-pos-border text-pos-text-soft disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-xs">جاري تجهيز الصورة...</span>
                </>
              ) : (
                <>
                  <ImagePlus size={22} />
                  <span className="text-xs font-semibold">دوسي لاختيار صورة من الجهاز</span>
                </>
              )}
            </button>
          )}
          {uploadError && <p className="mt-1.5 text-[11px] font-semibold text-pos-danger">{uploadError}</p>}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU (اختياري)">
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="pos-input" />
          </Field>
          <Field label="Barcode (اختياري)">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="pos-input" />
          </Field>
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold text-pos-text">مجموعات التعديلات (Modifiers) المرتبطة</label>
          <div className="flex flex-wrap gap-2">
            {modifierGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  selectedGroupIds.includes(g.id) ? 'border-pos-accent bg-pos-accent/10 text-pos-accent' : 'border-pos-border text-pos-text-soft'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold text-pos-text">الوصفة (المواد الخام المستهلكة عند البيع)</label>
          <div className="space-y-1.5">
            {inventoryItems.map((inv) => {
              const line = recipe.find((r) => r.inventoryItemId === inv.id);
              return (
                <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-pos-border p-2">
                  <input
                    type="checkbox"
                    checked={!!line}
                    onChange={() => toggleRecipeItem(inv.id)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="flex-1 text-xs font-semibold text-pos-text">{inv.name}</span>
                  {line && (
                    <input
                      type="number"
                      value={line.quantity || ''}
                      onChange={(e) => updateRecipeQty(inv.id, Number(e.target.value) || 0)}
                      placeholder={inv.unit}
                      className="w-20 rounded-md border border-pos-border px-2 py-1 text-xs"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-pos-border p-3">
          <span className="text-sm font-semibold text-pos-text">متوفر حالياً</span>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="h-5 w-5" />
        </label>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-pos-text">{label}</label>
      {children}
    </div>
  );
}
