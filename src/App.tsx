import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  BarChart3, 
  PlusCircle, 
  FileSpreadsheet, 
  Truck, 
  FileText, 
  ExternalLink,
  CheckCircle2,
  Bell
} from 'lucide-react';
import { Header } from './components/Header';
import { AnalysisTab } from './components/AnalysisTab';
import { RfqCreateTab } from './components/RfqCreateTab';
import { RfqSessionsTab } from './components/RfqSessionsTab';
import { ComparisonTab } from './components/ComparisonTab';
import { TrackerTab } from './components/TrackerTab';
import { OperationsDashboardTab } from './components/OperationsDashboardTab';
import { SupplierPortalView } from './components/SupplierPortalView';
import { PoDetailModal } from './components/PoDetailModal';
import { 
  RfqSession, 
  PurchaseOrder, 
  SupplierSubmission, 
  PurchaseOrderItem, 
  POStatus 
} from './types/procurement';
import { INITIAL_RFQ_SESSIONS, INITIAL_POS } from './data/initialData';

import { 
  safeLocalStorageSet, 
  safeLocalStorageGet, 
  saveToIndexedDB, 
  loadFromIndexedDB,
  exportFullDatabaseBackup,
  parseDatabaseBackupFile
} from './services/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('compare'); // start on the comparison tab to immediately showcase the new features
  
  // Sessions state (with initial realistic sample sessions for SIAC)
  const [sessions, setSessions] = useState<RfqSession[]>(() => {
    return safeLocalStorageGet<RfqSession[]>('siac_rfq_sessions', INITIAL_RFQ_SESSIONS);
  });

  // Selected session code for comparison
  const [activeSessionCode, setActiveSessionCode] = useState<string>(() => {
    return safeLocalStorageGet<string>('siac_active_session_code', INITIAL_RFQ_SESSIONS[0]?.code || '');
  });

  // Purchase Orders state
  const [orders, setOrders] = useState<PurchaseOrder[]>(() => {
    return safeLocalStorageGet<PurchaseOrder[]>('siac_purchase_orders', INITIAL_POS);
  });

  // Load IndexedDB large persistent store on start
  useEffect(() => {
    loadFromIndexedDB('sessions', 'all_sessions').then(data => {
      if (data && Array.isArray(data) && data.length > 0) {
        setSessions(data);
      }
    });
    loadFromIndexedDB('orders', 'all_orders').then(data => {
      if (data && Array.isArray(data) && data.length > 0) {
        setOrders(data);
      }
    });
  }, []);

  // Selected PO for Modal detail
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  // Staged items from Analysis to create new RFQ
  const [stagedRfqItems, setStagedRfqItems] = useState<RfqItem[]>([]);

  // Supplier Portal Simulation Modal or View
  const [supplierPortalSessionCode, setSupplierPortalSessionCode] = useState<string | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Save safely to LocalStorage + IndexedDB without quota exceptions
  useEffect(() => {
    safeLocalStorageSet('siac_rfq_sessions', sessions);
    saveToIndexedDB('sessions', 'all_sessions', sessions);
  }, [sessions]);

  useEffect(() => {
    safeLocalStorageSet('siac_purchase_orders', orders);
    saveToIndexedDB('orders', 'all_orders', orders);
  }, [orders]);

  useEffect(() => {
    if (activeSessionCode) {
      safeLocalStorageSet('siac_active_session_code', activeSessionCode);
    }
  }, [activeSessionCode]);

  const activeSession = sessions.find(s => s.code === activeSessionCode) || sessions[0];

  // Check direct URL path on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/portal/')) {
      const code = path.split('/portal/')[1]?.split('/')[0]?.trim();
      if (code) {
        setSupplierPortalSessionCode(code);
      }
    }
  }, [sessions]);

  // Handler: Create new RFQ Session
  const handleCreateRfq = (newSession: RfqSession) => {
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionCode(newSession.code);
    showToast(`✅ تم إنشاء طلب التسعير بنجاح: ${newSession.code}`);
  };

  // Handler: Submit Quote from Supplier Portal
  const handleSubmitQuote = (sessionCode: string, submission: SupplierSubmission) => {
    setSessions(prev => prev.map(s => {
      if (s.code !== sessionCode) return s;
      
      const existingIdx = s.submissions.findIndex(
        sub => sub.supplier_name.toLowerCase() === submission.supplier_name.toLowerCase()
      );

      let updatedSubmissions = [...s.submissions];
      if (existingIdx >= 0) {
        updatedSubmissions[existingIdx] = submission;
      } else {
        updatedSubmissions.push(submission);
      }

      return {
        ...s,
        submissions: updatedSubmissions
      };
    }));

    showToast(`✅ تم حفظ عرض أسعار المورد [${submission.supplier_name}]`);
  };

  // Handler: Award Single Item to a Supplier
  const handleAwardItem = (
    rfqCode: string,
    supplierName: string,
    item: PurchaseOrderItem,
    notes: string
  ) => {
    const now = new Date();
    const poNumber = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(orders.length + 1).padStart(3, '0')}`;

    const newPO: PurchaseOrder = {
      id: `po-${Date.now()}`,
      po_number: poNumber,
      rfq_code: rfqCode,
      title: `ترسية توريد: ${item.desc || item.filter_no} (${item.category})`,
      supplier: supplierName,
      total_value: item.total,
      currency: 'EGP',
      status: 'awarded',
      created_at: now.toLocaleString('ar-EG'),
      updated_at: now.toLocaleString('ar-EG'),
      notes: notes || 'تمت الترسية وفق أقل سعر فئة معتمدة',
      items: [item],
      events: [
        { id: `ev-${Date.now()}-1`, status: 'draft', note: 'إنشاء مسودة أمر الشراء', happened_at: now.toLocaleString('ar-EG') },
        { id: `ev-${Date.now()}-2`, status: 'awarded', note: `اعتماد قرار الترسية لـ ${supplierName}`, happened_at: now.toLocaleString('ar-EG') }
      ]
    };

    setOrders(prev => [newPO, ...prev]);
    showToast(`🏆 تمت ترسية الصنف لـ [${supplierName}] وإنشاء أمر الشراء ${poNumber}`);
  };

  // Handler: Batch Award all items
  const handleBatchAwardAll = (
    rfqCode: string,
    awardedOrders: { supplier: string; items: PurchaseOrderItem[]; total: number }[]
  ) => {
    const now = new Date();
    const newPOs: PurchaseOrder[] = awardedOrders.map((ord, i) => {
      const poNum = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(orders.length + i + 1).padStart(3, '0')}`;
      return {
        id: `po-${Date.now()}-${i}`,
        po_number: poNum,
        rfq_code: rfqCode,
        title: `أمر شراء ترسية ${rfqCode} — ${ord.supplier}`,
        supplier: ord.supplier,
        total_value: ord.total,
        currency: 'EGP',
        status: 'awarded',
        created_at: now.toLocaleString('ar-EG'),
        updated_at: now.toLocaleString('ar-EG'),
        notes: `ترسية شاملة لـ ${ord.items.length} صنف فلاتر`,
        items: ord.items,
        events: [
          { id: `ev-${Date.now()}-${i}-1`, status: 'draft', note: 'إنشاء أمر الشراء', happened_at: now.toLocaleString('ar-EG') },
          { id: `ev-${Date.now()}-${i}-2`, status: 'awarded', note: `اعتماد الترسية لـ ${ord.supplier}`, happened_at: now.toLocaleString('ar-EG') }
        ]
      };
    });

    setOrders(prev => [...newPOs, ...prev]);
    showToast(`🏆 تم إنشاء ${newPOs.length} أوامر شراء لكافة الموردين الفائزين بنجاح!`);
    setActiveTab('tracker');
  };

  // Handler: Update Item Receiving in Store 9004
  const handleUpdatePoItemReceiving = (poId: string, itemIdx: number, receivedQty: number, voucherNo: string, notes: string) => {
    const now = new Date().toLocaleString('ar-EG');
    setOrders(prev => prev.map(po => {
      if (po.id !== poId) return po;
      const updatedItems = po.items.map((it, idx) => {
        if (idx !== itemIdx) return it;
        return {
          ...it,
          received_qty: receivedQty,
          delivery_voucher: voucherNo,
          receiving_notes: notes,
          received_at: now
        };
      });
      const allReceived = updatedItems.every(it => (it.received_qty || 0) >= it.qty);
      const newStatus = allReceived ? 'delivered' : po.status;

      return {
        ...po,
        items: updatedItems,
        status: newStatus,
        updated_at: now
      };
    }));
  };

  // Handler: Dispatch Item from 9004 to Project
  const handleDispatchToProject = (poId: string, itemIdx: number, record: ProjectDispatchRecord) => {
    const now = new Date().toLocaleString('ar-EG');
    setOrders(prev => prev.map(po => {
      if (po.id !== poId) return po;
      const updatedItems = po.items.map((it, idx) => {
        if (idx !== itemIdx) return it;
        const currentDispatches = it.dispatches || [];
        return {
          ...it,
          dispatches: [...currentDispatches, record]
        };
      });
      return {
        ...po,
        items: updatedItems,
        updated_at: now
      };
    }));
  };

  // Handler: Advance PO Status
  const handleAdvanceStatus = (poId: string, nextStatus: POStatus, note?: string) => {
    const now = new Date().toLocaleString('ar-EG');
    setOrders(prev => prev.map(o => {
      if (o.id !== poId) return o;
      const updatedEvents = [
        ...o.events,
        {
          id: `ev-${Date.now()}`,
          status: nextStatus,
          note: note || `ترقية الحالة إلى ${nextStatus}`,
          happened_at: now
        }
      ];
      return {
        ...o,
        status: nextStatus,
        updated_at: now,
        events: updatedEvents
      };
    }));

    if (selectedPo && selectedPo.id === poId) {
      setSelectedPo(prev => prev ? {
        ...prev,
        status: nextStatus,
        updated_at: now,
        events: [...prev.events, { id: `ev-${Date.now()}`, status: nextStatus, note: note || '', happened_at: now }]
      } : null);
    }

    showToast(`✅ تم تحديث مرحلة أمر الشراء بنجاح`);
  };

  // Handler: Toggle active session
  const handleToggleSessionActive = (code: string) => {
    setSessions(prev => prev.map(s => {
      if (s.code !== code) return s;
      return { ...s, is_active: !s.is_active };
    }));
  };

  // Handler: Export complete database backup
  const handleExportBackup = () => {
    exportFullDatabaseBackup(sessions, orders);
    showToast('💾 تم تنزيل النسخة الاحتياطية بنجاح بصيغة JSON');
  };

  // Handler: Import and restore database backup
  const handleImportBackup = async (file: File) => {
    try {
      const parsed = await parseDatabaseBackupFile(file);
      if (window.confirm(`هل أنت متأكد من استرجاع النسخة الاحتياطية التي تحتوي على (${parsed.sessions.length} طلب تسعير)؟`)) {
        setSessions(parsed.sessions);
        setOrders(parsed.orders || []);
        if (parsed.sessions.length > 0) {
          setActiveSessionCode(parsed.sessions[0].code);
        }
        showToast(`✅ تم استرجاع النسخة الاحتياطية بنجاح (${parsed.sessions.length} طلب)`);
      }
    } catch (err: any) {
      alert('خطأ أثناء استرجاع النسخة الاحتياطية: ' + err.message);
    }
  };

  // Handler: Clear all data to start completely fresh with real data
  const handleClearAllData = () => {
    if (window.confirm('هل أنت متأكد من تفريغ كافة البيانات والبدء على نظيف لتحميل بيانات الشركة الحقيقية؟\n(نوصي بعمل "نسخ احتياطي للبيانات" أولاً لحفظ عملك الحالي)')) {
      setSessions([]);
      setOrders([]);
      setActiveSessionCode('');
      localStorage.removeItem('siac_rfq_sessions');
      localStorage.removeItem('siac_purchase_orders');
      saveToIndexedDB('sessions', 'all_sessions', []);
      saveToIndexedDB('orders', 'all_orders', []);
      setActiveTab('analysis');
      showToast('🗑️ تم تفريغ البيانات بنجاح — يمكنك الآن رفع ملفات SAP الحقيقية');
    }
  };

  // Handler: Restore demo dataset
  const handleRestoreDemoData = () => {
    setSessions(INITIAL_RFQ_SESSIONS);
    setOrders(INITIAL_POS);
    setActiveSessionCode(INITIAL_RFQ_SESSIONS[0].code);
    setActiveTab('compare');
    showToast('🔄 تم استعادة البيانات التجريبية للاختبار');
  };

  const hasData = sessions.length > 0 || orders.length > 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans" dir="rtl">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeRfqCount={sessions.filter(s => s.is_active).length}
        openSupplierPortalModal={() => {
          if (activeSession) {
            setSupplierPortalSessionCode(activeSession.code);
          } else {
            showToast('⚠️ يرجى إنشاء طلب تسعير أولاً');
            setActiveTab('create_rfq');
          }
        }}
        onClearAllData={handleClearAllData}
        onRestoreDemoData={handleRestoreDemoData}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        hasData={hasData}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-2 sm:px-4 lg:px-6 py-5">
        {/* Toast Notification Alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
            <Bell className="w-4 h-4 text-emerald-400 animate-bounce" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </div>
        )}

        {/* Tab 1: SAP Analysis & 9004 Store Matching */}
        {activeTab === 'analysis' && (
          <AnalysisTab onUseItemsForRfq={(items) => {
            setStagedRfqItems(items);
            setActiveTab('create_rfq');
            showToast(`✅ تم نقل ${items.length} صنف لصفحة إنشاء طلب العروض`);
          }} />
        )}

        {/* Tab 2: Create RFQ */}
        {activeTab === 'create_rfq' && (
          <RfqCreateTab
            initialItems={stagedRfqItems.length > 0 ? stagedRfqItems : (activeSession?.items || [])}
            onCreateRfq={(newSession) => {
              handleCreateRfq(newSession);
              setStagedRfqItems([]);
            }}
            onOpenPortal={(code) => setSupplierPortalSessionCode(code)}
            onNavigateToAnalysis={() => setActiveTab('analysis')}
          />
        )}

        {/* Tab 3: RFQ Sessions Archive */}
        {activeTab === 'sessions' && (
          <RfqSessionsTab
            sessions={sessions}
            onSelectSessionForCompare={(code) => {
              setActiveSessionCode(code);
              setActiveTab('compare');
            }}
            onOpenPortal={(code) => setSupplierPortalSessionCode(code)}
            onToggleSessionActive={handleToggleSessionActive}
          />
        )}

        {/* Tab 4: Comparison & Category-Based Awarding */}
        {activeTab === 'compare' && (
          <div className="space-y-6">
            {sessions.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                  <BarChart3 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">لا توجد طلبات عروض حالياً</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  تم تفريغ البيانات بنجاح للبدء بالبيانات الحقيقية. ابدأ بتحليل ملفات SAP ومخزن 9004 أو أنشئ طلب تسعير جديد.
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab('analysis')}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all"
                  >
                    📁 ابدأ برفع ملفات SAP
                  </button>
                  <button
                    onClick={() => setActiveTab('create_rfq')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl border border-slate-300 transition-all"
                  >
                    ➕ إنشاء طلب تسعير مباشر
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Session Selector Header */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        مقارنة عروض الأسعار والترسية الذكية
                      </h2>
                      <p className="text-xs text-slate-500">
                        الطلب الحالي: <strong className="text-blue-700 font-mono">{activeSession?.code}</strong> — {activeSession?.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                      value={activeSessionCode}
                      onChange={e => setActiveSessionCode(e.target.value)}
                      className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      {sessions.map(s => (
                        <option key={s.code} value={s.code}>
                          {s.code} — {s.title} ({s.submissions.length} موردين)
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => setSupplierPortalSessionCode(activeSession.code)}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح بوابة مورد للتسعير</span>
                    </button>
                  </div>
                </div>

                {activeSession && (
                  <ComparisonTab
                    session={activeSession}
                    onAwardItem={handleAwardItem}
                    onBatchAwardAll={handleBatchAwardAll}
                    onNavigateToTracker={() => setActiveTab('tracker')}
                    onOpenSupplierPortal={() => setSupplierPortalSessionCode(activeSession.code)}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 5: Operations Live Dashboard (داشبورد العمليات) */}
        {activeTab === 'operations_dashboard' && (
          <OperationsDashboardTab
            orders={orders}
            session={activeSession}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* Tab 6: PO Lifecycle Tracker & Store 9004 */}
        {activeTab === 'tracker' && (
          <TrackerTab
            orders={orders}
            onAdvanceStatus={handleAdvanceStatus}
            onOpenPoDetail={(po) => setSelectedPo(po)}
            onUpdateItemReceiving={handleUpdatePoItemReceiving}
            onDispatchToProject={handleDispatchToProject}
            onCreateManualPo={(poData) => {
              const now = new Date();
              const poNum = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(orders.length + 1).padStart(3, '0')}`;
              const newPo: PurchaseOrder = {
                id: `po-${Date.now()}`,
                po_number: poNum,
                rfq_code: poData.rfq_code || '',
                title: poData.title || 'أمر شراء يدوي',
                supplier: poData.supplier || 'مورد عام',
                total_value: poData.total_value || 0,
                currency: 'EGP',
                status: 'draft',
                created_at: now.toLocaleString('ar-EG'),
                updated_at: now.toLocaleString('ar-EG'),
                notes: poData.notes || '',
                items: [],
                events: [
                  { id: `ev-${Date.now()}`, status: 'draft', note: 'إنشاء أمر الشراء يدويًا', happened_at: now.toLocaleString('ar-EG') }
                ]
              };
              setOrders(prev => [newPo, ...prev]);
              showToast(`✅ تم إنشاء أمر الشراء ${poNum}`);
            }}
          />
        )}
      </main>

      {/* PO Detail Modal */}
      {selectedPo && (
        <PoDetailModal
          po={selectedPo}
          onClose={() => setSelectedPo(null)}
          onAdvanceStatus={handleAdvanceStatus}
        />
      )}

      {/* Supplier Portal Full-Screen Overlay / Modal */}
      {supplierPortalSessionCode && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md overflow-y-auto p-2 sm:p-6">
          <div className="max-w-[1600px] mx-auto bg-slate-100 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 min-h-full flex flex-col">
            {/* Top Close / Navigation Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>معاينة وتجربة بوابة الموردين (Supplier Portal View)</span>
              </div>

              <button
                onClick={() => setSupplierPortalSessionCode(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all border border-slate-700"
              >
                ✕ إغلاق والعودة للوحة الإدارة
              </button>
            </div>

            <div className="flex-1 p-2 sm:p-6">
              {(() => {
                const sess = sessions.find(s => s.code === supplierPortalSessionCode) || activeSession;
                return (
                  <SupplierPortalView
                    session={sess}
                    onSubmitQuote={handleSubmitQuote}
                    onBackToAdmin={() => setSupplierPortalSessionCode(null)}
                    isStandalone={true}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
