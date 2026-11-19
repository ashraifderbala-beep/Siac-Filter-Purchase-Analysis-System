import React, { useEffect, useState, useMemo } from 'react';
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
  ArrowUpFromLine,
  SlidersHorizontal,
  ArrowUpDown,
  LayoutGrid,
  ListFilter,
  RefreshCw,
  FileSpreadsheet,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PurchaseOrder, POStatus, FilterCategory, PurchaseOrderItem, ProjectDispatchRecord, ReceivedSupplierIdentity, RfqSession } from '../types/procurement';
import { STATUS_META } from './PoDetailModal';
import { safeLocalStorageGet } from '../services/storage';
import { createInventoryRequestId } from '../services/supabaseProcurement';
import { ExecutiveReportModal } from './ExecutiveReportModal';
import { ReassignItemModal } from './ReassignItemModal';
import { CancelAndReallocateSupplierModal } from './CancelAndReallocateSupplierModal';
import { getPurchaseOrderItemTotal } from '../services/purchaseOrderTotals';
import { getFilterIdentity } from '../services/filterIdentity';

interface TrackerTabProps {
  orders: PurchaseOrder[];
  session?: RfqSession | null;
  warehouseMode?: boolean;
  isAdmin?: boolean;
  onAdvanceStatus: (poId: string, nextStatus: POStatus, note?: string) => void;
  onOpenPoDetail: (po: PurchaseOrder) => void;
  onCreateManualPo: (po: Partial<PurchaseOrder>) => void;
  onUpdateItemReceiving?: (
    poId: string,
    itemIdx: number,
    receivedQty: number,
    voucherNo: string,
    notes: string,
    receivedSupplierIdentity: ReceivedSupplierIdentity
  ) => Promise<boolean>;
  onDispatchToProject?: (poId: string, itemIdx: number, record: ProjectDispatchRecord) => Promise<boolean>;
  onReassignSupplierItem?: (
    sourcePoId: string,
    targetSupplier: string,
    itemIdx: number,
    transferQty: number,
    newUnitPrice: number,
    newCategory: FilterCategory,
    reason: string
  ) => void;
  onCancelAndReallocatePo?: (
    sourcePoId: string,
    targetSupplier: string,
    updatedItems: PurchaseOrderItem[],
    reason: string,
    actionType: 'reallocate' | 'cancel_only'
  ) => void;
  onSyncLatestOffers?: () => void;
  onNavigateToCompare?: () => void;
  onExportSupplierPo?: (po: PurchaseOrder) => void;
}

