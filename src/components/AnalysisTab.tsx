import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  Play, 
  Download, 
  Sparkles, 
  Building2, 
  Layers, 
  ArrowRight,
  RefreshCw,
  Box,
  FileCheck
} from 'lucide-react';
import { processSapFiles, AnalysisResult } from '../services/analysisEngine';
import { exportAnalysisExcel } from '../services/excelExporter';
import { INITIAL_RFQ_ITEMS } from '../data/initialData';

interface AnalysisTabProps {
  onUseItemsForRfq: (items: any[]) => void;
}

export const AnalysisTab: React.FC<AnalysisTabProps> = ({ onUseItemsForRfq }) => {
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [invFile, setInvFile] = useState<File | null>(null);
  const [prFile, setPrFile] = useState<File | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Load demo analysis immediately
  const handleLoadDemo = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const demoResult: AnalysisResult = {
        stats: {
          raw_requests: 34,
          demand_lines: 26,
          projects: 6,
          central_9004_items: 18,
          central_9004_qty: 48,
          supplier_items: INITIAL_RFQ_ITEMS.length,
          alternatives_groups: 8,
          covered: 4
        },
        rfqItems: INITIAL_RFQ_ITEMS,
        projectAnalysis: {
          'مشروع المونوريل': [
            { equipCode: 'GEN-014', filterType: 'فلتر جاز', qtyNeeded: 10, projQty: 2, centralQty: 4, netIfCentral: 6, coveredProj: false, hasCentral: true },
            { equipCode: 'EXC-042', filterType: 'فلتر زيت', qtyNeeded: 14, projQty: 0, centralQty: 6, netIfCentral: 8, coveredProj: false, hasCentral: true }
          ],
          'مشروع العاصمة الإدارية R5': [
            { equipCode: 'GEN-014', filterType: 'فلتر جاز', qtyNeeded: 6, projQty: 0, centralQty: 0, netIfCentral: 6, coveredProj: false, hasCentral: false },
            { equipCode: 'LOD-019', filterType: 'فلتر جاز', qtyNeeded: 12, projQty: 1, centralQty: 2, netIfCentral: 10, coveredProj: false, hasCentral: true }
          ],
          'مشروع القطار السريع': [
            { equipCode: 'PU-088', filterType: 'فلتر جاز', qtyNeeded: 8, projQty: 3, centralQty: 0, netIfCentral: 8, coveredProj: false, hasCentral: false }
          ],
          'مشروع رأس الحكمة': [
            { equipCode: 'CAT-336D', filterType: 'فلتر هواء رئيسي', qtyNeeded: 10, projQty: 2, centralQty: 4, netIfCentral: 6, coveredProj: false, hasCentral: true }
          ]
        },
        central9004Stock: {
          'M003-30203001-000031': { desc: 'حشو فلتر جاز ماركة مان رقم CE1372', qty: 4 },
          'M003-30201002-000485': { desc: 'فلتر زيت ماركه TAITURN رقم TO-927-0', qty: 6 },
          'M003-30203001-000003': { desc: 'حشو فلتر جاز ماركه Hengst رقم E500KP02D36', qty: 8 }
        },
        coveredItems: [
          { project: 'مشروع العلمين', filterType: 'فلتر هيدروليك', qtyNeeded: 4, centralQty: 6, matCode: 'M003-30204001-000088' },
          { project: 'مشروع السخنة', filterType: 'فلتر زيت صغير', qtyNeeded: 2, centralQty: 4, matCode: 'M003-30201002-000999' }
        ]
      };

      setAnalysisResult(demoResult);
      setIsProcessing(false);
    }, 600);
  };

  const handleRunAnalysis = async () => {
    if (!mapFile || !invFile || !prFile) {
      alert('يرجى رفع الملفات الثلاثة أولاً');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await processSapFiles(mapFile, invFile, prFile);
      setAnalysisResult(res);
    } catch (err: any) {
      alert('حدث خطأ أثناء معالجة الملفات: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <span>تحليل ومعالجة ملفات SAP وتخصيص رصيد المخزن المركزي 9004</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              يقوم النظام بتجميع البدائل، خصم رصيد مخزن 9004 المركزي، وإنتاج ملف طلب المشتريات بدون تكرار
            </p>
          </div>

          <button
            type="button"
            onClick={handleLoadDemo}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold px-4 py-2.5 rounded-xl border border-indigo-200 shadow-sm transition-all"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>تحميل بيانات تجريبية واقعية لـ SIAC</span>
          </button>
        </div>

        {/* 3 Upload Zones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* File 1: Warehouse Map */}
          <div className={`border-2 border-dashed rounded-2xl p-5 text-center relative transition-all ${
            mapFile ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300 hover:border-blue-500 bg-slate-50/50'
          }`}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setMapFile(e.target.files?.[0] || null)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto mb-2 font-bold">
              1
            </div>
            <div className="text-xs font-bold text-slate-900">أرقام المخازن والمشاريع</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {mapFile ? <span className="text-emerald-700 font-bold">{mapFile.name}</span> : 'اسحب الملف هنا أو انقر للاختيار'}
            </div>
          </div>

          {/* File 2: Inventory */}
          <div className={`border-2 border-dashed rounded-2xl p-5 text-center relative transition-all ${
            invFile ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300 hover:border-blue-500 bg-slate-50/50'
          }`}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setInvFile(e.target.files?.[0] || null)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-2 font-bold">
              2
            </div>
            <div className="text-xs font-bold text-slate-900">رصيد الفلاتر بالمشاريع + 9004</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {invFile ? <span className="text-emerald-700 font-bold">{invFile.name}</span> : 'اسحب الملف هنا أو انقر للاختيار'}
            </div>
          </div>

          {/* File 3: Purchase Requests */}
          <div className={`border-2 border-dashed rounded-2xl p-5 text-center relative transition-all ${
            prFile ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300 hover:border-blue-500 bg-slate-50/50'
          }`}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setPrFile(e.target.files?.[0] || null)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2 font-bold">
              3
            </div>
            <div className="text-xs font-bold text-slate-900">طلبات الشراء من المشاريع</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {prFile ? <span className="text-emerald-700 font-bold">{prFile.name}</span> : 'اسحب الملف هنا أو انقر للاختيار'}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="text-xs text-purple-800 bg-purple-50 px-4 py-2 rounded-xl border border-purple-200">
            🟣 يتم تلقائياً استبعاد الفلاتر المغطاة بمخزن 9004 وتجميع الأرقام البديلة لنفس المعدة
          </div>

          <button
            type="button"
            disabled={(!mapFile || !invFile || !prFile) && !analysisResult}
            onClick={handleRunAnalysis}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-40 text-white font-bold text-sm px-8 py-3 rounded-xl shadow-md transition-all"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>جاري المعالجة والمطابقة...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>بدء التحليل والمعالجة</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Analysis Results Display */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-slate-900">{analysisResult.stats.raw_requests}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">طلبات SAP الخام</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-blue-700">{analysisResult.stats.demand_lines}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">بعد دمج البدائل</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-emerald-700">{analysisResult.stats.supplier_items}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">أصناف للشراء</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-purple-700">{analysisResult.stats.central_9004_qty}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">قطعة بمخزن 9004</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-emerald-600">{analysisResult.stats.covered}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">مغطى بالرصيد</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-slate-800">{analysisResult.stats.projects}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">مشاريع مشاركة</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-amber-600">{analysisResult.stats.alternatives_groups}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">مجموعات بدائل</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
              <div className="text-xl font-black text-indigo-600">{analysisResult.stats.central_9004_items}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">أصناف بـ 9004</div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-gradient-to-r from-emerald-900 to-slate-900 text-white p-6 rounded-2xl border border-emerald-800/40 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>تم تجهيز قائمة الأصناف للشراء ({analysisResult.rfqItems.length} صنف جاهز)</span>
              </h3>
              <p className="text-xs text-emerald-200/80 mt-1">
                يمكنك تصدير ملف Excel الشامل بـ 6 أوراق أو الانتقال مباشرة لإنشاء طلب التسعير للموردين
              </p>
            </div>

            <div className="flex flex-wrap gap-3 w-full sm:w-auto">
              <button
                onClick={() => exportAnalysisExcel(analysisResult)}
                className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-600 shadow-sm transition-all"
              >
                <Download className="w-4 h-4" />
                <span>تحميل Excel التحليل الكامل (6 أوراق)</span>
              </button>

              <button
                onClick={() => onUseItemsForRfq(analysisResult.rfqItems)}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-extrabold px-6 py-2.5 rounded-xl shadow-lg transition-all hover:scale-105"
              >
                <span>إنشاء طلب عروض أسعار للموردين (RFQ)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table of Analyzed Supplier Items */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-sm font-bold">الأصناف المحددة للشراء للموردين (بعد خصم 9004)</span>
              <span className="text-xs text-slate-400">{analysisResult.rfqItems.length} صنف</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="p-3 text-center w-12 font-bold">م</th>
                    <th className="p-3 font-bold">كود SAP</th>
                    <th className="p-3 font-bold">رقم / وصف الفلتر</th>
                    <th className="p-3 font-bold">نوع الفلتر</th>
                    <th className="p-3 font-bold">الأرقام البديلة</th>
                    <th className="p-3 text-center font-bold">رصيد 9004</th>
                    <th className="p-3 text-center font-bold">الكمية للشراء</th>
                    <th className="p-3 font-bold">المشاريع الطالبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analysisResult.rfqItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="p-3 font-mono font-semibold text-slate-700">{item.mat_code || '—'}</td>
                      <td className="p-3 font-bold text-slate-900">{item.primary_number}</td>
                      <td className="p-3 text-slate-700">{item.filter_type}</td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {item.alt_numbers && item.alt_numbers.length > 1 ? item.alt_numbers.slice(1).join(' / ') : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-mono font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          {item.central_avail || 0}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {item.qty_needed}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 text-[11px]">
                        {item.projects ? item.projects.join(' | ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
