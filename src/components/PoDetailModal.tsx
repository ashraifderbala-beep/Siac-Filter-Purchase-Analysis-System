import React from 'react';
import { 
  X, 
  Building2, 
  Calendar, 
  Clock, 
  FileText, 
  DollarSign, 
  CheckCircle2, 
  Layers, 
  Printer, 
  Tag
} from 'lucide-react';
import { PurchaseOrder, POStatus } from '../types/procurement';

interface PoDetailModalProps {
  po: PurchaseOrder | null;
  onClose: () => void;
  onAdvanceStatus: (poId: string, nextStatus: POStatus, note?: string) => void;
}

export const STATUS_META: Record<POStatus, { label: string; color: string; bg: string; icon: string; next?: POStatus }> = {
  draft: { label: 'إعداد ومسودة', color: '#64748b', bg: '#f1f5f9', icon: '📝', next: 'sent' },
  sent: { label: 'أُرسل للمورد', color: '#2563eb', bg: '#eff6ff', icon: '📤', next: 'awarded' },
  awarded: { label: 'تمت الترسية', color: '#7c3aed', bg: '#f5f3ff', icon: '🏆', next: 'po_issued' },
  po_issued: { label: 'أمر شراء صادر (SAP)', color: '#d97706', bg: '#fffbeb', icon: '📄', next: 'delivered' },
  delivered: { label: 'مُستلم بالمخازن', color: '#16a34a', bg: '#f0fdf4', icon: '✅', next: 'closed' },
  closed: { label: 'مغلق ومسدد', color: '#475569', bg: '#f8fafc', icon: '🔒' }
};

export const PoDetailModal: React.FC<PoDetailModalProps> = ({
  po,
  onClose,
  onAdvanceStatus
}) => {
  if (!po) return null;

  const currentMeta = STATUS_META[po.status] || STATUS_META.draft;
  const nextStatus = currentMeta.next;
  const nextMeta = nextStatus ? STATUS_META[nextStatus] : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 left-6 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* PO Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                {po.po_number}
              </span>
              <span
                style={{ backgroundColor: currentMeta.bg, color: currentMeta.color }}
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border border-slate-200"
              >
                {currentMeta.icon} {currentMeta.label}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-2">{po.title}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>المورد: <strong className="text-slate-800">{po.supplier}</strong></span>
              {po.rfq_code && <span className="text-slate-400">| كود الطلب: {po.rfq_code}</span>}
            </div>
          </div>

          <div className="text-right sm:text-left bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-semibold">إجمالي قيمة الأمر</div>
            <div className="text-2xl font-black text-emerald-700 font-mono">
              {po.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-xs">ج.م</span>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Timeline & Items */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 my-6">
          {/* Items Table */}
          <div className="md:col-span-7 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>الأصناف والكميات المدرجة ({po.items.length} صنف)</span>
            </h4>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 max-h-72 overflow-y-auto space-y-2">
              {po.items.map((it, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{it.desc || it.filter_no}</span>
                    <span className="font-bold text-emerald-700 font-mono">
                      {it.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>الكمية: <strong className="text-slate-800">{it.qty}</strong> × {it.unit_price} ج.م</span>
                    <span className="bg-slate-100 px-1.5 py-0.2 rounded font-bold text-slate-700">{it.category}</span>
                  </div>
                  {it.filter_no && it.filter_no !== it.desc && (
                    <div className="text-[10px] text-slate-400">رقم الفلتر المعتمد: {it.filter_no}</div>
                  )}
                </div>
              ))}
            </div>

            {po.notes && (
              <div className="bg-amber-50 text-amber-900 p-3 rounded-xl border border-amber-200 text-xs">
                📌 <strong>ملاحظات:</strong> {po.notes}
              </div>
            )}
          </div>

          {/* Timeline / Audit Trail */}
          <div className="md:col-span-5 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>سجل الأحداث والمراحل (Timeline)</span>
            </h4>

            <div className="space-y-3 pl-2 border-r-2 border-slate-200 pr-3">
              {po.events.map((ev, i) => {
                const meta = STATUS_META[ev.status] || { label: ev.status, icon: '•' };
                return (
                  <div key={ev.id || i} className="relative">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">{ev.happened_at}</div>
                    {ev.note && (
                      <div className="text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded-lg border border-slate-200 mt-0.5">
                        {ev.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            آخر تحديث: {po.updated_at}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {nextStatus && nextMeta && (
              <button
                onClick={() => {
                  const note = prompt('ملاحظة عن ترقية الحالة (اختياري):', `ترقية إلى مرحلة ${nextMeta.label}`);
                  if (note !== null) {
                    onAdvanceStatus(po.id, nextStatus, note || undefined);
                  }
                }}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <span>{nextMeta.icon} ترقية المرحلة إلى: {nextMeta.label}</span>
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-300 transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة PO</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
