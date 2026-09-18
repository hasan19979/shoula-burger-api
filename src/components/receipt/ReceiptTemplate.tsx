import { UtensilsCrossed, ShoppingBag, Bike } from 'lucide-react';
import type { ReceiptData, ReceiptOrderType } from '../../types/receipt';

const TYPE_LABEL: Record<ReceiptOrderType, string> = {
  'dine-in': 'داخل المطعم',
  takeaway: 'سفري',
  pickup: 'سفري',
  delivery: 'طلب توصيل',
};
const TYPE_ICON: Record<ReceiptOrderType, React.ElementType> = {
  'dine-in': UtensilsCrossed,
  takeaway: ShoppingBag,
  pickup: ShoppingBag,
  delivery: Bike,
};

function fmt(n: number) {
  return n.toFixed(2);
}

interface Props {
  data: ReceiptData;
}

/**
 * القالب الوحيد لكل الفواتير المطبوعة بالنظام (فاتورة الزبون، تذكرة طلبات الواتساب، تذكرة جهاز
 * الطباعة) — نفس التصميم بالضبط بكل مكان. مصمم لطابعة حرارية 58مم، أبيض وأسود، RTL بالكامل.
 */
export default function ReceiptTemplate({ data }: Props) {
  const date = new Date(data.createdAt);
  const TypeIcon = TYPE_ICON[data.orderType];
  const totalQuantity = data.items.reduce((sum, i) => sum + i.quantity, 0);
  const itemCount = data.items.length;

  const hasCustomerSection =
    data.orderType === 'delivery' &&
    data.customer &&
    (data.customer.name || data.customer.phone || data.customer.address);

  const change = data.paidAmount !== undefined ? data.paidAmount - data.total : null;

  return (
    <div id="receipt-printable" className="receipt-printable">
      {/* رأس الفاتورة */}
      <div className="r-center">
        <div className="r-name">{data.restaurantName}</div>
        {data.tagline && <div className="r-tagline">{data.tagline}</div>}
        {data.restaurantPhone && <div className="r-phone">{data.restaurantPhone}</div>}
      </div>

      <div className="r-divider" />

      {/* رقم الطلب — أهم عنصر بالفاتورة */}
      <div className="r-center">
        <div className="r-order-number">طلب #{data.orderNumber}</div>
        <div className="r-datetime">
          {date.toLocaleDateString('ar-EG')} — {date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* نوع الطلب */}
      <div className="r-type-box">
        <TypeIcon size={20} strokeWidth={2.2} />
        <span>{TYPE_LABEL[data.orderType]}</span>
        {data.orderType === 'dine-in' && data.tableNumber && <span className="r-table-badge">طاولة {data.tableNumber}</span>}
      </div>

      {/* بيانات العميل — طلبات التوصيل بس */}
      {hasCustomerSection && (
        <>
          <div className="r-divider" />
          <div className="r-customer">
            {data.customer?.name && (
              <div className="r-customer-row">
                <span className="r-customer-label">اسم العميل:</span> {data.customer.name}
              </div>
            )}
            {data.customer?.phone && (
              <div className="r-customer-row">
                <span className="r-customer-label">الهاتف:</span> {data.customer.phone}
              </div>
            )}
            {data.customer?.address && (
              <div className="r-customer-row">
                <span className="r-customer-label">العنوان:</span> {data.customer.address}
              </div>
            )}
          </div>
        </>
      )}

      <div className="r-divider" />

      {/* جدول الأصناف */}
      <div className="r-table-header">
        <span className="r-col-check" />
        <span className="r-col-name">الصنف</span>
        <span className="r-col-qty">الكمية</span>
        <span className="r-col-price">السعر</span>
        <span className="r-col-total">المجموع</span>
      </div>

      {data.items.map((item) => (
        <div key={`${item.productKey}-${item.notes.join('|')}`} className="r-item-row">
          <span className="r-checkbox" />
          <span className="r-item-main">
            <span className="r-item-name">{item.productName}</span>
            {item.notes.length > 0 && <span className="r-item-notes">{item.notes.join(' • ')}</span>}
          </span>
          <span className="r-col-qty r-item-qty">{item.quantity}</span>
          <span className="r-col-price r-item-price">{fmt(item.unitPrice)}</span>
          <span className="r-col-total r-item-linetotal">{fmt(item.lineTotal)}</span>
        </div>
      ))}

      <div className="r-divider" />

      {/* مجموع الكميات */}
      <div className="r-qty-box">
        <span>مجموع الكميات: {totalQuantity}</span>
        <span className="r-qty-box-sub">عدد الأصناف: {itemCount}</span>
      </div>

      {/* الحسابات */}
      <div className="r-totals">
        <div className="r-row">
          <span>المجموع الفرعي</span>
          <span>{fmt(data.subtotal)} {data.currency}</span>
        </div>
        {!!data.deliveryFee && data.deliveryFee > 0 && (
          <div className="r-row">
            <span>رسوم التوصيل</span>
            <span>{fmt(data.deliveryFee)} {data.currency}</span>
          </div>
        )}
        {!!data.discount && data.discount > 0 && (
          <div className="r-row">
            <span>الخصم</span>
            <span>-{fmt(data.discount)} {data.currency}</span>
          </div>
        )}
        <div className="r-row r-total-final">
          <span>الإجمالي</span>
          <span>{fmt(data.total)} {data.currency}</span>
        </div>
      </div>

      {/* الدفع — بس لو معروف فعلياً */}
      {data.paidAmount !== undefined && (
        <>
          <div className="r-row">
            <span>المدفوع</span>
            <span>{fmt(data.paidAmount)} {data.currency}</span>
          </div>
          {change !== null && Math.abs(change) > 0.001 && (
            <div className="r-row r-bold">
              <span>{change > 0 ? 'الباقي للزبون' : 'المتبقي على العميل'}</span>
              <span>{fmt(Math.abs(change))} {data.currency}</span>
            </div>
          )}
        </>
      )}

      <div className="r-divider" />

      {/* التذييل */}
      <div className="r-center r-footer">
        {data.tagline && <div className="r-tagline">{data.tagline}</div>}
        <div className="r-thanks">شكراً لزيارتكم ♥</div>
      </div>
    </div>
  );
}
