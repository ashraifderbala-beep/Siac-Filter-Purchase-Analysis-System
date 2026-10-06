import React from 'react';
import { 
  FileText, 
  BarChart3, 
  ExternalLink, 
  Copy, 
  Lock, 
  Unlock, 
  Clock, 
  Users, 
  Check, 
  CheckCircle2 
} from 'lucide-react';
import { RfqSession } from '../types/procurement';

interface RfqSessionsTabProps {
  sessions: RfqSession[];
  onSelectSessionForCompare: (code: string) => void;
  onOpenPortal: (code: string) => void;
  onToggleSessionActive: (code: string) => void;
}

export const RfqSessionsTab: React.FC<RfqSessionsTabProps> = ({
  sessions,
  onSelectSessionForCompare,
  onOpenPortal,
  onToggleSessionActive
}) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/portal/${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>سجل وطلبات العروض السابقة (RFQ Sessions)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            متابعة حالة جلسات استدراج الأسعار، الموردين الذين ردوا، وفتح جدول المقارنة والترسية
          </p>
        </div>
        <div className="text-xs bg-slate-100 px-3 py-1.5 rounded-xl text-slate-700 font-bold">
          إجمالي الجلسات: {sessions.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {sessions.map(s => {
          const totalQuotedItems = s.items.length;
          const suppliersCount = s.submissions.length;

          return (
            <div
              key={s.code}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                    {s.code}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {s.title}
                  </h3>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    s.is_active 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}>
                    {s.is_active ? 'مفتوح لاستلام العروض' : 'مغلق'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>تاريخ الإنشاء: {s.created_at}</span>
                  </span>
                  <span className="flex items-center gap-1 text-purple-700 font-semibold">
                    <Users className="w-3.5 h-3.5" />
                    <span>الموردين الذين قدموا عروضاً: <strong>{suppliersCount}</strong></span>
                  </span>
                  <span>الأصناف المطلوبة: <strong>{totalQuotedItems}</strong> صنف</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => onSelectSessionForCompare(s.code)}
                  className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md transition-all"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>مقارنة وترسية</span>
                </button>

                <button
                  onClick={() => handleCopyLink(s.code)}
                  className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-300 transition-colors"
                  title="نسخ رابط بوابة الموردين"
                >
                  {copiedCode === s.code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode === s.code ? 'تم النسخ' : 'نسخ الرابط'}</span>
                </button>

                <button
                  onClick={() => onOpenPortal(s.code)}
                  className="flex items-center justify-center gap-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold px-3 py-2 rounded-xl border border-purple-200 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح البوابة</span>
                </button>

                <button
                  onClick={() => onToggleSessionActive(s.code)}
                  className={`p-2 rounded-xl border transition-colors ${
                    s.is_active 
                      ? 'text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100' 
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title={s.is_active ? 'إغلاق الطلب' : 'إعادة فتح الطلب'}
                >
                  {s.is_active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
