import React, { useMemo, useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Boxes, 
  TrendingUp, 
  Sparkles, 
  Building2, 
  Truck, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  ShieldCheck, 
  Package, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  Layers, 
  Tag, 
  Briefcase, 
  ChevronRight, 
  BarChart3, 
  PieChart, 
  ArrowRight,
  Printer,
  SlidersHorizontal,
  ExternalLink,
  Settings,
  Plus,
  Trash2,
  Edit3,
  Save,
  RotateCcw,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PurchaseOrder, RfqSession, FilterCategory, PurchaseOrderItem, ProjectDispatchRecord, ProjectStoreInfo } from '../types/procurement';
import { safeLocalStorageGet, safeLocalStorageSet } from '../services/storage';

interface OperationsDashboardTabProps {
  orders: PurchaseOrder[];
  session?: RfqSession | null;
  onNavigateToTab: (tab: string) => void;
}

export const OperationsDashboardTab: React.FC<OperationsDashboardTabProps> = ({
  orders,
  session,
  onNavigateToTab
}) => {
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'all' | FilterCategory>('all');
  
  // Project & Store Management Modal
  const [showProjectManagerModal, setShowProjectManagerModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectStoreInfo | null>(null);
  const [newStoreCode, setNewStoreCode] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newLocation, setNewLocation] = useState('');

  // Persistent Real Projects & Stores Registry
  const [projectsList, setProjectsList] = useState<ProjectStoreInfo[]>(() => {
    // 1. Try to load from localStorage
    const saved = safeLocalStorageGet<ProjectStoreInfo[]>('siac_custom_projects_stores', []);
    if (saved && saved.length > 0) return saved;

    // 2. Extract dynamically from active session items if any exist
    const extractedFromSession = new Map<string, ProjectStoreInfo>();

    // Central Store 9004 is always essential
    extractedFromSession.set('9004', {
      id: 'store-9004',
      store_code: '9004',
      project_name: 'المخزن المركزي 9004 (الإدارة المركزية)',
      location: 'الورش المركزية — القاهرة',
      is_central: true
    });

    if (session?.items) {
      session.items.forEach(item => {
        if (item.projects && Array.isArray(item.projects)) {
          item.projects.forEach(p => {
            const trimmed = String(p).trim();
            if (trimmed) {
              const id = `proj-${trimmed.replace(/\s+/g, '-').toLowerCase()}`;
              if (!extractedFromSession.has(id)) {
                // Check if name contains a store code (e.g. 9015, 9021)
                const storeMatch = trimmed.match(/\b(90\d{2})\b/);
                extractedFromSession.set(id, {
                  id,
                  store_code: storeMatch ? storeMatch[1] : `90${Math.floor(10 + Math.random() * 80)}`,
                  project_name: trimmed,
                  location: 'موقع العمليات'
                });
              }
            }
          });
        }
      });
    }

    if (extractedFromSession.size > 1) {
      return Array.from(extractedFromSession.values());
    }

    // Default real SIAC store codes
    return [
      { id: 'proj-9004', store_code: '9004', project_name: 'المخزن المركزي 9004 (قطع الغيار والفلاتر)', location: 'الورش المركزية', is_central: true },
      { id: 'proj-9012', store_code: '9012', project_name: 'مشروع قطاع الكباري والمونوريل', location: 'موقع العاصمة والإنشاءات' },
      { id: 'proj-9021', store_code: '9021', project_name: 'مشروع محطة معالجة الصرف والتحلية', location: 'موقع العمليات' },
      { id: 'proj-9055', store_code: '9055', project_name: 'مشروع القطار الكهربائي السريع', location: 'المحطات والمسار' }
    ];
  });

  // Save projects list on change
  useEffect(() => {
    safeLocalStorageSet('siac_custom_projects_stores', projectsList);
  }, [projectsList]);

  // Handle Add or Edit Project
  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      alert('⚠️ يرجى إدخال اسم المشروع');
      return;
    }

    if (editingProject) {
      setProjectsList(prev => prev.map(p => {
        if (p.id !== editingProject.id) return p;
        return {
          ...p,
          store_code: newStoreCode.trim() || p.store_code,
          project_name: newProjectName.trim(),
          location: newLocation.trim() || p.location
        };
      }));
      setEditingProject(null);
    } else {
      const newProj: ProjectStoreInfo = {
        id: `proj-${Date.now()}`,
        store_code: newStoreCode.trim() || `90${Math.floor(10 + Math.random() * 80)}`,
        project_name: newProjectName.trim(),
        location: newLocation.trim() || 'موقع المشروع'
      };
      setProjectsList(prev => [...prev, newProj]);
    }

    setNewStoreCode('');
    setNewProjectName('');
    setNewLocation('');
  };

  // Delete project
  const handleDeleteProject = (id: string, name: string) => {
    if (window.confirm(`هل أنت متأكد من حذف مشروع (${name})؟`)) {
      setProjectsList(prev => prev.filter(p => p.id !== id));
    }
  };

  // Auto-extract real projects from current session & orders
  const handleAutoExtractProjects = () => {
    const extracted = new Map<string, ProjectStoreInfo>();

    // Central 9004
    extracted.set('9004', {
      id: 'proj-9004',
      store_code: '9004',
      project_name: 'المخزن المركزي 9004 (الإدارة المركزية)',
      location: 'الورش المركزية',
      is_central: true
    });

    if (session?.items) {
      session.items.forEach(item => {
        if (item.projects && Array.isArray(item.projects)) {
          item.projects.forEach(p => {
            const str = String(p).trim();
            if (str) {
              const match = str.match(/\b(90\d{2})\b/);
              const storeCode = match ? match[1] : `90${Math.floor(10 + Math.random() * 80)}`;
              const key = `${storeCode}-${str}`;
              if (!extracted.has(key)) {
                extracted.set(key, {
                  id: `proj-${Date.now()}-${Math.random()}`,
                  store_code: storeCode,
                  project_name: str,
                  location: 'موقع العمليات الفعلي'
                });
              }
            }
          });
        }
      });
    }

    const result = Array.from(extracted.values());
    setProjectsList(result);
    alert(`✅ تم استخراج ${result.length} مشروع ومخزن حقيقي من بياناتك الحالية بنجاح!`);
  };

  // Clear all projects to enter real ones
  const handleClearAllProjects = () => {
    if (window.confirm('هل تريد تفريغ قائمة المشروعات لإدخال أسماء المشروعات وأرقام المخازن الحقيقية لشركتكم؟')) {
      setProjectsList([
        { id: 'proj-9004', store_code: '9004', project_name: 'المخزن المركزي 9004', location: 'الورش المركزية', is_central: true }
      ]);
    }
  };

  // Compute Comprehensive Dashboard Metrics
  const metrics = useMemo(() => {
    let totalPoValue = 0;
    let totalOrderedPieces = 0;
    let totalReceivedIn9004 = 0;
    let totalDispatchedToProjects = 0;

    // Category metrics
    const categoryData: Record<FilterCategory, {
      pieces: number;
      value: number;
      receivedPieces: number;
      dispatchedPieces: number;
      itemsCount: number;
    }> = {
      'أصلي': { pieces: 0, value: 0, receivedPieces: 0, dispatchedPieces: 0, itemsCount: 0 },
      'هاي كوبي': { pieces: 0, value: 0, receivedPieces: 0, dispatchedPieces: 0, itemsCount: 0 },
      'صناعة محلي': { pieces: 0, value: 0, receivedPieces: 0, dispatchedPieces: 0, itemsCount: 0 }
    };

    // Filter Type metrics
    const filterTypesMap: Record<string, { pieces: number; value: number; received: number }> = {};

    // Supplier metrics
    const suppliersMap: Record<string, {
      poNumber: string;
      value: number;
      orderedPieces: number;
      receivedPieces: number;
      itemsCount: number;
    }> = {};

    // Real Projects map based on user's registered projectsList
    const projectStatsMap: Record<string, {
      storeCode: string;
      demandedPieces: number;
      receivedPieces: number;
      dispatchedPieces: number;
      items: { name: string; mat_code?: string; qty: number; received: number; dispatched: number; category: FilterCategory }[];
    }> = {};

    // Initialize map from registered projects
    projectsList.forEach(p => {
      projectStatsMap[p.project_name] = {
        storeCode: p.store_code,
        demandedPieces: 0,
        receivedPieces: 0,
        dispatchedPieces: 0,
        items: []
      };
    });

    // Populate from orders
    orders.forEach(po => {
      totalPoValue += po.total_value;

      if (!suppliersMap[po.supplier]) {
        suppliersMap[po.supplier] = {
          poNumber: po.po_number,
          value: 0,
          orderedPieces: 0,
          receivedPieces: 0,
          itemsCount: 0
        };
      }
      suppliersMap[po.supplier].value += po.total_value;

      po.items.forEach(item => {
        const qty = item.qty || 0;
        const total = item.total || (qty * item.unit_price) || 0;
        const rec = item.received_qty || 0;
        const dispatchesSum = item.dispatches?.reduce((sum, d) => sum + d.qty, 0) || 0;

        totalOrderedPieces += qty;
        totalReceivedIn9004 += rec;
        totalDispatchedToProjects += dispatchesSum;

        suppliersMap[po.supplier].orderedPieces += qty;
        suppliersMap[po.supplier].receivedPieces += rec;
        suppliersMap[po.supplier].itemsCount += 1;

        // Category stats
        const cat = item.category || 'أصلي';
        if (categoryData[cat]) {
          categoryData[cat].pieces += qty;
          categoryData[cat].value += total;
          categoryData[cat].receivedPieces += rec;
          categoryData[cat].dispatchedPieces += dispatchesSum;
          categoryData[cat].itemsCount += 1;
        }

        // Filter Type stats
        const ftype = item.filter_type || 'فلتر';
        if (!filterTypesMap[ftype]) {
          filterTypesMap[ftype] = { pieces: 0, value: 0, received: 0 };
        }
        filterTypesMap[ftype].pieces += qty;
        filterTypesMap[ftype].value += total;
        filterTypesMap[ftype].received += rec;

        // Record Dispatches per Project
        if (item.dispatches && item.dispatches.length > 0) {
          item.dispatches.forEach(d => {
            if (!projectStatsMap[d.project]) {
              projectStatsMap[d.project] = { storeCode: '9004', demandedPieces: 0, receivedPieces: 0, dispatchedPieces: 0, items: [] };
            }
            projectStatsMap[d.project].dispatchedPieces += d.qty;
            projectStatsMap[d.project].demandedPieces += d.qty;
            projectStatsMap[d.project].items.push({
              name: item.desc || item.filter_no,
              mat_code: item.mat_code,
              qty: d.qty,
              received: d.qty,
              dispatched: d.qty,
              category: item.category
            });
          });
        }
      });
    });

    // Auto-calculate demand from session items if items have real project names
    if (session && session.items) {
      session.items.forEach(item => {
        const itemProjects = item.projects && item.projects.length > 0 ? item.projects : [];
        if (itemProjects.length > 0) {
          const perProjectQty = Math.ceil((item.qty_needed || 1) / itemProjects.length);
          itemProjects.forEach(proj => {
            // Find matching project
            const matched = projectsList.find(p => p.project_name.toLowerCase() === proj.toLowerCase() || proj.includes(p.store_code));
            const projKey = matched ? matched.project_name : proj;
            
            if (!projectStatsMap[projKey]) {
              projectStatsMap[projKey] = { storeCode: matched?.store_code || '9004', demandedPieces: 0, receivedPieces: 0, dispatchedPieces: 0, items: [] };
            }
            projectStatsMap[projKey].demandedPieces += perProjectQty;
          });
        }
      });
    }

    const receivingRate = totalOrderedPieces > 0 ? Math.round((totalReceivedIn9004 / totalOrderedPieces) * 100) : 0;
    const dispatchRate = totalReceivedIn9004 > 0 ? Math.round((totalDispatchedToProjects / totalReceivedIn9004) * 100) : 0;

    return {
      totalPoValue,
      totalOrderedPieces,
      totalReceivedIn9004,
      totalDispatchedToProjects,
      receivingRate,
      dispatchRate,
      categoryData,
      filterTypesMap,
      suppliersMap,
      projectStatsMap
    };
  }, [orders, session, projectsList]);

  return (
    <div className="w-full space-y-6 animate-in fade-in">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-blue-900/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-blue-300">منظومة SIAC للمشتريات والمخازن</span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                لوحة العمليات الحية (Operations Live)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              داشبورد العمليات — متابعة أوامر الشراء والاستلام وصرف المشروعات
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              شاشة تحليلية موحدة توضح إحصائيات التوريد، المقارنة البصرية لجودة الفلاتر (أصلي vs هاي كوبي vs محلي)، ونسب التغطية والتسليم لكل مخزن ومشروع حقيقي في شركة SIAC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Manage Real Projects Button */}
            <button
              onClick={() => setShowProjectManagerModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Settings className="w-4 h-4 text-amber-200" />
              <span>⚙️ إدارة المشروعات وأرقام المخازن ({projectsList.length})</span>
            </button>

            <button
              onClick={() => onNavigateToTab('compare')}
              className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>مقارنة العروض والترسية</span>
            </button>
            <button
              onClick={() => onNavigateToTab('tracker')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>إدارة الاستلام بمخزن 9004</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* 1. TOP STATS ROW: FINANCIALS, VOLUMES & RECEIVING PROGRESS */}
      {/* ========================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total POs Value */}
        <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-5 rounded-2xl border border-slate-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-300">إجمالي قيمة أوامر الشراء الصادرة</span>
            <span className="p-2 rounded-xl bg-blue-600/30 text-blue-300 border border-blue-400/30">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono mt-2">
            {metrics.totalPoValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs font-normal">ج.م</span>
          </div>
          <div className="text-[11px] text-slate-300 mt-2 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>مسندة إلى <strong>{Object.keys(metrics.suppliersMap).length} موردين فائزين</strong></span>
          </div>
        </div>

        {/* Card 2: Total Filter Pieces Ordered */}
        <div className="bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 text-white p-5 rounded-2xl border border-purple-800/50 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-300">إجمالي كمية الفلاتر المطلوبة</span>
            <span className="p-2 rounded-xl bg-purple-600/30 text-purple-300 border border-purple-400/30">
              <Boxes className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-purple-200 font-mono mt-2">
            {metrics.totalOrderedPieces.toLocaleString('en-US')} <span className="text-xs font-normal font-sans">قطعة فلتر</span>
          </div>
          <div className="text-[11px] text-purple-300/80 mt-2 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>موزعة عبر <strong>{orders.length} أوامر شراء</strong></span>
          </div>
        </div>

        {/* Card 3: Received in 9004 */}
        <div className="bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-900 text-white p-5 rounded-2xl border border-emerald-800/50 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300">الفلاتر الموردة والمستلمة بـ 9004</span>
            <span className="p-2 rounded-xl bg-emerald-600/30 text-emerald-300 border border-emerald-400/30">
              <ArrowDownToLine className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono mt-2">
            {metrics.totalReceivedIn9004.toLocaleString('en-US')} <span className="text-xs font-normal font-sans">({metrics.receivingRate}%)</span>
          </div>
          <div className="w-full bg-emerald-950 rounded-full h-2 mt-2 border border-emerald-800/60 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full transition-all duration-700"
              style={{ width: `${metrics.receivingRate}%` }}
            ></div>
          </div>
        </div>

        {/* Card 4: Dispatched to Sites */}
        <div className="bg-gradient-to-br from-amber-950 via-orange-950 to-slate-900 text-white p-5 rounded-2xl border border-amber-800/50 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300">المنصرف لمواقع المشروعات</span>
            <span className="p-2 rounded-xl bg-amber-600/30 text-amber-300 border border-amber-400/30">
              <ArrowUpFromLine className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono mt-2">
            {metrics.totalDispatchedToProjects.toLocaleString('en-US')} <span className="text-xs font-normal font-sans">قطعة</span>
          </div>
          <div className="text-[11px] text-amber-200/80 mt-2 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-amber-400" />
            <span>متاحة للصرف بالمخزن: <strong>{Math.max(0, metrics.totalReceivedIn9004 - metrics.totalDispatchedToProjects)} قطعة</strong></span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DYNAMIC CATEGORY COMPARISON CARDS (أصلي vs هاي كوبي vs صناعة محلي)    */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                مقارنة فئات الجودة للترسية (Original vs High Copy vs Local)
              </h3>
              <p className="text-xs text-slate-400">تحليل كميات وقيم ونسب التوريد حسب فئة كل فلتر</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSelectedCategoryTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${selectedCategoryTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setSelectedCategoryTab('أصلي')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${selectedCategoryTab === 'أصلي' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              💎 أصلي
            </button>
            <button
              onClick={() => setSelectedCategoryTab('هاي كوبي')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${selectedCategoryTab === 'هاي كوبي' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              🔷 هاي كوبي
            </button>
            <button
              onClick={() => setSelectedCategoryTab('صناعة محلي')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${selectedCategoryTab === 'صناعة محلي' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              🔶 محلي
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* CATEGORY 1: ORIGINAL (أصلي) */}
          {(selectedCategoryTab === 'all' || selectedCategoryTab === 'أصلي') && (
            <div className="bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white border-2 border-emerald-300 rounded-2xl p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-black text-emerald-950 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-xl">
                  💎 الفلاتر الأصلية (Original)
                </span>
                <span className="text-xs font-mono font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  {metrics.totalOrderedPieces > 0 ? Math.round((metrics.categoryData['أصلي'].pieces / metrics.totalOrderedPieces) * 100) : 0}% من الكمية
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-inner">
                  <span className="block text-[10px] text-slate-500 font-bold">الكمية المطلوبة</span>
                  <span className="text-2xl font-black text-emerald-800 font-mono">
                    {metrics.categoryData['أصلي'].pieces.toLocaleString('en-US')} <span className="text-xs font-normal">قطعة</span>
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-inner">
                  <span className="block text-[10px] text-slate-500 font-bold">إجمالي القيمة</span>
                  <span className="text-lg font-black text-slate-900 font-mono">
                    {metrics.categoryData['أصلي'].value.toLocaleString('en-US', { minimumFractionDigits: 0 })} <span className="text-[10px]">ج.م</span>
                  </span>
                </div>
              </div>

              {/* Progress: Received in 9004 */}
              <div className="bg-white p-3.5 rounded-xl border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-bold flex items-center gap-1">
                    <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" />
                    <span>المستلم فعلياً بـ 9004:</span>
                  </span>
                  <span className="font-mono font-black text-emerald-700">
                    {metrics.categoryData['أصلي'].receivedPieces} / {metrics.categoryData['أصلي'].pieces} قطعة
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${metrics.categoryData['أصلي'].pieces > 0 ? (metrics.categoryData['أصلي'].receivedPieces / metrics.categoryData['أصلي'].pieces) * 100 : 0}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* CATEGORY 2: HIGH COPY (هاي كوبي) */}
          {(selectedCategoryTab === 'all' || selectedCategoryTab === 'هاي كوبي') && (
            <div className="bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-white border-2 border-blue-300 rounded-2xl p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-black text-blue-950 bg-blue-100 border border-blue-300 px-3 py-1 rounded-xl">
                  🔷 فلاتر هاي كوبي (High Copy)
                </span>
                <span className="text-xs font-mono font-black text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  {metrics.totalOrderedPieces > 0 ? Math.round((metrics.categoryData['هاي كوبي'].pieces / metrics.totalOrderedPieces) * 100) : 0}% من الكمية
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="bg-white p-3 rounded-xl border border-blue-200/80 shadow-inner">
                  <span className="block text-[10px] text-slate-500 font-bold">الكمية المطلوبة</span>
                  <span className="text-2xl font-black text-blue-800 font-mono">
                    {metrics.categoryData['هاي كوبي'].pieces.toLocaleString('en-US')} <span className="text-xs font-normal">قطعة</span>
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-200/80 shadow-inner">
                  <span className="block text-[10px] text-slate-500 font-bold">إجمالي القيمة</span>
                  <span className="text-lg font-black text-slate-900 font-mono">
                    {metrics.categoryData['هاي كوبي'].value.toLocaleString('en-US', { minimumFractionDigits: 0 })} <span className="text-[10px]">ج.م</span>
                  </span>
                </div>
              </div>

              {/* Progress: Received in 9004 */}
              <div className="bg-white p-3.5 rounded-xl border border-blue-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-bold flex items-center gap-1">
                    <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600" />
                    <span>المستلم فعلياً بـ 9004:</span>
                  </span>
                  <span className="font-mono font-black text-blue-700">
                    {metrics.categoryData['هاي كوبي'].receivedPieces} / {metrics.categoryData['هاي كوبي'].pieces} قطعة
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${metrics.categoryData['هاي كوبي'].pieces > 0 ? (metrics.categoryData['هاي كوبي'].receivedPieces / metrics.categoryData['هاي كوبي'].pieces) * 100 : 0}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* CATEGORY 3: LOCAL (صناعة محلي) */}
          {(selectedCategoryTab === 'all' || selectedCategoryTab === 'صناعة محلي') && (
            <div className="bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-white border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-black text-amber-950 bg-amber-100 border border-amber-300 px-3 py-1 rounded-xl">
                  🔶 فلاتر صناعة محلي (Local)
                </span>
                <span className="text-xs font-mono font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  {metrics.totalOrderedPieces > 0 ? Math.round((metrics.categoryData['صناعة محلي'].pieces / metrics.totalOrderedPieces) * 100) : 0}% من الكمية
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-inner">
                  <span className="block text-[10px] text-slate-500 font-bold">الكمية المطلوبة</span>
                  <span className="text-2xl font-black text-amber-800 font-mono">
                    {metrics.categoryData['صناعة محلي'].pieces.toLocaleString('en-US')} <span className="text-xs font-normal">قطعة</span>
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-inner">
                  <span className="block text-[10px] text-slate-500 font-bold">إجمالي القيمة</span>
                  <span className="text-lg font-black text-slate-900 font-mono">
                    {metrics.categoryData['صناعة محلي'].value.toLocaleString('en-US', { minimumFractionDigits: 0 })} <span className="text-[10px]">ج.م</span>
                  </span>
                </div>
              </div>

              {/* Progress: Received in 9004 */}
              <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-bold flex items-center gap-1">
                    <ArrowDownToLine className="w-3.5 h-3.5 text-amber-600" />
                    <span>المستلم فعلياً بـ 9004:</span>
                  </span>
                  <span className="font-mono font-black text-amber-700">
                    {metrics.categoryData['صناعة محلي'].receivedPieces} / {metrics.categoryData['صناعة محلي'].pieces} قطعة
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${metrics.categoryData['صناعة محلي'].pieces > 0 ? (metrics.categoryData['صناعة محلي'].receivedPieces / metrics.categoryData['صناعة محلي'].pieces) * 100 : 0}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. REAL PROJECTS & STORE NUMBERS SUPPLY FULFILLMENT CARDS                 */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  المشروعات وأرقام المخازن الحقيقية لشركة SIAC
                </h3>
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                  {projectsList.length} مخازن ومشروعات معتمدة
                </span>
              </div>
              <p className="text-xs text-slate-400">متابعة الفلاتر المخصصة والمنصرفة لكل موقع مشروع ومخزنه التابع</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowProjectManagerModal(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-300 transition-all flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>تعديل وإضافة المشروعات والمخازن</span>
            </button>

            <select
              value={selectedProjectFilter}
              onChange={e => setSelectedProjectFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
            >
              <option value="all">🏗️ جميع المشروعات ({projectsList.length})</option>
              {projectsList.map(p => (
                <option key={p.id} value={p.project_name}>
                  [مخزن {p.store_code}] {p.project_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Real Projects & Stores Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projectsList
            .filter(p => selectedProjectFilter === 'all' || p.project_name === selectedProjectFilter)
            .map((proj, idx) => {
              const pData = metrics.projectStatsMap[proj.project_name] || {
                storeCode: proj.store_code,
                demandedPieces: 0,
                receivedPieces: 0,
                dispatchedPieces: 0,
                items: []
              };

              const demanded = pData.demandedPieces;
              const dispatched = pData.dispatchedPieces;
              const fulfillmentPct = demanded > 0 ? Math.min(100, Math.round((dispatched / demanded) * 100)) : (dispatched > 0 ? 100 : 0);

              const cardColors = [
                { bg: 'bg-blue-50/70 border-blue-200 text-blue-950', badge: 'bg-blue-600 text-white', bar: 'from-blue-600 to-indigo-600' },
                { bg: 'bg-emerald-50/70 border-emerald-200 text-emerald-950', badge: 'bg-emerald-600 text-white', bar: 'from-emerald-600 to-teal-600' },
                { bg: 'bg-purple-50/70 border-purple-200 text-purple-950', badge: 'bg-purple-600 text-white', bar: 'from-purple-600 to-pink-600' },
                { bg: 'bg-amber-50/70 border-amber-200 text-amber-950', badge: 'bg-amber-600 text-white', bar: 'from-amber-600 to-orange-600' },
                { bg: 'bg-teal-50/70 border-teal-200 text-teal-950', badge: 'bg-teal-600 text-white', bar: 'from-teal-600 to-cyan-600' }
              ];
              const c = cardColors[idx % cardColors.length];

              return (
                <div 
                  key={proj.id}
                  className={`rounded-2xl p-5 border ${c.bg} space-y-3.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between`}
                >
                  <div className="space-y-2.5">
                    {/* Header: Store Code Badge + Status */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black font-mono px-2.5 py-0.5 rounded-lg shadow-sm ${c.badge}`}>
                        مخزن: {proj.store_code}
                      </span>
                      <span className="text-[11px] font-mono font-bold bg-white/90 px-2.5 py-0.5 rounded-full border border-slate-200">
                        {fulfillmentPct === 100 && dispatched > 0 ? '✅ مكتمل' : dispatched > 0 ? '⏳ جاري الصرف' : 'قيد الانتظار'}
                      </span>
                    </div>

                    {/* Real Project Name & Location */}
                    <div>
                      <h4 className="text-sm font-black tracking-tight text-slate-900 leading-snug">
                        {proj.project_name}
                      </h4>
                      {proj.location && (
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{proj.location}</p>
                      )}
                    </div>

                    {/* Numbers Overview */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200 shadow-inner">
                        <span className="block text-[10px] text-slate-500 font-bold">الاحتياج المطلوب</span>
                        <span className="text-lg font-black font-mono text-slate-800">
                          {demanded} <span className="text-[10px] font-normal font-sans">قطعة</span>
                        </span>
                      </div>
                      <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200 shadow-inner">
                        <span className="block text-[10px] text-slate-500 font-bold">المنصرف للموقع</span>
                        <span className="text-lg font-black font-mono text-emerald-700">
                          {dispatched} <span className="text-[10px] font-normal font-sans">قطعة</span>
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-700">
                        <span>نسبة التغطية:</span>
                        <span className="font-mono">{fulfillmentPct}%</span>
                      </div>
                      <div className="w-full bg-white rounded-full h-2 overflow-hidden border border-slate-300">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${c.bar}`}
                          style={{ width: `${fulfillmentPct}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigateToTab('tracker')}
                    className="w-full bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs py-2 rounded-xl border border-slate-300 transition-all flex items-center justify-center gap-1.5 shadow-sm mt-1"
                  >
                    <span>صرف فلاتر للمشروع 🚚</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. FILTER TYPES FUNCTIONAL BREAKDOWN (جاز، زيت، هواء، هيدروليك...)        */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              توزيع الفلاتر حسب النوع والوظيفة الميكانيكية
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {Object.keys(metrics.filterTypesMap).length} أنواع فلاتر مسجلة
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(metrics.filterTypesMap).map(([ftype, data], idx) => {
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
              <div key={ftype} className={`p-4 rounded-2xl border ${colorClass} space-y-1.5 shadow-sm flex flex-col justify-between`}>
                <div className="text-xs font-bold truncate" title={ftype}>{ftype}</div>
                <div>
                  <div className="text-xl font-black font-mono">
                    {data.pieces.toLocaleString('en-US')} <span className="text-[10px] font-normal font-sans">قطعة</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 font-semibold mt-0.5">
                    {data.value.toLocaleString('en-US', { minimumFractionDigits: 0 })} ج.م
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: MANAGE REAL PROJECTS & STORE NUMBERS (إدارة المشروعات والمخازن)    */}
      {/* ========================================================================= */}
      {showProjectManagerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-in fade-in my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    إدارة المشروعات وأرقام المخازن المعتمدة (SIAC Projects & Stores)
                  </h3>
                  <p className="text-xs text-slate-400">
                    يمكنك حذف المشروعات التجريبية، وتعديل أسماء المشروعات وأرقام المخازن الحقيقية لشركتكم
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProjectManagerModal(false);
                  setEditingProject(null);
                }}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="text-xs font-bold text-slate-700">
                المشروعات المسجلة حالياً: <strong className="text-blue-700 font-mono">{projectsList.length} مشروعات</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoExtractProjects}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition-all flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>استخراج تلقائي من بيانات SAP الحالية</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearAllProjects}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-rose-200 transition-all flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ للبدء الفعلي</span>
                </button>
              </div>
            </div>

            {/* Add / Edit Form */}
            <form onSubmit={handleSaveProject} className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/80 space-y-3">
              <h4 className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>{editingProject ? 'تعديل بيانات المشروع / المخزن' : 'إضافة مشروع ورقم مخزن جديد'}</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-700 mb-1">
                    رقم المخزن (Store #) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newStoreCode}
                    onChange={e => setNewStoreCode(e.target.value)}
                    placeholder="مثال: 9021"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div className="sm:col-span-6">
                  <label className="block font-bold text-slate-700 mb-1">
                    اسم المشروع الحقيقي <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    placeholder="مثال: مشروع محطة الصرف والتحلية — قطاع السخنة"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-700 mb-1">الموقع / المدينة</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="مثال: العين السخنة"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {editingProject && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProject(null);
                      setNewStoreCode('');
                      setNewProjectName('');
                      setNewLocation('');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    إلغاء التعديل
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow transition-all flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingProject ? 'حفظ التعديلات' : 'إضافة المشروع للقائمة'}</span>
                </button>
              </div>
            </form>

            {/* List of Registered Projects & Store Numbers Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-3 bg-slate-900 text-white text-xs font-bold flex justify-between">
                <span>سجل المشروعات والمخازن المسجلة</span>
                <span>{projectsList.length} سجل</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                {projectsList.map(p => (
                  <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg text-xs">
                        مخزن: {p.store_code}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900">{p.project_name}</div>
                        {p.location && <div className="text-[11px] text-slate-400">{p.location}</div>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProject(p);
                          setNewStoreCode(p.store_code);
                          setNewProjectName(p.project_name);
                          setNewLocation(p.location || '');
                        }}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل اسم المشروع أو رقم المخزن"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(p.id, p.project_name)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="حذف هذا المشروع"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowProjectManagerModal(false);
                  setEditingProject(null);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all"
              >
                إغلاق وتطبيق التغييرات ✅
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
