import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  Search, 
  Plus, 
  Filter, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  Building2, 
  ArrowRight,
  Package,
  Layers,
  PieChart,
  Boxes,
  AlertTriangle,
  FileCheck,
  Check,
  Share2,
  FileText,
  Printer,
  TrendingUp,
  Tag,
  Hash,
  Send,
  Sparkles,
  Save,
  RotateCcw,
  ArrowDownToLine,
  ArrowUpFromLine
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PurchaseOrder, POStatus, FilterCategory, PurchaseOrderItem, ProjectDispatchRecord } from '../types/procurement';
import { STATUS_META } from './PoDetailModal';
import { safeLocalStorageGet } from '../services/storage';

interface TrackerTabProps {
  orders: PurchaseOrder[];
  onAdvanceStatus: (poId: string, nextStatus: POStatus, note?: string) => void;
  onOpenPoDetail: (po: PurchaseOrder) => void;
  onCreateManualPo: (po: Partial<PurchaseOrder>) => void;
  onUpdateItemReceiving?: (poId: string, itemIdx: number, receivedQty: number, voucherNo: string, notes: string) => void;
  onDispatchToProject?: (poId: string, itemIdx: number, record: ProjectDispatchRecord) => void;
}

export const TrackerTab: React.FC<TrackerTabProps> = ({
  orders,
  onAdvanceStatus,
  onOpenPoDetail,
  onCreateManualPo,
  onUpdateItemReceiving,
  onDispatchToProject
}) => {
  // Main Sub-Tab selection
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'orders' | 'receiving_9004' | 'dispatch_projects'>('dashboard');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');

  // Receiving inline edit state: map of `poId-itemIdx` -> { receivedQty, voucherNo, notes }
  const [receivingInputs, setReceivingInputs] = useState<Record<string, { receivedQty: number; voucherNo: string; notes: string }>>({});

  // Dispatch modal / form state
  const [dispatchModalItem, setDispatchModalItem] = useState<{ po: PurchaseOrder; item: PurchaseOrderItem; itemIdx: number } | null>(null);
  const [dispatchQty, setDispatchQty] = useState<number>(1);
  const [dispatchVoucher, setDispatchVoucher] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');

  // Manual PO Form Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newValue, setNewValue] = useState<number>(0);
  const [newRfqCode, setNewRfqCode] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Real Registered SIAC Projects & Stores list
  const registeredProjects = useMemo(() => {
    const saved = safeLocalStorageGet<any[]>('siac_custom_projects_stores', []);
    if (saved && saved.length > 0) return saved;
    return [
      { id: 'proj-9004', store_code: '9004', project_name: 'المخزن المركزي 9004 (قطع الغيار والفلاتر)' },
      { id: 'proj-9012', store_code: '9012', project_name: 'مشروع قطاع الكباري والمونوريل' },
      { id: 'proj-9021', store_code: '9021', project_name: 'مشروع محطة معالجة الصرف والتحلية' },
      { id: 'proj-9055', store_code: '9055', project_name: 'مشروع القطار الكهربائي السريع' }
    ];
  }, []);

  const [dispatchProject, setDispatchProject] = useState(() => {
    return registeredProjects[0]?.project_name || 'المخزن المركزي 9004';
  });

  // ==========================================
  // DASHBOARD DYNAMIC CALCULATIONS & METRICS
  // ==========================================
  const dashboardStats = useMemo(() => {
    let totalValue = 0;
    let totalPieces = 0;
    let totalReceivedPieces = 0;

    const categoryStats: Record<FilterCategory, { count: number; pieces: number; value: number }> = {
      'أصلي': { count: 0, pieces: 0, value: 0 },
      'هاي كوبي': { count: 0, pieces: 0, value: 0 },
      'صناعة محلي': { count: 0, pieces: 0, value: 0 }
    };

    const filterTypeStats: Record<string, { pieces: number; value: number; count: number }> = {};
    const supplierStats: Record<string, { poCount: number; pieces: number; value: number; receivedPieces: number }> = {};

    orders.forEach(po => {
      totalValue += po.total_value;

      if (!supplierStats[po.supplier]) {
        supplierStats[po.supplier] = { poCount: 0, pieces: 0, value: 0, receivedPieces: 0 };
      }
      supplierStats[po.supplier].poCount += 1;
      supplierStats[po.supplier].value += po.total_value;

      po.items.forEach(item => {
        const qty = item.qty || 0;
        const total = item.total || (qty * item.unit_price) || 0;
        const rec = item.received_qty || 0;

        totalPieces += qty;
        totalReceivedPieces += rec;
        supplierStats[po.supplier].pieces += qty;
        supplierStats[po.supplier].receivedPieces += rec;

        // Category breakdown
        const cat = item.category || 'أصلي';
        if (categoryStats[cat]) {
          categoryStats[cat].count += 1;
          categoryStats[cat].pieces += qty;
          categoryStats[cat].value += total;
        }

        // Filter Type breakdown
        const ftype = item.filter_type || 'فلتر';
        if (!filterTypeStats[ftype]) {
          filterTypeStats[ftype] = { pieces: 0, value: 0, count: 0 };
        }
        filterTypeStats[ftype].pieces += qty;
        filterTypeStats[ftype].value += total;
        filterTypeStats[ftype].count += 1;
      });
    });

    const receivingPercentage = totalPieces > 0 ? Math.round((totalReceivedPieces / totalPieces) * 100) : 0;

    return {
      totalValue,
      totalPieces,
      totalReceivedPieces,
      receivingPercentage,
      categoryStats,
      filterTypeStats,
      supplierStats
    };
  }, [orders]);

  // Handle saving receiving info in Store 9004
  const handleSaveReceiving = (poId: string, itemIdx: number, orderedQty: number) => {
    const key = `${poId}-${itemIdx}`;
    const input = receivingInputs[key] || { receivedQty: orderedQty, voucherNo: '', notes: '' };
    
    if (onUpdateItemReceiving) {
      onUpdateItemReceiving(poId, itemIdx, input.receivedQty, input.voucherNo, input.notes);
    }

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    alert(`✅ تم تسجيل استلام (${input.receivedQty} من ${orderedQty} قطعة) في المخزن 9004 بنجاح!`);
  };

  // Quick 100% Receiving
  const handleQuickFullReceive = (poId: string, itemIdx: number, orderedQty: number) => {
    const key = `${poId}-${itemIdx}`;
    const voucher = receivingInputs[key]?.voucherNo || `REC-9004-${Date.now().toString().slice(-4)}`;
    const notes = receivingInputs[key]?.notes || 'تم الاستلام بالكامل مطابق للمواصفات';

    setReceivingInputs(prev => ({
      ...prev,
      [key]: { receivedQty: orderedQty, voucherNo: voucher, notes }
    }));

    if (onUpdateItemReceiving) {
      onUpdateItemReceiving(poId, itemIdx, orderedQty, voucher, notes);
    }
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
  };

  // Handle Dispatch to Project submit
  const handleDispatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalItem) return;

    const { po, item, itemIdx } = dispatchModalItem;
    const availableIn9004 = (item.received_qty || 0) - (item.dispatches?.reduce((sum, d) => sum + d.qty, 0) || 0);

    if (dispatchQty <= 0 || dispatchQty > availableIn9004) {
      alert(`⚠️ الكمية المصروفة يجب أن تكون بين 1 و ${availableIn9004} قطعة (المتاحة حالياً بالمخزن)`);
      return;
    }

    const record: ProjectDispatchRecord = {
      id: `disp-${Date.now()}`,
      project: dispatchProject,
      qty: dispatchQty,
      voucher_no: dispatchVoucher.trim() || `DISP-${Date.now().toString().slice(-4)}`,
      dispatched_at: new Date().toLocaleString('ar-EG'),
      notes: dispatchNotes.trim()
    };

    if (onDispatchToProject) {
      onDispatchToProject(po.id, itemIdx, record);
    }

    confetti({ particleCount: 70, spread: 80 });
    setDispatchModalItem(null);
    setDispatchQty(1);
    setDispatchVoucher('');
    setDispatchNotes('');
    alert(`🚚 تم صرف ${record.qty} قطعة لـ (${record.project}) بنجاح بموجب إذن صرف رقم: ${record.voucher_no}`);
  };

  // Filtered Orders for table
  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.rfq_code && o.rfq_code.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = selectedStatus === 'all' || o.status === selectedStatus;
    const matchesSupplier = selectedSupplierFilter === 'all' || o.supplier === selectedSupplierFilter;
    return matchesSearch && matchesStatus && matchesSupplier;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newSupplier) return;

    onCreateManualPo({
      title: newTitle,
      supplier: newSupplier,
      total_value: newValue,
      rfq_code: newRfqCode,
      notes: newNotes
    });

    setShowCreateModal(false);
    setNewTitle('');
    setNewSupplier('');
    setNewValue(0);
    setNewRfqCode('');
    setNewNotes('');
  };

  // If no POs yet, show empty call to action
  if (orders.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-xl space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Truck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900">لم يتم إصدار أوامر شراء (POs) بعد</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
            بعد استلام عروض الموردين، توجه إلى تبويب <strong>"مقارنة العروض والترسية"</strong> واضغط على زر <strong>"🏆 ترسية جماعية شاملة للفائزين"</strong>، وسيتم توليد أوامر الشراء لكل مورد وتفعيل الداشبورد ومخزن 9004 تلقائياً!
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء أمر شراء يدوي</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Top Main Navigation Sub-Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'dashboard'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>📊 لوحة مؤشرات الترسية وأوامر الشراء (Dashboard)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('receiving_9004')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'receiving_9004'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-slate-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-50'
            }`}
          >
            <ArrowDownToLine className="w-4 h-4 text-emerald-500" />
            <span>🏭 الاستلام في المخزن المركزي 9004 ({dashboardStats.receivingPercentage}%)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('dispatch_projects')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'dispatch_projects'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-slate-50 text-amber-800 border border-amber-200/60 hover:bg-amber-50'
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4 text-amber-500" />
            <span>🚚 الصرف والتخصيص لمواقع المشروعات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('orders')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'orders'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>📋 سجل أوامر الشراء ({orders.length} أوامر)</span>
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm mr-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ أمر شراء جديد</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUB-TAB 1: DYNAMIC COLOR-CODED DASHBOARD (طلب المستخدم) */}
      {/* ======================================================== */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Main Financial & Qty KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total PO Value Card */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-5 rounded-2xl border border-blue-900/50 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-300">إجمالي قيمة أوامر الشراء</span>
                <span className="p-2 rounded-xl bg-blue-600/30 text-blue-300 border border-blue-400/30">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-white font-mono mt-2">
                {dashboardStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
              </div>
              <div className="text-[11px] text-slate-300 mt-2 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>موزعة على <strong>{orders.length} أوامر شراء</strong> رسمية</span>
              </div>
            </div>

            {/* Total Filter Pieces Card */}
            <div className="bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 text-white p-5 rounded-2xl border border-purple-800/50 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300">إجمالي عدد الفلاتر المطلوبة</span>
                <span className="p-2 rounded-xl bg-purple-600/30 text-purple-300 border border-purple-400/30">
                  <Boxes className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-purple-200 font-mono mt-2">
                {dashboardStats.totalPieces.toLocaleString('en-US')} <span className="text-xs font-normal font-sans">قطعة فلتر</span>
              </div>
              <div className="text-[11px] text-purple-300/80 mt-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>تمت الترسية من واقع عروض الموردين الفائزة</span>
              </div>
            </div>

            {/* Store 9004 Receiving Progress Card */}
            <div className="bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-900 text-white p-5 rounded-2xl border border-emerald-800/50 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300">معدل الاستلام بمخزن 9004</span>
                <span className="p-2 rounded-xl bg-emerald-600/30 text-emerald-300 border border-emerald-400/30">
                  <ArrowDownToLine className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-300 font-mono mt-2">
                {dashboardStats.receivingPercentage}% <span className="text-xs font-normal font-sans">({dashboardStats.totalReceivedPieces} من {dashboardStats.totalPieces})</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-emerald-950 rounded-full h-2 mt-2 border border-emerald-800/60 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full transition-all duration-700"
                  style={{ width: `${dashboardStats.receivingPercentage}%` }}
                ></div>
              </div>
            </div>

            {/* Total Suppliers Count Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">الموردين الذين صدرت لهم أوامر</span>
                <span className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <Building2 className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono mt-1">
                {Object.keys(dashboardStats.supplierStats).length} <span className="text-xs font-normal font-sans">موردين فائزين</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                يمكن متابعة استلام كل مورد من تبويب مخزن 9004
              </div>
            </div>
          </div>

          {/* DYNAMIC CATEGORY BREAKDOWN CARDS (أصلي / هاي كوبي / محلي) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  توزيع الفلاتر حسب الفئة والجودة (Original vs High Copy vs Local)
                </h3>
              </div>
              <span className="text-xs text-slate-400">إجمالي الفلاتر: {dashboardStats.totalPieces} قطعة</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. ORIGINAL CARD (Green) */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border-2 border-emerald-300 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 bg-emerald-100/90 border border-emerald-300 px-3 py-1 rounded-xl">
                    💎 أصلي (Original)
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200">
                    {dashboardStats.totalPieces > 0 ? Math.round((dashboardStats.categoryStats['أصلي'].pieces / dashboardStats.totalPieces) * 100) : 0}% من الإجمالي
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-emerald-200/80">
                    <span className="block text-[10px] text-slate-500 font-bold">عدد القطع المطلوبة</span>
                    <span className="text-xl font-black text-emerald-800 font-mono">
                      {dashboardStats.categoryStats['أصلي'].pieces.toLocaleString('en-US')} <span className="text-xs font-normal">قطعة</span>
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200/80">
                    <span className="block text-[10px] text-slate-500 font-bold">إجمالي القيمة</span>
                    <span className="text-base font-black text-slate-900 font-mono">
                      {dashboardStats.categoryStats['أصلي'].value.toLocaleString('en-US', { minimumFractionDigits: 0 })} <span className="text-[10px]">ج.م</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. HIGH COPY CARD (Blue) */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 border-2 border-blue-300 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-blue-900 bg-blue-100/90 border border-blue-300 px-3 py-1 rounded-xl">
                    🔷 هاي كوبي (High Copy)
                  </span>
                  <span className="text-xs font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                    {dashboardStats.totalPieces > 0 ? Math.round((dashboardStats.categoryStats['هاي كوبي'].pieces / dashboardStats.totalPieces) * 100) : 0}% من الإجمالي
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-blue-200/80">
                    <span className="block text-[10px] text-slate-500 font-bold">عدد القطع المطلوبة</span>
                    <span className="text-xl font-black text-blue-800 font-mono">
                      {dashboardStats.categoryStats['هاي كوبي'].pieces.toLocaleString('en-US')} <span className="text-xs font-normal">قطعة</span>
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-blue-200/80">
                    <span className="block text-[10px] text-slate-500 font-bold">إجمالي القيمة</span>
                    <span className="text-base font-black text-slate-900 font-mono">
                      {dashboardStats.categoryStats['هاي كوبي'].value.toLocaleString('en-US', { minimumFractionDigits: 0 })} <span className="text-[10px]">ج.م</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. LOCAL CARD (Amber) */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900 bg-amber-100/90 border border-amber-300 px-3 py-1 rounded-xl">
                    🔶 صناعة محلي (Local)
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-700 bg-white px-2 py-0.5 rounded-lg border border-amber-200">
                    {dashboardStats.totalPieces > 0 ? Math.round((dashboardStats.categoryStats['صناعة محلي'].pieces / dashboardStats.totalPieces) * 100) : 0}% من الإجمالي
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-amber-200/80">
                    <span className="block text-[10px] text-slate-500 font-bold">عدد القطع المطلوبة</span>
                    <span className="text-xl font-black text-amber-800 font-mono">
                      {dashboardStats.categoryStats['صناعة محلي'].pieces.toLocaleString('en-US')} <span className="text-xs font-normal">قطعة</span>
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-200/80">
                    <span className="block text-[10px] text-slate-500 font-bold">إجمالي القيمة</span>
                    <span className="text-base font-black text-slate-900 font-mono">
                      {dashboardStats.categoryStats['صناعة محلي'].value.toLocaleString('en-US', { minimumFractionDigits: 0 })} <span className="text-[10px]">ج.م</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC FILTER TYPES BREAKDOWN CARDS (نوع الفلتر: جاز، زيت، هواء، هيدروليك...) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  توزيع الفلاتر حسب النوع والوظيفة (Filter Types Breakdown)
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                {Object.keys(dashboardStats.filterTypeStats).length} أنواع فلاتر مسجلة
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(dashboardStats.filterTypeStats).map(([ftype, data], idx) => {
                const colors = [
                  'bg-blue-50 border-blue-200 text-blue-900',
                  'bg-emerald-50 border-emerald-200 text-emerald-900',
                  'bg-purple-50 border-purple-200 text-purple-900',
                  'bg-amber-50 border-amber-200 text-amber-900',
                  'bg-teal-50 border-teal-200 text-teal-900',
                  'bg-rose-50 border-rose-200 text-rose-900'
                ];
                const colorClass = colors[idx % colors.length];

                return (
                  <div key={ftype} className={`p-4 rounded-2xl border ${colorClass} space-y-1 shadow-sm`}>
                    <div className="text-xs font-bold truncate" title={ftype}>{ftype}</div>
                    <div className="text-lg font-black font-mono mt-1">
                      {data.pieces.toLocaleString('en-US')} <span className="text-[10px] font-normal font-sans">قطعة</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 font-semibold pt-1 border-t border-slate-200/50">
                      {data.value.toLocaleString('en-US', { minimumFractionDigits: 0 })} ج.م
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SUPPLIER AWARDS BREAKDOWN TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">توزيع الترسية وأوامر الشراء على الموردين الفائزين</h3>
              </div>
              <span className="text-xs text-slate-300">
                {Object.keys(dashboardStats.supplierStats).length} موردين فائزين
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="p-3 font-bold">اسم المورد</th>
                    <th className="p-3 text-center font-bold">عدد الأصناف</th>
                    <th className="p-3 text-center font-bold">إجمالي الكمية المطلوبة</th>
                    <th className="p-3 text-center font-bold">الكمية المستلمة بـ 9004</th>
                    <th className="p-3 text-center font-bold">نسبة التوريد</th>
                    <th className="p-3 text-center font-bold">إجمالي قيمة أمر الشراء</th>
                    <th className="p-3 text-center font-bold">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(dashboardStats.supplierStats).map(([supName, data]) => {
                    const pct = data.pieces > 0 ? Math.round((data.receivedPieces / data.pieces) * 100) : 0;
                    const matchingPo = orders.find(o => o.supplier === supName);

                    return (
                      <tr key={supName} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <span>{supName}</span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-700">
                          {matchingPo ? matchingPo.items.length : '—'}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {data.pieces} قطعة
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700">
                          {data.receivedPieces} قطعة
                        </td>
                        <td className="p-3 text-center">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                            pct === 100 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                              : pct > 0 
                                ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {pct}% {pct === 100 ? '✅ مكتمل' : pct > 0 ? '⏳ جزئي' : 'قيد التوريد'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-slate-900 text-sm">
                          {data.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (matchingPo) onOpenPoDetail(matchingPo);
                            }}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs px-3 py-1 rounded-lg border border-blue-200 transition-all"
                          >
                            عرض أمر الشراء 🔍
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: STORE 9004 RECEIVING & PARTIAL DELIVERY (طلب المستخدم الرئيسي) */}
      {/* ========================================================================= */}
      {activeSubTab === 'receiving_9004' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Top Banner explaining Store 9004 workflow */}
          <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-emerald-800/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-black text-white">
                    نظام فحص واستلام شحنات الموردين في المخزن المركزي (9004)
                  </h3>
                </div>
                <p className="text-xs text-emerald-200/90 leading-relaxed max-w-2xl">
                  يمكنك تسجيل الكمية المستلمة فعلياً لكل صنف (سواء استلام كامل أو جزئي مع إثبات العجز)، ورقم إذن الاستلام، وملاحظات الفحص الفني قبل تحويلها للصرف للمشروعات.
                </p>
              </div>

              <div className="bg-emerald-900/60 border border-emerald-700/80 rounded-xl p-3.5 text-center text-xs space-y-1">
                <span className="block text-emerald-300 font-semibold">إجمالي المستلم فعلياً بـ 9004:</span>
                <span className="text-xl font-black font-mono text-emerald-200">
                  {dashboardStats.totalReceivedPieces} / {dashboardStats.totalPieces} <span className="text-xs font-normal">قطعة</span>
                </span>
              </div>
            </div>
          </div>

          {/* Receiving Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold">جدول استلام الفلاتر وتوثيق الكميات الفعلية</h4>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSupplierFilter}
                  onChange={e => setSelectedSupplierFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none"
                >
                  <option value="all">🏢 جميع الموردين ({Object.keys(dashboardStats.supplierStats).length})</option>
                  {Object.keys(dashboardStats.supplierStats).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="p-3 font-bold w-12 text-center">م</th>
                    <th className="p-3 font-bold min-w-[200px]">الفلتر والكود</th>
                    <th className="p-3 font-bold">المورد المسند إليه</th>
                    <th className="p-3 font-bold text-center">الكمية المطلوبة (PO)</th>
                    <th className="p-3 font-bold text-center min-w-[140px] bg-emerald-50 text-emerald-900">
                      الكمية المستلمة فعلياً
                    </th>
                    <th className="p-3 font-bold text-center">المتبقي / العجز</th>
                    <th className="p-3 font-bold text-center min-w-[150px]">رقم إذن الاستلام / البوليصة</th>
                    <th className="p-3 font-bold min-w-[200px]">ملاحظات الفحص والاستلام</th>
                    <th className="p-3 font-bold text-center min-w-[140px]">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders
                    .filter(po => selectedSupplierFilter === 'all' || po.supplier === selectedSupplierFilter)
                    .map((po) => {
                      return po.items.map((item, itemIdx) => {
                        const key = `${po.id}-${itemIdx}`;
                        const currentInput = receivingInputs[key] || {
                          receivedQty: item.received_qty !== undefined ? item.received_qty : 0,
                          voucherNo: item.delivery_voucher || '',
                          notes: item.receiving_notes || ''
                        };

                        const orderedQty = item.qty || 1;
                        const receivedQty = currentInput.receivedQty;
                        const shortage = Math.max(0, orderedQty - receivedQty);
                        const isFullyReceived = receivedQty >= orderedQty;
                        const isPartiallyReceived = receivedQty > 0 && receivedQty < orderedQty;

                        return (
                          <tr 
                            key={key} 
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isFullyReceived 
                                ? 'bg-emerald-50/20' 
                                : isPartiallyReceived 
                                  ? 'bg-amber-50/30' 
                                  : ''
                            }`}
                          >
                            <td className="p-3 text-center font-mono font-bold text-slate-500">
                              #{itemIdx + 1}
                            </td>

                            <td className="p-3">
                              <div className="font-bold text-slate-900">{item.desc || item.filter_no}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {item.mat_code && (
                                  <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                    {item.mat_code}
                                  </span>
                                )}
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200 font-semibold">
                                  {item.category}
                                </span>
                              </div>
                            </td>

                            <td className="p-3 font-bold text-slate-700">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                                <span>{po.supplier}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">{po.po_number}</span>
                            </td>

                            <td className="p-3 text-center">
                              <span className="font-mono font-bold text-sm bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                                {orderedQty} قطعة
                              </span>
                            </td>

                            {/* Actual Received Qty Input */}
                            <td className="p-3 text-center bg-emerald-50/40">
                              <input
                                type="number"
                                min="0"
                                max={orderedQty * 2}
                                value={currentInput.receivedQty}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10) || 0;
                                  setReceivingInputs(prev => ({
                                    ...prev,
                                    [key]: { ...currentInput, receivedQty: val }
                                  }));
                                }}
                                className="w-24 bg-white border border-emerald-400 rounded-lg px-2.5 py-1.5 text-center font-mono font-black text-sm text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                              />
                            </td>

                            {/* Shortage calculation */}
                            <td className="p-3 text-center">
                              {shortage > 0 ? (
                                <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold text-[11px] inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                                  <span>عجز: {shortage} قطعة</span>
                                </span>
                              ) : (
                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[11px] inline-flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>مكتمل بالكامل</span>
                                </span>
                              )}
                            </td>

                            {/* Delivery Voucher # */}
                            <td className="p-3">
                              <input
                                type="text"
                                value={currentInput.voucherNo}
                                onChange={e => {
                                  setReceivingInputs(prev => ({
                                    ...prev,
                                    [key]: { ...currentInput, voucherNo: e.target.value }
                                  }));
                                }}
                                placeholder="رقم إذن التوريد..."
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </td>

                            {/* Receiving Notes / Condition */}
                            <td className="p-3">
                              <input
                                type="text"
                                value={currentInput.notes}
                                onChange={e => {
                                  setReceivingInputs(prev => ({
                                    ...prev,
                                    [key]: { ...currentInput, notes: e.target.value }
                                  }));
                                }}
                                placeholder="ملاحظات العجز أو الفحص..."
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </td>

                            {/* Action Buttons */}
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSaveReceiving(po.id, itemIdx, orderedQty)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg shadow-sm transition-all"
                                  title="حفظ الكمية والملاحظات في المخزن 9004"
                                >
                                  💾 حفظ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickFullReceive(po.id, itemIdx, orderedQty)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2 py-1 rounded-lg border border-slate-300 transition-all"
                                  title="استلام كامل (100%) بنقرة واحدة"
                                >
                                  الكل ({orderedQty})
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================== */}
      {/* SUB-TAB 3: DISPATCH TO PROJECTS (صرف الفلاتر من 9004 إلى مواقع المشروعات) */}
      {/* =========================================================================== */}
      {activeSubTab === 'dispatch_projects' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Top Banner explaining Project Dispatch */}
          <div className="bg-gradient-to-r from-amber-950 via-orange-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-amber-800/50">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <ArrowUpFromLine className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-black text-white">
                    نظام صرف وتخصيص الفلاتر من المخزن 9004 إلى المشروعات
                  </h3>
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed max-w-2xl">
                  يمكنك صرف الفلاتر المستلمة بالمخزن 9004 لكل مشروع على حدة (المونوريل، العاصمة، رأس الحكمة، القطار السريع...) مع تسجيل رقم إذن الصرف وسجل التوزيع.
                </p>
              </div>

              <div className="bg-amber-900/60 border border-amber-700/80 rounded-xl p-3.5 text-center text-xs space-y-1">
                <span className="block text-amber-300 font-semibold">مواقع المشروعات النشطة:</span>
                <span className="text-lg font-black font-mono text-amber-200">
                  {siacProjects.length} مواقع مشاريع
                </span>
              </div>
            </div>
          </div>

          {/* Project Dispatch Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold">أرصدة الفلاتر المستلمة في 9004 وحالة الصرف للمشروعات</h4>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="p-3 font-bold w-12 text-center">م</th>
                    <th className="p-3 font-bold">الفلتر المطلوب</th>
                    <th className="p-3 font-bold">المورد</th>
                    <th className="p-3 font-bold text-center">المستلم بـ 9004</th>
                    <th className="p-3 font-bold text-center">المنصرف للمشروعات</th>
                    <th className="p-3 font-bold text-center bg-amber-50 text-amber-900">المتاح للصرف بـ 9004</th>
                    <th className="p-3 font-bold min-w-[200px]">سجل الصرف للمواقع</th>
                    <th className="p-3 font-bold text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((po) => {
                    return po.items.map((item, itemIdx) => {
                      const received = item.received_qty || 0;
                      const dispatchedTotal = item.dispatches?.reduce((sum, d) => sum + d.qty, 0) || 0;
                      const availableIn9004 = Math.max(0, received - dispatchedTotal);

                      return (
                        <tr key={`${po.id}-${itemIdx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-mono font-bold text-slate-500">
                            #{itemIdx + 1}
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-900">{item.desc || item.filter_no}</div>
                            <span className="text-[10px] text-slate-500 font-mono">{item.mat_code}</span>
                          </td>

                          <td className="p-3 font-bold text-slate-700">
                            {po.supplier}
                          </td>

                          <td className="p-3 text-center font-mono font-bold text-emerald-700">
                            {received} قطعة
                          </td>

                          <td className="p-3 text-center font-mono font-bold text-amber-700">
                            {dispatchedTotal} قطعة
                          </td>

                          <td className="p-3 text-center font-mono font-black text-sm bg-amber-50/50 text-slate-900">
                            {availableIn9004} قطعة
                          </td>

                          {/* Dispatched logs badge */}
                          <td className="p-3">
                            {item.dispatches && item.dispatches.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {item.dispatches.map((d, dIdx) => (
                                  <span key={dIdx} className="text-[10px] bg-slate-100 border border-slate-300 px-2 py-0.5 rounded font-bold text-slate-800">
                                    {d.project}: <strong>{d.qty} قطة</strong> ({d.voucher_no})
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">لم يتم الصرف لأي مشروع بعد</span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            <button
                              type="button"
                              disabled={availableIn9004 === 0}
                              onClick={() => {
                                setDispatchModalItem({ po, item, itemIdx });
                                setDispatchQty(Math.min(availableIn9004, item.qty || 1));
                              }}
                              className={`font-bold text-xs px-3 py-1.5 rounded-xl transition-all ${
                                availableIn9004 > 0
                                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              🚚 صرف لمشروع
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* SUB-TAB 4: PO ORDERS PIPELINE LIST & DETAIL              */}
      {/* ======================================================= */}
      {activeSubTab === 'orders' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Stage Filter Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(Object.keys(STATUS_META) as POStatus[]).map(statusKey => {
              const meta = STATUS_META[statusKey];
              const matchingCount = orders.filter(o => o.status === statusKey).length;
              const isSelected = selectedStatus === statusKey;

              return (
                <button
                  key={statusKey}
                  onClick={() => setSelectedStatus(isSelected ? 'all' : statusKey)}
                  className={`p-3 rounded-2xl text-right transition-all border text-xs flex flex-col justify-between ${
                    isSelected 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-blue-500' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base">{meta.icon}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                      {matchingCount} أمر
                    </span>
                  </div>
                  <div className="mt-2 font-bold">{meta.label}</div>
                </button>
              );
            })}
          </div>

          {/* Search bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 بحث برقم PO، المورد، أو العنوان..."
                className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="text-xs text-slate-500">
              عرض <strong>{filteredOrders.length}</strong> من أصل <strong>{orders.length}</strong> أمر شراء
            </div>
          </div>

          {/* Orders Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map(po => {
              const meta = STATUS_META[po.status] || STATUS_META.draft;
              return (
                <div 
                  key={po.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                        {po.po_number}
                      </span>
                      <span 
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                        className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200"
                      >
                        {meta.icon} {meta.label}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{po.title}</h4>

                    <div className="text-xs text-slate-600 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>المورد: <strong className="text-slate-800">{po.supplier}</strong></span>
                    </div>

                    <div className="text-xs text-slate-500">
                      عدد الأصناف: <strong className="text-slate-800">{po.items.length} صنف</strong>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold">قيمة الأمر الإجمالية</span>
                      <span className="text-lg font-black text-slate-900 font-mono">
                        {po.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenPoDetail(po)}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm"
                    >
                      التفاصيل 🔍
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DISPATCH TO PROJECT MODAL */}
      {dispatchModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <ArrowUpFromLine className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">إذن صرف فلاتر لموقع المشروع</h3>
                  <p className="text-[11px] text-slate-400">خصم من رصيد المخزن 9004</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModalItem(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">
                {dispatchModalItem.item.desc || dispatchModalItem.item.filter_no}
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>المورد: <strong>{dispatchModalItem.po.supplier}</strong></span>
                <span>المستلم بـ 9004: <strong className="text-emerald-700">{dispatchModalItem.item.received_qty || 0} قطعة</strong></span>
              </div>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اختر المشروع المستلم <span className="text-rose-500">*</span></label>
                <select
                  value={dispatchProject}
                  onChange={e => setDispatchProject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  {registeredProjects.map((p: any) => (
                    <option key={p.id || p.project_name} value={p.project_name}>
                      [مخزن {p.store_code}] {p.project_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكمية المصروفة <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    max={(dispatchModalItem.item.received_qty || 0) - (dispatchModalItem.item.dispatches?.reduce((s, d) => s + d.qty, 0) || 0)}
                    value={dispatchQty}
                    onChange={e => setDispatchQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-center text-slate-900 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم إذن الصرف</label>
                  <input
                    type="text"
                    value={dispatchVoucher}
                    onChange={e => setDispatchVoucher(e.target.value)}
                    placeholder="مثال: OUT-9004-102"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات الصرف والتسليم للموقع</label>
                <input
                  type="text"
                  value={dispatchNotes}
                  onChange={e => setDispatchNotes(e.target.value)}
                  placeholder="مثال: عهدة مهندس الموقع / سيارة نقل رقم..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDispatchModalItem(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-2 rounded-xl shadow-md transition-all"
                >
                  تأكيد الصرف للمشروع 🚚
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MANUAL PO MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">إنشاء أمر شراء (PO) جديد</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">عنوان أمر الشراء <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="مثال: توريد فلاتر جاز وزيت — شركة الرفيق"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المورد <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newSupplier}
                  onChange={e => setNewSupplier(e.target.value)}
                  placeholder="مثال: شركة أبناء سعيد سعدان"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">إجمالي القيمة التقديرية (ج.م.)</label>
                <input
                  type="number"
                  min="0"
                  value={newValue || ''}
                  onChange={e => setNewValue(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="ملاحظات الدفع أو مواعيد التوريد..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-xl shadow-md transition-all"
                >
                  إنشاء الأمر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
