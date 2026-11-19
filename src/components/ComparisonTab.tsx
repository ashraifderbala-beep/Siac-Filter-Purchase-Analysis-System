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
  ArrowLeft,
  Cpu,
  Wrench,
  Printer,
  Edit3,
  Save,
  Tag,
  HandCoins,
  X,
  Upload,
  Star,
  BookmarkCheck,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  RfqSession, 
  FilterCategory, 
  AwardCriteria, 
  PurchaseOrder, 
  PurchaseOrderItem,
  ManualAwardSelection,
  SapHistoricalPrice
} from '../types/procurement';
import { exportComparisonExcel } from '../services/excelExporter';
import { allocateOfferQuantities } from '../services/awardAllocator';
import { allocateProjectQuotas } from '../services/projectQuotas';
import { findMatchingEquipment, getSmartCategoryRecommendation } from '../data/siacEquipmentData';
import { findSapPrice, formatSapDate, readSapPriceHistoryFile } from '../services/sapPriceHistory';
import { ExecutiveReportModal } from './ExecutiveReportModal';

interface ComparisonTabProps {
  session: RfqSession;
  existingOrders?: PurchaseOrder[];
  categorySelection?: Record<string, AwardCriteria>;
  onCategorySelectionChange?: (newMap: Record<string, AwardCriteria>) => void;
  manualAwards?: Record<string, ManualAwardSelection>;
  onSetManualAward?: (rfqCode: string, itemId: string, selection: ManualAwardSelection) => void;
  onClearManualAward?: (rfqCode: string, itemId: string) => void;
  onAwardItem: (
    rfqCode: string,
    awards: { supplierName: string; item: PurchaseOrderItem; notes: string }[]
  ) => void;
  onBatchAwardAll: (
    rfqCode: string,
    awardedOrders: { supplier: string; items: PurchaseOrderItem[]; total: number }[]
  ) => void;
  onUpdateSupplierPrice?: (
    rfqCode: string,
    supplierName: string,
    itemId: string,
    offerId: string,
    altNo: string,
    category: FilterCategory,
    newUnitPrice: number,
    notes?: string,
    sapCode?: string
  ) => void;
  onImportSapPrices?: (rfqCode: string, prices: Record<string, SapHistoricalPrice>) => void;
  onNavigateToTracker: () => void;
  onOpenSupplierPortal: () => void;
}

