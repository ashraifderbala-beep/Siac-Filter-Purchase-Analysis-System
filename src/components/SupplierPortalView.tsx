import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Send, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Layers, 
  Tag, 
  Phone, 
  User, 
  ShieldCheck, 
  Sparkles,
  ArrowRight,
  Hash,
  Filter,
  Check,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  ArrowUpDown,
  RotateCcw,
  Zap,
  SlidersHorizontal,
  Edit3,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RfqSession, FilterCategory, SupplierOfferOption, SupplierSubmission, RfqItem } from '../types/procurement';

interface SupplierPortalViewProps {
  session?: RfqSession | null;
  onSubmitQuote: (sessionCode: string, submission: SupplierSubmission) => void;
  onBackToAdmin?: () => void;
  isStandalone?: boolean;
}

export const SupplierPortalView: React.FC<SupplierPortalViewProps> = ({
  session,
  onSubmitQuote,
  onBackToAdmin,
  isStandalone = false
}) => {
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [isEditingExistingQuote, setIsEditingExistingQuote] = useState(false);
  const [editSuccessBanner, setEditSuccessBanner] = useState<string | null>(null);
  
  // Navigation & Search Tabs
  const [activePortalTab, setActivePortalTab] = useState<'all' | 'search_tab' | 'unquoted' | 'quoted'>('all');
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterType, setSelectedFilterType] = useState('all');
  const [selectedRange, setSelectedRange] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'serial_asc' | 'serial_desc' | 'qty_desc'>('serial_asc');
  const [jumpItemNo, setJumpItemNo] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [highlightedItemNo, setHighlightedItemNo] = useState<number | null>(null);

  // Existing registered suppliers for this session
  const existingSubmissions = session?.submissions || [];

  // Safe items extraction & strict numerical sorting by item_no
  const sessionItems = useMemo(() => {
    const raw = session?.items || [];
    return [...raw].map((item, index) => {
      const parsedNo = typeof item.item_no === 'number' ? item.item_no : parseInt(String(item.item_no || ''), 10);
      return {
        ...item,
        item_no: !isNaN(parsedNo) && parsedNo > 0 ? parsedNo : (index + 1)
      };
    }).sort((a, b) => (a.item_no ?? 0) - (b.item_no ?? 0));
  }, [session?.items]);

  // Form state: record of itemId -> array of SupplierOfferOption
  const [offersMap, setOffersMap] = useState<Record<string, SupplierOfferOption[]>>(() => {
    const initial: Record<string, SupplierOfferOption[]> = {};
    sessionItems.forEach((item, idx) => {
      const key = item.id || `item-${item.item_no || idx + 1}`;
      initial[key] = [
        {
          id: `opt-${key}-0`,
          category: 'أصلي',
          alt_no: '',
          unit_price: 0,
          qty_avail: item.qty_needed || 1,
          notes: ''
        }
      ];
    });
    return initial;
  });

  // Keep offersMap synchronized whenever session or items change (if not in edit mode)
  useEffect(() => {
    if (sessionItems.length > 0 && !isEditingExistingQuote) {
      setOffersMap(prev => {
        const next = { ...prev };
        sessionItems.forEach((item, idx) => {
          const key = item.id || `item-${item.item_no || idx + 1}`;
          if (!next[key] || next[key].length === 0) {
            next[key] = [
              {
                id: `opt-${key}-0`,
                category: 'أصلي',
                alt_no: '',
                unit_price: 0,
                qty_avail: item.qty_needed || 1,
                notes: ''
              }
            ];
          }
        });
        return next;
      });
    }
  }, [session?.code, sessionItems, isEditingExistingQuote]);

  // Load existing supplier quote to EDIT (إمكانية تعديل العرض السابق)
  const handleLoadExistingSupplierQuote = (targetName: string) => {
    if (!targetName) return;
    const sub = existingSubmissions.find(
      s => s.supplier_name.trim().toLowerCase() === targetName.trim().toLowerCase()
    );
    if (!sub) return;

    setSupplierName(sub.supplier_name);
    setSupplierPhone(sub.phone || '');
    setIsEditingExistingQuote(true);

    const updatedOffers: Record<string, SupplierOfferOption[]> = {};
    sessionItems.forEach((item, idx) => {
      const key = item.id || `item-${item.item_no || idx + 1}`;
      const savedList = sub.offers[item.id] || sub.offers[`item-${item.item_no}`] || sub.offers[key];

      if (savedList && savedList.length > 0) {
        updatedOffers[key] = savedList.map((o, oIdx) => ({
          ...o,
          id: o.id || `opt-${key}-${oIdx}`
        }));
      } else {
        updatedOffers[key] = [
          {
            id: `opt-${key}-0`,
            category: 'أصلي',
            alt_no: '',
            unit_price: 0,
            qty_avail: item.qty_needed || 1,
            notes: ''
          }
        ];
      }
    });

    setOffersMap(updatedOffers);
    setEditSuccessBanner(`✏️ تم استرجاع عرض أسعار (${sub.supplier_name}) المسجل مسبقاً! يمكنك الآن تعديل أي سعر أو صنف، ثم الضغط على "تحديث وحفظ التعديلات".`);
    
    setTimeout(() => {
      setEditSuccessBanner(null);
    }, 7000);
  };

  // Compute Range Buckets dynamically
  const rangeBuckets = useMemo(() => {
    const total = sessionItems.length;
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
  }, [sessionItems.length]);

  // If no session exists or session has no items
  if (!session || sessionItems.length === 0) {
    return (
      <div className="w-full max-w-xl mx-auto py-16 px-4 text-center">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">لا يوجد طلب عروض مفتوح حالياً</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            يرجى إنشاء طلب عروض أسعار أولاً من تبويب <strong>"إنشاء طلب عروض (RFQ)"</strong> بالضغط على زر <strong>"توليد كود ورابط طلب العروض"</strong> ليتمكن الموردون من التسعير.
          </p>
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all"
            >
              العودة للوحة الإدارة
            </button>
          )}
        </div>
      </div>
    );
  }

  // Unique filter types for quick tabs
  const filterTypes = ['all', ...Array.from(new Set(sessionItems.map(i => i.filter_type).filter(Boolean)))];

  // Add extra price/alternative row for the same filter
  const handleAddAlternative = (key: string) => {
    setOffersMap(prev => {
      const currentList = prev[key] || [];
      const item = sessionItems.find(i => (i.id === key || `item-${i.item_no}` === key));
      const newOption: SupplierOfferOption = {
        id: `opt-${key}-${Date.now()}`,
        category: currentList.length === 1 ? 'هاي كوبي' : (currentList.length === 2 ? 'صناعة محلي' : 'أصلي'),
        alt_no: '',
        unit_price: 0,
        qty_avail: item?.qty_needed || 1,
        notes: ''
      };
      return {
        ...prev,
        [key]: [...currentList, newOption]
      };
    });
  };

  // Remove alternative row
  const handleRemoveOption = (key: string, optIndex: number) => {
    setOffersMap(prev => {
      const currentList = prev[key] || [];
      if (currentList.length <= 1) return prev;
      const updated = currentList.filter((_, idx) => idx !== optIndex);
      return {
        ...prev,
        [key]: updated
      };
    });
  };

  // Update specific field in an offer option
  const handleUpdateOption = (
    key: string,
    optIndex: number,
    field: keyof SupplierOfferOption,
    value: any
  ) => {
    setOffersMap(prev => {
      const currentList = [...(prev[key] || [])];
      if (!currentList[optIndex]) return prev;

      currentList[optIndex] = {
        ...currentList[optIndex],
        [field]: value
      };

      return {
        ...prev,
        [key]: currentList
      };
    });
  };

  // Calculate statistics
  const totalQuotedItems = Object.entries(offersMap).filter(([_, list]) => 
    list.some(o => o.unit_price > 0)
  ).length;

  const unquotedCount = sessionItems.length - totalQuotedItems;

  const totalOffersCount = Object.values(offersMap).reduce(
    (acc, list) => acc + list.filter(o => o.unit_price > 0).length,
    0
  );

  // Filtered and Sorted Items
  const filteredItems = useMemo(() => {
    let result = sessionItems.filter(item => {
      const key = item.id || `item-${item.item_no}`;
      const primary = String(item.primary_number || '');
      const mat = String(item.mat_code || '');
      const alts = Array.isArray(item.alt_numbers) ? item.alt_numbers : [];
      const itemNoStr = String(item.item_no || '');
      const equip = String(item.equip_code || '');

      // Tab matching
      const offers = offersMap[key] || [];
      const isQuoted = offers.some(o => o.unit_price > 0);
      if (activePortalTab === 'unquoted' && isQuoted) return false;
      if (activePortalTab === 'quoted' && !isQuoted) return false;

      // Search query match (Supports search by Serial Number # like "14", "#45", or name/code)
      const q = searchQuery.trim().toLowerCase().replace(/^#/, '');
      if (q) {
        const matchesSearch = 
          itemNoStr === q ||
          itemNoStr.includes(q) ||
          primary.toLowerCase().includes(q) ||
          mat.toLowerCase().includes(q) ||
          alts.some(a => String(a || '').toLowerCase().includes(q)) ||
          equip.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Filter type match
      if (selectedFilterType !== 'all' && item.filter_type !== selectedFilterType) {
        return false;
      }

      // Range match
      if (selectedRange !== 'all') {
        const [minStr, maxStr] = selectedRange.split('-');
        const min = parseInt(minStr, 10);
        const max = parseInt(maxStr, 10);
        const num = item.item_no ?? 0;
        if (!isNaN(min) && !isNaN(max)) {
          if (num < min || num > max) return false;
        }
      }

      return true;
    });

    // Sorting
    if (sortBy === 'serial_asc') {
      result.sort((a, b) => (a.item_no ?? 0) - (b.item_no ?? 0));
    } else if (sortBy === 'serial_desc') {
      result.sort((a, b) => (b.item_no ?? 0) - (a.item_no ?? 0));
    } else if (sortBy === 'qty_desc') {
      result.sort((a, b) => (b.qty_needed || 0) - (a.qty_needed || 0));
    }

    return result;
  }, [sessionItems, offersMap, activePortalTab, searchQuery, selectedFilterType, selectedRange, sortBy]);

  // Jump to specific item #
  const scrollToItem = (targetNo: number) => {
    setHighlightedItemNo(targetNo);
    const element = document.getElementById(`item-row-${targetNo}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setSelectedRange('all');
      setSelectedFilterType('all');
      setSearchQuery('');
      setActivePortalTab('all');
      setTimeout(() => {
        const el = document.getElementById(`item-row-${targetNo}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    setTimeout(() => {
      setHighlightedItemNo(null);
    }, 3000);
  };

  const handleJumpToItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpItemNo) return;
    const targetNo = parseInt(jumpItemNo, 10);
    if (!isNaN(targetNo)) {
      scrollToItem(targetNo);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedFilterType('all');
    setSelectedRange('all');
    setActivePortalTab('all');
    setSortBy('serial_asc');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierName.trim()) {
      alert('⚠️ يرجى إدخال اسم الشركة أو اسم المورد قبل الإرسال');
      return;
    }

    if (totalQuotedItems === 0) {
      alert('⚠️ يرجى تسعير صنف واحد على الأقل لتقديم العرض');
      return;
    }

    // Clean up offers map: only keep options with unit_price > 0
    const cleanedOffers: Record<string, SupplierOfferOption[]> = {};
    for (const [itemId, list] of Object.entries(offersMap)) {
      const validOptions = list.filter(o => o.unit_price > 0);
      if (validOptions.length > 0) {
        cleanedOffers[itemId] = validOptions;
      }
    }

    const submission: SupplierSubmission = {
      supplier_name: supplierName.trim(),
      phone: supplierPhone.trim(),
      submitted_at: new Date().toLocaleString('ar-EG'),
      offers: cleanedOffers
    };

    onSubmitQuote(session.code, submission);
    setSubmittedSuccess(true);
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  if (submittedSuccess) {
    return (
      <div className="w-full max-w-4xl mx-auto py-12 px-4">
        <div className="bg-white rounded-3xl p-10 border border-emerald-100 shadow-2xl text-center">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 mb-3">
            {isEditingExistingQuote ? 'تم تحديث عرض أسعاركم بنجاح!' : 'تم استلام عرض أسعاركم بنجاح!'}
          </h2>
          <p className="text-slate-600 text-base max-w-xl mx-auto mb-6 leading-relaxed">
            شكراً لتعاونكم معنا — شركة <strong className="text-blue-700">{supplierName}</strong>. 
            تم تسجيل <strong className="text-emerald-700">{totalOffersCount} تسعيرة وبدائل</strong> لـ <strong className="text-slate-800">{totalQuotedItems} صنفاً</strong> مرتبة بالمسلسل في نظام مشتريات شركة SIAC.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 max-w-lg mx-auto mb-8 text-right text-sm space-y-2">
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">كود طلب العروض:</span>
              <span className="font-bold font-mono text-blue-700">{session.code}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">تاريخ وساعة التحديث:</span>
              <span className="font-semibold text-slate-700">{new Date().toLocaleString('ar-EG')}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">حالة الطلب:</span>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-xs">
                محدث رسميًا قيد الدراسة والترسية
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => setSubmittedSuccess(false)}
              className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              <span>متابعة التعديل / إضافة تسعيرات أخرى</span>
            </button>
            {onBackToAdmin && (
              <button
                onClick={onBackToAdmin}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2"
              >
                <span>العودة للوحة الإدارة والمقارنة</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1700px] mx-auto py-6 px-3 sm:px-6 lg:px-8 space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-blue-900/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-300" />
              </div>
              <span className="text-sm font-bold text-blue-300">شركة SIAC — ورقة تسعير الموردين</span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                مرتبة بالمسلسل من 1 إلى {sessionItems.length}
              </span>
              {isEditingExistingQuote && (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>وضع تعديل عرض سابق</span>
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {session.title || 'طلب عروض أسعار فلاتر ومستلزمات صيانة'}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-1">
              <span className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 font-mono">
                كود الطلب: <strong className="text-blue-400">{session.code}</strong>
              </span>
              {session.deadline && (
                <span className="flex items-center gap-1.5 text-amber-300 bg-amber-950/40 border border-amber-800/60 px-3 py-1 rounded-lg font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  آخر موعد: {session.deadline}
                </span>
              )}
              <span className="bg-emerald-950/70 border border-emerald-800/60 px-3 py-1 rounded-lg font-bold text-emerald-300">
                إجمالي الأصناف: <strong>{sessionItems.length} بند مسلسل</strong>
              </span>
            </div>
          </div>

          {/* Quick Jump to Serial Number Box */}
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 lg:max-w-md shadow-inner text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <ListOrdered className="w-4 h-4" />
                <span>انتقال سريع لرقم البند بالمسلسل:</span>
              </span>
              <span className="text-slate-400 text-[11px] font-mono">1 إلى {sessionItems.length}</span>
            </div>
            
            <form onSubmit={handleJumpToItem} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Hash className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="number"
                  min="1"
                  max={sessionItems.length}
                  value={jumpItemNo}
                  onChange={e => setJumpItemNo(e.target.value)}
                  placeholder="اكتب رقم البند (مثال: 14)..."
                  className="w-full pr-8 pl-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-amber-300 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-4 py-1.5 rounded-lg shadow transition-all whitespace-nowrap"
              >
                انتقال فوراً
              </button>
            </form>

            {/* Quick Range Buttons if > 50 items */}
            {rangeBuckets.length > 0 && (
              <div className="flex items-center gap-1 pt-1 overflow-x-auto scrollbar-none">
                <span className="text-[10px] text-slate-400 ml-1">النطاقات:</span>
                <button
                  type="button"
                  onClick={() => setSelectedRange('all')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedRange === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                >
                  الكل
                </button>
                {rangeBuckets.map(b => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setSelectedRange(b.key)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${selectedRange === b.key ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Mode Alert Banner */}
      {editSuccessBanner && (
        <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center font-bold flex-shrink-0">
              <Edit3 className="w-4 h-4" />
            </div>
            <p className="text-xs sm:text-sm font-bold leading-relaxed">{editSuccessBanner}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditSuccessBanner(null)}
            className="text-amber-800 hover:text-amber-950 text-xs font-bold px-2 py-1 bg-amber-200/60 rounded-lg"
          >
            إغلاق
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier Profile Info Card & EDIT PREVIOUS QUOTE OPTION */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">بيانات الشركة أو المورد المسعّر</h2>
                <p className="text-xs text-slate-400">يرجى كتابة اسم الشركة أو اختيار اسمك لتعديل عرض سابق</p>
              </div>
            </div>

            {/* Load Previous Quote Dropdown if suppliers already submitted */}
            {existingSubmissions.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-600 font-bold flex items-center gap-1 whitespace-nowrap">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>تعديل عرض سابق:</span>
                </span>
                <select
                  value={supplierName}
                  onChange={e => handleLoadExistingSupplierQuote(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">-- اختر شركتك لتعديل أسعارك --</option>
                  {existingSubmissions.map(s => (
                    <option key={s.supplier_name} value={s.supplier_name}>
                      🏢 {s.supplier_name} ({Object.keys(s.offers).length} تسعيرة)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم الشركة / المورد التجاري <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={e => {
                  setSupplierName(e.target.value);
                  // Check if name matches an existing submission
                  const match = existingSubmissions.find(
                    s => s.supplier_name.trim().toLowerCase() === e.target.value.trim().toLowerCase()
                  );
                  if (match && !isEditingExistingQuote) {
                    setIsEditingExistingQuote(true);
                  }
                }}
                placeholder="مثال: شركة النيل لتجارة الفلاتر والمعدات"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                رقم الهاتف / الواتساب للتواصل والترسية
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={supplierPhone}
                  onChange={e => setSupplierPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all text-left font-mono"
                  dir="ltr"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>
          </div>
        </div>

        {/* PRIMARY NAVIGATION & SEARCH TABS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Main View Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-2 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setActivePortalTab('all')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activePortalTab === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>📋 كافة البنود المسلسلة (1 - {sessionItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePortalTab('search_tab')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activePortalTab === 'search_tab'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>🔍 تبويب البحث والتصفية المتقدمة</span>
              {searchQuery && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActivePortalTab('unquoted')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activePortalTab === 'unquoted'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>⏳ المتبقي للتسعير ({unquotedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePortalTab('quoted')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activePortalTab === 'quoted'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>✅ البنود المسعّرة ({totalQuotedItems})</span>
            </button>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-4 bg-white space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Main Search Input */}
              <div className="md:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="🔍 بحث برقم المسلسل (مثال: 14 أو #14)، اسم الفلتر، كود SAP، أو البدائل..."
                  className="w-full pr-10 pl-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-2.5 text-xs text-slate-400 hover:text-slate-700 font-bold bg-slate-200 rounded-full w-5 h-5 flex items-center justify-center"
                    title="مسح البحث"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter by Type */}
              <div className="md:col-span-3">
                <select
                  value={selectedFilterType}
                  onChange={e => setSelectedFilterType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">📁 جميع أنواع الفلاتر ({sessionItems.length})</option>
                  {filterTypes.filter(t => t !== 'all').map(ft => (
                    <option key={ft} value={ft}>{ft}</option>
                  ))}
                </select>
              </div>

              {/* Sort Order Selector */}
              <div className="md:col-span-3">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="serial_asc">🔢 ترتيب تصاعدي حسب المسلسل (1 ➔ {sessionItems.length})</option>
                  <option value="serial_desc">🔢 ترتيب تنازلي حسب المسلسل ({sessionItems.length} ➔ 1)</option>
                  <option value="qty_desc">⚡ الأكثر طلباً بالكمية أولاً</option>
                </select>
              </div>
            </div>

            {/* Extra search panel when in search tab */}
            {activePortalTab === 'search_tab' && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    <span>لوحة التصفية والانتقال السريع لجميع البنود المسلسلة (1 إلى {sessionItems.length})</span>
                  </div>
                  {(searchQuery || selectedFilterType !== 'all' || selectedRange !== 'all') && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-xs text-rose-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة ضبط الفلاتر</span>
                    </button>
                  )}
                </div>

                {/* Filter Type Quick Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-500 ml-1">النوع:</span>
                  {filterTypes.map(ft => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setSelectedFilterType(ft)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedFilterType === ft
                          ? 'bg-indigo-600 text-white shadow-sm font-bold'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {ft === 'all' ? 'الكل' : ft}
                    </button>
                  ))}
                </div>

                {/* Number Range Badges */}
                {rangeBuckets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-indigo-100/80">
                    <span className="text-[11px] font-bold text-slate-500 ml-1">النطاق المسلسل:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedRange('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        selectedRange === 'all'
                          ? 'bg-blue-600 text-white shadow-sm font-bold'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      الكل (1-{sessionItems.length})
                    </button>
                    {rangeBuckets.map(b => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setSelectedRange(b.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          selectedRange === b.key
                            ? 'bg-blue-600 text-white shadow-sm font-bold'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Spacious Wide Items Table & Cards */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold">
                قائمة عروض الأسعار المسلسلة — من البند رقم 1 إلى {sessionItems.length}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span>المعروض: <strong>{filteredItems.length}</strong> من أصل <strong>{sessionItems.length}</strong></span>
              <span className="text-emerald-400 font-bold bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-800">
                المسعّر: {totalQuotedItems} / {sessionItems.length}
              </span>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">لا توجد بنود مطابقة لمعايير البحث الحالية</h4>
              <p className="text-xs text-slate-500">
                يرجى التأكد من رقم المسلسل أو اسم الفلتر، أو إعادة تعيين الفلاتر
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 shadow-sm transition-all inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط الفلاتر وعرض كافة الـ {sessionItems.length} صنفاً</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredItems.map((item) => {
                const itemNum = item.item_no ?? 1;
                const key = item.id || `item-${itemNum}`;
                const itemOffers = (offersMap[key] && offersMap[key].length > 0)
                  ? offersMap[key]
                  : [
                      {
                        id: `opt-${key}-0`,
                        category: 'أصلي',
                        alt_no: '',
                        unit_price: 0,
                        qty_avail: item.qty_needed || 1,
                        notes: ''
                      }
                    ];
                const hasQuoted = itemOffers.some(o => o.unit_price > 0);
                const displayName = String(item.primary_number || `بند رقم ${itemNum}`);
                const isHighlighted = highlightedItemNo === itemNum;

                return (
                  <div 
                    key={key} 
                    id={`item-row-${itemNum}`}
                    className={`p-5 transition-all duration-500 ${
                      isHighlighted 
                        ? 'bg-amber-100/70 ring-4 ring-amber-400 border-l-8 border-amber-600' 
                        : hasQuoted 
                          ? 'bg-emerald-50/25 border-l-4 border-emerald-500' 
                          : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Item Header / Overview Row */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                      <div className="flex items-start gap-3.5">
                        {/* Prominent Serial Number Badge */}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 text-white flex flex-col items-center justify-center flex-shrink-0 shadow-md border border-slate-700">
                          <span className="text-[10px] text-blue-300 font-semibold leading-none">بند</span>
                          <span className="text-base font-black text-amber-300 font-mono leading-none mt-0.5">#{itemNum}</span>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">
                              {displayName}
                            </h4>
                            {item.mat_code && (
                              <span className="font-mono text-[11px] bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded font-semibold">
                                SAP: {item.mat_code}
                              </span>
                            )}
                            <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold">
                              {item.filter_type || 'فلتر'}
                            </span>
                            {hasQuoted && (
                              <span className="flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full font-bold">
                                <Check className="w-3 h-3" />
                                <span>تم التسعير</span>
                              </span>
                            )}
                          </div>

                          {/* Alternative Numbers hint */}
                          {Array.isArray(item.alt_numbers) && item.alt_numbers.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                              <Tag className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                              <span className="text-slate-500 font-medium">البدائل المقترحة: </span>
                              <span className="font-mono font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-amber-900">
                                {item.alt_numbers.map(String).join(' / ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Qty Badge & Action to add alternative */}
                      <div className="flex items-center justify-between xl:justify-end gap-3">
                        <div className="bg-slate-100 border border-slate-300 px-4 py-1.5 rounded-xl text-center">
                          <span className="block text-[10px] text-slate-500 font-semibold">الكمية المطلوبة</span>
                          <span className="text-base font-black text-slate-900 font-mono">{item.qty_needed || 1} <span className="text-xs font-normal font-sans">قطعة</span></span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddAlternative(key)}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-sm transition-all"
                          title="إضافة تسعيرة لفئة أخرى (أصلي / هاي كوبي / محلي)"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ إضافة سعر / بديل آخر</span>
                        </button>
                      </div>
                    </div>

                    {/* Multi-Offer Options Table for this Filter */}
                    <div className="mt-3 space-y-2.5">
                      {itemOffers.map((option, optIdx) => (
                        <div 
                          key={option.id || optIdx}
                          className={`grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 rounded-xl border items-center ${
                            option.unit_price > 0 
                              ? 'bg-white border-emerald-400 shadow-sm ring-1 ring-emerald-400/30' 
                              : 'bg-slate-50/80 border-slate-200'
                          }`}
                        >
                          {/* Option Tag / Number */}
                          <div className="md:col-span-1 flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                              تسعير #{optIdx + 1}
                            </span>
                          </div>

                          {/* Category Selector */}
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                              فئة الفلتر <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={option.category}
                              onChange={e => handleUpdateOption(key, optIdx, 'category', e.target.value as FilterCategory)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                            >
                              <option value="أصلي">💎 أصلي (Original)</option>
                              <option value="هاي كوبي">🔷 هاي كوبي (High Copy)</option>
                              <option value="صناعة محلي">🔶 صناعة محلي (Local)</option>
                            </select>
                          </div>

                          {/* Supplier Part Number / Brand */}
                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                              رقم الفلتر عندكم / الماركة المقدمة
                            </label>
                            <input
                              type="text"
                              value={option.alt_no || ''}
                              onChange={e => handleUpdateOption(key, optIdx, 'alt_no', e.target.value)}
                              placeholder="مثال: MANN CE1372 أو Fleetguard"
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                            />
                          </div>

                          {/* Unit Price */}
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                              سعر الوحدة (ج.م.) <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={option.unit_price || ''}
                                onChange={e => handleUpdateOption(key, optIdx, 'unit_price', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className={`w-full bg-white border rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-left font-mono ${
                                  option.unit_price > 0 ? 'border-emerald-500 text-emerald-700 bg-emerald-50/40' : 'border-slate-300 text-slate-800'
                                }`}
                                dir="ltr"
                              />
                              <span className="text-[10px] text-slate-400 absolute right-2 top-2 font-semibold">ج.م</span>
                            </div>
                          </div>

                          {/* Available Qty */}
                          <div className="md:col-span-1">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                              المتاح
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={option.qty_avail || ''}
                              onChange={e => handleUpdateOption(key, optIdx, 'qty_avail', parseInt(e.target.value) || 0)}
                              placeholder={String(item.qty_needed || 1)}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 text-center focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                            />
                          </div>

                          {/* Notes */}
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                              ملاحظات / بلد المنشأ
                            </label>
                            <input
                              type="text"
                              value={option.notes || ''}
                              onChange={e => handleUpdateOption(key, optIdx, 'notes', e.target.value)}
                              placeholder="مثال: ألماني ضمان"
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                            />
                          </div>

                          {/* Delete Row button if > 1 */}
                          <div className="md:col-span-1 flex justify-end">
                            {itemOffers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(key, optIdx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="حذف هذا العرض البديل"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating / Sticky Submit Footer */}
        <div className="sticky bottom-4 z-30 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-4 sm:p-5 border border-slate-700 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center font-bold text-blue-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-white">
                {isEditingExistingQuote ? (
                  <span>تحديث التسعير: تم تسعير <span className="text-emerald-400 font-bold">{totalQuotedItems}</span> من أصل <span className="text-amber-300 font-bold">{sessionItems.length}</span> بند</span>
                ) : (
                  <span>ملخص التسعير: تم تسعير <span className="text-emerald-400 font-bold">{totalQuotedItems}</span> من أصل <span className="text-amber-300 font-bold">{sessionItems.length}</span> بند</span>
                )}
              </div>
              <p className="text-slate-400 text-xs">
                {supplierName ? `مقدم باسم: ${supplierName}` : 'يرجى كتابة اسم الشركة بالأعلى قبل التأكيد'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="submit"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm px-8 py-3.5 rounded-xl shadow-lg shadow-emerald-900/40 transition-all hover:scale-[1.02]"
            >
              {isEditingExistingQuote ? (
                <>
                  <Edit3 className="w-4 h-4" />
                  <span>تحديث وحفظ التعديلات على عرض الأسعار</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>إرسال عرض الأسعار رسميًا لـ SIAC</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
