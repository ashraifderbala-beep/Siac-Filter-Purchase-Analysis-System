import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Share2, 
  Copy, 
  ExternalLink, 
  MessageSquare, 
  Check, 
  Calendar, 
  DollarSign, 
  FileText,
  Trash2,
  CheckCircle2,
  Upload,
  Plus,
  ArrowRight,
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { RfqItem, RfqSession, SapHistoricalPrice } from '../types/procurement';
import { INITIAL_SAP_PRICES, INITIAL_RFQ_ITEMS } from '../data/initialData';

interface RfqCreateTabProps {
  initialItems?: RfqItem[];
  onCreateRfq: (session: RfqSession) => void;
  onOpenPortal: (code: string) => void;
  onNavigateToAnalysis: () => void;
}

export const RfqCreateTab: React.FC<RfqCreateTabProps> = ({
  initialItems = [],
  onCreateRfq,
  onOpenPortal,
  onNavigateToAnalysis
}) => {
  const [title, setTitle] = useState('طلب عروض أسعار فلاتر — دورة الصيانة');
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  
  const [items, setItems] = useState<RfqItem[]>(initialItems);
  const [createdSession, setCreatedSession] = useState<RfqSession | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Modal / Form state to add single item manually
  const [showAddManualModal, setShowAddManualModal] = useState(false);
  const [manualFilterName, setManualFilterName] = useState('');
  const [manualMatCode, setManualMatCode] = useState('');
  const [manualFilterType, setManualFilterType] = useState('فلتر جاز');
  const [manualQty, setManualQty] = useState<number>(10);
  const [manualEquip, setManualEquip] = useState('');
  const [manualAltNos, setManualAltNos] = useState('');

  // Sync with initialItems when passed from AnalysisTab
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      setItems(initialItems);
    }
  }, [initialItems]);

  // Handle Excel upload of items directly in RFQ Creator
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames.find(n => n.includes('شراء') || n.includes('مورد') || n.includes('Filter') || n.includes('Item')) || wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const parsedItems: RfqItem[] = [];
        let startIndex = 1;

        // Detect header
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const rowStr = (rows[i] || []).join(' ');
          if (rowStr.includes('فلتر') || rowStr.includes('Filter') || rowStr.includes('SAP') || rowStr.includes('الكمية')) {
            startIndex = i + 1;
            break;
          }
        }

        for (let i = startIndex; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Try to extract fields intelligently
          const matCode = String(row[1] || row[0] || '').match(/M003-\d+-\d+/)?.[0] || (String(row[1] || '').trim().startsWith('M003') ? String(row[1]).trim() : '');
          const desc = String(row[2] || row[1] || row[0] || '').trim();
          const ftype = String(row[3] || 'فلتر').trim();
          const qty = Number(row[6] || row[4] || row[3] || row[2]) || 0;

          if (desc && desc !== '—' && !desc.includes('الإجمالي')) {
            parsedItems.push({
              id: `item-import-${Date.now()}-${i}`,
              mat_code: matCode,
              filter_type: ftype,
              primary_number: desc,
              alt_numbers: [desc],
              qty_needed: qty > 0 ? qty : 10,
              projects: []
            });
          }
        }

        if (parsedItems.length > 0) {
          setItems(parsedItems);
          alert(`✅ تم استيراد ${parsedItems.length} صنف بنجاح من ملف Excel!`);
        } else {
          alert('⚠️ لم يتم التعرف على الأصناف في الملف. يرجى التأكد من محتوى الجدول.');
        }
      } catch (err: any) {
        alert('خطأ أثناء قراءة ملف الإكسيل: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Add Item Manually
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFilterName.trim()) {
      alert('يرجى كتابة اسم أو رقم الفلتر');
      return;
    }

    const alts = manualAltNos.split(/[\/\n,]+/).map(s => s.trim()).filter(Boolean);
    const newItem: RfqItem = {
      id: `item-manual-${Date.now()}`,
      mat_code: manualMatCode.trim(),
      filter_type: manualFilterType.trim(),
      primary_number: manualFilterName.trim(),
      alt_numbers: [manualFilterName.trim(), ...alts],
      qty_needed: manualQty > 0 ? manualQty : 1,
      equip_code: manualEquip.trim(),
      projects: ['طلب يدوي']
    };

    setItems(prev => [newItem, ...prev]);
    setShowAddManualModal(false);
    setManualFilterName('');
    setManualMatCode('');
    setManualQty(10);
    setManualEquip('');
    setManualAltNos('');
  };

  // Remove Item from list
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // Submit and Create RFQ
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('⚠️ يرجى إضافة أصناف للطلب أولاً (يمكنك استخدام زر "إضافة صنف يدوياً" أو "استيراد Excel" أو "تحليل ملفات SAP")');
      return;
    }

    const now = new Date();
    const code = `RFQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

    const orderedItems: RfqItem[] = items.map((item, idx) => ({
      ...item,
      item_no: item.item_no !== undefined && typeof item.item_no === 'number' ? item.item_no : (idx + 1)
    }));

    const newSession: RfqSession = {
      code,
      title: title.trim(),
      created_at: now.toLocaleString('ar-EG'),
      deadline,
      is_active: true,
      items: orderedItems,
      sap_prices: INITIAL_SAP_PRICES,
      submissions: []
    };

    onCreateRfq(newSession);
    setCreatedSession(newSession);
  };

  const shareLink = createdSession 
    ? `${window.location.origin}/portal/${createdSession.code}` 
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareWhatsApp = () => {
    if (!createdSession) return;
    const msg = encodeURIComponent(
      `مرحباً،\nيرجى تقديم عرض أسعار لطلب توريد فلاتر — شركة SIAC الهندسية\nكود الطلب: ${createdSession.code}\nالعنوان: ${createdSession.title}\nالرابط المباشر للتقديم: ${shareLink}\nآخر موعد: ${deadline}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Creation Form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              <span>إنشاء طلب عروض أسعار جديد (RFQ Session)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              يمكنك استيراد الأصناف من محرك التحليل، أو رفع ملف Excel، أو إضافتها يدوياً صنفاً بصنف
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddManualModal(true)}
              className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3.5 py-2 rounded-xl border border-blue-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة صنف يدوياً</span>
            </button>

            <label className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl border border-emerald-200 cursor-pointer transition-all">
              <Upload className="w-4 h-4" />
              <span>📁 استيراد ملف Excel للأصناف</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
            </label>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                عنوان وموضوع الطلب <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="مثال: طلب عروض فلاتر — الربع الأخير 2026"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                الموعد النهائي لاستلام العروض (Deadline)
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          </div>

          {/* Items Summary in this RFQ */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  الأصناف المدرجة في هذا الطلب ({items.length} صنف)
                </span>
                {items.length > 0 && (
                  <span className="text-[11px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                    إجمالي: {items.reduce((a, b) => a + b.qty_needed, 0)} قطعة
                  </span>
                )}
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="text-xs text-rose-600 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح القائمة</span>
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-slate-200 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">لا توجد أصناف مدرجة في الطلب حتى الآن</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  اختر الطريقة التي تفضلها لإضافة الفلاتر المطلوبة لتسعير الموردين:
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onNavigateToAnalysis}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition-all"
                  >
                    <span>1. الذهاب لتحليل ملفات SAP و 9004</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddManualModal(true)}
                    className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-4 py-2 rounded-xl border border-indigo-200 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>2. إضافة صنف يدوياً</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setItems(INITIAL_RFQ_ITEMS)}
                    className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl border border-slate-300 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>تحميل أصناف تجريبية فوراً</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2">
                {items.map((item, idx) => (
                  <div key={item.id || idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-3 hover:border-blue-300 transition-all">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span className="w-6 h-6 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-slate-900 truncate">{item.primary_number}</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                          {item.mat_code && <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded font-semibold">{item.mat_code}</span>}
                          <span>{item.filter_type}</span>
                          {item.equip_code && <span>المعدة: {item.equip_code}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100 text-xs font-mono">
                        {item.qty_needed} قطعة
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={items.length === 0}
            className="w-full bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-sm py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <PlusCircle className="w-5 h-5" />
            <span>توليد كود ورابط طلب العروض ومشاركته مع الموردين</span>
          </button>
        </form>
      </div>

      {/* Manual Item Modal */}
      {showAddManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setShowAddManualModal(false)}
              className="absolute top-5 left-5 text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              <span>إضافة فلتر / صنف يدوياً للطلب</span>
            </h3>

            <form onSubmit={handleAddManualItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم أو رقم الفلتر <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualFilterName}
                  onChange={e => setManualFilterName(e.target.value)}
                  placeholder="مثال: حشو فلتر جاز ماركة مان CE1372"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود SAP (اختياري)</label>
                  <input
                    type="text"
                    value={manualMatCode}
                    onChange={e => setManualMatCode(e.target.value)}
                    placeholder="M003-30203001-..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الكمية المطلوبة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={manualQty}
                    onChange={e => setManualQty(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الفلتر</label>
                  <select
                    value={manualFilterType}
                    onChange={e => setManualFilterType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
                  >
                    <option value="فلتر جاز">فلتر جاز</option>
                    <option value="فلتر زيت">فلتر زيت</option>
                    <option value="فلتر هواء">فلتر هواء</option>
                    <option value="فلتر هيدروليك">فلتر هيدروليك</option>
                    <option value="فلتر مياه / تبريد">فلتر مياه / تبريد</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود المعدة (اختياري)</label>
                  <input
                    type="text"
                    value={manualEquip}
                    onChange={e => setManualEquip(e.target.value)}
                    placeholder="مثال: CAT-336D"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أرقام بديلة متكافئة (مفصولة بفاصلة)</label>
                <input
                  type="text"
                  value={manualAltNos}
                  onChange={e => setManualAltNos(e.target.value)}
                  placeholder="CE1372, WK940/20, P550388"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddManualModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-md"
                >
                  إضافة للقائمة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success & Share Card */}
      {createdSession && (
        <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 text-white rounded-2xl p-6 border border-emerald-800/60 shadow-xl space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>تم إنشاء طلب العروض بنجاح! كود الطلب: {createdSession.code}</span>
          </div>
          <p className="text-xs text-slate-300">
            أرسل هذا الرابط المباشر للموردين عبر الواتساب أو البريد. يفتح كل مورد الرابط ويدخل أسعاره وبدائله بسهولة.
          </p>

          <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareLink}
              className="flex-1 bg-slate-800 text-slate-200 text-xs px-3 py-2 rounded-lg font-mono w-full border border-slate-700"
              dir="ltr"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleCopyLink}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'تم النسخ' : 'نسخ'}</span>
              </button>

              <button
                onClick={handleShareWhatsApp}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>واتساب</span>
              </button>

              <button
                onClick={() => onOpenPortal(createdSession.code)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح البوابة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