export const TrackerTab: React.FC<TrackerTabProps> = ({
  orders,
  session,
  warehouseMode = false,
  isAdmin = false,
  onAdvanceStatus,
  onOpenPoDetail,
  onCreateManualPo,
  onUpdateItemReceiving,
  onDispatchToProject,
  onReassignSupplierItem,
  onCancelAndReallocatePo,
  onSyncLatestOffers,
  onNavigateToCompare,
  onExportSupplierPo
}) => {
  // Main Sub-Tab selection
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'orders' | 'receiving_9004' | 'dispatch_projects'>(
    warehouseMode ? 'receiving_9004' : 'dashboard'
  );

  useEffect(() => {
    if (warehouseMode && (activeSubTab === 'dashboard' || activeSubTab === 'orders')) {
      setActiveSubTab('receiving_9004');
    }
  }, [warehouseMode, activeSubTab]);

  // Executive 1-Page Report Modal state
  const [showExecutiveReport, setShowExecutiveReport] = useState(false);

  // Price Drop & Savings Details Modal state
  const [showSavingsDetailsModal, setShowSavingsDetailsModal] = useState(false);

  // Cancel & Disqualify Supplier Modal state
  const [cancelModalPo, setCancelModalPo] = useState<PurchaseOrder | null>(null);

  // Reassign Modal state
  const [reassignModalData, setReassignModalData] = useState<{
    sourcePo: PurchaseOrder;
    item: PurchaseOrderItem;
    itemIdx: number;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<
    | 'po_asc'
    | 'po_desc'
    | 'supplier_asc'
    | 'supplier_desc'
    | 'status_flow'
    | 'value_desc'
    | 'value_asc'
    | 'pieces_desc'
    | 'pieces_asc'
    | 'items_desc'
    | 'date_desc'
    | 'date_asc'
    | 'fulfillment_desc'
    | 'fulfillment_asc'
  >('po_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Receiving inline edit state: map of `poId-itemIdx` -> { receivedQty, voucherNo, notes }
  const [receivingInputs, setReceivingInputs] = useState<Record<string, {
    receivedQty: number;
    voucherNo: string;
    notes: string;
    supplierPartNumber: string;
    supplierBrand: string;
    supplierSapCode: string;
  }>>({});
  const supplierReceiptDefaults = (item: PurchaseOrderItem) => {
    const identity = getFilterIdentity(item);
    const confirmed = item.received_supplier_identity_confirmed === true;
    return {
      supplierPartNumber: confirmed
        ? item.received_supplier_part_number || ''
        : item.received_supplier_part_number || (identity.supplierNumber === '—' ? '' : identity.supplierNumber),
      supplierBrand: confirmed
        ? item.received_supplier_brand || ''
        : item.received_supplier_brand || identity.supplierBrand,
      supplierSapCode: confirmed
        ? item.received_supplier_sap_code || ''
        : item.received_supplier_sap_code || (identity.supplierSapCode === '—' ? '' : identity.supplierSapCode)
    };
  };

  // Dispatch modal / form state
  const [dispatchModalItem, setDispatchModalItem] = useState<{ po: PurchaseOrder; item: PurchaseOrderItem; itemIdx: number } | null>(null);
  const [dispatchQty, setDispatchQty] = useState<number>(1);
  const [dispatchVoucher, setDispatchVoucher] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatchRequest, setDispatchRequest] = useState<{ fingerprint: string; id: string } | null>(null);

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

  const dispatchProjects = useMemo(() => {
    const projects = new Map(
      registeredProjects
        .filter(project => project.store_code !== '9004')
        .map(project => [project.project_name, project])
    );
    orders.forEach(order => order.items.forEach(item => {
      (item.award_project_allocations || item.project_allocations || []).forEach(allocation => {
        if (!projects.has(allocation.project)) {
          projects.set(allocation.project, {
            id: allocation.project,
            store_code: '—',
            project_name: allocation.project
          });
        }
      });
    }));
    return [...projects.values()];
  }, [orders, registeredProjects]);

  const [dispatchProject, setDispatchProject] = useState(() => {
    return dispatchProjects[0]?.project_name
      || 'المخزن المركزي 9004';
  });

  useEffect(() => {
    if (dispatchProjects.length > 0 && !dispatchProjects.some(project => project.project_name === dispatchProject)) {
      setDispatchProject(dispatchProjects[0].project_name);
    }
  }, [dispatchProject, dispatchProjects]);

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
        const total = getPurchaseOrderItemTotal(item);
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

  // Real-time Detection of Supplier Portal Updates & Price Drop Opportunities (مثل تحديثات المورد سعيد سعدان)
  const savingsOpportunity = useMemo(() => {
    if (!session || !session.items || !session.submissions) return null;

    // Map existing awarded items in POs for this session/RFQ
    const currentPoItemsMap: Record<string, { poId: string; poNumber: string; supplier: string; unit_price: number; qty: number; total: number }> = {};
    
    orders.filter(o => !o.rfq_code || o.rfq_code === session.code).forEach(po => {
      if (po.status === 'cancelled') return;
      po.items.forEach(it => {
        if (it.mat_code) currentPoItemsMap[it.mat_code] = { poId: po.id, poNumber: po.po_number, supplier: po.supplier, unit_price: it.unit_price, qty: it.qty, total: getPurchaseOrderItemTotal(it) };
        if (it.desc) currentPoItemsMap[it.desc] = { poId: po.id, poNumber: po.po_number, supplier: po.supplier, unit_price: it.unit_price, qty: it.qty, total: getPurchaseOrderItemTotal(it) };
        if (it.filter_no) currentPoItemsMap[it.filter_no] = { poId: po.id, poNumber: po.po_number, supplier: po.supplier, unit_price: it.unit_price, qty: it.qty, total: getPurchaseOrderItemTotal(it) };
      });
    });

    let totalPotentialSavings = 0;
    const cheaperItems: {
      itemId: string;
      desc: string;
      matCode: string;
      qty: number;
      currentPoSupplier: string;
      currentPoPrice: number;
      bestSupplier: string;
      bestPrice: number;
      bestCategory: FilterCategory;
      savings: number;
      isNewOffer: boolean;
    }[] = [];

    const newSuppliersSet = new Set<string>();

    session.items.forEach(item => {
      const allOffers: { supplier: string; unit_price: number; category: FilterCategory; notes?: string }[] = [];
      session.submissions.forEach(sub => {
        const itemOffers = sub.offers[item.id] || sub.offers[`item-${item.item_no}`] || [];
        itemOffers.forEach(o => {
          if (o.unit_price > 0) {
            allOffers.push({ supplier: sub.supplier_name, unit_price: o.unit_price, category: o.category, notes: o.notes });
          }
        });
      });

      if (allOffers.length === 0) return;
      allOffers.sort((a, b) => a.unit_price - b.unit_price);
      const best = allOffers[0];

      const currentPo = currentPoItemsMap[item.mat_code] || currentPoItemsMap[item.primary_number];
      if (currentPo) {
        if (best.unit_price < currentPo.unit_price) {
          const itemSavings = (currentPo.unit_price - best.unit_price) * item.qty_needed;
          totalPotentialSavings += itemSavings;
          newSuppliersSet.add(best.supplier);
          cheaperItems.push({
            itemId: item.id,
            desc: item.primary_number,
            matCode: item.mat_code,
            qty: item.qty_needed,
            currentPoSupplier: currentPo.supplier,
            currentPoPrice: currentPo.unit_price,
            bestSupplier: best.supplier,
            bestPrice: best.unit_price,
            bestCategory: best.category,
            savings: itemSavings,
            isNewOffer: false
          });
        }
      } else {
        newSuppliersSet.add(best.supplier);
        cheaperItems.push({
          itemId: item.id,
          desc: item.primary_number,
          matCode: item.mat_code,
          qty: item.qty_needed,
          currentPoSupplier: 'لم يصدر له أمر شراء بعد',
          currentPoPrice: 0,
          bestSupplier: best.supplier,
          bestPrice: best.unit_price,
          bestCategory: best.category,
          savings: 0,
          isNewOffer: true
        });
      }
    });

    if (cheaperItems.length === 0) return null;

    return {
      totalPotentialSavings,
      cheaperItemsCount: cheaperItems.length,
      suppliersList: Array.from(newSuppliersSet),
      items: cheaperItems
    };
  }, [session, orders]);

  // Handle saving receiving info in Store 9004
  const handleSaveReceiving = async (poId: string, itemIdx: number, orderedQty: number) => {
    const key = `${poId}-${itemIdx}`;
    const item = orders.find(order => order.id === poId)?.items[itemIdx];
    if (!item) return;
    const input = receivingInputs[key] || {
      receivedQty: orderedQty,
      voucherNo: '',
      notes: '',
      ...supplierReceiptDefaults(item)
    };
    
    if (!onUpdateItemReceiving) return;
    const saved = await onUpdateItemReceiving(
      poId,
      itemIdx,
      input.receivedQty,
      input.voucherNo,
      input.notes,
      {
        partNumber: input.supplierPartNumber,
        brand: input.supplierBrand,
        sapCode: input.supplierSapCode
      }
    );
    if (!saved) return;

    confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    alert(`✅ تم تسجيل استلام (${input.receivedQty} من ${orderedQty} قطعة) في المخزن 9004 بنجاح!`);
  };

  // Quick 100% Receiving
  const handleQuickFullReceive = async (poId: string, itemIdx: number, orderedQty: number) => {
    const key = `${poId}-${itemIdx}`;
    const item = orders.find(order => order.id === poId)?.items[itemIdx];
    if (!item) return;
    const input = receivingInputs[key] || {
      receivedQty: orderedQty,
      voucherNo: '',
      notes: '',
      ...supplierReceiptDefaults(item)
    };
    const voucher = input.voucherNo || `REC-9004-${Date.now().toString().slice(-4)}`;
    const notes = input.notes || 'تم الاستلام بالكامل مطابق للمواصفات';

    setReceivingInputs(prev => ({
      ...prev,
      [key]: { ...input, receivedQty: orderedQty, voucherNo: voucher, notes }
    }));

    if (!onUpdateItemReceiving) return;
    const saved = await onUpdateItemReceiving(poId, itemIdx, orderedQty, voucher, notes, {
      partNumber: input.supplierPartNumber,
      brand: input.supplierBrand,
      sapCode: input.supplierSapCode
    });
    if (!saved) return;
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
  };

  // Handle Dispatch to Project submit
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalItem) return;

    const { po, item, itemIdx } = dispatchModalItem;
    const availableIn9004 = (item.received_qty || 0) - (item.dispatches?.reduce((sum, d) => sum + d.qty, 0) || 0);
    const projectAllocation = item.project_allocations?.find(allocation => allocation.project === dispatchProject);
    const dispatchedToProject = item.dispatches
      ?.filter(dispatch => dispatch.project === dispatchProject)
      .reduce((sum, dispatch) => sum + dispatch.qty, 0) || 0;
    const remainingProjectQuota = projectAllocation
      ? Math.max(0, projectAllocation.qty - dispatchedToProject)
      : 0;
    const maximumDispatch = Math.min(availableIn9004, remainingProjectQuota);

    if (!projectAllocation) {
      alert('⚠️ لا توجد حصة مسجلة لهذا الصنف في المشروع المختار. يرجى مراجعة مسؤول المشتريات قبل الصرف.');
      return;
    }
    if (dispatchQty <= 0 || dispatchQty > maximumDispatch) {
      alert(`⚠️ الكمية المصروفة يجب أن تكون بين 1 و ${maximumDispatch} قطعة (الأقل من الحصة المتبقية ورصيد 9004)`);
      return;
    }

    const voucherNo = dispatchVoucher.trim() || `DISP-${Date.now().toString().slice(-4)}`;
    const fingerprint = JSON.stringify([
      po.id, itemIdx, dispatchProject, dispatchQty, voucherNo, dispatchNotes.trim()
    ]);
    const requestId = dispatchRequest?.fingerprint === fingerprint
      ? dispatchRequest.id
      : createInventoryRequestId();
    setDispatchRequest({ fingerprint, id: requestId });
    const record: ProjectDispatchRecord = {
      id: requestId,
      project: dispatchProject,
      qty: dispatchQty,
      voucher_no: voucherNo,
      dispatched_at: new Date().toLocaleString('ar-EG'),
      notes: dispatchNotes.trim()
    };

    if (!onDispatchToProject) return;
    const saved = await onDispatchToProject(po.id, itemIdx, record);
    if (!saved) return;

    confetti({ particleCount: 70, spread: 80 });
    setDispatchModalItem(null);
    setDispatchQty(1);
    setDispatchVoucher('');
    setDispatchNotes('');
    setDispatchRequest(null);
    alert(`🚚 تم صرف ${record.qty} قطعة لـ (${record.project}) بنجاح بموجب إذن صرف رقم: ${record.voucher_no}`);
  };

  // Unique suppliers list with stats for filter dropdown
  const uniqueSuppliers = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    orders.forEach(o => {
      const sup = o.supplier || 'مورد عام';
      const existing = map.get(sup) || { count: 0, total: 0 };
      map.set(sup, {
        count: existing.count + 1,
        total: existing.total + o.total_value
      });
    });
    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      total: data.total
    }));
  }, [orders]);

  // Filtered and Sorted Orders (Search across PO#, Supplier, Items, Codes, Notes, Category)
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const STATUS_ORDER_MAP: Record<string, number> = {
      draft: 1,
      rfq_sent: 2,
      price_evaluated: 3,
      approved: 4,
      issued: 5,
      partially_received: 6,
      completed: 7,
      cancelled: 8
    };

    const getPoPieces = (po: PurchaseOrder) => po.items.reduce((sum, it) => sum + (it.qty || 0), 0);
    const getPoFulfillmentPct = (po: PurchaseOrder) => {
      const tot = po.items.reduce((sum, it) => sum + (it.qty || 0), 0);
      const rec = po.items.reduce((sum, it) => sum + (it.received_qty || 0), 0);
      return tot > 0 ? (rec / tot) * 100 : 0;
    };

    const result = orders.filter(o => {
      const matchesSearch = !q ||
        o.po_number.toLowerCase().includes(q) ||
        o.supplier.toLowerCase().includes(q) ||
        o.title.toLowerCase().includes(q) ||
        (o.rfq_code && o.rfq_code.toLowerCase().includes(q)) ||
        (o.notes && o.notes.toLowerCase().includes(q)) ||
        o.items.some(it => 
          (it.desc && it.desc.toLowerCase().includes(q)) ||
          (it.filter_no && it.filter_no.toLowerCase().includes(q)) ||
          (it.mat_code && it.mat_code.toLowerCase().includes(q)) ||
          (it.category && it.category.toLowerCase().includes(q)) ||
          (it.filter_type && it.filter_type.toLowerCase().includes(q))
        );

      const matchesStatus = selectedStatus === 'all' || o.status === selectedStatus;
      const matchesSupplier = selectedSupplierFilter === 'all' || o.supplier.trim().toLowerCase() === selectedSupplierFilter.trim().toLowerCase();
      const matchesCategory = selectedCategoryFilter === 'all' || o.items.some(it => it.category === selectedCategoryFilter);
      
      return matchesSearch && matchesStatus && matchesSupplier && matchesCategory;
    });

    // 14-Criteria High-Speed Sorting
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'po_asc':
          return a.po_number.localeCompare(b.po_number, 'ar-EG', { numeric: true });
        case 'po_desc':
          return b.po_number.localeCompare(a.po_number, 'ar-EG', { numeric: true });
        case 'supplier_asc':
          return a.supplier.localeCompare(b.supplier, 'ar-EG');
        case 'supplier_desc':
          return b.supplier.localeCompare(a.supplier, 'ar-EG');
        case 'status_flow':
          return (STATUS_ORDER_MAP[a.status] || 99) - (STATUS_ORDER_MAP[b.status] || 99);
        case 'value_desc':
          return b.total_value - a.total_value;
        case 'value_asc':
          return a.total_value - b.total_value;
        case 'pieces_desc':
          return getPoPieces(b) - getPoPieces(a);
        case 'pieces_asc':
          return getPoPieces(a) - getPoPieces(b);
        case 'items_desc':
          return b.items.length - a.items.length;
        case 'date_desc':
          return (b.created_at || '').localeCompare(a.created_at || '');
        case 'date_asc':
          return (a.created_at || '').localeCompare(b.created_at || '');
        case 'fulfillment_desc':
          return getPoFulfillmentPct(b) - getPoFulfillmentPct(a);
        case 'fulfillment_asc':
          return getPoFulfillmentPct(a) - getPoFulfillmentPct(b);
        default:
          return 0;
      }
    });
  }, [orders, searchQuery, selectedStatus, selectedSupplierFilter, selectedCategoryFilter, sortBy]);

  // Statistics for currently filtered results
  const filteredMetrics = useMemo(() => {
    let pieces = 0;
    let receivedPieces = 0;
    let total = 0;
    const suppliersSet = new Set<string>();

    filteredOrders.forEach(o => {
      total += o.total_value;
      if (o.supplier) suppliersSet.add(o.supplier);
      o.items.forEach(it => {
        pieces += (it.qty || 0);
        receivedPieces += (it.received_qty || 0);
      });
    });

    const fulfillmentPct = pieces > 0 ? Math.round((receivedPieces / pieces) * 100) : 0;

    return {
      count: filteredOrders.length,
      pieces,
      receivedPieces,
      fulfillmentPct,
      total,
      suppliersCount: suppliersSet.size
    };
  }, [filteredOrders]);

  const hasActiveFilters = 
    searchQuery.trim() !== '' || 
    selectedStatus !== 'all' || 
    selectedSupplierFilter !== 'all' || 
    selectedCategoryFilter !== 'all' || 
    sortBy !== 'po_asc';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSelectedSupplierFilter('all');
    setSelectedCategoryFilter('all');
    setSortBy('po_asc');
  };

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
          <h3 className="text-xl font-black text-slate-900">
            {warehouseMode ? 'لا توجد أوامر توريد متاحة للمخزن 9004' : 'لم يتم إصدار أوامر شراء (POs) بعد'}
          </h3>
          {!warehouseMode && (
            <>
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
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Smart Savings & Supplier Portal Price Updates Alert Banner (تنبيه تحديثات بوابة الموردين مثل سعيد سعدان) */}
      {!warehouseMode && savingsOpportunity && savingsOpportunity.cheaperItemsCount > 0 && (
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-amber-300/40 relative overflow-hidden animate-in fade-in">
          {/* Background subtle glow */}
          <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative z-10">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-white/20 text-white backdrop-blur-md px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-sm">
                  <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                  <span>تنبيه ذكي: عروض أسعار جديدة ومحدثة من بوابة الموردين!</span>
                </span>
                {savingsOpportunity.totalPotentialSavings > 0 && (
                  <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-black shadow-sm">
                    💰 وفر مالي متاح: {savingsOpportunity.totalPotentialSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                  </span>
                )}
                <span className="bg-black/20 text-white px-2.5 py-0.5 rounded-full text-xs font-medium">
                  {savingsOpportunity.cheaperItemsCount} أصناف فلاتر
                </span>
              </div>
              
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                المورد [{savingsOpportunity.suppliersList.join('، ')}] وموردون آخرون قدموا أسعاراً أقل لأصناف تم عمل أوامر شراء (PO) لها!
              </h3>
              
              <p className="text-xs sm:text-sm text-amber-100 max-w-3xl leading-relaxed">
                تم رصد عروض أحدث عبر <strong>بوابة الموردين</strong> توفر أسعاراً منافسة. بمجرد الضغط على زر المزامنة، يقوم النظام باستبدال وتحديث مسودات أوامر الشراء المعلقة للموردين الأقل سعراً تلقائياً وتحديث التقرير الإداري فوراً دون الحاجة لإعادة إنشاء كل شيء يدوياً!
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              {onSyncLatestOffers && (
                <button
                  type="button"
                  onClick={onSyncLatestOffers}
                  className="bg-white hover:bg-amber-50 text-slate-900 text-xs sm:text-sm font-black px-5 py-3 rounded-2xl shadow-xl transition-all flex items-center gap-2 hover:scale-105 active:scale-95 cursor-pointer"
                  title="تحديث واستبدال أوامر الشراء المعلقة بأحدث الأسعار والموردين الفائزين فوراً"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                  <span>🔄 مزامنة وتحديث أوامر الشراء فوراً بأقل الأسعار</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSavingsDetailsModal(true)}
                className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-3 rounded-2xl transition-all border border-white/30 backdrop-blur-md flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-amber-200" />
                <span>🔍 تفاصيل الفروق والوفر</span>
              </button>

              {onNavigateToCompare && (
                <button
                  type="button"
                  onClick={onNavigateToCompare}
                  className="bg-black/25 hover:bg-black/40 text-white text-xs font-bold px-4 py-3 rounded-2xl transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📊 شاشة المقارنة</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Main Navigation Sub-Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full sm:w-auto">
          {!warehouseMode && <button
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
          </button>}

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

          {!warehouseMode && <button
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
          </button>}
        </div>

        <div className="flex items-center gap-2 mr-auto">
          {onSyncLatestOffers && !warehouseMode && (
            <button
              type="button"
              onClick={onSyncLatestOffers}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 hover:scale-105"
              title="إعادة مزامنة أوامر الشراء مع تقرير الترسية الحالي (الكميات والأسعار والفئات) مع الحفاظ على أرقام الأوامر وسجلات الاستلام"
            >
              <RefreshCw className="w-4 h-4 text-amber-200" />
              <span>🔄 تحديث الأوامر حسب تقرير الترسية</span>
            </button>
          )}

          {isAdmin && !warehouseMode && <button
            type="button"
            onClick={() => setShowExecutiveReport(true)}
            className="bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 hover:scale-105"
            title="طباعة التقرير الشامل المعتمد لمدير الإدارة شاملاً ضريبة القيمة المضافة 14%"
          >
            <Printer className="w-4 h-4 text-amber-300" />
            <span>📄 تقرير شامل لمدير الإدارة (شامل 14% ضريبة)</span>
          </button>}

          {!warehouseMode && <button
            onClick={() => setShowCreateModal(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ أمر شراء جديد</span>
          </button>}
        </div>
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
              <table className="w-full text-right border-collapse text-xs min-w-[1500px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="p-3 font-bold w-12 text-center">م</th>
                    <th className="p-3 font-bold min-w-[210px]">الفلتر المطلوب للشراء</th>
                    <th className="p-3 font-bold min-w-[300px] bg-blue-50 text-blue-900">بيانات المورد والاستلام الفعلي</th>
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
                    .filter(po => po.status !== 'cancelled')
                    .filter(po => selectedSupplierFilter === 'all' || po.supplier === selectedSupplierFilter)
                    .map((po) => {
                      return po.items.map((item, itemIdx) => {
                        const key = `${po.id}-${itemIdx}`;
                        const identity = getFilterIdentity(item);
                        const currentInput = receivingInputs[key] || {
                          receivedQty: item.received_qty !== undefined ? item.received_qty : 0,
                          voucherNo: item.delivery_voucher || '',
                          notes: item.receiving_notes || '',
                          ...supplierReceiptDefaults(item)
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
                              <div className="font-bold text-slate-900">{identity.requestedNumber}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {item.mat_code && (
                                  <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200" dir="ltr">
                                    SAP: {identity.requestedSapCode}
                                  </span>
                                )}
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200 font-semibold">
                                  {item.category}
                                </span>
                              </div>
                            </td>

                            <td className="p-3 bg-blue-50/30">
                              <div className="space-y-1">
                                <div className="font-mono font-black text-blue-800 break-words">
                                  رقم العرض: {identity.supplierNumber}
                                </div>
                                <div className="text-[10px] text-slate-600">
                                  الماركة: {identity.supplierBrand || 'غير مسجلة'}
                                </div>
                                <div className="text-[10px] font-mono text-slate-600" dir="ltr">
                                  SAP المورد: {identity.supplierSapCode}
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-1 border-t border-blue-100 pt-2">
                                <label className="text-[9px] font-bold text-slate-600">
                                  رقم المستلم فعليًا
                                  <input
                                    value={currentInput.supplierPartNumber}
                                    onChange={event => setReceivingInputs(prev => ({
                                      ...prev,
                                      [key]: { ...currentInput, supplierPartNumber: event.target.value }
                                    }))}
                                    className="mt-1 w-full rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[10px]"
                                  />
                                </label>
                                <label className="text-[9px] font-bold text-slate-600">
                                  الماركة المستلمة
                                  <input
                                    value={currentInput.supplierBrand}
                                    onChange={event => setReceivingInputs(prev => ({
                                      ...prev,
                                      [key]: { ...currentInput, supplierBrand: event.target.value }
                                    }))}
                                    className="mt-1 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-[10px]"
                                  />
                                </label>
                                <label className="text-[9px] font-bold text-slate-600">
                                  SAP المورد المستلم
                                  <input
                                    value={currentInput.supplierSapCode}
                                    onChange={event => setReceivingInputs(prev => ({
                                      ...prev,
                                      [key]: { ...currentInput, supplierSapCode: event.target.value }
                                    }))}
                                    className="mt-1 w-full rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[10px]"
                                    dir="ltr"
                                  />
                                </label>
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
                                max={orderedQty}
                                value={currentInput.receivedQty}
                                onChange={e => {
                                  const val = Math.max(0, Math.min(orderedQty, parseInt(e.target.value, 10) || 0));
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
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleSaveReceiving(po.id, itemIdx, orderedQty)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg shadow-sm transition-all flex items-center gap-1"
                                  title="حفظ الكمية والملاحظات في المخزن 9004"
                                >
                                  <span>💾 حفظ</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickFullReceive(po.id, itemIdx, orderedQty)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2 py-1 rounded-lg border border-slate-300 transition-all"
                                  title="استلام كامل (100%) بنقرة واحدة"
                                >
                                  الكل ({orderedQty})
                                </button>
                                {shortage > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setReassignModalData({ sourcePo: po, item, itemIdx })}
                                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[11px] px-2 py-1 rounded-lg shadow-2xs transition-all flex items-center gap-1"
                                    title="نقل وتحويل كمية العجز أو البند لمورد بديل آخر"
                                  >
                                    <RotateCcw className="w-3 h-3 text-amber-600" />
                                    <span>تحويل لبديل ({shortage})</span>
                                  </button>
                                )}
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
                  {registeredProjects.length} مواقع مشاريع
                </span>
              </div>
            </div>
          </div>

          {/* Selected project fulfillment & shortage snapshot */}
          {(() => {
            const rows = orders
              .filter(po => po.status !== 'cancelled')
              .flatMap(po => po.items.flatMap((item, itemIdx) => {
                const allocation = (item.award_project_allocations || item.project_allocations)
                  ?.find(entry => entry.project === dispatchProject);
                if (!allocation) return [];
                const dispatched = item.dispatches
                  ?.filter(entry => entry.project === dispatchProject)
                  .reduce((sum, entry) => sum + entry.qty, 0) || 0;
                return [{
                  key: `${po.id}-${itemIdx}`,
                  poNumber: po.po_number,
                  supplier: po.supplier,
                  identity: getFilterIdentity(item),
                  quota: allocation.qty,
                  dispatched,
                  remaining: Math.max(0, allocation.qty - dispatched),
                  ordered: item.qty || 0,
                  received: item.received_qty || 0,
                  supplierShortage: Math.max(0, (item.qty || 0) - (item.received_qty || 0))
                }];
              }));

            const totalQuota = rows.reduce((sum, row) => sum + row.quota, 0);
            const totalDispatched = rows.reduce((sum, row) => sum + row.dispatched, 0);
            const totalRemaining = rows.reduce((sum, row) => sum + row.remaining, 0);
            const itemsWithShortage = rows.filter(row => row.remaining > 0);

            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-gradient-to-l from-rose-50 to-amber-50 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      عجز وحالة توريد المشروع المحدد: <span className="text-amber-800">{dispatchProject}</span>
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">
                    يعتمد على حصة كل صنف في أمر الشراء مقابل ما تم صرفه فعلياً للمشروع
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-center">
                    <div className="text-[10px] font-bold text-indigo-700">إجمالي الحصة المعتمدة للمشروع</div>
                    <div className="mt-1 font-mono text-xl font-black text-indigo-900">{totalQuota} قطعة</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <div className="text-[10px] font-bold text-emerald-700">تم صرفه فعلياً للمشروع</div>
                    <div className="mt-1 font-mono text-xl font-black text-emerald-900">{totalDispatched} قطعة</div>
                  </div>
                  <div className={`rounded-xl border p-3 text-center ${totalRemaining > 0 ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className={`text-[10px] font-bold ${totalRemaining > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>العجز المتبقي للمشروع</div>
                    <div className={`mt-1 font-mono text-xl font-black ${totalRemaining > 0 ? 'text-rose-900' : 'text-emerald-900'}`}>{totalRemaining} قطعة</div>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="px-4 pb-4 text-xs font-bold text-amber-800 bg-amber-50/60">
                    لا توجد حصص مسجلة لهذا المشروع في أوامر الشراء. تأكد من تطابق اسم المشروع في التوزيع (project_allocations) مع الاسم المحدد هنا.
                  </p>
                ) : itemsWithShortage.length === 0 ? (
                  <p className="px-4 pb-4 text-xs font-bold text-emerald-700">
                    ✅ تم صرف كامل الحصة المعتمدة لهذا المشروع.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border-t border-slate-100">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-[10px] font-black text-slate-500 sticky top-0">
                        <tr>
                          <th className="p-2">الفلتر المطلوب</th>
                          <th className="p-2">رقم/ماركة المورد</th>
                          <th className="p-2 text-center">حصة المشروع</th>
                          <th className="p-2 text-center">تم صرفه</th>
                          <th className="p-2 text-center">عجز المشروع</th>
                          <th className="p-2 text-center">عجز توريد المورد (إجمالي البند)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itemsWithShortage.map(row => (
                          <tr key={row.key} className="hover:bg-rose-50/40">
                            <td className="p-2">
                              <div className="font-bold text-slate-900">{row.identity.requestedNumber}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{row.poNumber} · {row.supplier}</div>
                            </td>
                            <td className="p-2 font-mono font-bold text-blue-800">{row.identity.supplierNumber}</td>
                            <td className="p-2 text-center font-mono">{row.quota}</td>
                            <td className="p-2 text-center font-mono text-emerald-700">{row.dispatched}</td>
                            <td className="p-2 text-center">
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono font-black text-rose-700">
                                {row.remaining}
                              </span>
                            </td>
                            <td className="p-2 text-center font-mono">
                              {row.supplierShortage > 0 ? (
                                <span className="font-bold text-amber-700">{row.supplierShortage} قطعة لم تُورد</span>
                              ) : (
                                <span className="font-bold text-emerald-700">تم توريد البند بالكامل</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Project Dispatch Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold">أرصدة الفلاتر المستلمة في 9004 وحالة الصرف للمشروعات</h4>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold">
                <span>المشروع:</span>
                <select
                  value={dispatchProject}
                  onChange={event => setDispatchProject(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-white"
                >
                  {dispatchProjects.map(project => (
                    <option key={project.id} value={project.project_name}>{project.project_name}</option>
                  ))}
                </select>
              </label>
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
                    <th className="p-3 font-bold text-center">حصة المشروع المحدد / المتبقي</th>
                    <th className="p-3 font-bold text-center bg-amber-50 text-amber-900">المتاح للصرف بـ 9004</th>
                    <th className="p-3 font-bold min-w-[200px]">سجل الصرف للمواقع</th>
                    <th className="p-3 font-bold text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.filter(po => po.status !== 'cancelled').map((po) => {
                    return po.items.map((item, itemIdx) => {
                      const identity = getFilterIdentity(item);
                      const received = item.received_qty || 0;
                      const dispatchedTotal = item.dispatches?.reduce((sum, d) => sum + d.qty, 0) || 0;
                      const availableIn9004 = Math.max(0, received - dispatchedTotal);
                      const selectedProjectQuota = item.project_allocations?.find(
                        allocation => allocation.project === dispatchProject
                      );
                      const dispatchedToSelectedProject = item.dispatches
                        ?.filter(dispatch => dispatch.project === dispatchProject)
                        .reduce((sum, dispatch) => sum + dispatch.qty, 0) || 0;

                      return (
                        <tr key={`${po.id}-${itemIdx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-mono font-bold text-slate-500">
                            #{itemIdx + 1}
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-900">{identity.requestedNumber}</div>
                            <span className="block text-[10px] text-slate-500 font-mono" dir="ltr">
                              SAP المطلوب: {identity.requestedSapCode}
                            </span>
                            <div className="text-[10px] font-bold text-blue-700 mt-1 break-words">
                              المستلم: <span className="font-mono">{identity.receivedSupplierNumber}</span>
                            </div>
                            <div className="text-[10px] text-slate-600">
                              الماركة: {identity.receivedSupplierBrand}
                            </div>
                            <div className="text-[10px] text-slate-600 font-mono" dir="ltr">
                              SAP المورد: {identity.receivedSupplierSapCode}
                            </div>
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

                          <td className="p-3 text-center font-mono font-bold text-indigo-800">
                            {selectedProjectQuota
                              ? `${selectedProjectQuota.qty} / ${Math.max(0, selectedProjectQuota.qty - dispatchedToSelectedProject)} قطعة`
                              : 'لا توجد حصة مسجلة'}
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
                                const fallbackProject = item.project_allocations?.[0]?.project;
                                const targetProject = item.project_allocations?.some(
                                  allocation => allocation.project === dispatchProject
                                )
                                  ? dispatchProject
                                  : fallbackProject || dispatchProject;
                                if (targetProject) setDispatchProject(targetProject);

                                const targetQuota = item.project_allocations?.find(
                                  allocation => allocation.project === targetProject
                                )?.qty || 0;
                                const targetDispatched = item.dispatches
                                  ?.filter(dispatch => dispatch.project === targetProject)
                                  .reduce((sum, dispatch) => sum + dispatch.qty, 0) || 0;
                                const maxQty = Math.max(
                                  0,
                                  Math.min(availableIn9004, targetQuota - targetDispatched)
                                );

                                setDispatchModalItem({ po, item, itemIdx });
                                setDispatchQty(maxQty > 0 ? maxQty : 1);
                                setDispatchVoucher(`DISP-${Date.now().toString().slice(-4)}`);
                                setDispatchRequest(null);
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

          {/* Advanced Search, Filtering & Quick Sort Toolbar */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            {/* 1. Main Search & Fast Dropdowns Row */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Universal Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-blue-600 absolute right-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 بحث سريع: رقم PO (مثال PO-202610-001)، اسم المورد، الصنف، كود المادة، الفئة، أو الملاحظات..."
                  className="w-full pr-10 pl-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-full w-5 h-5 flex items-center justify-center font-bold transition-colors"
                    title="مسح البحث"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter & Sort Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Supplier Filter Dropdown */}
                <div className="relative min-w-[170px] flex-1 sm:flex-none">
                  <select
                    value={selectedSupplierFilter}
                    onChange={e => setSelectedSupplierFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="all">🏢 كافة الموردين ({uniqueSuppliers.length})</option>
                    {uniqueSuppliers.map(sup => (
                      <option key={sup.name} value={sup.name}>
                        {sup.name} ({sup.count} أمر - {sup.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter Dropdown */}
                <div className="relative min-w-[150px] flex-1 sm:flex-none">
                  <select
                    value={selectedStatus}
                    onChange={e => setSelectedStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="all">📑 كافة الحالات ({orders.length})</option>
                    {(Object.keys(STATUS_META) as POStatus[]).map(statusKey => {
                      const meta = STATUS_META[statusKey];
                      const count = orders.filter(o => o.status === statusKey).length;
                      return (
                        <option key={statusKey} value={statusKey}>
                          {meta.icon} {meta.label} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Quality / Category Filter */}
                <div className="relative min-w-[140px] flex-1 sm:flex-none">
                  <select
                    value={selectedCategoryFilter}
                    onChange={e => setSelectedCategoryFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="all">💎 جميع الفئات (أصلي/هاي كوبي/محلي)</option>
                    <option value="أصلي">💎 فئة أصلي (Original)</option>
                    <option value="هاي كوبي">🔷 فئة هاي كوبي (High Copy)</option>
                    <option value="صناعة محلي">🔶 فئة صناعة محلي (Local)</option>
                  </select>
                </div>

                {/* Fast Sort Dropdown */}
                <div className="relative min-w-[190px] flex-1 sm:flex-none">
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="w-full bg-blue-50/80 border border-blue-300 text-blue-950 rounded-xl px-3 py-2.5 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer"
                  >
                    <option value="po_asc">🔢 رقم أمر الشراء (تصاعدي 1 ⬅ 9)</option>
                    <option value="po_desc">🔢 رقم أمر الشراء (تنازلي 9 ⬅ 1)</option>
                    <option value="supplier_asc">🏢 اسم المورد (أبجدياً أ - ي)</option>
                    <option value="supplier_desc">🏢 اسم المورد (أبجدياً ي - أ)</option>
                    <option value="status_flow">🚦 ترتيب مسار العمل (مسودة ⬅ مكتمل)</option>
                    <option value="value_desc">💰 القيمة المالية (الأعلى أولاً)</option>
                    <option value="value_asc">💵 القيمة المالية (الأقل أولاً)</option>
                    <option value="pieces_desc">📦 إجمالي الكمية بالقطع (الأكبر أولاً)</option>
                    <option value="pieces_asc">📦 إجمالي الكمية بالقطع (الأقل أولاً)</option>
                    <option value="items_desc">📋 عدد الأصناف (الأكثر أصنافاً أولاً)</option>
                    <option value="fulfillment_desc">📈 نسبة التوريد والاستلام (الأعلى أولاً)</option>
                    <option value="fulfillment_asc">⏳ نسبة التوريد والاستلام (الأقل أولاً)</option>
                    <option value="date_desc">🕒 تاريخ الإنشاء (الأحدث أولاً)</option>
                    <option value="date_asc">⏳ تاريخ الإنشاء (الأقدم أولاً)</option>
                  </select>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      viewMode === 'grid'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="عرض البطاقات (Grid View)"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline">بطاقات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      viewMode === 'table'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="عرض الجدول الموحد (Table View)"
                  >
                    <ListFilter className="w-4 h-4" />
                    <span className="hidden sm:inline">جدول</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Quick 1-Click Supplier Pills & Category Quick Selectors */}
            {uniqueSuppliers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 ml-1">فرز سريع بالمورد:</span>
                <button
                  type="button"
                  onClick={() => setSelectedSupplierFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    selectedSupplierFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  الكل ({orders.length})
                </button>
                {uniqueSuppliers.slice(0, 6).map(sup => (
                  <button
                    key={sup.name}
                    type="button"
                    onClick={() => setSelectedSupplierFilter(selectedSupplierFilter === sup.name ? 'all' : sup.name)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                      selectedSupplierFilter === sup.name
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/60'
                    }`}
                  >
                    <Building2 className="w-3 h-3" />
                    <span>{sup.name}</span>
                    <span className={`px-1 py-0.2 rounded text-[10px] ${selectedSupplierFilter === sup.name ? 'bg-blue-700 text-white' : 'bg-white text-blue-900 font-mono'}`}>
                      {sup.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 3. Active Filters & Statistics Summary Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500 font-semibold">نتائج الفلترة:</span>
                <span className="font-bold bg-blue-50 text-blue-800 px-2.5 py-1 rounded-lg border border-blue-200">
                  {filteredMetrics.count} من أصل {orders.length} أمر شراء
                </span>
                <span className="font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200">
                  {filteredMetrics.pieces.toLocaleString('en-US')} قطعة ({filteredMetrics.fulfillmentPct}% مستلم بـ 9004)
                </span>
                <span className="font-mono font-black bg-slate-900 text-white px-2.5 py-1 rounded-lg">
                  {filteredMetrics.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                </span>
                <span className="font-bold bg-purple-50 text-purple-800 px-2 py-1 rounded-lg border border-purple-200">
                  {filteredMetrics.suppliersCount} موردين مشمولين
                </span>

                {/* Active Filter Chips */}
                {searchQuery && (
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold text-[11px]">
                    بحث: "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-700">✕</button>
                  </span>
                )}
                {selectedSupplierFilter !== 'all' && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold text-[11px]">
                    المورد: {selectedSupplierFilter}
                    <button onClick={() => setSelectedSupplierFilter('all')} className="text-blue-500 hover:text-blue-800">✕</button>
                  </span>
                )}
                {selectedStatus !== 'all' && (
                  <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold text-[11px]">
                    الحالة: {STATUS_META[selectedStatus as POStatus]?.label || selectedStatus}
                    <button onClick={() => setSelectedStatus('all')} className="text-purple-500 hover:text-purple-800">✕</button>
                  </span>
                )}
                {selectedCategoryFilter !== 'all' && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold text-[11px]">
                    الفئة: {selectedCategoryFilter}
                    <button onClick={() => setSelectedCategoryFilter('all')} className="text-amber-500 hover:text-amber-800">✕</button>
                  </span>
                )}
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center gap-1 hover:underline cursor-pointer bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة تعيين الفلاتر</span>
                </button>
              )}
            </div>
          </div>

          {/* Empty Search State */}
          {filteredOrders.length === 0 && (
            <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">لا توجد أوامر شراء مطابقة لمعايير البحث أو الفلتر</h4>
              <p className="text-xs text-slate-500">
                جرب تغيير مصطلح البحث أو اختيار مورد/حالة أخرى.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                عرض كافة أوامر الشراء ({orders.length})
              </button>
            </div>
          )}

          {/* VIEW MODE 1: GRID CARDS VIEW */}
          {viewMode === 'grid' && filteredOrders.length > 0 && (
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

                      <div className="flex items-center gap-1.5">
                        {onExportSupplierPo && (
                          <button
                            type="button"
                            onClick={() => onExportSupplierPo(po)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-2 rounded-xl transition-all flex items-center gap-1"
                            title="تصدير كارت الترسية لهذا المورد إلى Excel"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            Excel
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setCancelModalPo(po)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-2 rounded-xl transition-all"
                          title="إلغاء أمر الشراء واستبعاد المورد وترحيل الكميات"
                        >
                          إلغاء / استبعاد ❌
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenPoDetail(po)}
                          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm"
                        >
                          التفاصيل 🔍
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: DETAILED TABLE VIEW */}
          {viewMode === 'table' && filteredOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-200">
                      <th className="p-3 text-center w-10">م</th>
                      <th className="p-3">رقم أمر الشراء (PO)</th>
                      <th className="p-3">اسم المورد</th>
                      <th className="p-3">عنوان الأمر</th>
                      <th className="p-3 text-center">الحالة</th>
                      <th className="p-3 text-center">عدد الأصناف</th>
                      <th className="p-3 text-center">الكمية (قطع)</th>
                      <th className="p-3 text-center">القيمة الإجمالية</th>
                      <th className="p-3 text-center">تاريخ الإنشاء</th>
                      <th className="p-3 text-center min-w-[150px]">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((po, idx) => {
                      const meta = STATUS_META[po.status] || STATUS_META.draft;
                      const totalPieces = po.items.reduce((sum, it) => sum + (it.qty || 0), 0);
                      return (
                        <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-blue-700">{po.po_number}</td>
                          <td className="p-3 font-bold text-slate-900">{po.supplier}</td>
                          <td className="p-3 text-slate-700 max-w-[220px] truncate" title={po.title}>{po.title}</td>
                          <td className="p-3 text-center">
                            <span 
                              style={{ backgroundColor: meta.bg, color: meta.color }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 inline-block whitespace-nowrap"
                            >
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold">{po.items.length}</td>
                          <td className="p-3 text-center font-mono font-bold">{totalPieces}</td>
                          <td className="p-3 text-center font-mono font-black text-slate-900">
                            {po.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                          </td>
                          <td className="p-3 text-center font-mono text-[10px] text-slate-500">{po.created_at}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenPoDetail(po)}
                                className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-all shadow-2xs"
                              >
                                التفاصيل 🔍
                              </button>
                              {onExportSupplierPo && (
                                <button
                                  type="button"
                                  onClick={() => onExportSupplierPo(po)}
                                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-all"
                                  title="تصدير كارت الترسية للمورد Excel"
                                >
                                  Excel
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setCancelModalPo(po)}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-all"
                                title="إلغاء واستبعاد المورد"
                              >
                                إلغاء ❌
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                {getFilterIdentity(dispatchModalItem.item).requestedNumber}
              </div>
              <div className="text-[11px] font-bold text-blue-800">
                رقم/ماركة المورد: <span className="font-mono">{getFilterIdentity(dispatchModalItem.item).supplierNumber}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono" dir="ltr">
                SAP المطلوب: {getFilterIdentity(dispatchModalItem.item).requestedSapCode}
              </div>
              <div className="text-[10px] text-slate-600 font-mono" dir="ltr">
                SAP المورد المستلم: {getFilterIdentity(dispatchModalItem.item).receivedSupplierSapCode}
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>المورد: <strong>{dispatchModalItem.po.supplier}</strong></span>
                <span>المستلم بـ 9004: <strong className="text-emerald-700">{dispatchModalItem.item.received_qty || 0} قطعة</strong></span>
              </div>
              <div className="flex justify-between border-t border-amber-200 pt-2 text-slate-700">
                <span>حصة المشروع المسجلة:</span>
                <strong>{dispatchModalItem.item.project_allocations?.find(allocation => allocation.project === dispatchProject)?.qty ?? 'غير محددة'} قطعة</strong>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>تم صرفه للمشروع:</span>
                <strong>
                  {dispatchModalItem.item.dispatches
                    ?.filter(dispatch => dispatch.project === dispatchProject)
                    .reduce((sum, dispatch) => sum + dispatch.qty, 0) || 0} قطعة
                </strong>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>المتبقي / عجز المشروع:</span>
                <strong>
                  {Math.max(
                    0,
                    (dispatchModalItem.item.project_allocations?.find(
                      allocation => allocation.project === dispatchProject
                    )?.qty || 0) -
                      (dispatchModalItem.item.dispatches
                        ?.filter(dispatch => dispatch.project === dispatchProject)
                        .reduce((sum, dispatch) => sum + dispatch.qty, 0) || 0)
                  )} قطعة
                </strong>
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
                  {(dispatchModalItem.item.project_allocations?.length
                    ? dispatchModalItem.item.project_allocations.map(allocation => {
                        const store = registeredProjects.find(
                          project => project.project_name === allocation.project
                        );
                        return (
                          <option key={allocation.project} value={allocation.project}>
                            [مخزن {store?.store_code || '—'}] {allocation.project} — الحصة {allocation.qty}
                          </option>
                        );
                      })
                    : dispatchProjects.map(project => (
                        <option key={project.id || project.project_name} value={project.project_name}>
                          [مخزن {project.store_code}] {project.project_name}
                        </option>
                      ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الكمية المصروفة <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    max={Math.min(
                      Math.max(0, (dispatchModalItem.item.received_qty || 0) - (dispatchModalItem.item.dispatches?.reduce((s, d) => s + d.qty, 0) || 0)),
                      Math.max(0, (dispatchModalItem.item.project_allocations?.find(allocation => allocation.project === dispatchProject)?.qty || 0) -
                        (dispatchModalItem.item.dispatches?.filter(d => d.project === dispatchProject).reduce((sum, d) => sum + d.qty, 0) || 0))
                    )}
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

      {/* EXECUTIVE 1-PAGE SUMMARY PRINTABLE REPORT MODAL */}
      {isAdmin && showExecutiveReport && (
        <ExecutiveReportModal
          orders={session ? orders.filter(order => order.rfq_code === session.code) : orders}
          session={session}
          onClose={() => setShowExecutiveReport(false)}
        />
      )}

      {/* REASSIGN ITEM MODAL (في حال تعثر أو اعتذار مورد عن التوريد) */}
      {reassignModalData && onReassignSupplierItem && (
        <ReassignItemModal
          sourcePo={reassignModalData.sourcePo}
          item={reassignModalData.item}
          itemIdx={reassignModalData.itemIdx}
          session={session}
          allOrders={orders}
          onClose={() => setReassignModalData(null)}
          onReassignSuccess={(sourcePoId, targetSupplier, itemIdx, transferQty, newUnitPrice, newCategory, reason) => {
            onReassignSupplierItem(sourcePoId, targetSupplier, itemIdx, transferQty, newUnitPrice, newCategory, reason);
          }}
        />
      )}

      {/* CANCEL PO & DISQUALIFY SUPPLIER MODAL */}
      {cancelModalPo && onCancelAndReallocatePo && (
        <CancelAndReallocateSupplierModal
          po={cancelModalPo}
          session={session}
          allOrders={orders}
          onClose={() => setCancelModalPo(null)}
          onConfirmReallocation={(sourcePoId, targetSupplier, updatedItems, reason, actionType) => {
            onCancelAndReallocatePo(sourcePoId, targetSupplier, updatedItems, reason, actionType);
            setCancelModalPo(null);
          }}
        />
      )}

      {/* SAVINGS & NEW SUPPLIER OFFERS BREAKDOWN MODAL (كشف تفاصيل فروق الأسعار والوفر المالي) */}
      {showSavingsDetailsModal && savingsOpportunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-400/30">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    كشف فروق الأسعار والوفر المالي من بوابة الموردين
                  </h3>
                  <p className="text-xs text-blue-200/80">
                    مقارنة بين أوامر الشراء الحالية (PO) وأحدث العروض المستلمة من الموردين (مثل سعيد سعدان)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSavingsDetailsModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-right">
              {/* Summary KPIs Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold text-emerald-700 block">إجمالي الوفر الإضافي المتاح</span>
                  <span className="text-xl font-black text-emerald-900 font-mono">
                    {savingsOpportunity.totalPotentialSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold text-blue-700 block">عدد البنود المتاح تخفيضها/ترسيتها</span>
                  <span className="text-xl font-black text-blue-900 font-mono">
                    {savingsOpportunity.cheaperItemsCount} <span className="text-xs font-normal">صنف فلاتر</span>
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold text-amber-700 block">الموردون الأقل تكلفة الجدد</span>
                  <span className="text-sm font-black text-amber-900 truncate block mt-1">
                    {savingsOpportunity.suppliersList.join('، ')}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">وصف الصنف / كود المادة</th>
                        <th className="p-3 text-center">الكمية</th>
                        <th className="p-3">المورد الحالي (PO)</th>
                        <th className="p-3 text-center">سعر الـ PO الحالي</th>
                        <th className="p-3">المورد الأقل سعراً (الجديد)</th>
                        <th className="p-3 text-center">السعر الجديد</th>
                        <th className="p-3 text-center text-emerald-700">الوفر الصافي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {savingsOpportunity.items.map((it, idx) => (
                        <tr key={it.itemId || idx} className="hover:bg-amber-50/40 transition-colors">
                          <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-semibold text-slate-800">
                            <div>{it.desc}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{it.matCode}</div>
                          </td>
                          <td className="p-3 text-center font-bold font-mono text-slate-700">{it.qty}</td>
                          <td className="p-3 text-slate-600">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-[11px]">
                              {it.currentPoSupplier}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500">
                            {it.currentPoPrice > 0 ? `${it.currentPoPrice.toLocaleString()} ج.م` : '—'}
                          </td>
                          <td className="p-3">
                            <span className="bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-lg text-[11px] border border-emerald-300">
                              {it.bestSupplier}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">
                            {it.bestPrice.toLocaleString()} ج.م
                          </td>
                          <td className="p-3 text-center font-mono font-black text-emerald-800">
                            {it.savings > 0 ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
                                +{it.savings.toLocaleString()} ج.م
                              </span>
                            ) : (
                              <span className="text-blue-600 text-[10px]">عرض جديد</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>ملاحظة للمهندس المسؤول:</strong> عند الضغط على زر التحديث أدناه، سيتم استبدال مسودات أوامر الشراء فوراً وترحيل البنود للمورد الفائز الجديد [سعيد سعدان / الموردين الأرخص]. سينعكس هذا التوفير لحظياً على شاشة المتابعة وعلى <strong>التقرير الصادر للإدارة</strong>.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowSavingsDetailsModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                إغلاق
              </button>

              {onSyncLatestOffers && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSavingsDetailsModal(false);
                    onSyncLatestOffers();
                  }}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs px-6 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>🔄 اعتماد المزامنة وتحديث كافة أوامر الشراء والتقرير الآن</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
