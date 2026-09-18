import { useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Receipt, Percent, Ban } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useOrdersStore } from '../store/ordersStore';
import { useProductsStore } from '../store/productsStore';
import { useCategoriesStore } from '../store/categoriesStore';
import { CURRENCY } from '../data/demoData';
import {
  filterOrdersByRange,
  computeSummary,
  computeProductSales,
  computeCategorySales,
  computePaymentMethodBreakdown,
  computeCashierSales,
  RANGE_LABELS,
  type ReportRange,
} from '../utils/reports';
import type { PaymentMethod } from '../types';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  wallet: 'محفظة',
  'bank-transfer': 'تحويل',
  other: 'أخرى',
};

const PIE_COLORS = ['#2f6fed', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6'];

export default function ReportsPage() {
  const { orders, fetchOrders } = useOrdersStore();
  const products = useProductsStore((s) => s.products);
  const categories = useCategoriesStore((s) => s.categories);
  const [range, setRange] = useState<ReportRange>('today');

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = useMemo(() => filterOrdersByRange(orders, range), [orders, range]);
  const summary = useMemo(() => computeSummary(filtered), [filtered]);
  const productSales = useMemo(() => computeProductSales(filtered).slice(0, 8), [filtered]);
  const categorySales = useMemo(() => computeCategorySales(filtered, products, categories), [filtered, products, categories]);
  const paymentBreakdown = useMemo(() => computePaymentMethodBreakdown(filtered), [filtered]);
  const cashierSales = useMemo(() => computeCashierSales(filtered), [filtered]);

  const categoryChartData = categorySales.map((c) => ({
    name: c.categoryName,
    revenue: Number(c.revenue.toFixed(2)),
  }));
  const paymentChartData = paymentBreakdown.map((p) => ({ name: METHOD_LABEL[p.method], value: Number(p.total.toFixed(2)) }));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <BarChart3 size={18} />
          التقارير
        </h1>
        <div className="flex gap-1.5 rounded-xl border border-pos-border bg-pos-bg p-1">
          {(Object.keys(RANGE_LABELS) as ReportRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                range === r ? 'bg-pos-navy-900 text-white' : 'text-pos-text-soft'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        {/* بطاقات الملخص */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard icon={TrendingUp} label="المبيعات" value={`${summary.totalSales.toFixed(2)} ${CURRENCY}`} color="text-pos-success" />
          <SummaryCard icon={Receipt} label="عدد الطلبات" value={String(summary.orderCount)} color="text-pos-accent" />
          <SummaryCard
            icon={BarChart3}
            label="متوسط قيمة الطلب"
            value={`${summary.averageOrderValue.toFixed(2)} ${CURRENCY}`}
            color="text-pos-navy-900"
          />
          <SummaryCard icon={Percent} label="إجمالي الخصومات" value={`${summary.totalDiscounts.toFixed(2)} ${CURRENCY}`} color="text-pos-warning" />
          <SummaryCard icon={Ban} label="طلبات ملغاة" value={`${summary.cancelledCount} (${summary.cancelledValue.toFixed(0)} ${CURRENCY})`} color="text-pos-danger" />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* أكثر المنتجات مبيعاً */}
          <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-pos-text">أكثر المنتجات مبيعاً</h2>
            {productSales.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={productSales} layout="vertical" margin={{ right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e3e8ef" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="productName" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${Number(v)} قطعة`, 'الكمية']} />
                  <Bar dataKey="quantity" fill="#2f6fed" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* المبيعات حسب طريقة الدفع */}
          <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-pos-text">المبيعات حسب طريقة الدفع</h2>
            {paymentChartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(d) => `${d.name}`}>
                    {paymentChartData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${Number(v).toFixed(2)} ${CURRENCY}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* المبيعات حسب التصنيف */}
          <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-pos-text">المبيعات حسب التصنيف</h2>
            {categoryChartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(2)} ${CURRENCY}`} />
                  <Bar dataKey="revenue" fill="#16a34a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* المبيعات حسب الكاشير */}
          <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-pos-text">المبيعات حسب الكاشير</h2>
            {cashierSales.length === 0 ? (
              <EmptyChart />
            ) : (
              <div className="space-y-2">
                {cashierSales.map((c) => (
                  <div key={c.cashierName} className="flex items-center justify-between rounded-xl bg-pos-bg p-3 text-sm">
                    <span className="font-semibold text-pos-text">{c.cashierName}</span>
                    <span className="text-xs text-pos-text-soft">{c.orderCount} طلب</span>
                    <span className="font-bold text-pos-navy-900">{c.total.toFixed(2)} {CURRENCY}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
      <Icon size={18} className={color} />
      <p className="mt-2 text-lg font-extrabold text-pos-text">{value}</p>
      <p className="text-[11px] text-pos-text-soft">{label}</p>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-40 items-center justify-center text-xs text-pos-text-soft">ما في بيانات كافية بهاي الفترة</div>;
}
