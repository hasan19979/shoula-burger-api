import { useState } from 'react';
import { Search, Phone, MapPin, User } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useCustomersStore, type AddressHistory } from '../../store/customersStore';
import KeyboardInput from '../keyboard/KeyboardInput';

export default function CustomerInfoBar() {
  const { orderType, customerPhone, customerName, deliveryAddress, setCustomerPhone, setCustomerName, setDeliveryAddress } = useCartStore();
  const fetchAddressHistory = useCustomersStore((s) => s.fetchAddressHistory);
  const [addressHistory, setAddressHistory] = useState<AddressHistory | null>(null);
  const [searching, setSearching] = useState(false);

  if (orderType === 'dine-in') return null;

  async function handleSearch() {
    if (!customerPhone.trim()) return;
    setSearching(true);
    const result = await fetchAddressHistory(customerPhone.trim());
    setAddressHistory(result);
    if (result.name && !customerName.trim()) setCustomerName(result.name);
    if (result.addresses.length > 0 && !deliveryAddress.trim()) setDeliveryAddress(result.addresses[0]);
    setSearching(false);
  }

  return (
    <div className="border-b border-pos-border bg-pos-bg px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-lg border border-pos-border bg-pos-surface px-3 py-2">
          <Phone size={14} className="shrink-0 text-pos-text-soft" />
          <KeyboardInput
            value={customerPhone}
            onChange={setCustomerPhone}
            mode="numeric"
            placeholder="رقم جوال الزبون"
            className="w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !customerPhone.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-pos-navy-900 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          <Search size={13} /> {searching ? 'جاري البحث...' : 'بحث'}
        </button>
        <div className="flex min-w-[140px] flex-1 items-center gap-1.5 rounded-lg border border-pos-border bg-pos-surface px-3 py-2">
          <User size={14} className="shrink-0 text-pos-text-soft" />
          <KeyboardInput
            value={customerName}
            onChange={setCustomerName}
            mode="text"
            placeholder="اسم الزبون (اختياري)"
            className="w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {addressHistory && orderType !== 'delivery' && (
        <p className="mt-2 text-[11px] text-pos-text-soft">
          {addressHistory.name ? `✓ تم البحث — الاسم: ${addressHistory.name}` : '✓ تم البحث — ما في بيانات سابقة لهاد الرقم'}
        </p>
      )}

      {orderType === 'delivery' && (
        <div className="mt-2.5">
          {addressHistory && addressHistory.addresses.length > 0 && (
            <>
              <p className="mb-1.5 text-[11px] font-semibold text-pos-success">
                ✓ لقينا {addressHistory.addresses.length} عنوان سابق لهاد الرقم — دوسي لاختيار وحد
              </p>
              <div className="pos-scroll mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {addressHistory.addresses.map((addr) => (
                  <button
                    key={addr}
                    onClick={() => setDeliveryAddress(addr)}
                    className={`shrink-0 max-w-[220px] truncate rounded-lg border px-3 py-1.5 text-[11.5px] ${
                      deliveryAddress === addr ? 'border-pos-accent bg-pos-accent/10 font-bold text-pos-accent' : 'border-pos-border bg-pos-surface text-pos-text-soft'
                    }`}
                    title={addr}
                  >
                    {addr}
                  </button>
                ))}
              </div>
            </>
          )}
          {addressHistory && addressHistory.addresses.length === 0 && (
            <p className="mb-1.5 text-[11px] text-pos-text-soft">ما في عناوين سابقة مسجّلة لهاد الرقم — اكتبي العنوان يدوياً تحت</p>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border border-pos-border bg-pos-surface px-3 py-2">
            <MapPin size={14} className="shrink-0 text-pos-accent" />
            <KeyboardInput
              value={deliveryAddress}
              onChange={setDeliveryAddress}
              mode="text"
              placeholder="عنوان التوصيل — الحي، الشارع، أقرب معلم *"
              className="w-full bg-transparent text-sm focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
