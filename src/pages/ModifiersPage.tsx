import { useState } from 'react';
import { Layers, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useModifierGroupsStore } from '../store/modifierGroupsStore';
import { CURRENCY } from '../data/demoData';
import type { ModifierGroup } from '../types';
import ModifierGroupFormModal from '../components/modifiers/ModifierGroupFormModal';

export default function ModifiersPage() {
  const { groups, deleteGroup, addOption, updateOption, deleteOption } = useModifierGroupsStore();
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null | undefined>(undefined);
  const [newOptionDrafts, setNewOptionDrafts] = useState<Record<string, { name: string; price: string }>>({});

  function handleDeleteGroup(group: ModifierGroup) {
    if (confirm(`متأكدة من حذف مجموعة "${group.name}"؟ (لازم تشيليها من أي منتج مربوطة فيه أولاً)`)) deleteGroup(group.id);
  }

  function getDraft(groupId: string) {
    return newOptionDrafts[groupId] ?? { name: '', price: '' };
  }
  function setDraft(groupId: string, patch: Partial<{ name: string; price: string }>) {
    setNewOptionDrafts((prev) => ({ ...prev, [groupId]: { ...getDraft(groupId), ...patch } }));
  }
  function handleAddOption(groupId: string) {
    const draft = getDraft(groupId);
    if (!draft.name.trim()) return;
    addOption(groupId, { name: draft.name.trim(), price: Number(draft.price) || 0, defaultIncluded: false });
    setNewOptionDrafts((prev) => ({ ...prev, [groupId]: { name: '', price: '' } }));
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <Layers size={18} />
          مجموعات التعديلات (Modifiers)
        </h1>
        <button onClick={() => setEditingGroup(null)} className="flex items-center gap-1.5 rounded-lg bg-pos-accent px-3.5 py-2 text-xs font-bold text-white">
          <Plus size={14} /> مجموعة جديدة
        </button>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <div key={group.id} className="rounded-2xl border border-pos-border bg-pos-surface p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-pos-text">{group.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{group.selectionType === 'single' ? 'اختيار واحد' : 'اختيار متعدد'}</Badge>
                    {group.required && <Badge danger>إجباري</Badge>}
                    <Badge>الحد: {group.min}-{group.max}</Badge>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setEditingGroup(group)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-border text-pos-text">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDeleteGroup(group)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-danger/30 text-pos-danger">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {group.options.map((opt) => (
                  <div key={opt.id} className="flex items-center gap-2 rounded-lg bg-pos-bg p-2">
                    <span className="flex-1 text-xs font-semibold text-pos-text">{opt.name}</span>
                    <input
                      type="number"
                      value={opt.price || ''}
                      onChange={(e) => updateOption(group.id, opt.id, { price: Number(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-16 rounded-md border border-pos-border px-2 py-1 text-xs"
                    />
                    <span className="text-[10px] text-pos-text-soft">{CURRENCY}</span>
                    <button onClick={() => deleteOption(group.id, opt.id)} className="text-pos-danger">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  value={getDraft(group.id).name}
                  onChange={(e) => setDraft(group.id, { name: e.target.value })}
                  placeholder="اسم خيار جديد..."
                  className="flex-1 rounded-lg border border-dashed border-pos-border px-2.5 py-1.5 text-xs"
                />
                <input
                  type="number"
                  value={getDraft(group.id).price}
                  onChange={(e) => setDraft(group.id, { price: e.target.value })}
                  placeholder="السعر"
                  className="w-16 rounded-lg border border-dashed border-pos-border px-2 py-1.5 text-xs"
                />
                <button onClick={() => handleAddOption(group.id)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-pos-accent text-white">
                  <Plus size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingGroup !== undefined && <ModifierGroupFormModal group={editingGroup} onClose={() => setEditingGroup(undefined)} />}
    </div>
  );
}

function Badge({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${danger ? 'bg-pos-danger/10 text-pos-danger' : 'bg-pos-bg text-pos-text-soft'}`}>
      {children}
    </span>
  );
}