export const ComparisonTab: React.FC<ComparisonTabProps> = ({
  session,
  existingOrders,
  categorySelection: propCategorySelection,
  onCategorySelectionChange,
  manualAwards: propManualAwards,
  onSetManualAward,
  onClearManualAward,
  onAwardItem,
  onBatchAwardAll,
  onUpdateSupplierPrice,
  onImportSapPrices,
  onNavigateToTracker,
  onOpenSupplierPortal
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const sapFileInputRef = useRef<HTMLInputElement>(null);
  const [sapImporting, setSapImporting] = useState(false);
  // Default OFF: "آخر سعر SAP" must reflect the newest supply date.
  // Turning it ON intentionally compares against the price before the latest supply.
  const [excludeLatestSapPo, setExcludeLatestSapPo] = useState(false);

  // Category selection per item ID (defaults to 'best_overall' or 'أصلي')
  const [internalCategorySelection, setInternalCategorySelection] = useState<Record<string, AwardCriteria>>(() => {
    const initial: Record<string, AwardCriteria> = {};
    (session.items || []).forEach(item => {
      initial[item.id] = 'أصلي';
    });
    return initial;
  });

  const categorySelection = (propCategorySelection && Object.keys(propCategorySelection).length > 0)
    ? propCategorySelection
    : internalCategorySelection;

  const setCategorySelection = (newMapOrUpdater: Record<string, AwardCriteria> | ((prev: Record<string, AwardCriteria>) => Record<string, AwardCriteria>)) => {
    if (typeof newMapOrUpdater === 'function') {
      const updated = newMapOrUpdater(categorySelection);
      if (onCategorySelectionChange) onCategorySelectionChange(updated);
      else setInternalCategorySelection(updated);
    } else {
      if (onCategorySelectionChange) onCategorySelectionChange(newMapOrUpdater);
      else setInternalCategorySelection(newMapOrUpdater);
    }
  };

  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all');
  const [searchItem, setSearchItem] = useState('');
  const [selectedRange, setSelectedRange] = useState('all');
  const [showExecutiveReport, setShowExecutiveReport] = useState(false);
  const [showManualOnly, setShowManualOnly] = useState(false);

  // Internal Manual Awards fallback if not passed as prop
  const [internalManualAwards, setInternalManualAwards] = useState<Record<string, ManualAwardSelection>>(() => {
    return session.manual_awards || {};
  });

  const manualAwards = propManualAwards || internalManualAwards;

  const handleAwardSpecificOffer = (itemId: string, selection: ManualAwardSelection) => {
    if (onSetManualAward) {
      onSetManualAward(session.code, itemId, selection);
    } else {
      setInternalManualAwards(prev => ({
        ...prev,
        [itemId]: selection
      }));
    }
    confetti({ particleCount: 60, spread: 65, origin: { y: 0.65 } });
  };

  const handleResetToAutoWinner = (itemId: string) => {
    if (onClearManualAward) {
      onClearManualAward(session.code, itemId);
    } else {
      setInternalManualAwards(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  // Negotiation & Price Editing Modal State
  const [negotiationTarget, setNegotiationTarget] = useState<{
    rfqCode: string;
    supplierName: string;
    itemId: string;
    offerId: string;
    altNo: string;
    itemDesc: string;
    itemCode: string;
    qty: number;
    category: FilterCategory;
    currentPrice: number;
    newPrice: number;
    notes: string;
    sapCode: string;
    currentWinningSupplier?: string;
    currentWinningPrice?: number;
  } | null>(null);

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

  // Smart Auto-Category Recommendation by Equipment Criticality
  const handleApplyEquipmentRecommendations = () => {
    const updated: Record<string, AwardCriteria> = {};
    (session.items || []).forEach(item => {
      const matched = findMatchingEquipment(`${item.primary_number} ${item.filter_type}`, item.equip_code);
      const rec = getSmartCategoryRecommendation(matched, item.primary_number);
      updated[item.id] = rec.recommended_quality;
    });
    setCategorySelection(updated);
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    alert('🎯 تم تطبيق التوصيات الفنية الذكية بناءً على حساسية وقدرة كل معدة لجميع الأصناف بنجاح!');
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

      // Equipment matching
      const matchedEquipment = findMatchingEquipment(`${item.primary_number} ${item.filter_type}`, item.equip_code);
      const smartRec = getSmartCategoryRecommendation(matchedEquipment, item.primary_number);

      // Gather all offers for this item across all suppliers
      const allOffersForThisItem: {
        id: string;
        supplier: string;
        category: FilterCategory;
        unit_price: number;
        alt_no: string;
        qty_avail: number;
        notes?: string;
        sap_code?: string;
        brand_name?: string;
      }[] = [];

      (session.submissions || []).forEach(sub => {
        const itemOffers = sub.offers[item.id] || sub.offers[`item-${item.item_no}`] || [];
        itemOffers.forEach(o => {
          if (o.unit_price > 0) {
            allOffersForThisItem.push({
              id: o.id,
              supplier: sub.supplier_name,
              category: o.category,
              unit_price: o.unit_price,
              alt_no: o.alt_no,
              qty_avail: o.qty_avail,
              notes: o.notes,
              sap_code: o.sap_code,
              brand_name: o.brand_name
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
      const autoLowestOffer = eligibleOffers[0] || null;

      // Check for manual award / brand override
      const manualSelection = (manualAwards && manualAwards[item.id]) || session.manual_awards?.[item.id];

      const winningAllocations = allocateOfferQuantities(
        item.qty_needed,
        allOffersForThisItem,
        chosenCriteria,
        manualSelection
      );
      const winningOffer = winningAllocations[0] || null;

      // Available categories count
      const availableCategories = Array.from(new Set(allOffersForThisItem.map(o => o.category)));

      // Best overall price for reference
      const sortedAll = [...allOffersForThisItem].sort((a, b) => a.unit_price - b.unit_price);
      const absoluteLowestOffer = sortedAll[0] || null;

      const unitPrice = winningOffer?.unit_price || 0;
      const allocatedQty = winningAllocations.reduce((sum, allocation) => sum + allocation.qty, 0);
      const totalAmount = winningAllocations.reduce((sum, allocation) => sum + allocation.total, 0);

      const sap = findSapPrice(
        session.sap_prices,
        winningOffer?.sap_code,
        winningOffer?.supplier,
        item.mat_code
      );
      let sapWeightedQty = 0;
      let sapWeightedTotal = 0;
      let sapMax = sap ? sap.max_price : 0;
      winningAllocations.forEach(allocation => {
        const allocationSap = findSapPrice(
          session.sap_prices,
          allocation.sap_code,
          allocation.supplier,
          item.mat_code
        );
        if (!allocationSap || allocationSap.last_price <= 0) return;
        sapWeightedQty += allocation.qty;
        sapWeightedTotal += allocationSap.last_price * allocation.qty;
        sapMax = Math.max(sapMax, allocationSap.max_price || 0);
      });
      const sapLast = sapWeightedQty > 0 ? sapWeightedTotal / sapWeightedQty : 0;
      const averageSupplierPrice = allocatedQty > 0 ? totalAmount / allocatedQty : unitPrice;
      const sapDiffPerUnit = sapLast > 0 && averageSupplierPrice > 0
        ? sapLast - averageSupplierPrice
        : 0;
      const sapDiffPct = sapLast > 0 && averageSupplierPrice > 0
        ? (sapDiffPerUnit / sapLast) * 100
        : 0;
      const savingsVsLast = winningAllocations.reduce((sum, allocation) => {
        const allocationSap = findSapPrice(
          session.sap_prices,
          allocation.sap_code,
          allocation.supplier,
          item.mat_code
        );
        const allocationSapLast = allocationSap?.last_price || 0;
        return allocationSapLast > 0
          ? sum + (allocationSapLast - allocation.unit_price) * allocation.qty
          : sum;
      }, 0);
      const sapDiffAmount = savingsVsLast;
      const winningSapCode = winningOffer?.sap_code?.trim() || item.mat_code || '';
      const sapCodeSource = winningOffer?.sap_code?.trim() ? 'offer' : 'item';

      return {
        item,
        chosenCriteria,
        sap,
        sapLast,
        sapMax,
        averageSupplierPrice,
        sapDiffPerUnit,
        sapDiffPct,
        sapDiffAmount,
        winningSapCode,
        sapCodeSource,
        matchedEquipment,
        smartRec,
        allOffersForThisItem,
        eligibleOffers,
        autoLowestOffer,
        winningAllocations,
        winningOffer,
        isManualWinner: !!manualSelection,
        manualSelection,
        availableCategories,
        absoluteLowestOffer,
        unitPrice,
        allocatedQty,
        totalAmount,
        savingsVsLast
      };
    });
  }, [session, categorySelection, manualAwards]);

  // Overall statistics
  const grandTotal = evaluatedRows.reduce((acc, row) => acc + row.totalAmount, 0);
  const totalSavings = evaluatedRows.reduce((acc, row) => acc + row.savingsVsLast, 0);
  const totalSapDiff = evaluatedRows.reduce((acc, row) => acc + row.sapDiffAmount, 0);
  const totalAwardableItems = evaluatedRows.filter(r => r.winningAllocations.length > 0).length;
  const fullyAwardedItems = evaluatedRows.filter(r => r.item.qty_needed > 0 && r.allocatedQty >= r.item.qty_needed).length;

  const categoryBreakdown = useMemo(() => {
    const counts = { 'أصلي': 0, 'هاي كوبي': 0, 'صناعة محلي': 0 };
    evaluatedRows.forEach(r => {
      const awardedCategories = new Set(r.winningAllocations.map(allocation => allocation.category));
      awardedCategories.forEach(category => {
        counts[category] += 1;
      });
    });
    return counts;
  }, [evaluatedRows]);

  // Single Item Award handler
  const handleAwardSingleItem = (row: typeof evaluatedRows[0]) => {
    if (row.winningAllocations.length === 0) return;

    const projectAllocations = allocateProjectQuotas(
      row.item.projects,
      row.winningAllocations.map(allocation => allocation.qty)
    );
    const awards = row.winningAllocations.map((allocation, index) => ({
      supplierName: allocation.supplier,
      item: {
        source_rfq_item_id: row.item.id,
        filter_no: allocation.alt_no || row.item.primary_number,
        desc: row.item.primary_number,
        mat_code: row.item.mat_code,
        sap_code: allocation.sap_code,
        supplier_brand: allocation.brand_name || allocation.brand || undefined,
        qty: allocation.qty,
        project_allocations: [],
        award_project_allocations: projectAllocations[index],
        unit_price: allocation.unit_price,
        category: allocation.category,
        total: allocation.total,
        notes: allocation.isManual
          ? `${allocation.notes ? allocation.notes + ' | ' : ''}ترسية معتمدة بالماركة (${allocation.brand || allocation.alt_no || allocation.category})`
          : allocation.notes
      },
      notes: allocation.isManual
        ? `ترسية خاصة معتمدة بالماركة: (${row.item.primary_number}) فئة [${allocation.category}] بسعر ${allocation.unit_price} ج.م لـ ${allocation.supplier}`
        : `ترسية كمية ${allocation.qty} من صنف (${row.item.primary_number}) بسعر ${allocation.unit_price} ج.م للوحدة لـ ${allocation.supplier}`
    }));

    onAwardItem(session.code, awards);

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
      const projectAllocations = allocateProjectQuotas(
        row.item.projects,
        row.winningAllocations.map(allocation => allocation.qty)
      );
      row.winningAllocations.forEach((allocation, allocationIndex) => {
        const sup = allocation.supplier;
        if (!supplierGroups[sup]) supplierGroups[sup] = { items: [], total: 0 };

        const poItem: PurchaseOrderItem = {
          source_rfq_item_id: row.item.id,
          filter_no: allocation.alt_no || row.item.primary_number,
          desc: row.item.primary_number,
          mat_code: row.item.mat_code,
          sap_code: allocation.sap_code,
          supplier_brand: allocation.brand_name || allocation.brand || undefined,
          filter_type: row.item.filter_type || 'فلتر',
          qty: allocation.qty,
          project_allocations: [],
          award_project_allocations: projectAllocations[allocationIndex],
          unit_price: allocation.unit_price,
          category: allocation.category,
          total: allocation.total,
          notes: allocation.isManual
            ? `${allocation.notes ? allocation.notes + ' | ' : ''}ترسية معتمدة بالماركة (${allocation.brand || allocation.alt_no || allocation.category})`
            : allocation.notes,
          received_qty: 0
        };

        supplierGroups[sup].items.push(poItem);
        supplierGroups[sup].total += allocation.total;
      });
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

  const handleApplyReportToPurchaseOrders = () => {
    if (previewOrders.length === 0) {
      alert('⚠️ لا توجد أصناف مُرسّاة في التقرير لتحديث أوامر الشراء');
      return;
    }
    const confirmed = window.confirm(
      'سيتم اعتماد تقرير الترسية وتحديث أوامر الشراء (POs) الحالية بالكميات والأسعار والفئات الجديدة.\n\n' +
      'ملاحظة: يتم الحفاظ على أرقام أوامر الشراء وسجلات الاستلام/الصرف القائمة.\n\nهل تريد المتابعة؟'
    );
    if (!confirmed) return;
    handleBatchAwardAll();
  };

  const handleExportComparisonExcel = () => {
    exportComparisonExcel(session, categorySelection, undefined, manualAwards);
  };

  const handleSapFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!onImportSapPrices) {
      alert('⚠️ لا يمكن حفظ أسعار SAP من هذه الشاشة. تواصل مع مدير النظام.');
      return;
    }

    setSapImporting(true);
    try {
      const prices = await readSapPriceHistoryFile(file, {
        excludeLatestPurchaseOrder: excludeLatestSapPo
      });
      const importedCount = Object.keys(prices).length;

      if (importedCount === 0) {
        alert(
          '⚠️ لم يتم العثور على أسعار صالحة داخل الملف.\n\n' +
          'تأكد من وجود عمود Material (كود SAP) وعمود Posting Date وعمود Unit Price، ' +
          'وأن الملف هو تصدير حركات SAP وليس ملفًا آخر.'
        );
        return;
      }

      onImportSapPrices(session.code, prices);
      alert(
        `✅ تم استيراد ${importedCount} سعر SAP بنجاح.\n\n` +
        `تم تحديث تاريخ آخر سعر وتاريخه وفرق السعر لكل صنف مطابق.` +
        (excludeLatestSapPo ? '\nتم استبعاد آخر أمر شراء من حساب آخر سعر (سعر ما قبل التوريد).' : '')
      );
    } catch (error) {
      alert('❌ تعذر قراءة ملف SAP: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSapImporting(false);
    }
  };

  const hasSapPrices = Object.keys(session.sap_prices || {}).length > 0;

  // Existing purchase orders for this RFQ, indexed by supplier
  const poBySupplier = useMemo(() => {
    const map = new Map<string, PurchaseOrder>();
    (existingOrders || []).forEach(order => {
      if (order.rfq_code !== session.code) return;
      const key = order.supplier.trim().toLocaleLowerCase();
      const current = map.get(key);
      if (!current || (current.status === 'cancelled' && order.status !== 'cancelled')) {
        map.set(key, order);
      }
    });
    return map;
  }, [existingOrders, session.code]);

  // Preview orders for the Executive Printable Report Modal
  const previewOrders: PurchaseOrder[] = useMemo(() => {
    const supplierGroups: Record<string, { items: PurchaseOrderItem[]; total: number }> = {};
    evaluatedRows.forEach(row => {
      row.winningAllocations.forEach(allocation => {
        const sup = allocation.supplier;
        if (!supplierGroups[sup]) supplierGroups[sup] = { items: [], total: 0 };
        const projectQuota = allocateProjectQuotas(row.item.projects, [allocation.qty])[0];
        supplierGroups[sup].items.push({
          source_rfq_item_id: row.item.id,
          filter_no: allocation.alt_no || row.item.primary_number,
          desc: row.item.primary_number,
          mat_code: row.item.mat_code,
          sap_code: allocation.sap_code,
          supplier_brand: allocation.brand_name || allocation.brand || undefined,
          filter_type: row.item.filter_type || 'فلتر',
          qty: allocation.qty,
          project_allocations: [],
          award_project_allocations: projectQuota,
          unit_price: allocation.unit_price,
          category: allocation.category,
          total: allocation.total,
          received_qty: 0
        });
        supplierGroups[sup].total += allocation.total;
      });
    });

    return Object.entries(supplierGroups).map(([supplier, data], idx) => {
      const existing = poBySupplier.get(supplier.trim().toLocaleLowerCase());
      return {
        id: existing?.id || `preview-po-${idx}`,
        po_number: existing?.po_number || `PO-202610-${String(idx + 1).padStart(3, '0')}`,
        rfq_code: session.code,
        title: `أمر شراء توريد فلاتر — ${supplier}`,
        supplier: supplier,
        total_value: data.total,
        currency: 'EGP',
        status: 'awarded' as const,
        created_at: existing?.created_at || new Date().toLocaleDateString('ar-EG'),
        updated_at: existing?.updated_at || new Date().toLocaleDateString('ar-EG'),
        notes: `ترسية ${data.items.length} صنف فلاتر`,
        items: data.items,
        events: existing?.events || []
      };
    });
  }, [evaluatedRows, session.code, poBySupplier]);

  // True when the live purchase orders already reflect the current award report
  const isSyncedWithPurchaseOrders = useMemo(() => {
    if (previewOrders.length === 0) return true;
    const keyOf = (item: PurchaseOrderItem) =>
      (item.mat_code || '').trim().toLocaleLowerCase() ||
      (item.filter_no || '').trim().toLocaleLowerCase() ||
      (item.desc || '').trim().toLocaleLowerCase();

    return previewOrders.every(order => {
      const existing = poBySupplier.get(order.supplier.trim().toLocaleLowerCase());
      if (!existing) return false;
      return order.items.every(previewItem => {
        const previewKey = keyOf(previewItem);
        const existingItem = (existing.items || []).find(item => keyOf(item) === previewKey);
        if (!existingItem) return false;
        return existingItem.qty === previewItem.qty &&
          Math.abs(existingItem.unit_price - previewItem.unit_price) < 0.0001 &&
          existingItem.category === previewItem.category;
      });
    });
  }, [previewOrders, poBySupplier]);

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

    if (showManualOnly && !r.isManualWinner) return false;

    if (selectedSupplierFilter === 'all') return true;
    return r.allOffersForThisItem.some(o => o.supplier === selectedSupplierFilter);
  });

  const manualAwardsCount = evaluatedRows.filter(r => r.isManualWinner).length;

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
            <span>مكتمل بالكامل لـ <strong>{fullyAwardedItems}</strong> من {(session.items || []).length} صنف</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-900 text-white p-5 rounded-2xl border border-emerald-800/50 shadow-sm relative overflow-hidden">
          <div className="text-xs font-semibold text-emerald-300 mb-1">
            {totalSavings >= 0 ? 'صافي التوفير عن أسعار SAP' : 'صافي الزيادة عن أسعار SAP'}
          </div>
          <div className={`text-2xl font-black font-mono ${totalSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {Math.abs(totalSavings).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-bold text-emerald-200">ج.م.</span>
          </div>
          <div className="text-[11px] text-emerald-200/80 mt-2 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>مقارنة بآخر أسعار شراء تاريخية مسجلة</span>
          </div>
          <div className={`text-[10px] mt-1 font-mono font-bold ${totalSapDiff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {totalSapDiff > 0 ? 'إجمالي توفير القيمة عن SAP' : totalSapDiff < 0 ? 'إجمالي زيادة القيمة عن SAP' : 'مطابق لأسعار SAP'}:
            {' '}
            {Math.abs(totalSapDiff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
            <span className="text-[9px] font-normal"> (فرق الوحدة × الكمية)</span>
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
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>يتحدث تلقائياً مع تغيير فئة كل فلتر</span>
            {manualAwardsCount > 0 && (
              <span className="text-amber-800 font-bold text-[10px] bg-amber-100 px-1.5 py-0.5 rounded">
                ⭐ {manualAwardsCount} معتمد بالماركة
              </span>
            )}
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
              onClick={() => exportComparisonExcel(session, categorySelection, undefined, manualAwards)}
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

      {/* Award report / purchase order reconciliation alert */}
      {!isSyncedWithPurchaseOrders && previewOrders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h4 className="text-sm font-black text-amber-950">
                تقرير الترسية يعكس أحدث العروض، لكن أوامر الشراء الحالية غير مطابقة
              </h4>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                اضغط لتحديث شاشة متابعة أوامر الشراء (POs) وسجل الأوامر بالكميات والأسعار والفئات الحالية،
                مع الحفاظ على أرقام الأوامر وسجلات الاستلام والصرف.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleApplyReportToPurchaseOrders}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 whitespace-nowrap hover:scale-105"
          >
            <RefreshCw className="w-4 h-4" />
            <span>اعتماد وتحديث أوامر الشراء الآن</span>
          </button>
        </div>
      )}

      {/* SAP historical price import */}
      <div className="bg-white border border-blue-200 rounded-2xl p-3.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-start gap-2.5">
          <span className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex-shrink-0">
            <Upload className="w-4 h-4" />
          </span>
          <div>
            <div className="text-xs font-black text-slate-900 flex items-center gap-2">
              <span>أسعار SAP التاريخية (آخر سعر توريد)</span>
              {hasSapPrices && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold">
                  أسعار متاحة: {Object.keys(session.sap_prices || {}).length} صنف
                </span>
              )}
              {excludeLatestSapPo && (
                <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-md font-bold" title="الخيار مفعّل: آخر سعر معروض هو سعر ما قبل التوريد الأخير وليس أحدث توريد">
                  ⚠️ آخر سعر قبل التوريد الأخير
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              ارفع ملف حركات SAP (CSV أو Excel) لمطابقة عمود <strong>Material</strong> مع كود SAP الخاص بعرض المورد،
              مع تفضيل مطابقة <strong>Material + Vendor</strong> عند توفر اسم المورد، ثم الرجوع لكود البند.
              واستخراج آخر سعر توريد وتاريخه تلقائيًا. حركات الاستلام 101 فقط تُعتمد عند توفرها.
              <span className="block text-[10px] text-blue-700 font-bold mt-0.5">
                آخر سعر = سعر الوحدة في أحدث تاريخ توريد للمادة بغض النظر عن المورد والدفعة (Posting Date هو الفيصل)، وأعلى سعر = أعلى سعر مسجّل لنفس المادة/المورد.
                فرق سعر الوحدة = آخر سعر SAP - سعر المورد الفائز (لا تدخل الكمية في فرق السعر). موجب = توفير، سالب = زيادة.
                الأكواد غير الموجودة في ملف SAP تظهر «لا يوجد سعر SAP».
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <label
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 cursor-pointer hover:bg-slate-100 transition-colors"
            title="عند التفعيل: يُستبعد أمر الشراء الخاص بأحدث حركة، بحيث يعكس آخر سعر قبل التوريد الحالي. يتطلب إعادة استيراد ملف SAP لتطبيق التغيير."
          >
            <input
              type="checkbox"
              checked={excludeLatestSapPo}
              onChange={(event) => setExcludeLatestSapPo(event.target.checked)}
              className="accent-blue-600"
            />
            <span>استبعاد آخر أمر شراء (سعر ما قبل التوريد)</span>
          </label>

          <input
            ref={sapFileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="hidden"
            onChange={handleSapFileSelected}
          />

          <button
            type="button"
            onClick={() => sapFileInputRef.current?.click()}
            disabled={sapImporting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-black px-4 py-2 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            {sapImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            <span>{sapImporting ? 'جارٍ استخراج الأسعار...' : 'استيراد ملف SAP'}</span>
          </button>
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
              onClick={handleApplyEquipmentRecommendations}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-md flex items-center gap-1.5"
              title="تطبيق الترسية الذكية التلقائية بناءً على حساسية وقدرة كل معدة مسجلة"
            >
              <Cpu className="w-4 h-4 text-slate-950" />
              <span>🎯 الترسية الذكية حسب حساسية المعدة</span>
            </button>
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
              type="button"
              onClick={() => setShowExecutiveReport(true)}
              className="bg-blue-600/40 hover:bg-blue-600/60 text-blue-100 border border-blue-400/40 font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              title="معاينة وطباعة التقرير الشامل لمدير الإدارة شاملاً ضريبة 14%"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>📄 تقرير الترسية لمدير الإدارة (14% ضريبة)</span>
            </button>

            <button
              type="button"
              onClick={handleApplyReportToPurchaseOrders}
              className={`font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 ${
                isSyncedWithPurchaseOrders
                  ? 'bg-emerald-600/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-600/30'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
              title="تحديث أوامر الشراء وشاشة المتابعة والسجل بالكميات والأسعار الحالية مع الحفاظ على أرقام الأوامر وسجلات الاستلام"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isSyncedWithPurchaseOrders ? 'أوامر الشراء مطابقة للتقرير' : '🔄 تحديث أوامر الشراء حسب التقرير'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportComparisonExcel}
              className="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100 border border-emerald-400/40 font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              title="تصدير مصفوفة مقارنة العروض والترسية إلى ملف Excel"
            >
              <Download className="w-4 h-4" />
              <span>📊 تصدير المقارنة Excel</span>
            </button>

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

          <div className="flex flex-wrap items-center justify-between w-full lg:w-auto gap-3 text-xs text-slate-600">
            {/* Filter by Manual Brand Award button */}
            <button
              type="button"
              onClick={() => setShowManualOnly(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                showManualOnly
                  ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-amber-50'
              }`}
              title="عرض فقط الأصناف التي تمت ترسيتها يدوياً باختيار الماركة والمورد"
            >
              <Star className={`w-3.5 h-3.5 ${showManualOnly ? 'text-slate-950 fill-slate-950' : 'text-amber-500 fill-amber-500'}`} />
              <span>ترسية بالماركة ({manualAwardsCount})</span>
            </button>

            <span className="bg-slate-200/90 px-3 py-1 rounded-lg font-mono font-bold text-slate-800">
              المعروض: {filteredEvaluatedRows.length} من {evaluatedRows.length} بند
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>الفائز مميز بالكأس 🏆 أو النجمة ⭐ للترسية بالماركة</span>
            </div>
          </div>
        </div>

        {/* Scrollable Matrix Table with Sticky Columns & Header */}
        <div 
          ref={tableContainerRef}
          className="overflow-x-auto overflow-y-auto max-h-[750px] scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-slate-100 relative"
        >
          <table className="w-full text-right border-collapse text-xs min-w-[1650px]">
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
                <th className="p-3 text-center w-28 bg-amber-950/90 text-amber-200 font-bold" title="آخر سعر = سعر الوحدة في أحدث تاريخ توريد للمادة بغض النظر عن المورد. أعلى سعر يظل خاصًا بنفس المادة/المورد.">
                  آخر سعر SAP
                </th>

                {/* Column 6: SAP Last Price Date */}
                <th className="p-3 text-center w-28 bg-amber-950/90 text-amber-200 font-bold">
                  تاريخ آخر سعر SAP
                </th>

                {/* Column 7: Difference vs SAP */}
                <th className="p-3 text-center w-24 bg-amber-950/90 text-amber-200 font-bold" title="موجب = توفير عن آخر سعر SAP / سالب = زيادة">
                  فرق السعر %
                </th>
                <th className="p-3 text-center w-28 bg-amber-950/90 text-amber-200 font-bold" title="فرق سعر الوحدة = آخر سعر SAP - سعر العرض الفائز. الكمية لا تدخل في فرق السعر. موجب = توفير، سالب = زيادة">
                  فرق سعر الوحدة (ج.م)
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
                        {row.matchedEquipment && row.matchedEquipment.length > 0 && (
                          <span 
                            className="text-[9px] bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold truncate max-w-[200px]"
                            title={row.matchedEquipment.map(e => `[${e.equip_code}] ${e.description} (${e.criticality})`).join('\n')}
                          >
                            🚜 {row.matchedEquipment[0].equip_code}: {row.matchedEquipment[0].brand}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Sticky Column 3: Qty (Right 288px) */}
                    <td className={`p-3 text-center sticky right-[288px] z-20 ${rowBg} shadow-[4px_0_8px_rgba(0,0,0,0.08)]`}>
                      <span className="font-mono font-bold text-slate-800 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {item.qty_needed}
                      </span>
                    </td>

                    {/* Per-Item Category Selector & Brand Override Box */}
                    <td className="p-2.5 bg-indigo-50/40 border-r border-l border-indigo-100/60 min-w-[200px]">
                      <div className="flex flex-col gap-1.5">
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

                        {/* Manual Brand Override Notification or Quick Brand Selector */}
                        {row.isManualWinner ? (
                          <div className="bg-amber-100/90 border border-amber-300 rounded-xl p-1.5 text-right space-y-1 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-amber-900 flex items-center gap-1">
                                <Star className="w-3 h-3 text-amber-600 fill-amber-500" />
                                <span>ترسية بالماركة:</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleResetToAutoWinner(item.id)}
                                className="text-[9px] bg-white hover:bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-md font-bold transition-colors"
                                title="إلغاء الترسية بالماركة والعودة للأقل سعراً تلقائياً"
                              >
                                🔄 إلغاء
                              </button>
                            </div>
                            <div className="text-[10px] font-extrabold text-slate-900 truncate">
                              {row.winningOffer?.supplier}
                            </div>
                            <div className="text-[9px] text-amber-900 font-mono flex items-center justify-between">
                              <span className="truncate max-w-[100px]">{row.winningOffer?.alt_no || row.winningOffer?.category}</span>
                              <span className="font-bold">{row.winningOffer?.unit_price.toFixed(2)} ج.م</span>
                            </div>
                          </div>
                        ) : (
                          row.allOffersForThisItem.length > 1 && (
                            <div className="mt-0.5">
                              <select
                                value=""
                                onChange={(e) => {
                                  const idx = parseInt(e.target.value, 10);
                                  if (!isNaN(idx)) {
                                    const chosen = row.allOffersForThisItem[idx];
                                    if (chosen) {
                                      handleAwardSpecificOffer(item.id, {
                                        supplier: chosen.supplier,
                                        category: chosen.category,
                                        unit_price: chosen.unit_price,
                                        alt_no: chosen.alt_no,
                                        notes: chosen.notes,
                                        brand: chosen.alt_no || chosen.notes,
                                        sap_code: chosen.sap_code,
                                        reason: 'ترسية مخصصة باختيار الماركة من القائمة'
                                      });
                                    }
                                  }
                                }}
                                className="w-full text-[10px] py-1 px-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none hover:border-blue-400 font-medium cursor-pointer"
                              >
                                <option value="">🎯 ترسية ماركة محددة...</option>
                                {row.allOffersForThisItem.map((off, oIdx) => (
                                  <option key={oIdx} value={oIdx}>
                                    {off.supplier.slice(0, 16)}.. — {off.alt_no || off.category} ({off.unit_price.toFixed(0)} ج.م)
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        )}
                      </div>
                    </td>

                    {/* SAP Historical Reference Price */}
                    <td className="p-3 text-center bg-amber-50/20 border-r border-amber-100/60">
                      {row.sapLast > 0 ? (
                        <div title={`كود SAP المستخدم: ${row.winningSapCode || '—'} (${row.sapCodeSource === 'offer' ? 'كود المورد' : 'كود البند'})${row.sap?.last_date ? `\nآخر سعر من: ${row.sap.last_vendor || 'مورد غير محدد'} — ${formatSapDate(row.sap.last_date)}${row.sap.last_batch ? `\nالدفعة: ${row.sap.last_batch}` : ''}${row.sap.last_po ? `\nأمر الشراء: ${row.sap.last_po}` : ''}` : ''}`}>
                          <div className="font-mono font-bold text-slate-800 text-xs">
                            {row.sapLast.toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">ج.م</span>
                          </div>
                          {row.sapMax > row.sapLast && (
                            <div className="text-[10px] text-amber-700 font-mono">
                              أعلى: {row.sapMax.toFixed(2)}
                            </div>
                          )}
                          <div className={`text-[8px] font-bold ${row.sapCodeSource === 'offer' ? 'text-blue-600' : 'text-slate-400'}`}>
                            {row.sapCodeSource === 'offer' ? 'كود المورد' : 'كود البند'}
                          </div>
                        </div>
                      ) : (
                        <div title={`لا يوجد سعر SAP مطابق للكود ${row.winningSapCode || row.item.mat_code || ''} في الملف المستورد`}>
                          <span className="text-slate-400 text-xs">—</span>
                          <div className="text-[8px] text-slate-400">لا يوجد سعر SAP</div>
                        </div>
                      )}
                    </td>

                    {/* SAP Last Price Date */}
                    <td className="p-3 text-center bg-amber-50/20 border-r border-amber-100/60">
                      {row.sap?.last_date ? (
                        <div>
                          <div className="font-mono font-bold text-slate-800 text-xs">
                            {formatSapDate(row.sap.last_date)}
                          </div>
                          {row.sap.last_po && (
                            <div className="text-[9px] text-slate-500 font-mono truncate" title={`أمر الشراء: ${row.sap.last_po}`}>
                              PO: {row.sap.last_po}
                            </div>
                          )}
                          {row.sap.last_batch && (
                            <div className="text-[9px] text-slate-500 font-mono truncate" title={`الدفعة (Batch): ${row.sap.last_batch}`}>
                              Batch: {row.sap.last_batch}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>

                    {/* Difference vs SAP */}
                    <td className="p-3 text-center bg-amber-50/20 border-r border-amber-100/60" title="فرق النسبة = ((آخر سعر SAP - سعر المورد الفائز) ÷ آخر سعر SAP) × 100 | موجب = توفير، سالب = زيادة">
                      {row.sapLast > 0 && row.allocatedQty > 0 ? (
                        <div>
                          <div
                            className={`font-mono font-black text-xs ${
                              row.sapDiffPct > 0 ? 'text-emerald-700' : row.sapDiffPct < 0 ? 'text-rose-600' : 'text-slate-600'
                            }`}
                            title={`فرق سعر الوحدة: ${row.sapDiffPerUnit > 0 ? '+' : ''}${row.sapDiffPerUnit.toFixed(2)} ج.م (آخر سعر SAP ${row.sapLast.toFixed(2)} - سعر المورد ${row.averageSupplierPrice.toFixed(2)})`}
                          >
                            {row.sapDiffPct > 0 ? '+' : ''}{row.sapDiffPct.toFixed(1)}%
                          </div>
                          <div className={`text-[9px] font-bold ${row.sapDiffPct > 0 ? 'text-emerald-600' : row.sapDiffPct < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                            {row.sapDiffPct > 0 ? 'توفير' : row.sapDiffPct < 0 ? 'زيادة' : 'مطابق'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td
                      className="p-3 text-center bg-amber-50/20 border-r border-amber-100/60"
                      title={`فرق سعر الوحدة = آخر سعر SAP ${row.sapLast.toFixed(2)} - سعر العرض الفائز ${row.averageSupplierPrice.toFixed(2)} = ${row.sapDiffPerUnit.toFixed(2)} ج.م. الكمية لا تدخل في فرق السعر. موجب = توفير، سالب = زيادة`}
                    >
                      {row.sapLast > 0 && row.averageSupplierPrice > 0 ? (
                        <div>
                          <div
                            className={`font-mono font-black text-xs ${
                              row.sapDiffPerUnit > 0 ? 'text-emerald-700' : row.sapDiffPerUnit < 0 ? 'text-rose-600' : 'text-slate-600'
                            }`}
                          >
                            {row.sapDiffPerUnit > 0 ? '+' : ''}
                            {row.sapDiffPerUnit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className={`text-[9px] font-bold whitespace-nowrap ${row.sapDiffPerUnit > 0 ? 'text-emerald-600' : row.sapDiffPerUnit < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                            {row.sapDiffPerUnit > 0 ? 'توفير' : row.sapDiffPerUnit < 0 ? 'زيادة' : 'مطابق'} · {row.sapLast.toFixed(2)} - {row.averageSupplierPrice.toFixed(2)}
                          </div>
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
                              ? (row.isManualWinner ? 'bg-amber-50/60 border-amber-300 ring-1 ring-inset ring-amber-300' : 'bg-emerald-100/40 border-emerald-400 ring-1 ring-inset ring-emerald-400/50')
                              : 'border-slate-100'
                          }`}
                        >
                          <div className="space-y-1.5">
                            {offersFromThisSup.map((off, oIdx) => {
                              const isThisOptionWinning = isSupplierWinning && winning?.category === off.category && Math.abs(winning.unit_price - off.unit_price) < 0.01;
                              const isThisManualChosen = isThisOptionWinning && row.isManualWinner;
                              const offerSap = findSapPrice(session.sap_prices, off.sap_code, sup, row.item.mat_code);
                              const offerSapLast = offerSap?.last_price || 0;
                              const offerDiffPct = offerSapLast > 0
                                ? ((offerSapLast - off.unit_price) / offerSapLast) * 100
                                : 0;

                              return (
                                <div 
                                  key={oIdx}
                                  className={`p-2 rounded-xl text-xs border transition-all ${
                                    isThisOptionWinning 
                                      ? (isThisManualChosen 
                                          ? 'bg-amber-600 text-white font-bold shadow-md ring-2 ring-amber-300' 
                                          : 'bg-emerald-600 text-white font-bold shadow-md ring-2 ring-emerald-400')
                                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                      isThisOptionWinning 
                                        ? (isThisManualChosen ? 'bg-amber-700 text-white' : 'bg-emerald-700 text-white')
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {off.category}
                                    </span>
                                    {isThisOptionWinning && (
                                      <span className="flex items-center gap-0.5 text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full font-black">
                                        {isThisManualChosen ? '⭐ فائز بالماركة' : '🏆 فائز'}
                                      </span>
                                    )}
                                  </div>

                                  <div className="font-mono font-bold text-sm mt-1 flex items-baseline justify-between">
                                    <span>{off.unit_price.toFixed(2)}</span>
                                    <span className={`text-[10px] font-normal ${isThisOptionWinning ? 'text-amber-100' : 'text-slate-500'}`}>ج.م</span>
                                  </div>

                                  {offerSapLast > 0 && (
                                    <div
                                      className={`text-[10px] font-mono font-bold mt-0.5 ${
                                        isThisOptionWinning
                                          ? 'text-white/90'
                                          : offerDiffPct > 0
                                            ? 'text-emerald-700'
                                            : offerDiffPct < 0
                                              ? 'text-rose-600'
                                              : 'text-slate-500'
                                      }`}
                                      title={`آخر سعر SAP: ${offerSapLast.toFixed(2)} ج.م | كود SAP: ${off.sap_code || row.item.mat_code || '—'}`}
                                    >
                                      {Math.abs(offerDiffPct) < 0.05
                                        ? '= سعر SAP'
                                        : `${offerDiffPct > 0 ? '+' : ''}${offerDiffPct.toFixed(1)}% عن SAP`}
                                    </div>
                                  )}

                                  {off.alt_no && (
                                    <div className={`text-[10px] truncate mt-0.5 font-mono ${isThisOptionWinning ? 'text-amber-100' : 'text-slate-600'}`} title={off.alt_no}>
                                      رقم/ماركة: {off.alt_no}
                                    </div>
                                  )}

                                  {off.notes && (
                                    <div className={`text-[9px] truncate mt-0.5 ${isThisOptionWinning ? 'text-amber-100' : 'text-slate-400'}`} title={off.notes}>
                                      {off.notes}
                                    </div>
                                  )}

                                  {/* Award this Offer / Brand Button */}
                                  <div className="mt-2 space-y-1">
                                    {isThisManualChosen ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleResetToAutoWinner(row.item.id);
                                        }}
                                        className="w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-extrabold bg-amber-800 hover:bg-amber-900 text-amber-100 border border-amber-400/50 transition-all shadow-xs"
                                        title="إلغاء الترسية بالماركة والعودة للأقل سعراً تلقائياً"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5 text-amber-200" />
                                        <span>تراجع للتلقائي</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleAwardSpecificOffer(row.item.id, {
                                            supplier: sup,
                                            category: off.category,
                                            unit_price: off.unit_price,
                                            alt_no: off.alt_no,
                                            notes: off.notes,
                                            brand: off.alt_no || off.notes,
                                            sap_code: off.sap_code,
                                            reason: 'ترسية مخصصة حسب تفضيل الماركة والجودة'
                                          });
                                        }}
                                        className={`w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all shadow-xs ${
                                          isThisOptionWinning
                                            ? 'bg-emerald-700 text-emerald-100 opacity-90 cursor-default'
                                            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 hover:border-amber-400'
                                        }`}
                                        title={`ترسية هذا الصنف مباشرة على ${sup} (${off.alt_no || off.category}) حتى لو سعره أعلى`}
                                      >
                                        <Star className="w-2.5 h-2.5 text-amber-600 fill-amber-500" />
                                        <span>{isThisOptionWinning ? '✓ فائز حالياً' : 'ترسية هذه الماركة'}</span>
                                      </button>
                                    )}

                                    {/* Quick Edit / Negotiate Price Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setNegotiationTarget({
                                          rfqCode: session.code,
                                          supplierName: sup,
                                          itemId: row.item.id,
                                          offerId: off.id,
                                          altNo: off.alt_no,
                                          itemDesc: `${row.item.filter_type || ''} ${row.item.primary_number}`,
                                          itemCode: row.item.primary_number,
                                          qty: row.item.qty_needed,
                                          category: off.category,
                                          currentPrice: off.unit_price,
                                          newPrice: off.unit_price,
                                          notes: off.notes || '',
                                          sapCode: off.sap_code || '',
                                          currentWinningSupplier: winning?.supplier,
                                          currentWinningPrice: winning?.unit_price
                                        });
                                      }}
                                      className="w-full flex items-center justify-center gap-1 py-0.5 px-1 rounded-md text-[9px] font-semibold bg-slate-100/90 hover:bg-blue-100 text-slate-700 hover:text-blue-900 border border-slate-200 transition-all"
                                      title="تعديل السعر بعد التفاوض مع هذا المورد وتحديث الترسية"
                                    >
                                      <Edit3 className="w-2.5 h-2.5 text-slate-600" />
                                      <span>تعديل السعر / تفاوض</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}

                    {/* Final Award Decision Column */}
                    <td className="p-3 text-center bg-slate-50/70 min-w-[130px]">
                      {winning ? (
                        <div className="space-y-1.5">
                          {row.winningAllocations.map(allocation => (
                            <div
                              key={`${allocation.supplier}-${allocation.category}-${allocation.alt_no}`}
                              className={`text-[10px] font-bold px-1.5 py-1 rounded-lg border ${
                                allocation.isManual
                                  ? 'text-amber-900 bg-amber-100/90 border-amber-300'
                                  : 'text-emerald-800 bg-emerald-100/90 border-emerald-300'
                              }`}
                              title={`${allocation.supplier} — ${allocation.alt_no || allocation.category}`}
                            >
                              <div className="truncate">
                                {allocation.isManual && <span className="ml-1 text-amber-600">⭐</span>}
                                {allocation.supplier}
                              </div>
                              <div dir="ltr" className="font-mono text-[9px]">
                                {allocation.qty} × {allocation.unit_price.toFixed(2)} ج.م
                              </div>
                            </div>
                          ))}

                          {row.allocatedQty < item.qty_needed && (
                            <div className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-1.5 py-1">
                              متبقٍ دون تغطية: {item.qty_needed - row.allocatedQty}
                            </div>
                          )}

                          <div className="font-mono font-bold text-xs text-slate-900">
                            {row.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAwardSingleItem(row)}
                            className="w-full font-bold text-[11px] py-1 px-2 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Trophy className="w-3 h-3" />
                            <span>{row.allocatedQty < item.qty_needed ? 'ترسية المتاح فقط' : 'ترسية هذا البند'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-semibold">
                            {row.eligibleOffers.length > 0
                              ? 'توجد عروض بالفئة المختارة لكن بدون كميات متاحة'
                              : row.availableCategories.length > 0
                                ? 'لا توجد عروض متوافقة مع الفئة المختارة'
                                : 'لا توجد عروض لهذا البند من أي مورد'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            الفئة المختارة: {row.chosenCriteria === 'best_overall' ? 'الأفضل عموماً' : row.chosenCriteria}
                          </span>
                          {row.availableCategories.length > 0 && (
                            <>
                              <span className="text-[10px] font-bold text-amber-700">
                                الفئات المتاحة: {row.availableCategories.join(' | ')}
                              </span>
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {row.availableCategories.map(category => (
                                  <button
                                    key={category}
                                    type="button"
                                    onClick={() => handleSetItemCategory(item.id, category)}
                                    className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
                                  >
                                    اختر {category}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
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

      {/* EXECUTIVE 1-PAGE SUMMARY PRINTABLE REPORT MODAL */}
      {showExecutiveReport && (
        <ExecutiveReportModal
          orders={previewOrders}
          session={session}
          onClose={() => setShowExecutiveReport(false)}
          onApplyToPurchaseOrders={handleApplyReportToPurchaseOrders}
          onExportExcel={handleExportComparisonExcel}
          isSyncedWithPurchaseOrders={isSyncedWithPurchaseOrders}
        />
      )}

      {/* SUPPLIER PRICE NEGOTIATION MODAL (تعديل وتفاوض الأسعار وتحديث الترسية) */}
      {negotiationTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 bg-blue-500/20 rounded-lg text-blue-300 border border-blue-400/30">
                    <HandCoins className="w-5 h-5 text-amber-300" />
                  </div>
                  <h3 className="text-lg font-black tracking-tight">جلسة تفاوض وتعديل سعر المورد</h3>
                </div>
                <p className="text-xs text-blue-200/80">
                  تحديث سعر الصنف بعد التفاوض وإعادة تقييم الترسية وأمر الشراء آلياً
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNegotiationTarget(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-slate-300 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Filter & Supplier Details */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">المورد المُفاوض:</span>
                  <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {negotiationTarget.supplierName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">الصنف والكود:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {negotiationTarget.itemDesc}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">الفئة والكمية المطلوبة:</span>
                  <span className="font-semibold text-slate-700">
                    {negotiationTarget.category} | {negotiationTarget.qty} قطعة
                  </span>
                </div>
              </div>

              {/* Price Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-100/70 p-3.5 rounded-xl border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">السعر الأصلي السابق</label>
                  <div className="font-mono font-black text-base text-slate-700">
                    {negotiationTarget.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    <span className="text-xs font-normal text-slate-500 mr-1">ج.م</span>
                  </div>
                </div>

                <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-300 ring-2 ring-emerald-500/20">
                  <label className="text-[11px] font-bold text-emerald-800 block mb-1">السعر التفاوضي الجديد (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={negotiationTarget.newPrice || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setNegotiationTarget(prev => prev ? { ...prev, newPrice: isNaN(val) ? 0 : val } : null);
                    }}
                    className="w-full font-mono font-black text-lg text-emerald-900 bg-white border border-emerald-300 rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200">
                <label className="text-[11px] font-bold text-blue-900 block mb-1">كود SAP الخاص بهذا العرض (اختياري)</label>
                <input
                  type="text"
                  value={negotiationTarget.sapCode}
                  onChange={(e) => {
                    setNegotiationTarget(prev => prev ? { ...prev, sapCode: e.target.value } : null);
                  }}
                  className="w-full font-mono font-bold text-sm text-blue-950 bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="M003-30201004-000264"
                  dir="ltr"
                />
                <p className="text-[10px] text-blue-700 mt-1 leading-relaxed">
                  اكتب كود SAP للرقم الذي سيورده هذا المورد. لو تُرك فارغًا، سيتم الرجوع إلى كود البند الأساسي.
                </p>
              </div>

              {/* Quick Discount Shortcuts */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 block">نسب تخفيض سريعة للتفاوض:</span>
                <div className="flex items-center gap-1.5">
                  {[5, 10, 15, 20, 25].map(pct => {
                    const discounted = Math.round((negotiationTarget.currentPrice * (1 - pct / 100)) * 100) / 100;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setNegotiationTarget(prev => prev ? { 
                            ...prev, 
                            newPrice: discounted,
                            notes: `تم الاتفاق على خصم تفاوضي ${pct}% من السعر المبدئي`
                          } : null);
                        }}
                        className="flex-1 py-1 px-2 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-300 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                      >
                        -{pct}%
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Impact / Evaluation Live Preview */}
              {negotiationTarget.newPrice > 0 && (
                <div className="rounded-xl p-3.5 border text-xs space-y-1.5 bg-blue-50/70 border-blue-200 text-blue-950">
                  <div className="flex items-center justify-between font-bold">
                    <span>إجمالي قيمة البند بالسعر الجديد ({negotiationTarget.qty} قطعة):</span>
                    <span className="font-mono text-sm text-blue-900">
                      {(negotiationTarget.newPrice * negotiationTarget.qty).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                    </span>
                  </div>
                  {negotiationTarget.newPrice < negotiationTarget.currentPrice && (
                    <div className="text-emerald-700 font-bold flex items-center gap-1">
                      <span>📉 وفر إجمالي:</span>
                      <span className="font-mono">
                        {((negotiationTarget.currentPrice - negotiationTarget.newPrice) * negotiationTarget.qty).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                      </span>
                      <span>({Math.round(((negotiationTarget.currentPrice - negotiationTarget.newPrice) / negotiationTarget.currentPrice) * 100)}% خصم)</span>
                    </div>
                  )}

                  {negotiationTarget.currentWinningPrice !== undefined && (
                    <div className="pt-1 border-t border-blue-200/60 mt-1">
                      {negotiationTarget.newPrice < negotiationTarget.currentWinningPrice ? (
                        <div className="text-emerald-700 font-black flex items-center gap-1">
                          <span>🏆 الفوز المؤكد: السعر الجديد أقل من العرض الفائز الحالي ({negotiationTarget.currentWinningPrice} ج.م لـ {negotiationTarget.currentWinningSupplier})، وسيتحول الفوز لهذا المورد فور الحفظ!</span>
                        </div>
                      ) : negotiationTarget.newPrice === negotiationTarget.currentWinningPrice ? (
                        <div className="text-blue-800 font-semibold">
                          متساوٍ مع العرض الأقل الحالي ({negotiationTarget.currentWinningPrice} ج.م).
                        </div>
                      ) : (
                        <div className="text-slate-600">
                          العرض الأقل الحالي لا يزال {negotiationTarget.currentWinningPrice} ج.م لـ ({negotiationTarget.currentWinningSupplier}).
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notes Field */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">ملاحظات وقرار التفاوض (اختياري)</label>
                <input
                  type="text"
                  value={negotiationTarget.notes}
                  onChange={(e) => {
                    const text = e.target.value;
                    setNegotiationTarget(prev => prev ? { ...prev, notes: text } : null);
                  }}
                  placeholder="مثال: تم التوافق مع مدير مبيعات المورد على تخفيض السعر"
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setNegotiationTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={!negotiationTarget.newPrice || negotiationTarget.newPrice <= 0}
                onClick={() => {
                  if (onUpdateSupplierPrice && negotiationTarget.newPrice > 0) {
                    onUpdateSupplierPrice(
                      negotiationTarget.rfqCode,
                      negotiationTarget.supplierName,
                      negotiationTarget.itemId,
                      negotiationTarget.offerId,
                      negotiationTarget.altNo,
                      negotiationTarget.category,
                      negotiationTarget.newPrice,
                      negotiationTarget.notes,
                      negotiationTarget.sapCode
                    );
                    confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
                    setNegotiationTarget(null);
                  }
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/20 transition-all flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>حفظ وتطبيق الترسية الفورية</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
