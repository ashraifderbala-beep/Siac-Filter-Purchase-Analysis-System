import React, { useState, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  Trophy, 
  Sparkles, 
  Download, 
  Check, 
  Filter, 
  TrendingDown, 
  AlertTriangle, 
  FileSpreadsheet, 
  DollarSign, 
  Layers, 
  Building2, 
  CheckCircle2, 
  ArrowUpDown,
  ShoppingBag,
  Info,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  SlidersHorizontal,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  RfqSession, 
  FilterCategory, 
  AwardCriteria, 
  PurchaseOrder, 
  PurchaseOrderItem 
} from '../types/procurement';
import { exportComparisonExcel } from '../services/excelExporter';

interface ComparisonTabProps {
  session: RfqSession;
  onAwardItem: (
    rfqCode: string,
    supplierName: string,
    item: PurchaseOrderItem,
    notes: string
  ) => void;
  onBatchAwardAll: (
    rfqCode: string,
    awardedOrders: { supplier: string; items: PurchaseOrderItem[]; total: number }[]
  ) => void;
  onNavigateToTracker: () => void;
  onOpenSupplierPortal: () => void;
}

export const ComparisonTab: React.FC<ComparisonTabProps> = ({
  session,
  onAwardItem,
  onBatchAwardAll,
  onNavigateToTracker,
  onOpenSupplierPortal
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Category selection per item ID (defaults to 'best_overall' or 'أصلي')
  const [categorySelection, setCategorySelection] = useState<Record<string, AwardCriteria>>(() => {
    const initial: Record<string, AwardCriteria> = {};
    (session.items || []).forEach(item => {
      initial[item.id] = 'أصلي';
    });
    return initial;
  });

  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all');
  const [searchItem, setSearchItem] = useState('');
  const [selectedRange, setSelectedRange] = useState('all');

  // Suppliers who submitted offers
  const suppliers = session.submissions ? session.submissions.map(s => s.supplier_name) : [];

  // Compute Range Buckets dynamically
  const rangeBuckets = useMemo(() => {
    const total = (session.items || []).length;
    if (total <= 50) return [];
    const buckets: { label: string; min: number; max: number; key: string }[] = [];
    const step = 50;
    for (let i = 1; i <= total; i += step) {
      const max = Math.min(i + step - 1, total);
      buckets.push({
        label: `${i} - ${max}`,
        min: i,
        max: max,
        key: `${i}-${max}`
      });
    }
    return buckets;
  }, [session.items]);

  // Set category for ALL items at once
  const handleSetGlobalCategory = (criteria: AwardCriteria) => {
    const updated: Record<string, AwardCriteria> = {};
    (session.items || []).forEach(item => {
      updated[item.id] = criteria;
    });
    setCategorySelection(updated);
  };

  // Set category for a single item
  const handleSetItemCategory = (itemId: string, criteria: AwardCriteria) => {
    setCategorySelection(prev => ({
      ...prev,
      [itemId]: criteria
    }));
  };

  // Horizontal Scroll Handlers
  const scrollTable = (direction: 'left' | 'right', amount = 350) => {
    if (tableContainerRef.current) {
      const delta = direction === 'left' ? -amount : amount;
      tableContainerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    }
  };

  const scrollToSupplier = (supName: string) => {
    const el = document.getElementById(`sup-col-${supName}`);
    if (el && tableContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  // Evaluation logic for each item sorted strictly by item_no
  const evaluatedRows = useMemo(() => {
    const rawItems = session.items || [];
    const sorted = [...rawItems].map((item, idx) => {
      const parsedNo = typeof item.item_no === 'number' ? item.item_no : parseInt(String(item.item_no || ''), 10);
      return {
        ...item,
        item_no: !isNaN(parsedNo) && parsedNo > 0 ? parsedNo : (idx + 1)
      };
    }).sort((a, b) => (a.item_no ?? 0) - (b.item_no ?? 0));

    return sorted.map(item => {
      const chosenCriteria = categorySelection[item.id] || 'best_overall';
      const sap = session.sap_prices ? session.sap_prices[item.mat_code] : undefined;

      // Gather all offers for this item across all suppliers
      const allOffersForThisItem: {
        supplier: string;
        category: FilterCategory;
        unit_price: number;
        alt_no: string;
        qty_avail: number;
        notes?: string;
      }[] = [];

      (session.submissions || []).forEach(sub => {
        const itemOffers = sub.offers[item.id] || sub.offers[`item-${item.item_no}`] || [];
        itemOffers.forEach(o => {
          if (o.unit_price > 0) {
            allOffersForThisItem.push({
              supplier: sub.supplier_name,
              category: o.category,
              unit_price: o.unit_price,
              alt_no: o.alt_no,
              qty_avail: o.qty_avail,
              notes: o.notes
            });
          }
        });
      });

      // Filter offers by selected category criteria
      const eligibleOffers = allOffersForThisItem.filter(o => {
        if (chosenCriteria === 'best_overall') return true;
        return o.category === chosenCriteria;
      });

      // Sort by price ascending
      eligibleOffers.sort((a, b) => a.unit_price - b.unit_price);
      const winningOffer = eligibleOffers[0] || null;

      // Available categories count
      const availableCategories = Array.from(new Set(allOffersForThisItem.map(o => o.category)));

      // Best overall price for reference
      const sortedAll = [...allOffersForThisItem].sort((a, b) => a.unit_price - b.unit_price);
      const absoluteLowestOffer = sortedAll[0] || null;

      const unitPrice = winningOffer ? winningOffer.unit_price : 0;
      const totalAmount = unitPrice * item.qty_needed;

      const sapLast = sap ? sap.last_price : 0;
      const sapMax = sap ? sap.max_price : 0;
      const savingsVsLast = (sapLast > 0 && unitPrice > 0) ? (sapLast - unitPrice) * item.qty_needed : 0;

      return {
        item,
        chosenCriteria,
        sap,
        sapLast,
        sapMax,
        allOffersForThisItem,
        eligibleOffers,
        winningOffer,
        availableCategories,
        absoluteLowestOffer,
        unitPrice,
        totalAmount,
        savingsVsLast
      };
    });
  }, [session, categorySelection]);

  // Overall statistics
  const grandTotal = evaluatedRows.reduce((acc, row) => acc + row.totalAmount, 0);
  const totalSavings = evaluatedRows.reduce((acc, row) => acc + Math.max(0, row.savingsVsLast), 0);
  const totalAwardableItems = evaluatedRows.filter(r => r.winningOffer !== null).length;

  const categoryBreakdown = useMemo(() => {
    const counts = { 'أصلي': 0, 'هاي كوبي': 0, 'صناعة محلي': 0 };
    evaluatedRows.forEach(r => {
      if (r.winningOffer) {
        counts[r.winningOffer.category] = (counts[r.winningOffer.category] || 0) + 1;
      }
    });
    return counts;
  }, [evaluatedRows]);

  // Single Item Award handler
  const handleAwardSingleItem = (row: typeof evaluatedRows[0]) => {
    if (!row.winningOffer) return;

    const poItem: PurchaseOrderItem = {
      filter_no: row.winningOffer.alt_no || row.item.primary_number,
      desc: row.item.primary_number,
      mat_code: row.item.mat_code,
      qty: row.item.qty_needed,
      unit_price: row.winningOffer.unit_price,
      category: row.winningOffer.category,
      total: row.totalAmount,
      notes: row.winningOffer.notes
    };

    onAwardItem(
      session.code,
      row.winningOffer.supplier,
      poItem,
      `ترسية صنف (${row.item.primary_number}) فئة [${row.winningOffer.category}] بسعر ${row.winningOffer.unit_price} ج.م.`
    );

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 }
    });
  };

  // Batch Award All items based on current category selections
  const handleBatchAwardAll = () => {
    if (totalAwardableItems === 0) {
      alert('⚠️ لا توجد عروض متوافقة مع الفئات المختارة للترسية');
      return;
    }

    const supplierGroups: Record<string, { items: PurchaseOrderItem[]; total: number }> = {};

    evaluatedRows.forEach(row => {
      if (row.winningOffer) {
        const sup = row.winningOffer.supplier;
        if (!supplierGroups[sup]) {
          supplierGroups[sup] = { items: [], total: 0 };
        }

        const poItem: PurchaseOrderItem = {
          filter_no: row.winningOffer.alt_no || row.item.primary_number,
          desc: row.item.primary_number,
          mat_code: row.item.mat_code,
          filter_type: row.item.filter_type || 'فلتر',
          qty: row.item.qty_needed,
          unit_price: row.winningOffer.unit_price,
          category: row.winningOffer.category,
          total: row.totalAmount,
          notes: row.winningOffer.notes,
          received_qty: 0
        };

        supplierGroups[sup].items.push(poItem);
        supplierGroups[sup].total += row.totalAmount;
      }
    });

    const ordersToCreate = Object.entries(supplierGroups).map(([supplier, data]) => ({
      supplier,
      items: data.items,
      total: data.total
    }));

    onBatchAwardAll(session.code, ordersToCreate);
    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.5 }
    });
  };

  const filteredEvaluatedRows = evaluatedRows.filter(r => {
    const primary = String(r.item?.primary_number || r.item?.id || '');
    const mat = String(r.item?.mat_code || '');
    const alts = Array.isArray(r.item?.alt_numbers) ? r.item.alt_numbers : [];
    const itemNoStr = String(r.item?.item_no || '');
    const equip = String(r.item?.equip_code || '');

    const q = searchItem.trim().toLowerCase().replace(/^#/, '');
    const matchesSearch = !q ||
      itemNoStr === q ||
      itemNoStr.includes(q) ||
      primary.toLowerCase().includes(q) ||
      mat.toLowerCase().includes(q) ||
      alts.some(a => String(a || '').toLowerCase().includes(q)) ||
      equip.toLowerCase().includes(q);
    
    if (!matchesSearch) return false;

    // Range matching
    if (selectedRange !== 'all') {
      const [minStr, maxStr] = selectedRange.split('-');
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);
      const num = r.item?.item_no ?? 0;
      if (!isNaN(min) && !isNaN(max)) {
        if (num < min || num > max) return false;
      }
    }

    if (selectedSupplierFilter === 'all') return true;
    return r.allOffersForThisItem.some(o => o.supplier === selectedSupplierFilter);
  });

  return (
    <div className="w-full space-y-6">
      {/* KPI Cards & Financial Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-5 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="text-xs font-semibold text-blue-300 mb-1">إجمالي قيمة الترسية المحسوبة</div>
          <div className="text-2xl font-black text-white font-mono">
            {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-blue-200">ج.م.</span>
          </div>
          <div className="text-[11px] text-slate-300 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>مكتمل لـ <strong>{totalAwardableItems}</strong> من {(session.items || []).length} صنف</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-900 text-white p-5 rounded-2xl border border-emerald-800/50 shadow-sm relative overflow-hidden">
          <div className="text-xs font-semibold text-emerald-300 mb-1">إجمالي التوفير المحقق عن أسعار SAP</div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-emerald-200">ج.م.</span>
          </div>
          <div className="text-[11px] text-emerald-200/80 mt-2 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>مقارنة بآخر أسعار شراء تاريخية مسجلة</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">توزيع الفئات الفائزة بالترسية</div>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-2.5 py-1 rounded-lg font-bold">
              💎 {categoryBreakdown['أصلي']} أصلي
            </span>
            <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-2.5 py-1 rounded-lg font-bold">
              🔷 {categoryBreakdown['هاي كوبي']} هاي كوبي
            </span>
            <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs px-2.5 py-1 rounded-lg font-bold">
              🔶 {categoryBreakdown['صناعة محلي']} محلي
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            يتحدث تلقائياً مع تغيير فئة كل فلتر
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">الموردين المشاركون بالعروض</div>
            <div className="text-lg font-black text-slate-900">
              {suppliers.length} موردين مسجلين
            </div>
          </div>
          <div className="pt-2 flex gap-2">
            <button
              onClick={() => exportComparisonExcel(session, categorySelection)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl border border-slate-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
            <button
              onClick={onOpenSupplierPortal}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold py-2 rounded-xl border border-blue-200 transition-colors"
            >
              <span>بوابة مورد جديد</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Category Policy Bar & Batch Award Button */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-blue-800/40">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                منظومة تحديد فئة الترسية (Category-Based Awarding Policy)
              </h3>
            </div>
            <p className="text-xs text-blue-200/80">
              يمكنك تحديد سياسة الترسية العامة للكل بضغطة واحدة، أو تخصيص فئة كل فلتر بشكل منفصل من الجدول بالأسفل:
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-blue-200 font-bold ml-1">تطبيق على جميع الأصناف:</span>
            <button
              onClick={() => handleSetGlobalCategory('أصلي')}
              className="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-400/40 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1"
            >
              <span>💎 الكل: أصلي</span>
            </button>
            <button
              onClick={() => handleSetGlobalCategory('هاي كوبي')}
              className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1"
            >
              <span>🔷 الكل: هاي كوبي</span>
            </button>
            <button
              onClick={() => handleSetGlobalCategory('صناعة محلي')}
              className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-400/40 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1"
            >
              <span>🔶 الكل: محلي</span>
            </button>
            <button
              onClick={() => handleSetGlobalCategory('best_overall')}
              className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-400/40 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1"
            >
              <span>⭐ الكل: الأرخص</span>
            </button>

            <div className="h-6 w-px bg-blue-700/60 mx-1 hidden sm:block"></div>

            <button
              onClick={handleBatchAwardAll}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-900 font-extrabold text-xs px-4 py-2 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <Trophy className="w-4 h-4 text-slate-900" />
              <span>🏆 ترسية جماعية شاملة للفائزين ({totalAwardableItems} صنف)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Side-by-Side Comparison Matrix Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden flex flex-col">
        {/* Table Search & Filter Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={searchItem}
                onChange={e => setSearchItem(e.target.value)}
                placeholder="🔍 ابحث برقم المسلسل (#14)، الفلتر، أو الكود..."
                className="w-full bg-white border border-slate-300 rounded-xl pr-3 pl-8 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
              {searchItem && (
                <button
                  type="button"
                  onClick={() => setSearchItem('')}
                  className="absolute left-2.5 top-2 text-xs text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full w-4 h-4 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Range buttons if large session */}
            {rangeBuckets.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                <span className="text-[11px] font-bold text-slate-500">النطاق:</span>
                <button
                  type="button"
                  onClick={() => setSelectedRange('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedRange === 'all'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  الكل ({evaluatedRows.length})
                </button>
                {rangeBuckets.map(b => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setSelectedRange(b.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      selectedRange === b.key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between w-full lg:w-auto gap-4 text-xs text-slate-600">
            <span className="bg-slate-200/90 px-3 py-1 rounded-lg font-mono font-bold text-slate-800">
              المعروض: {filteredEvaluatedRows.length} من {evaluatedRows.length} بند
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>الفائز مميز بالكأس 🏆 والأخضر</span>
            </div>
          </div>
        </div>

        {/* Scrollable Matrix Table with Sticky Columns & Header */}
        <div 
          ref={tableContainerRef}
          className="overflow-x-auto overflow-y-auto max-h-[750px] scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-slate-100 relative"
        >
          <table className="w-full text-right border-collapse text-xs min-w-[1400px]">
            {/* Sticky Table Header (Pinned at top) */}
            <thead className="sticky top-0 z-30 shadow-md">
              <tr className="bg-slate-900 text-white divide-x divide-slate-800">
                {/* Column 1: Index / Serial (Sticky Right 0) */}
                <th className="p-3 text-center w-12 font-bold sticky right-0 z-40 bg-slate-900 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                  م
                </th>

                {/* Column 2: Filter Description & Alts (Sticky Right 48px) */}
                <th className="p-3 font-bold min-w-[240px] max-w-[280px] sticky right-12 z-40 bg-slate-900 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                  الفلتر المطلوب والبدائل
                </th>

                {/* Column 3: Quantity (Sticky Right 300px) */}
                <th className="p-3 text-center w-16 font-bold sticky right-[288px] z-40 bg-slate-900 shadow-[4px_0_8px_rgba(0,0,0,0.4)]">
                  الكمية
                </th>

                {/* Column 4: Category Selector */}
                <th className="p-3 text-center min-w-[180px] bg-indigo-950 text-indigo-200 font-bold">
                  🎯 فئة الترسية المطلوبة
                </th>

                {/* Column 5: SAP Last Price */}
                <th className="p-3 text-center w-28 bg-amber-950/90 text-amber-200 font-bold">
                  آخر سعر SAP
                </th>

                {/* Supplier Columns */}
                {suppliers.map((sup, sIdx) => {
                  const colors = [
                    'bg-blue-950 text-blue-200 border-blue-800',
                    'bg-slate-800 text-slate-200 border-slate-700',
                    'bg-purple-950 text-purple-200 border-purple-800',
                    'bg-teal-950 text-teal-200 border-teal-800',
                    'bg-emerald-950 text-emerald-200 border-emerald-800',
                    'bg-indigo-950 text-indigo-200 border-indigo-800'
                  ];
                  return (
                    <th
                      key={sup}
                      id={`sup-col-${sup}`}
                      className={`p-3 text-center min-w-[240px] font-bold border-l ${colors[sIdx % colors.length]}`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[210px]" title={sup}>{sup}</span>
                      </div>
                    </th>
                  );
                })}

                {/* Final Decision Column */}
                <th className="p-3 text-center w-40 bg-emerald-950 text-emerald-300 font-bold">
                  🏆 قرار الترسية المباشر
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200">
              {filteredEvaluatedRows.map((row, idx) => {
                const item = row.item;
                const winning = row.winningOffer;
                const isEven = idx % 2 === 0;
                const rowBg = isEven ? 'bg-white' : 'bg-slate-50/50';

                return (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-blue-50/40 transition-colors ${rowBg}`}
                  >
                    {/* Sticky Column 1: Serial # (Right 0) */}
                    <td className={`p-3 text-center sticky right-0 z-20 ${rowBg} shadow-[2px_0_5px_rgba(0,0,0,0.06)]`}>
                      <span className="font-mono font-black text-amber-950 bg-amber-100/90 px-2 py-1 rounded-lg text-xs border border-amber-300 shadow-sm">
                        #{item.item_no ?? (idx + 1)}
                      </span>
                    </td>

                    {/* Sticky Column 2: Filter Description (Right 48px) */}
                    <td className={`p-3 sticky right-12 z-20 ${rowBg} shadow-[2px_0_5px_rgba(0,0,0,0.06)] max-w-[240px]`}>
                      <div className="font-bold text-slate-900 text-xs truncate" title={item.primary_number}>
                        {item.primary_number}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {item.mat_code && (
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200 font-semibold">
                            {item.mat_code}
                          </span>
                        )}
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-100 font-semibold">
                          {item.filter_type}
                        </span>
                      </div>
                    </td>

                    {/* Sticky Column 3: Qty (Right 288px) */}
                    <td className={`p-3 text-center sticky right-[288px] z-20 ${rowBg} shadow-[4px_0_8px_rgba(0,0,0,0.08)]`}>
                      <span className="font-mono font-bold text-slate-800 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {item.qty_needed}
                      </span>
                    </td>

                    {/* Per-Item Category Selector */}
                    <td className="p-2.5 bg-indigo-50/40 border-r border-l border-indigo-100/60 min-w-[180px]">
                      <div className="flex flex-col gap-1">
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetItemCategory(item.id, 'أصلي')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              row.chosenCriteria === 'أصلي'
                                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-emerald-50'
                            }`}
                          >
                            💎 أصلي
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetItemCategory(item.id, 'هاي كوبي')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              row.chosenCriteria === 'هاي كوبي'
                                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-blue-50'
                            }`}
                          >
                            🔷 هاي كوبي
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetItemCategory(item.id, 'صناعة محلي')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              row.chosenCriteria === 'صناعة محلي'
                                ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-400'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-amber-50'
                            }`}
                          >
                            🔶 محلي
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetItemCategory(item.id, 'best_overall')}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                              row.chosenCriteria === 'best_overall'
                                ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-400'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-purple-50'
                            }`}
                          >
                            ⭐ الأرخص
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* SAP Historical Reference Price */}
                    <td className="p-3 text-center bg-amber-50/20 border-r border-amber-100/60">
                      {row.sapLast > 0 ? (
                        <div>
                          <div className="font-mono font-bold text-slate-800 text-xs">
                            {row.sapLast.toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">ج.م</span>
                          </div>
                          {row.sapMax > row.sapLast && (
                            <div className="text-[10px] text-amber-700 font-mono">
                              أعلى: {row.sapMax.toFixed(2)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>

                    {/* Dynamic Supplier Columns */}
                    {suppliers.map(sup => {
                      const offersFromThisSup = row.allOffersForThisItem.filter(o => o.supplier === sup);
                      const isSupplierWinning = winning && winning.supplier === sup;

                      if (offersFromThisSup.length === 0) {
                        return (
                          <td key={sup} className="p-3 text-center text-slate-400 border-l border-slate-100 text-xs">
                            —
                          </td>
                        );
                      }

                      return (
                        <td 
                          key={sup} 
                          className={`p-2.5 border-l transition-all ${
                            isSupplierWinning 
                              ? 'bg-emerald-100/40 border-emerald-400 ring-1 ring-inset ring-emerald-400/50' 
                              : 'border-slate-100'
                          }`}
                        >
                          <div className="space-y-1.5">
                            {offersFromThisSup.map((off, oIdx) => {
                              const isThisOptionWinning = isSupplierWinning && winning?.category === off.category && winning?.unit_price === off.unit_price;

                              return (
                                <div 
                                  key={oIdx}
                                  className={`p-2 rounded-xl text-xs border transition-all ${
                                    isThisOptionWinning 
                                      ? 'bg-emerald-600 text-white font-bold shadow-md ring-2 ring-emerald-400' 
                                      : 'bg-white text-slate-800 border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                      isThisOptionWinning ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {off.category}
                                    </span>
                                    {isThisOptionWinning && (
                                      <span className="flex items-center gap-0.5 text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full font-black">
                                        🏆 فائز
                                      </span>
                                    )}
                                  </div>

                                  <div className="font-mono font-bold text-sm mt-1 flex items-baseline justify-between">
                                    <span>{off.unit_price.toFixed(2)}</span>
                                    <span className={`text-[10px] font-normal ${isThisOptionWinning ? 'text-emerald-100' : 'text-slate-500'}`}>ج.م</span>
                                  </div>

                                  {off.alt_no && (
                                    <div className={`text-[10px] truncate mt-0.5 font-mono ${isThisOptionWinning ? 'text-emerald-100' : 'text-slate-500'}`} title={off.alt_no}>
                                      رقم: {off.alt_no}
                                    </div>
                                  )}

                                  {off.notes && (
                                    <div className={`text-[9px] truncate mt-0.5 ${isThisOptionWinning ? 'text-emerald-100' : 'text-slate-400'}`} title={off.notes}>
                                      {off.notes}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}

                    {/* Final Award Decision Column */}
                    <td className="p-3 text-center bg-slate-50/70">
                      {winning ? (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-lg border border-emerald-300 truncate" title={winning.supplier}>
                            {winning.supplier}
                          </div>
                          <div className="font-mono font-bold text-xs text-slate-900">
                            {row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAwardSingleItem(row)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-1 px-2 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1"
                          >
                            <Trophy className="w-3 h-3" />
                            <span>ترسية هذا البند</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-semibold">
                          لا توجد عروض متوافقة
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* BOTTOM HORIZONTAL SCROLL RULER & SUPPLIER QUICK NAVIGATOR (مسطرة التمرير السريع للموردين) */}
        <div className="p-3 bg-slate-900 text-white border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 sticky bottom-0 z-20 shadow-xl">
          {/* Scroll Direction Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>مسطرة التنقل الأفقي بين الموردين:</span>
            </span>

            <button
              type="button"
              onClick={() => scrollTable('right', 400)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border border-slate-700"
              title="تمرير لليمين (بداية الجدول)"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>لليمين (الأصناف)</span>
            </button>

            <button
              type="button"
              onClick={() => scrollTable('left', 400)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-md shadow-blue-900/50"
              title="تمرير لليسار (مشاهدة باقي الموردين)"
            >
              <span>المزيد من الموردين</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Jump to Specific Supplier Column */}
          {suppliers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">انتقال سريع لمورد:</span>
              <div className="flex items-center gap-1 overflow-x-auto max-w-[450px] scrollbar-none">
                {suppliers.map(sup => (
                  <button
                    key={sup}
                    type="button"
                    onClick={() => scrollToSupplier(sup)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold px-2.5 py-1 rounded-lg truncate max-w-[140px] transition-all"
                    title={`انتقال لعمود ${sup}`}
                  >
                    {sup}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 font-mono">
            {suppliers.length} موردين | {filteredEvaluatedRows.length} بند
          </div>
        </div>
      </div>
    </div>
  );
};
