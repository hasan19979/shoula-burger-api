import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useCategoriesStore } from './store/categoriesStore';
import { useProductsStore } from './store/productsStore';
import { useModifierGroupsStore } from './store/modifierGroupsStore';
import { useInventoryStore } from './store/inventoryStore';
import { useSettingsStore } from './store/settingsStore';
import { defaultPageFor } from './utils/permissions';
import AppSidebar, { type AppPage } from './components/layout/AppSidebar';
import MobileNav from './components/layout/MobileNav';
import LoginScreen from './components/auth/LoginScreen';
import POSPage from './pages/POSPage';
import OrdersPage from './pages/OrdersPage';
import TablesPage from './pages/TablesPage';
import WhatsAppOrdersPage from './pages/WhatsAppOrdersPage';
import ReportsPage from './pages/ReportsPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import ModifiersPage from './pages/ModifiersPage';
import StaffPage from './pages/StaffPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import { usePrinterStationAutoPrint } from './hooks/usePrinterStationAutoPrint';
import { usePrintCoordinator } from './store/printCoordinator';
import PrintStationTicket from './components/receipt/PrintStationTicket';
import ReceiptPrintable from './components/receipt/ReceiptPrintable';
import GlobalKeyboard from './components/keyboard/GlobalKeyboard';
import KeyboardDebugButton from './components/keyboard/KeyboardDebugButton';

function App() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const [page, setPage] = useState<AppPage>('pos');
  usePrinterStationAutoPrint(); // شغّالة دايماً — بغض النظر أي شاشة مفتوحة
  const printJob = usePrintCoordinator((s) => s.job); // مكان الطباعة الوحيد بكل التطبيق — يستحيل يصير فاتورتين بنفس اللحظة

  const fetchCategories = useCategoriesStore((s) => s.fetchCategories);
  const fetchProducts = useProductsStore((s) => s.fetchProducts);
  const fetchGroups = useModifierGroupsStore((s) => s.fetchGroups);
  const fetchInventory = useInventoryStore((s) => s.fetchItems);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  // بيانات المنيو (فئات/منتجات/تعديلات/مخزون) عامة — تُجاب من السيرفر الحقيقي فور فتح التطبيق، حتى قبل تسجيل الدخول
  useEffect(() => {
    fetchCategories();
    fetchProducts();
    fetchGroups();
    fetchInventory();
    fetchSettings();
  }, [fetchCategories, fetchProducts, fetchGroups, fetchInventory, fetchSettings]);

  // لما توظف/يبدّل دخول مستخدم جديد، وجّهيها لأول شاشة مسموحة لدورها
  useEffect(() => {
    if (currentUser) setPage(defaultPageFor(currentUser.role));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <>
        <LoginScreen />
        {printJob?.type === 'broadcast' && <PrintStationTicket order={printJob.order} />}
        {printJob?.type === 'payment' && <ReceiptPrintable {...printJob} />}
        <GlobalKeyboard />
        <KeyboardDebugButton />
      </>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-pos-bg" dir="rtl">
      <AppSidebar activePage={page} onNavigate={setPage} />

      {/* على الموبايل بنحجز مساحة تحت (pb-16) حتى الشريط السفلي الثابت ما يغطي محتوى الصفحة */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {page === 'pos' && <POSPage />}
        {page === 'orders' && <OrdersPage />}
        {page === 'tables' && <TablesPage onGoToOrder={() => setPage('pos')} />}
        {page === 'whatsapp-orders' && <WhatsAppOrdersPage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'products' && <ProductsPage />}
        {page === 'inventory' && <InventoryPage />}
        {page === 'modifiers' && <ModifiersPage />}
        {page === 'staff' && <StaffPage />}
        {page === 'customers' && <CustomersPage />}
        {page === 'suppliers' && <SuppliersPage />}
      </div>

      <MobileNav activePage={page} onNavigate={setPage} />
      {printJob?.type === 'broadcast' && <PrintStationTicket order={printJob.order} />}
      {printJob?.type === 'payment' && <ReceiptPrintable {...printJob} />}
      <GlobalKeyboard />
      <KeyboardDebugButton />
    </div>
  );
}

export default App;
