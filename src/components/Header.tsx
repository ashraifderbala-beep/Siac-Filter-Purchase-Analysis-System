import React, { useRef } from 'react';
import { 
  BarChart3, 
  PlusCircle, 
  FileSpreadsheet, 
  Truck, 
  CheckCircle2, 
  FileText,
  Building2,
  ExternalLink,
  Download,
  Upload,
  ShieldCheck,
  Save,
  LayoutDashboard
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeRfqCount: number;
  openSupplierPortalModal?: () => void;
  onClearAllData?: () => void;
  onRestoreDemoData?: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  hasData?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeRfqCount,
  openSupplierPortalModal,
  onClearAllData,
  onRestoreDemoData,
  onExportBackup,
  onImportBackup,
  hasData = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { id: 'analysis', label: 'تحليل ملفات SAP و 9004', icon: FileSpreadsheet },
    { id: 'create_rfq', label: 'إنشاء طلب عروض (RFQ)', icon: PlusCircle },
    { id: 'sessions', label: 'سجل الطلبات', icon: FileText, badge: activeRfqCount },
    { id: 'compare', label: 'مقارنة العروض والترسية', icon: BarChart3, highlight: true },
    { id: 'operations_dashboard', label: 'داشبورد العمليات', icon: LayoutDashboard },
    { id: 'tracker', label: 'متابعة أوامر الشراء (POs)', icon: Truck },
    { id: 'portal_demo', label: 'بوابة الموردين', icon: ExternalLink, isSpecial: true }
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportBackup) {
      onImportBackup(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-xl">
      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 gap-3">
          {/* Logo & Company Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-blue-400/30 flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-blue-200 bg-clip-text text-transparent">
                  SIAC
                </span>
                <span className="text-[11px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full font-bold">
                  مشتريات الفلاتر
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 font-medium truncate max-w-[340px]">
                الشركة الهندسية للصناعات والتشييد — نظام المطابقة والترسية الذكية
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav className="hidden xl:flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/60 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === 'portal_demo' && openSupplierPortalModal) {
                      openSupplierPortalModal();
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    item.isSpecial
                      ? 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-400/40 shadow-sm'
                      : isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.isSpecial ? 'text-purple-300' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                      {item.badge}
                    </span>
                  )}
                  {item.highlight && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Actions: Backup, Restore, Clear */}
          <div className="flex items-center gap-2">
            {/* Backup Export Button */}
            {onExportBackup && hasData && (
              <button
                onClick={onExportBackup}
                className="hidden sm:flex items-center gap-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="تنزيل نسخة احتياطية آمنة (Backup) لكافة بيانات الطلبات والموردين"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                <span>نسخ احتياطي للبيانات</span>
              </button>
            )}

            {/* Hidden File Input for Restore */}
            {onImportBackup && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="hidden md:flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  title="استرجاع نسخة احتياطية سابقة من ملف JSON"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  <span>استيراد نسخة</span>
                </button>
              </>
            )}

            {/* Clear or Restore Demo */}
            {hasData ? (
              <button
                onClick={onClearAllData}
                className="flex items-center gap-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-sm"
                title="تفريغ جميع البيانات للبدء من جديد"
              >
                <span>🗑️ مسح</span>
              </button>
            ) : (
              <button
                onClick={onRestoreDemoData}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                title="استعادة البيانات التجريبية للاختبار"
              >
                <span>🔄 استعادة التجريبي</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Navigation Scrollable */}
        <div className="xl:hidden flex overflow-x-auto py-2 gap-2 border-t border-slate-800 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'portal_demo' && openSupplierPortalModal) {
                    openSupplierPortalModal();
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
