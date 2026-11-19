import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  BarChart3, 
  PlusCircle, 
  FileSpreadsheet, 
  Truck, 
  FileText, 
  ExternalLink,
  CheckCircle2, 
  Bell,
  ShieldCheck,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Header } from './components/Header';
import { AnalysisTab } from './components/AnalysisTab';
import { RfqCreateTab } from './components/RfqCreateTab';
import { RfqSessionsTab } from './components/RfqSessionsTab';
import { ComparisonTab } from './components/ComparisonTab';
import { EquipmentMatcherTab } from './components/EquipmentMatcherTab';
import { TrackerTab } from './components/TrackerTab';
import { InventoryReportTab, ProjectWarehouseTab } from './components/InventoryTabs';
import { ProjectRequestForm } from './components/ProjectRequestForm';
import { ProjectRequestsTab } from './components/ProjectRequestsTab';
import { OperationsDashboardTab } from './components/OperationsDashboardTab';
import { SupplierPortalView } from './components/SupplierPortalView';
import { PoDetailModal } from './components/PoDetailModal';
import { DataRecoveryModal } from './components/DataRecoveryModal';
import { AuthenticationScreen } from './components/AuthenticationScreen';
import { UsersManagementTab } from './components/UsersManagementTab';
import { useAuth } from './auth/AuthProvider';
import { canOpenTab } from './auth/permissions';
import { 
  RfqSession, 
  PurchaseOrder, 
  SupplierSubmission, 
  PurchaseOrderItem, 
  POStatus,
  AwardCriteria,
  FilterCategory,
  RfqItem,
  ProjectDispatchRecord,
  ManualAwardSelection,
  AppPermission,
  UserProfile,
  SapHistoricalPrice,
  ReceivedSupplierIdentity
} from './types/procurement';
import { INITIAL_RFQ_SESSIONS, INITIAL_POS } from './data/initialData';
import { USER_REAL_RFQ_SESSION_1913, USER_REAL_POS_1913, USER_REAL_CATEGORY_SELECTIONS_1913 } from './data/userExportedSession1913';

import { 
  safeLocalStorageSet, 
  safeLocalStorageGet, 
  safeLocalStorageRemove,
  setStorageScope,
  saveToIndexedDB, 
  exportFullDatabaseBackup,
  parseDatabaseBackupFile,
  saveEmergencySnapshot,
  loadEmergencySnapshot,
  getEmergencySnapshotSync
} from './services/storage';
import { parseComparisonExcelFile } from './services/excelImporter';
import { exportSupplierPurchaseOrderExcel } from './services/supplierPoExcelExporter';
import { buildAwardGroups, reconcileAwardGroupsWithOrders } from './services/awardReport';
import { sumPurchaseOrderItems } from './services/purchaseOrderTotals';
import {
  deleteMissingProcurementRecords,
  importMissingLocalData,
  insertPurchaseOrder,
  insertRfqSession,
  loadAssignedProjectPurchaseOrders,
  loadSharedProcurementData,
  recordPurchaseOrderDispatch,
  recordPurchaseOrderReceipt,
  type SharedProcurementData,
  updatePurchaseOrder,
  updateRfqSession
} from './services/supabaseProcurement';

// Helper: Ensure the comprehensive 188-item session with authentic suppliers is always present and clean
function ensureCompleteSessions(rawList: RfqSession[] | null | undefined): RfqSession[] {
  if (!rawList || !Array.isArray(rawList) || rawList.length === 0) {
    return [USER_REAL_RFQ_SESSION_1913];
  }

  // Filter out any legacy dummy demo sessions or sessions containing the fake dummy suppliers (النيل / المتحدة)
  const cleanedList = rawList.filter(s => {
    if (!s) return false;
    if (s.code === 'RFQ-20261004-1557') return false;
    if (s.title && (s.title.includes('8 أصناف') || s.title.includes('تجريبية'))) return false;
    if (s.code !== USER_REAL_RFQ_SESSION_1913.code && (s.items?.length || 0) <= 8 && (!s.submissions || s.submissions.length === 0)) return false;
    // Filter out old sessions containing mock dummy companies
    const hasFakeSuppliers = (s.submissions || []).some(sub => sub.supplier_name.includes('النيل') || sub.supplier_name.includes('المتحدة'));
    if (hasFakeSuppliers && s.code !== USER_REAL_RFQ_SESSION_1913.code) return false;
    return true;
  });

  const realCode = USER_REAL_RFQ_SESSION_1913.code; // 'RFQ-20261004-1913'
  const existingReal = cleanedList.find(s => s.code === realCode);

  let result: RfqSession[];
  if (!existingReal) {
    // If the 188-item authentic session was missing, add it as primary
    result = [USER_REAL_RFQ_SESSION_1913, ...cleanedList];
  } else if ((existingReal.items?.length || 0) < 180 || (existingReal.submissions?.length || 0) < 4) {
    // If it was truncated or missing submissions, restore full session
    result = cleanedList.map(s => s.code === realCode ? USER_REAL_RFQ_SESSION_1913 : s);
  } else {
    result = [...cleanedList];
  }

  return result.length > 0 ? result : [USER_REAL_RFQ_SESSION_1913];
}

// Helper: Ensure all real POs from USER_REAL_POS_1913 (Said Saadan, Rafiq, Express, Trust, Dizak) are present
function ensureCompleteOrders(rawOrders: PurchaseOrder[] | null | undefined): PurchaseOrder[] {
  if (!rawOrders || !Array.isArray(rawOrders) || rawOrders.length === 0) {
    return USER_REAL_POS_1913;
  }

  // Filter out any legacy demo POs or POs to fake companies (النيل / المتحدة / الأهرام)
  const cleanedOrders = rawOrders.filter(o => {
    if (!o) return false;
    if (o.rfq_code === 'RFQ-20261004-1557' || o.id === 'po-supp-1' || o.id === 'po-2') return false;
    if (o.supplier && (o.supplier.includes('النيل') || o.supplier.includes('المتحدة') || o.supplier.includes('الأهرام'))) return false;
    return true;
  });

  const result = [...cleanedOrders];
  USER_REAL_POS_1913.forEach(realPo => {
    const exists = result.some(o =>
      o.id === realPo.id ||
      (o.po_number === realPo.po_number && o.supplier === realPo.supplier) ||
      (
        (o.rfq_code || '') === (realPo.rfq_code || '') &&
        (o.supplier || '').trim() === (realPo.supplier || '').trim()
      )
    );
    if (!exists) {
      result.unshift(realPo);
    }
  });

  return result.length > 0 ? result : USER_REAL_POS_1913;
}

export default function App() {
  const auth = useAuth();

  if (!auth.configured) {
    return <AuthenticationScreen />;
  }
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center" dir="rtl">
        جارٍ التحقق من حساب المستخدم وصلاحياته...
      </div>
    );
  }
  if (!auth.user) {
    return <AuthenticationScreen />;
  }
  if (auth.error || !auth.profile) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-lg rounded-2xl border border-rose-800 bg-slate-900 p-6 text-center">
          <p role="alert" className="mb-4 text-sm text-rose-200">
            {auth.error || 'لا يوجد ملف صلاحيات مرتبط بهذا الحساب.'}
          </p>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }
  if (!auth.permissions.some(permission => [
    'analysis.run',
    'rfq.create',
    'rfq.read',
    'offers.compare',
    'equipment.read',
    'operations.read',
    'po.read',
    'project.inventory.receive',
    'project.inventory.issue',
    'project.request.submit',
    'project.request.read'
  ].includes(permission))) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="mb-4 text-sm text-slate-200">
            هذا الحساب غير مرتبط بواجهة متاحة حالياً. راجع مسؤول النظام لإسناد الدور والقسم المناسبين.
          </p>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthenticatedApp
      profile={auth.profile}
      permissions={auth.permissions}
      can={auth.can}
      onSignOut={auth.signOut}
    />
  );
}

function AuthenticatedApp({
  profile,
  permissions,
  can,
  onSignOut
}: {
  profile: UserProfile;
  permissions: string[];
  can: (permission: AppPermission) => boolean;
  onSignOut: () => Promise<void>;
}) {
  setStorageScope(profile.id);
  const availableTabs = [
    'analysis',
    'create_rfq',
    'sessions',
    'compare',
    'equipment_matcher',
    'operations_dashboard',
    'tracker',
    'inventory_report',
    'project_inventory',
    'project_requests',
    'users'
  ].filter(tab =>
    canOpenTab(permissions, tab) &&
    (tab !== 'operations_dashboard' || profile.role_code === 'admin') &&
    (tab !== 'tracker' || profile.role_code !== 'project_warehouse') &&
    (tab !== 'project_inventory' || profile.role_code === 'project_warehouse')
  );
  const [activeTab, setActiveTab] = useState<string>(() =>
    availableTabs.includes('compare') ? 'compare' : (availableTabs[0] || '')
  );
  
  // Category selection map shared across ComparisonTab and EquipmentMatcherTab
  const [categorySelection, setCategorySelection] = useState<Record<string, AwardCriteria>>(() => {
    return safeLocalStorageGet<Record<string, AwardCriteria>>('siac_active_category_selection', USER_REAL_CATEGORY_SELECTIONS_1913);
  });

  useEffect(() => {
    safeLocalStorageSet('siac_active_category_selection', categorySelection);
  }, [categorySelection]);

  const categorySelectionRef = useRef(categorySelection);
  useEffect(() => {
    categorySelectionRef.current = categorySelection;
  }, [categorySelection]);

  // Manual Award Selection map per session: rfqCode -> (itemId -> ManualAwardSelection)
  const [manualAwards, setManualAwards] = useState<Record<string, Record<string, ManualAwardSelection>>>(() => {
    return safeLocalStorageGet<Record<string, Record<string, ManualAwardSelection>>>('siac_manual_awards_map', {});
  });

  useEffect(() => {
    safeLocalStorageSet('siac_manual_awards_map', manualAwards);
  }, [manualAwards]);

  // Sessions state (guarantees the authentic 188-item session with real suppliers is always loaded)
  const [sessions, setSessions] = useState<RfqSession[]>(() => {
    let raw = safeLocalStorageGet<RfqSession[]>('siac_rfq_sessions', [USER_REAL_RFQ_SESSION_1913]);
    if (!raw || !Array.isArray(raw) || raw.length === 0 || !raw[0]?.items || raw[0].items.length === 0) {
      const snap = getEmergencySnapshotSync();
      if (snap && snap.sessions && snap.sessions.length > 0) {
        raw = snap.sessions;
      } else {
        raw = [USER_REAL_RFQ_SESSION_1913];
      }
    }
    const validated = ensureCompleteSessions(raw);
    return validated;
  });

  // Selected session code for comparison: defaults to the real 188-item session
  const [activeSessionCode, setActiveSessionCode] = useState<string>(() => {
    const saved = safeLocalStorageGet<string>('siac_active_session_code', USER_REAL_RFQ_SESSION_1913.code);
    if (!saved || saved === 'RFQ-20261004-1557' || saved === 'RFQ-202610-REAL-182') {
      return USER_REAL_RFQ_SESSION_1913.code;
    }
    return saved;
  });

  // Purchase Orders state
  const [orders, setOrders] = useState<PurchaseOrder[]>(() => {
    let raw = safeLocalStorageGet<PurchaseOrder[]>('siac_purchase_orders', USER_REAL_POS_1913);
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      const snap = getEmergencySnapshotSync();
      if (snap && snap.orders && snap.orders.length > 0) {
        raw = snap.orders;
      } else {
        raw = USER_REAL_POS_1913;
      }
    }
    return ensureCompleteOrders(raw);
  });

  const [cloudDataReady, setCloudDataReady] = useState(false);
  const [cloudLoadError, setCloudLoadError] = useState<string | null>(null);
  const [cloudReloadCount, setCloudReloadCount] = useState(0);
  const cloudWarmCacheKey = `siac_cloud_ready_${profile.id}`;
  const [hasWarmCloudCache] = useState(() => safeLocalStorageGet<boolean>(cloudWarmCacheKey, false));
  const hasLoadedCloudDataRef = useRef(false);
  const [isDataPersistLoaded, setIsDataPersistLoaded] = useState(false);
  const [isLocalImporting, setIsLocalImporting] = useState(false);
  const [pendingLocalImport, setPendingLocalImport] = useState<SharedProcurementData | null>(() =>
    safeLocalStorageGet<SharedProcurementData | null>('siac_pending_cloud_import', null)
  );
  const syncedSignatures = useRef({
    sessions: new Map<string, string>(),
    orders: new Map<string, string>()
  });

  // Emergency Data Recovery Modal State
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState<boolean>(false);

  // Selected PO for Modal detail
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  // Staged items from Analysis to create new RFQ
  const [stagedRfqItems, setStagedRfqItems] = useState<RfqItem[]>([]);

  // Supplier Portal Simulation Modal or View
  const [supplierPortalSessionCode, setSupplierPortalSessionCode] = useState<string | null>(null);
  const [projectRequestToken, setProjectRequestToken] = useState<string | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const requirePermission = (permission: AppPermission): boolean => {
    if (can(permission)) return true;
    showToast('⛔ لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء');
    return false;
  };
  const ownershipFields = {
    created_by_user_id: profile.id,
    created_by_email: profile.email,
    department_id: profile.department_id,
    department_name: profile.department_name
  };

  useEffect(() => {
    let active = true;

    // Strict guard: skip loading if data was already loaded successfully
    if (hasLoadedCloudDataRef.current) {
      return;
    }

    setCloudDataReady(false);
    setCloudLoadError(null);

    const loadData = async () => {
      try {
        const localData = pendingLocalImport || { sessions, orders };
        if (profile.role_code === 'project_warehouse') {
          const projectOrders = await loadAssignedProjectPurchaseOrders();
          if (!active) return;
          setSessions([]);
          setOrders(projectOrders);
          setPendingLocalImport(null);
          setCloudLoadError(null);
          setCloudDataReady(true);
          hasLoadedCloudDataRef.current = true;
          safeLocalStorageSet(cloudWarmCacheKey, true);
          return;
        }
        const cloudData = await loadSharedProcurementData();
        if (!active) return;

        const cloudSessionCodes = new Set(cloudData.sessions.map(session => session.code));
        const cloudOrderIds = new Set(cloudData.orders.map(order => order.id));
        const hasLocalOnlyData = localData.sessions.some(session => !cloudSessionCodes.has(session.code)) ||
          localData.orders.some(order => !cloudOrderIds.has(order.id));

        if (hasLocalOnlyData) {
          setPendingLocalImport(localData);
          safeLocalStorageSet('siac_pending_cloud_import', localData);
        }

        const storedActiveCode = safeLocalStorageGet<string>('siac_active_session_code', '');
        const nextActiveCode = cloudData.sessions.some(session => session.code === storedActiveCode)
          ? storedActiveCode
          : (cloudData.sessions[0]?.code || '');
        const localActiveSession = sessions.find(session => session.code === nextActiveCode);
        const localCategoryMatchesActive = !storedActiveCode || storedActiveCode === nextActiveCode;
        const localCategorySelection = localActiveSession?.category_selection
          || (localCategoryMatchesActive ? categorySelectionRef.current : {});
        const mergedCloudSessions = cloudData.sessions.map(session => (
          session.code === nextActiveCode &&
          !session.category_selection &&
          Object.keys(localCategorySelection).length > 0
            ? { ...session, category_selection: localCategorySelection }
            : session
        ));

        syncedSignatures.current.sessions = new Map(
          cloudData.sessions.map(session => [session.code, JSON.stringify(session)])
        );
        syncedSignatures.current.orders = new Map(
          cloudData.orders.map(order => [order.id, JSON.stringify(order)])
        );
        setSessions(mergedCloudSessions);
        setOrders(cloudData.orders);
        setActiveSessionCode(nextActiveCode);
        setCloudDataReady(true);
        hasLoadedCloudDataRef.current = true;
        setIsDataPersistLoaded(true);
        safeLocalStorageSet(cloudWarmCacheKey, true);
      } catch (error) {
        if (!active) return;
        setCloudLoadError(error instanceof Error ? error.message : 'تعذر تحميل بيانات Supabase.');
      }
    };

    void loadData();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReloadCount]);

  const cloudSyncQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!cloudDataReady) return;

    cloudSyncQueue.current = cloudSyncQueue.current
      .then(async () => {
        const knownSessions = syncedSignatures.current.sessions;
        const currentSessionCodes = new Set(sessions.map(session => session.code));
        const removedSessionCodes = [...knownSessions.keys()].filter(code => !currentSessionCodes.has(code));
        if (removedSessionCodes.length > 0 && can('rfq.manage')) {
          await deleteMissingProcurementRecords('rfq_sessions', removedSessionCodes);
          removedSessionCodes.forEach(code => knownSessions.delete(code));
        }

        for (const session of sessions) {
          const signature = JSON.stringify(session);
          if (knownSessions.get(session.code) === signature) continue;
          const isNew = !knownSessions.has(session.code);
          if ((isNew && !can('rfq.create')) || (!isNew && !can('rfq.manage'))) continue;

          if (isNew) await insertRfqSession(session, profile);
          else await updateRfqSession(session);
          knownSessions.set(session.code, signature);
        }
      })
      .catch(error => {
        showToast(error instanceof Error ? error.message : 'تعذر مزامنة طلبات RFQ مع Supabase.');
      });
  }, [sessions, cloudDataReady, permissions.join(',')]);

  useEffect(() => {
    if (!cloudDataReady) return;

    cloudSyncQueue.current = cloudSyncQueue.current
      .then(async () => {
        const knownOrders = syncedSignatures.current.orders;
        const currentOrderIds = new Set(orders.map(order => order.id));
        const removedOrderIds = [...knownOrders.keys()].filter(id => !currentOrderIds.has(id));
        if (removedOrderIds.length > 0 && can('po.manage')) {
          await deleteMissingProcurementRecords('purchase_orders', removedOrderIds);
          removedOrderIds.forEach(id => knownOrders.delete(id));
        }

        for (const order of orders) {
          const signature = JSON.stringify(order);
          if (knownOrders.get(order.id) === signature) continue;
          const isNew = !knownOrders.has(order.id);
          if ((isNew && !can('po.create')) || (!isNew && !can('po.manage'))) continue;

          if (isNew) await insertPurchaseOrder(order, profile);
          else await updatePurchaseOrder(order, profile);
          knownOrders.set(order.id, signature);
        }
      })
      .catch(error => {
        showToast(error instanceof Error ? error.message : 'تعذر مزامنة أوامر الشراء مع Supabase.');
      });
  }, [orders, cloudDataReady, permissions.join(',')]);

  useEffect(() => {
    if (activeTab && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] || '');
    }
  }, [activeTab, availableTabs.join(',')]);

  // Save safely to LocalStorage + IndexedDB + Emergency Snapshot
  useEffect(() => {
    safeLocalStorageSet('siac_rfq_sessions', sessions);
    saveToIndexedDB('sessions', 'all_sessions', sessions);
    saveEmergencySnapshot(sessions, orders);
  }, [sessions, orders]);

  useEffect(() => {
    safeLocalStorageSet('siac_purchase_orders', orders);
    saveToIndexedDB('orders', 'all_orders', orders);
  }, [orders]);

  useEffect(() => {
    if (activeSessionCode) {
      safeLocalStorageSet('siac_active_session_code', activeSessionCode);
    }
  }, [activeSessionCode]);

  // Safety: If activeSessionCode is legacy demo or missing, redirect to USER_REAL_RFQ_SESSION_1913 or first valid
  useEffect(() => {
    if (activeSessionCode === 'RFQ-20261004-1557' || !sessions.some(s => s.code === activeSessionCode)) {
      const fallback = sessions.some(s => s.code === USER_REAL_RFQ_SESSION_1913.code)
        ? USER_REAL_RFQ_SESSION_1913.code
        : (sessions[0]?.code || USER_REAL_RFQ_SESSION_1913.code);
      setActiveSessionCode(fallback);
      safeLocalStorageSet('siac_active_session_code', fallback);
    }
  }, [sessions, activeSessionCode]);

  const activeSession = sessions.find(s => s.code === activeSessionCode) || sessions[0];

  const lastCategorySessionRef = useRef(activeSession?.code || '');
  useEffect(() => {
    if (!activeSession) return;
    const sessionChanged = lastCategorySessionRef.current !== activeSession.code;
    lastCategorySessionRef.current = activeSession.code;
    const storedSelection = activeSession.category_selection;
    if (storedSelection && Object.keys(storedSelection).length > 0) {
      setCategorySelection(storedSelection);
    } else if (sessionChanged) {
      setCategorySelection({});
    }
  }, [activeSession?.code, activeSession?.category_selection]);

  const applyCategorySelection = (next: Record<string, AwardCriteria>) => {
    setCategorySelection(next);
    if (!activeSession) return;
    setSessions(prev => prev.map(session => (
      session.code === activeSession.code
        ? { ...session, category_selection: next }
        : session
    )));
  };

  // Check direct URL path on mount
  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname;
      if (path.includes('/portal/')) {
        const code = path.split('/portal/')[1]?.split('/')[0]?.trim();
        if (code) {
          setSupplierPortalSessionCode(code);
        }
      }
      const projectMatch = path.match(/\/project-request\/([^/]+)/);
      setProjectRequestToken(projectMatch?.[1] ? decodeURIComponent(projectMatch[1]) : null);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  // Handler: Create new RFQ Session
  const handleCreateRfq = (newSession: RfqSession) => {
    if (!requirePermission('rfq.create')) return;
    setSessions(prev => [{ ...newSession, ...ownershipFields }, ...prev]);
    setActiveSessionCode(newSession.code);
    showToast(`✅ تم إنشاء طلب التسعير بنجاح: ${newSession.code}`);
  };

  // Handler: Submit Quote from Supplier Portal
  const handleSubmitQuote = (sessionCode: string, submission: SupplierSubmission) => {
    if (!requirePermission('supplier.submit')) return;
    if (profile.role_code === 'supplier' && !profile.supplier_name) {
      showToast('⛔ لم يتم ربط حساب المورد باسم مورد معتمد');
      return;
    }
    const verifiedSubmission = profile.role_code === 'supplier'
      ? { ...submission, supplier_name: profile.supplier_name! }
      : submission;
    setSessions(prev => prev.map(s => {
      if (s.code !== sessionCode) return s;
      
      const existingIdx = s.submissions.findIndex(
        sub => sub.supplier_name.toLowerCase() === verifiedSubmission.supplier_name.toLowerCase()
      );

      let updatedSubmissions = [...s.submissions];
      if (existingIdx >= 0) {
        updatedSubmissions[existingIdx] = verifiedSubmission;
      } else {
        updatedSubmissions.push(verifiedSubmission);
      }

      return {
        ...s,
        submissions: updatedSubmissions
      };
    }));

    showToast(`✅ تم حفظ عرض أسعار المورد [${verifiedSubmission.supplier_name}]`);
  };

  // Handler: Award Single Item to a Supplier
  const handleAwardItem = (
    rfqCode: string,
    awards: { supplierName: string; item: PurchaseOrderItem; notes: string }[]
  ) => {
    if (!requirePermission('offers.award')) return;
    if (awards.length === 0) return;
    const now = new Date();
    const poPrefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const currentMonthSequence = orders.reduce((max, order) => {
      const match = order.po_number.match(new RegExp(`^${poPrefix}(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const timestamp = Date.now();
    const newPOs: PurchaseOrder[] = awards.map((award, index) => ({
      id: `po-${timestamp}-${index}`,
      po_number: `${poPrefix}${String(currentMonthSequence + index + 1).padStart(3, '0')}`,
      rfq_code: rfqCode,
      ...ownershipFields,
      title: `ترسية توريد: ${award.item.desc || award.item.filter_no} (${award.item.category})`,
      supplier: award.supplierName,
      total_value: award.item.total,
      currency: 'EGP',
      status: 'awarded',
      created_at: now.toLocaleString('ar-EG'),
      updated_at: now.toLocaleString('ar-EG'),
      notes: award.notes || 'تمت الترسية وفق أقل سعر فئة معتمدة',
      items: [award.item],
      events: [
        { id: `ev-${timestamp}-${index}-1`, status: 'draft', note: 'إنشاء مسودة أمر الشراء', happened_at: now.toLocaleString('ar-EG') },
        { id: `ev-${timestamp}-${index}-2`, status: 'awarded', note: `اعتماد قرار الترسية لـ ${award.supplierName}`, happened_at: now.toLocaleString('ar-EG') }
      ]
    }));

    setOrders(prev => [...newPOs, ...prev]);
    showToast(`🏆 تمت الترسية على ${awards.length} مورد/موردين وإنشاء أوامر شراء مستقلة للكميات المخصصة`);
  };

  // Handler: Set Manual Award (ترسية يدوية بالماركة حتى لو أعلى سعراً)
  const handleSetManualAward = (rfqCode: string, itemId: string, selection: ManualAwardSelection) => {
    if (!requirePermission('offers.award')) return;
    setManualAwards(prev => {
      const sessionMap = { ...(prev[rfqCode] || {}) };
      sessionMap[itemId] = {
        ...selection,
        awarded_at: new Date().toLocaleString('ar-EG')
      };
      return {
        ...prev,
        [rfqCode]: sessionMap
      };
    });

    setSessions(prev => prev.map(s => {
      if (s.code !== rfqCode) return s;
      const current = { ...(s.manual_awards || {}) };
      current[itemId] = {
        ...selection,
        awarded_at: new Date().toLocaleString('ar-EG')
      };
      return {
        ...s,
        manual_awards: current
      };
    }));

    showToast(`⭐ تم اعتماد الترسية بالماركة: [${selection.supplier}] - ${selection.brand || selection.alt_no || selection.category} (${selection.unit_price} ج.م)`);
  };

  // Handler: Clear Manual Award (إلغاء الترسية بالماركة والتراجع للأقل سعراً تلقائياً)
  const handleClearManualAward = (rfqCode: string, itemId: string) => {
    if (!requirePermission('offers.award')) return;
    setManualAwards(prev => {
      const sessionMap = { ...(prev[rfqCode] || {}) };
      delete sessionMap[itemId];
      return {
        ...prev,
        [rfqCode]: sessionMap
      };
    });

    setSessions(prev => prev.map(s => {
      if (s.code !== rfqCode) return s;
      const current = { ...(s.manual_awards || {}) };
      delete current[itemId];
      return {
        ...s,
        manual_awards: current
      };
    }));

    showToast(`🔄 تم إلغاء الترسية بالماركة والعودة للأقل سعراً تلقائياً`);
  };

  // Handler: Import SAP historical prices into the active RFQ session
  const handleImportSapPrices = (rfqCode: string, prices: Record<string, SapHistoricalPrice>) => {
    if (!requirePermission('offers.award')) return;
    const importedMaterialCount = Object.keys(prices).filter(code => !code.includes('||')).length;
    const importedCount = importedMaterialCount || Object.keys(prices).length;
    if (importedCount === 0) return;

    setSessions(prev => prev.map(session => {
      if (session.code !== rfqCode) return session;
      const merged: Record<string, SapHistoricalPrice> = { ...(session.sap_prices || {}) };
      Object.entries(prices).forEach(([code, incoming]) => {
        const existing = merged[code];
        merged[code] = {
          ...incoming,
          desc: existing?.desc || incoming.desc
        };
      });
      return {
        ...session,
        sap_prices: merged
      };
    }));

    showToast(`✅ تم استيراد ${importedCount} مادة من أسعار SAP (مع تفصيل لكل مورد) وتحديث المقارنة`);
  };

  // Handler: Update Supplier Price after Negotiation (تعديل السعر بعد التفاوض)
  const handleUpdateSupplierPrice = (
    rfqCode: string,
    supplierName: string,
    itemId: string,
    offerId: string,
    altNo: string,
    category: FilterCategory,
    newUnitPrice: number,
    notes?: string,
    sapCode?: string
  ) => {
    if (!requirePermission('offers.award')) return;
    if (!Number.isFinite(newUnitPrice) || newUnitPrice <= 0) {
      showToast('يجب إدخال سعر تفاوضي صحيح أكبر من صفر.');
      return;
    }
    const sourceSession = sessions.find(session => session.code === rfqCode);
    const sourceItem = sourceSession?.items.find(item => item.id === itemId);
    const supplierKey = supplierName.trim().toLocaleLowerCase();
    const offerRecord = sourceSession?.submissions
      .find(submission => submission.supplier_name.trim().toLocaleLowerCase() === supplierKey);
    const offerKey = offerRecord?.offers[itemId]
      ? itemId
      : sourceItem?.item_no !== undefined && offerRecord?.offers[`item-${sourceItem.item_no}`]
        ? `item-${sourceItem.item_no}`
        : itemId;
    const selectedOfferExists = (offerRecord?.offers[offerKey] || []).some(offer =>
      offer.id === offerId || (offer.category === category && offer.alt_no === altNo)
    );
    if (!sourceItem || !selectedOfferExists) {
      showToast('تعذر تحديث العرض؛ أعد تحميل المقارنة لأن العرض المحدد لم يعد موجوداً.');
      return;
    }

    setSessions(prev => prev.map(s => {
      if (s.code !== rfqCode) return s;

      const subIdx = s.submissions.findIndex(
        sub => sub.supplier_name.trim().toLocaleLowerCase() === supplierKey
      );
      if (subIdx < 0) return s;

      const sub = s.submissions[subIdx];
      const currentItemOffers = sub.offers[offerKey] || [];
      const updatedItemOffers = currentItemOffers.map(offer =>
        offer.id === offerId || (offer.category === category && offer.alt_no === altNo)
          ? {
              ...offer,
              unit_price: newUnitPrice,
              notes: notes ? `${notes} (سعر تفاوضي معتمد)` : (offer.notes || 'سعر تفاوضي معدل'),
              ...(sapCode !== undefined ? { sap_code: sapCode.trim() || undefined } : {})
            }
          : offer
      );

      const updatedSub = {
        ...sub,
        offers: {
          ...sub.offers,
          [offerKey]: updatedItemOffers
        }
      };

      const updatedSubmissions = [...s.submissions];
      updatedSubmissions[subIdx] = updatedSub;

      return {
        ...s,
        submissions: updatedSubmissions
      };
    }));

    const itemCode = sourceItem.primary_number.trim().toLocaleLowerCase();
    const materialCode = sourceItem.mat_code.trim().toLocaleLowerCase();
    setOrders(prevOrders => prevOrders.map(po => {
      const matchSup = po.supplier.trim().toLocaleLowerCase() === supplierKey;
      if (po.rfq_code === rfqCode && matchSup && (po.status === 'draft' || po.status === 'awarded')) {
        let hasItem = false;
        const updatedItems = po.items.map(it => {
          const matchesItem =
            it.filter_no.trim().toLocaleLowerCase() === itemCode ||
            (materialCode !== '' && it.mat_code?.trim().toLocaleLowerCase() === materialCode);
          const hasInventoryActivity = (it.received_qty || 0) > 0 || (it.dispatches?.length || 0) > 0;
          if (matchesItem && !hasInventoryActivity) {
            hasItem = true;
            return {
              ...it,
              unit_price: newUnitPrice,
              total: it.qty * newUnitPrice,
              ...(sapCode !== undefined ? { sap_code: sapCode.trim() || undefined } : {}),
              notes: notes ? `${notes} (سعر تفاوضي محدث)` : it.notes
            };
          }
          return it;
        });
        if (hasItem) {
          const newTotal = sumPurchaseOrderItems(updatedItems);
          return {
            ...po,
            items: updatedItems,
            total_value: newTotal,
            updated_at: new Date().toLocaleString('ar-EG'),
            events: [
              ...po.events,
              {
                id: `ev-${Date.now()}`,
                status: po.status,
                note: `تحديث سعر البند إلى ${newUnitPrice.toLocaleString()} ج.م بعد مفاوضات الأسعار مع المورد`,
                happened_at: new Date().toLocaleString('ar-EG')
              }
            ]
          };
        }
      }
      return po;
    }));

    showToast(`💰 تم تعديل سعر العرض لـ [${supplierName}] إلى ${newUnitPrice.toLocaleString()} ج.م؛ وتم تحديث أوامر الشراء غير المستلمة المرتبطة بهذا الطلب والصنف.`);
  };

  // Handler: Batch Award all items — reconciles the awarded report with the live POs
  // (keeps PO numbers/receiving history and updates quantities, prices and categories safely)
  const handleBatchAwardAll = (
    rfqCode: string,
    awardedOrders: { supplier: string; items: PurchaseOrderItem[]; total: number }[]
  ) => {
    if (!requirePermission('offers.award')) return;
    if (awardedOrders.length === 0) {
      showToast('⚠️ لا توجد أصناف مُرسّاة لتحديث أوامر الشراء');
      return;
    }

    const result = reconcileAwardGroupsWithOrders({
      existingOrders: orders,
      rfqCode,
      groups: awardedOrders,
      ownership: ownershipFields
    });

    setOrders(result.orders);

    const changes: string[] = [];
    if (result.added > 0) changes.push(`إضافة ${result.added}`);
    if (result.updated > 0) changes.push(`تحديث ${result.updated}`);
    if (result.removed > 0) changes.push(`حذف ${result.removed}`);
    if (result.unchanged > 0) changes.push(`مطابق ${result.unchanged}`);

    showToast(
      changes.length > 0
        ? `🏆 تمت مزامنة أوامر الشراء مع تقرير الترسية (${changes.join(' | ')})${result.keptForHistory.length > 0 ? ` — تم الاحتفاظ بـ ${result.keptForHistory.length} سجل استلام/صرف` : ''}`
        : '✅ أوامر الشراء مطابقة لتقرير الترسية بالفعل'
    );

    setActiveTab('tracker');
  };

  // Handler: Sync and update POs with latest winning offers from RFQ submissions
  const handleSyncLatestOffers = (rfqCode: string) => {
    if (!requirePermission('offers.award')) return;
    const session = sessions.find(s => s.code === rfqCode);
    if (!session) {
      showToast('⚠️ لم يتم العثور على طلب التسعير المطلوب');
      return;
    }

    const sessionManualAwards = manualAwards[rfqCode] || session.manual_awards || {};
    const awardedOrders = buildAwardGroups(session, categorySelection, sessionManualAwards);

    if (awardedOrders.length === 0) {
      showToast('⚠️ لا توجد عروض أسعار متوافقة للمزامنة');
      return;
    }

    handleBatchAwardAll(rfqCode, awardedOrders);
  };

  // Handler: Export one supplier's awarded items as a supplier-portal style Excel file
  const handleExportSupplierPo = (po: PurchaseOrder) => {
    const session = sessions.find(item => item.code === po.rfq_code) || (activeSession?.code === po.rfq_code ? activeSession : null);
    try {
      exportSupplierPurchaseOrderExcel(po, session);
      showToast(`📊 تم تصدير كارت الترسية للمورد ${po.supplier} (${po.po_number})`);
    } catch (error) {
      showToast(error instanceof Error ? `تعذر تصدير ملف المورد: ${error.message}` : 'تعذر تصدير ملف المورد');
    }
  };

  /**
   * Merges a warehouse RPC result with the local-only metadata that the RPC
   * payload does not carry (ownership + project allocations) and registers the
   * resulting signature as already synced.
   *
   * The RPC has already persisted the order in Supabase. Without registering
   * the signature the cloud-sync effect sees a "changed" order and calls
   * updatePurchaseOrder, which the inventory guard trigger rejects because the
   * write did not originate from the warehouse RPC.
   */
  const applyWarehouseOrderUpdate = (updatedOrder: PurchaseOrder): PurchaseOrder => {
    const previous = orders.find(order => order.id === updatedOrder.id);
    const merged: PurchaseOrder = {
      ...updatedOrder,
      items: updatedOrder.items.map((item, index) => ({
        ...item,
        project_allocations: Array.isArray(item.project_allocations)
          ? item.project_allocations
          : previous?.items[index]?.project_allocations,
        award_project_allocations: Array.isArray(item.award_project_allocations)
          ? item.award_project_allocations
          : previous?.items[index]?.award_project_allocations || previous?.items[index]?.project_allocations
      })),
      created_by_user_id: previous?.created_by_user_id ?? updatedOrder.created_by_user_id,
      created_by_email: previous?.created_by_email ?? updatedOrder.created_by_email,
      department_id: previous?.department_id ?? updatedOrder.department_id,
      department_name: previous?.department_name ?? updatedOrder.department_name
    };
    syncedSignatures.current.orders.set(merged.id, JSON.stringify(merged));
    return merged;
  };

  // Handler: Update Item Receiving in Store 9004
  const handleUpdatePoItemReceiving = async (
    poId: string,
    itemIdx: number,
    receivedQty: number,
    voucherNo: string,
    notes: string,
    receivedSupplierIdentity: ReceivedSupplierIdentity
  ): Promise<boolean> => {
    if (!requirePermission('po.receive')) return false;
    try {
      const updatedOrder = await recordPurchaseOrderReceipt(
        poId,
        itemIdx,
        receivedQty,
        voucherNo,
        notes,
        receivedSupplierIdentity
      );
      const merged = applyWarehouseOrderUpdate(updatedOrder);
      setOrders(previous => previous.map(order => order.id === merged.id ? merged : order));
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تسجيل الاستلام في Supabase.');
      return false;
    }
  };

  // Handler: Dispatch Item from 9004 to Project
  const handleDispatchToProject = async (
    poId: string,
    itemIdx: number,
    record: ProjectDispatchRecord
  ): Promise<boolean> => {
    if (!requirePermission('po.dispatch')) return false;
    try {
      const updatedOrder = await recordPurchaseOrderDispatch(
        poId,
        itemIdx,
        record.project,
        record.qty,
        record.voucher_no || '',
        record.notes || '',
        record.id
      );
      const merged = applyWarehouseOrderUpdate(updatedOrder);
      setOrders(previous => previous.map(order => order.id === merged.id ? merged : order));
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر تسجيل الصرف في Supabase.');
      return false;
    }
  };

  // Handler: Reassign / Transfer Item to Another Supplier
  const handleReassignSupplierItem = (
    sourcePoId: string,
    targetSupplier: string,
    itemIdx: number,
    transferQty: number,
    newUnitPrice: number,
    newCategory: FilterCategory,
    reason: string
  ) => {
    if (!requirePermission('po.manage')) return;
    const now = new Date().toLocaleString('ar-EG');

    setOrders(prev => {
      let transferredItem: PurchaseOrderItem | null = null;
      let sourceSupplierName = '';

      // 1. Deduct or remove from source PO
      const updatedSourceList = prev.map(po => {
        if (po.id !== sourcePoId) return po;
        sourceSupplierName = po.supplier;
        const targetItem = po.items[itemIdx];
        if (!targetItem) return po;

        transferredItem = {
          ...targetItem,
          qty: transferQty,
          unit_price: newUnitPrice,
          category: newCategory,
          total: transferQty * newUnitPrice
        };

        let newItems: PurchaseOrderItem[];
        if (transferQty >= targetItem.qty) {
          newItems = po.items.filter((_, i) => i !== itemIdx);
        } else {
          const remainingQty = targetItem.qty - transferQty;
          newItems = po.items.map((it, i) => {
            if (i !== itemIdx) return it;
            return {
              ...it,
              qty: remainingQty,
              total: remainingQty * it.unit_price
            };
          });
        }

        const newTotal = sumPurchaseOrderItems(newItems);
        return {
          ...po,
          items: newItems,
          total_value: newTotal,
          updated_at: now,
          events: [
            ...po.events,
            {
              id: `ev-${Date.now()}`,
              status: po.status,
              note: `تحويل ${transferQty} قطعة من بند (${targetItem.desc || targetItem.filter_no}) إلى المورد (${targetSupplier}) — السبب: ${reason}`,
              happened_at: now
            }
          ]
        };
      });

      if (!transferredItem) return prev;

      // 2. Add or update destination PO
      const existingTargetPo = updatedSourceList.find(o => o.supplier === targetSupplier);
      if (existingTargetPo) {
        return updatedSourceList.map(po => {
          if (po.id !== existingTargetPo.id) return po;
          const newItems = [...po.items, transferredItem!];
          const newTotal = sumPurchaseOrderItems(newItems);
          return {
            ...po,
            items: newItems,
            total_value: newTotal,
            updated_at: now,
            events: [
              ...po.events,
              {
                id: `ev-${Date.now()}`,
                status: po.status,
                note: `استلام تحويل ${transferQty} قطعة من المورد (${sourceSupplierName}) — بند: ${transferredItem!.desc || transferredItem!.filter_no}`,
                happened_at: now
              }
            ]
          };
        });
      } else {
        const poNum = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(updatedSourceList.length + 1).padStart(3, '0')}`;
        const newPo: PurchaseOrder = {
          id: `po-${Date.now()}`,
          po_number: poNum,
          rfq_code: prev.find(o => o.id === sourcePoId)?.rfq_code || '',
          ...ownershipFields,
          title: `أمر شراء توريد فلاتر — ${targetSupplier}`,
          supplier: targetSupplier,
          total_value: (transferredItem as any)?.total || 0,
          currency: 'EGP',
          status: 'draft',
          created_at: now,
          updated_at: now,
          notes: `تم إنشاء الأمر نتيجة تحويل كميات من المورد (${sourceSupplierName})`,
          items: transferredItem ? [transferredItem] : [],
          events: [
            {
              id: `ev-${Date.now()}`,
              status: 'draft',
              note: `إنشاء أمر الشراء بعد تحويل بنود من (${sourceSupplierName})`,
              happened_at: now
            }
          ]
        };
        return [newPo, ...updatedSourceList];
      }
    });

    showToast(`🔄 تم بنجاح نقل ${transferQty} قطعة إلى المورد (${targetSupplier}) وتحديث أوامر الشراء`);
  };

  // Handler: Cancel PO & Disqualify Supplier with full re-awarding / reallocation to alternative supplier
  const handleCancelAndReallocatePo = (
    sourcePoId: string,
    targetSupplier: string,
    updatedItems: PurchaseOrderItem[],
    reason: string,
    actionType: 'reallocate' | 'cancel_only'
  ) => {
    if (!requirePermission('po.manage')) return;
    const now = new Date().toLocaleString('ar-EG');
    const sourcePo = orders.find(o => o.id === sourcePoId);
    const sourceSupplierName = sourcePo?.supplier || 'المورد المستبعد';

    if (actionType === 'cancel_only') {
      setOrders(prev => prev.filter(o => o.id !== sourcePoId));
      if (selectedPo && selectedPo.id === sourcePoId) {
        setSelectedPo(null);
      }
      showToast(`🗑️ تم إلغاء أمر الشراء واستبعاد المورد (${sourceSupplierName}) بنجاح`);
      return;
    }

    // Reallocate entire PO to target supplier
    setOrders(prev => {
      const remainingOrders = prev.filter(o => o.id !== sourcePoId);
      const existingTargetPo = remainingOrders.find(o => o.supplier.trim().toLowerCase() === targetSupplier.trim().toLowerCase());
      const totalReallocatedValue = sumPurchaseOrderItems(updatedItems);

      if (existingTargetPo) {
        return remainingOrders.map(po => {
          if (po.id !== existingTargetPo.id) return po;
          const mergedItems = [...po.items, ...updatedItems];
          const newTotal = sumPurchaseOrderItems(mergedItems);
          return {
            ...po,
            items: mergedItems,
            total_value: newTotal,
            updated_at: now,
            events: [
              ...po.events,
              {
                id: `ev-${Date.now()}`,
                status: po.status,
                note: `ترحيل واستلام كافة بنود أمر شراء المورد المستبعد (${sourceSupplierName}) — السبب: ${reason}`,
                happened_at: now
              }
            ]
          };
        });
      } else {
        const poNum = `PO-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(remainingOrders.length + 1).padStart(3, '0')}`;
        const newPo: PurchaseOrder = {
          id: `po-${Date.now()}`,
          po_number: poNum,
          rfq_code: sourcePo?.rfq_code || '',
          ...ownershipFields,
          title: `أمر شراء توريد فلاتر (بديل لـ ${sourceSupplierName}) — ${targetSupplier}`,
          supplier: targetSupplier,
          total_value: totalReallocatedValue,
          currency: 'EGP',
          status: 'awarded',
          created_at: now,
          updated_at: now,
          notes: `تم إصدار الأمر بديلاً عن المورد المستبعد (${sourceSupplierName}) — السبب: ${reason}`,
          items: updatedItems,
          events: [
            {
              id: `ev-${Date.now()}-1`,
              status: 'draft',
              note: `إنشاء أمر شراء بديل بعد استبعاد (${sourceSupplierName}) لـ: ${reason}`,
              happened_at: now
            },
            {
              id: `ev-${Date.now()}-2`,
              status: 'awarded',
              note: `اعتماد ترحيل ${updatedItems.length} صنف إلى (${targetSupplier})`,
              happened_at: now
            }
          ]
        };
        return [newPo, ...remainingOrders];
      }
    });

    if (selectedPo && selectedPo.id === sourcePoId) {
      setSelectedPo(null);
    }

    showToast(`🔄 تم بنجاح استبعاد (${sourceSupplierName}) وترحيل الأصناف بالكامل إلى (${targetSupplier})`);
  };

  // Handler: Advance PO Status
  const handleAdvanceStatus = (poId: string, nextStatus: POStatus, note?: string) => {
    if (!requirePermission('po.manage')) return;
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
    if (!requirePermission('rfq.manage')) return;
    setSessions(prev => prev.map(s => {
      if (s.code !== code) return s;
      return { ...s, is_active: !s.is_active };
    }));
  };

  // Handler: Export complete database backup
  const handleExportBackup = () => {
    if (!requirePermission('backup.manage')) return;
    exportFullDatabaseBackup(sessions, orders);
    showToast('💾 تم تنزيل النسخة الاحتياطية بنجاح بصيغة JSON');
  };

  // Handler: Import Excel, CSV or JSON backup / comparison files (.xlsx, .xls, .csv, .json)
  const handleImportBackup = async (file: File) => {
    if (!requirePermission('backup.manage')) return;
    try {
      const isSpreadsheetOrCsv = 
        file.name.endsWith('.xlsx') || 
        file.name.endsWith('.xls') || 
        file.name.toLowerCase().endsWith('.csv') ||
        file.type.includes('spreadsheet') ||
        file.type.includes('csv');

      if (isSpreadsheetOrCsv) {
        const result = await parseComparisonExcelFile(file);
        if (result && result.session) {
          const importedCategorySelection = result.categorySelection && Object.keys(result.categorySelection).length > 0
            ? result.categorySelection
            : {};
          const importedSession = Object.keys(importedCategorySelection).length > 0
            ? {
                ...result.session,
                category_selection: {
                  ...(result.session.category_selection || {}),
                  ...importedCategorySelection
                }
              }
            : result.session;
          setSessions(prev => {
            const exists = prev.some(s => s.code === importedSession.code);
            const updated = exists 
              ? prev.map(s => s.code === importedSession.code ? importedSession : s) 
              : [importedSession, ...prev];
            safeLocalStorageSet('siac_rfq_sessions', updated);
            saveToIndexedDB('sessions', 'all_sessions', updated);
            saveEmergencySnapshot(updated, result.orders && result.orders.length > 0 ? result.orders : orders);
            return updated;
          });
          if (result.orders && result.orders.length > 0) {
            setOrders(prev => {
              const updated = [...result.orders, ...prev.filter(p => p.rfq_code !== importedSession.code)];
              safeLocalStorageSet('siac_purchase_orders', updated);
              saveToIndexedDB('orders', 'all_orders', updated);
              return updated;
            });
          }
          if (Object.keys(importedCategorySelection).length > 0) {
            setCategorySelection(prev => ({ ...prev, ...importedCategorySelection }));
          }
          setActiveSessionCode(importedSession.code);
          setActiveTab('compare');
          const fileTypeLabel = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'إكسل';
          showToast(`✅ تم استيراد ملف الـ ${fileTypeLabel} [${importedSession.code}] بنجاح (${importedSession.items.length} صنف — ${importedSession.submissions.length} موردين)!`);
          return;
        }
      }

      // Check if file is JSON
      const text = await file.text();
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        throw new Error('صيغة الملف غير مدعومة. يرجى اختيار ملف Excel (.xlsx/.xls) أو ملف CSV أو ملف JSON');
      }

      // If JSON is sheet-based export
      if (parsedJson['ملخص الترسية وأفضل العروض'] || parsedJson['تفاصيل كافة العروض والبدائل']) {
        const result = await parseComparisonExcelFile(file);
        const importedCategorySelection = result.categorySelection && Object.keys(result.categorySelection).length > 0
          ? result.categorySelection
          : {};
        const importedSession = Object.keys(importedCategorySelection).length > 0
          ? {
              ...result.session,
              category_selection: {
                ...(result.session.category_selection || {}),
                ...importedCategorySelection
              }
            }
          : result.session;
        setSessions(prev => {
          const exists = prev.some(s => s.code === importedSession.code);
          const updated = exists 
            ? prev.map(s => s.code === importedSession.code ? importedSession : s) 
            : [importedSession, ...prev];
          safeLocalStorageSet('siac_rfq_sessions', updated);
          saveToIndexedDB('sessions', 'all_sessions', updated);
          saveEmergencySnapshot(updated, result.orders && result.orders.length > 0 ? result.orders : orders);
          return updated;
        });
        if (result.orders && result.orders.length > 0) {
          setOrders(prev => {
            const updated = [...result.orders, ...prev.filter(p => p.rfq_code !== importedSession.code)];
            safeLocalStorageSet('siac_purchase_orders', updated);
            saveToIndexedDB('orders', 'all_orders', updated);
            return updated;
          });
        }
        if (Object.keys(importedCategorySelection).length > 0) {
          setCategorySelection(prev => ({ ...prev, ...importedCategorySelection }));
        }
        setActiveSessionCode(importedSession.code);
        setActiveTab('compare');
        showToast(`✅ تم استيراد بيانات مقارنة العروض بنجاح (${importedSession.items.length} صنف — ${importedSession.submissions.length} موردين)!`);
        return;
      }

      // Otherwise standard full database backup
      const parsed = await parseDatabaseBackupFile(file);
      setSessions(parsed.sessions);
      setOrders(parsed.orders || []);
      if (parsed.sessions.length > 0) {
        setActiveSessionCode(parsed.sessions[0].code);
      }
      safeLocalStorageSet('siac_rfq_sessions', parsed.sessions);
      safeLocalStorageSet('siac_purchase_orders', parsed.orders || []);
      saveToIndexedDB('sessions', 'all_sessions', parsed.sessions);
      saveToIndexedDB('orders', 'all_orders', parsed.orders || []);
      saveEmergencySnapshot(parsed.sessions, parsed.orders || []);
      showToast(`✅ تم استرجاع النسخة الاحتياطية بنجاح (${parsed.sessions.length} طلب)`);
    } catch (err: any) {
      alert('خطأ أثناء استيراد الملف: ' + err.message);
    }
  };

  // Handler: Safe clear data
  const handleSafeClearData = () => {
    if (!requirePermission('backup.manage')) return;
    saveEmergencySnapshot(sessions, orders);
    setSessions([]);
    setOrders([]);
    setActiveSessionCode('');
    safeLocalStorageRemove('siac_rfq_sessions');
    safeLocalStorageRemove('siac_purchase_orders');
    saveToIndexedDB('sessions', 'all_sessions', []);
    saveToIndexedDB('orders', 'all_orders', []);
    setActiveTab('analysis');
    showToast('🗑️ تم تفريغ البيانات بنجاح — يمكنك الآن رفع ملفات SAP الحقيقية أو استعادتها بأي وقت');
  };

  const handleImportLocalCloudData = async () => {
    if (!requirePermission('backup.manage') || !pendingLocalImport || isLocalImporting) return;
    const missingSessionCount = pendingLocalImport.sessions.filter(
      session => !sessions.some(cloudSession => cloudSession.code === session.code)
    ).length;
    const missingOrderCount = pendingLocalImport.orders.filter(
      order => !orders.some(cloudOrder => cloudOrder.id === order.id)
    ).length;
    const approved = window.confirm(
      `سيتم إضافة ${missingSessionCount} طلب RFQ و${missingOrderCount} أمر شراء محلي غير موجود على السحابة. ` +
      'لن تُستبدل أي سجلات موجودة على Supabase، وسيكون القسم الحالي هو مالك السجلات المستوردة. هل تريد المتابعة؟'
    );
    if (!approved) return;

    setIsLocalImporting(true);
    try {
      const imported = await importMissingLocalData(pendingLocalImport, profile);
      const cloudData = await loadSharedProcurementData();
      syncedSignatures.current.sessions = new Map(
        cloudData.sessions.map(session => [session.code, JSON.stringify(session)])
      );
      syncedSignatures.current.orders = new Map(
        cloudData.orders.map(order => [order.id, JSON.stringify(order)])
      );
      setSessions(cloudData.sessions);
      setOrders(cloudData.orders);
      setPendingLocalImport(null);
      safeLocalStorageRemove('siac_pending_cloud_import');
      showToast(`✅ تمت مراجعة البيانات وإضافة ${imported.sessions} طلب RFQ و${imported.orders} أمر شراء دون استبدال الموجود`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر ترحيل البيانات المحلية إلى Supabase.');
    } finally {
      setIsLocalImporting(false);
    }
  };

  // Handler: Restore default complete dataset (including 188 real items and authentic suppliers: Saeed Saadan, Rafiq, Express, Trust, Dizak)
  const handleRestoreDefaultData = () => {
    if (!requirePermission('backup.manage')) return;
    setSessions(INITIAL_RFQ_SESSIONS);
    setOrders(INITIAL_POS);
    setActiveSessionCode(USER_REAL_RFQ_SESSION_1913.code);
    setActiveTab('compare');
    safeLocalStorageSet('siac_rfq_sessions', INITIAL_RFQ_SESSIONS);
    safeLocalStorageSet('siac_purchase_orders', INITIAL_POS);
    safeLocalStorageSet('siac_active_session_code', USER_REAL_RFQ_SESSION_1913.code);
    saveToIndexedDB('sessions', 'all_sessions', INITIAL_RFQ_SESSIONS);
    saveToIndexedDB('orders', 'all_orders', INITIAL_POS);
    saveEmergencySnapshot(INITIAL_RFQ_SESSIONS, INITIAL_POS);
    showToast('⚡ تم استعادة جلسة الـ 188 صنف بالكامل وعروض الموردين الحقيقيين (سعيد سعدان، الرفيق، اكسبريس، ترست، ديزك نراك) وأوامر الشراء بنجاح!');
  };

  // Handler: Restore from Emergency Snapshot
  const handleRestoreSnapshot = async () => {
    if (!requirePermission('backup.manage')) return;
    const snap = await loadEmergencySnapshot();
    if (snap && snap.sessions && snap.sessions.length > 0) {
      const validatedSessions = ensureCompleteSessions(snap.sessions);
      const validatedOrders = ensureCompleteOrders(snap.orders);
      setSessions(validatedSessions);
      setOrders(validatedOrders);
      setActiveSessionCode(USER_REAL_RFQ_SESSION_1913.code);
      setActiveTab('compare');
      safeLocalStorageSet('siac_rfq_sessions', validatedSessions);
      safeLocalStorageSet('siac_purchase_orders', validatedOrders);
      safeLocalStorageSet('siac_active_session_code', USER_REAL_RFQ_SESSION_1913.code);
      saveToIndexedDB('sessions', 'all_sessions', validatedSessions);
      saveToIndexedDB('orders', 'all_orders', validatedOrders);
      showToast(`🔄 تم بنجاح استرجاع آخر نقطة حفظ مسجلة (${snap.savedAtArabic})!`);
    } else {
      handleRestoreDefaultData();
    }
  };

  const hasData = (sessions && sessions.length > 0) || (orders && orders.length > 0);

  if (projectRequestToken) {
    return (
      <ProjectRequestForm
        token={projectRequestToken}
        profile={profile}
        canSubmit={can('project.request.submit')}
        canManage={can('project.request.manage')}
        onClose={() => {
          setProjectRequestToken(null);
          window.history.replaceState({}, '', import.meta.env.BASE_URL || '/');
          if (availableTabs.includes('project_requests')) setActiveTab('project_requests');
        }}
        onSignOut={() => {
          void onSignOut();
        }}
        onNotify={showToast}
      />
    );
  }

  if (!cloudDataReady && !hasLoadedCloudDataRef.current && !isDataPersistLoaded && !hasWarmCloudCache) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          {cloudLoadError ? (
            <>
              <p role="alert" className="mb-4 text-sm text-rose-200">{cloudLoadError}</p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setCloudReloadCount(count => count + 1)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold hover:bg-blue-500"
                >
                  إعادة المحاولة
                </button>
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600"
                >
                  تسجيل الخروج
                </button>
              </div>
            </>
          ) : (
            <p role="status" className="text-sm">جار تحميل بيانات القسم من Supabase...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 font-sans text-slate-900" dir="rtl">
      <div className="sticky top-0 z-40">
      <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-[11px] font-bold text-emerald-950">
        بيانات طلبات RFQ وأوامر الشراء محمّلة من Supabase، ويحدد القسم والصلاحيات السجلات التي يمكن لكل مستخدم الاطلاع عليها أو تعديلها.
      </div>
      {!cloudDataReady && !cloudLoadError && (
        <div role="status" className="border-b border-sky-200 bg-sky-50 px-4 py-1.5 text-center text-[11px] font-bold text-sky-900">
          جار تحديث البيانات من Supabase في الخلفية... يمكنك متابعة العمل بالبيانات المحفوظة.
        </div>
      )}
      {cloudLoadError && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-center text-[11px] font-bold text-rose-900">
          <span>{cloudLoadError}</span>
          <button
            type="button"
            onClick={() => setCloudReloadCount(count => count + 1)}
            className="rounded-lg bg-rose-700 px-2 py-1 text-white hover:bg-rose-600"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeRfqCount={sessions.filter(s => s.is_active).length}
        allowedTabs={availableTabs}
        profile={profile}
        canOpenSupplierPortal={can('supplier.submit')}
        onSignOut={() => {
          void onSignOut().catch(error => showToast(
            error instanceof Error ? `تعذر تسجيل الخروج: ${error.message}` : 'تعذر تسجيل الخروج.'
          ));
        }}
        openSupplierPortalModal={() => {
          if (!requirePermission('supplier.submit')) return;
          if (activeSession) {
            setSupplierPortalSessionCode(activeSession.code);
          } else {
            showToast('⚠️ يرجى إنشاء طلب تسعير أولاً');
            setActiveTab('create_rfq');
          }
        }}
        onOpenRecoveryCenter={can('backup.manage') ? () => setIsRecoveryModalOpen(true) : undefined}
        onClearAllData={can('backup.manage') ? () => setIsRecoveryModalOpen(true) : undefined}
        onRestoreDemoData={can('backup.manage') ? handleRestoreDefaultData : undefined}
        onExportBackup={can('backup.manage') ? handleExportBackup : undefined}
        onImportBackup={can('backup.manage') ? handleImportBackup : undefined}
        hasData={hasData}
      />
      </div>

      {/* Emergency Data Recovery Banner (Always visible if data is missing or empty) */}
      {can('backup.manage') && (!sessions || sessions.length === 0 || !activeSession || (activeSession.submissions || []).length === 0) && (
        <div className="bg-gradient-to-r from-amber-600 via-emerald-600 to-teal-700 text-white p-3.5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-8 border-b border-emerald-400/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h4 className="font-black text-sm">
                هل اختفت البيانات أو العروض بسبب تفريغ ذاكرة المتصفح المؤقتة؟
              </h4>
              <p className="text-xs text-white/90">
                لا تقلق! كافة عروض الموردين (بما فيهم عروض سعيد سعدان وأوامر الشراء) محفوظة وجاهزة للاسترجاع فوراً بنقرة واحدة.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleRestoreDefaultData}
              className="bg-white hover:bg-emerald-50 text-emerald-900 text-xs font-black px-4 py-2 rounded-xl shadow-lg transition-all flex items-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4 text-emerald-700" />
              <span>⚡ استعادة كافة العروض والبيانات فوراً</span>
            </button>
            <button
              onClick={() => setIsRecoveryModalOpen(true)}
              className="bg-emerald-950/40 hover:bg-emerald-950/60 text-white border border-white/30 text-xs font-bold px-3 py-2 rounded-xl transition-all whitespace-nowrap"
            >
              <span>مركز الاستعادة والنسخ</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto min-h-[calc(100vh-104px)] w-full max-w-[1920px] min-w-0 px-2 py-5 sm:px-4 lg:pr-[17rem] lg:pl-6">
        {/* Toast Notification Alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
            <Bell className="w-4 h-4 text-emerald-400 animate-bounce" />
            <span className="text-xs font-bold">{toastMessage}</span>
          </div>
        )}

        {pendingLocalImport && can('backup.manage') && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-amber-950">
              <div className="font-black">توجد بيانات محلية لم تُرفع إلى السحابة</div>
              <div className="mt-1">
                {pendingLocalImport.sessions.filter(session => !sessions.some(cloudSession => cloudSession.code === session.code)).length} طلب RFQ و
                {pendingLocalImport.orders.filter(order => !orders.some(cloudOrder => cloudOrder.id === order.id)).length} أمر شراء غير موجود على Supabase.
                لن تُستبدل السجلات الموجودة.
              </div>
            </div>
            <button
              type="button"
              disabled={isLocalImporting}
              onClick={() => void handleImportLocalCloudData()}
              className="shrink-0 rounded-xl bg-amber-700 px-4 py-2 text-xs font-black text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {isLocalImporting ? 'جارٍ الترحيل...' : 'مراجعة وإضافة البيانات المحلية'}
            </button>
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
              <div className="bg-white rounded-3xl p-10 border-2 border-emerald-400/40 shadow-xl text-center max-w-2xl mx-auto space-y-5">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-3xl flex items-center justify-center mx-auto shadow-md">
                  <RotateCcw className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-300">
                    استعادة فورية بضغطة واحدة
                  </span>
                  <h3 className="text-xl font-black text-slate-900">
                    هل ترغب في استرجاع كافة العروض وطلبات الأسعار السابقة؟
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-lg mx-auto">
                    إذا كانت العروض أو البيانات قد اختفت بسبب تفريغ ذاكرة المتصفح المؤقتة، يمكنك استعادتها فوراً بنقرة واحدة لاسترجاع كافة عروض الموردين الحقيقيين (سعيد سعدان، الرفيق، اكسبريس، ترست، ديزك نراك) وأوامر الشراء بالكامل.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    onClick={handleRestoreDefaultData}
                    className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black px-6 py-3 rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>⚡ استعادة كافة العروض والبيانات الأصلية فوراً</span>
                  </button>
                  <button
                    onClick={() => setIsRecoveryModalOpen(true)}
                    className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-5 py-3 rounded-xl border border-slate-300 transition-all flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>مركز الاستعادة والنسخ الاحتياطي</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-wrap justify-center gap-4 text-xs text-slate-500">
                  <button
                    onClick={() => setActiveTab('analysis')}
                    className="hover:text-blue-600 font-semibold underline"
                  >
                    📁 أو ابدأ برفع ملفات SAP جديدة
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => setActiveTab('create_rfq')}
                    className="hover:text-blue-600 font-semibold underline"
                  >
                    ➕ إنشاء طلب تسعير جديد
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

                  <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                    <select
                      value={activeSessionCode}
                      onChange={e => setActiveSessionCode(e.target.value)}
                      className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      {sessions.map(s => (
                        <option key={s.code} value={s.code}>
                          {s.code === USER_REAL_RFQ_SESSION_1913.code ? '⭐ ' : ''}{s.code} — {s.title} ({s.items?.length || 0} صنف — {s.submissions.length} موردين)
                        </option>
                      ))}
                    </select>

                    {activeSessionCode !== USER_REAL_RFQ_SESSION_1913.code && (
                      <button
                        onClick={() => setActiveSessionCode(USER_REAL_RFQ_SESSION_1913.code)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1 whitespace-nowrap"
                        title="الانتقال فوراً لملف الفلاتر الشامل المعتمد (188 صنف | سعيد سعدان، الرفيق، اكسبريس، ترست)"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                        <span>جلسة الـ 188 صنف الحقيقية</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleSyncLatestOffers(activeSession.code)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
                      title="مزامنة وتحديث أوامر الشراء بالعروض الأحدث وأقل الأسعار لجميع الموردين بعد المفاوضات"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>مزامنة أوامر الشراء</span>
                    </button>

                    <button
                      onClick={() => setSupplierPortalSessionCode(activeSession.code)}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح بوابة مورد للتسعير</span>
                    </button>
                  </div>
                </div>

                {activeSession && (
                  <ComparisonTab
                    session={activeSession}
                    existingOrders={orders}
                    categorySelection={categorySelection}
                    onCategorySelectionChange={applyCategorySelection}
                    manualAwards={manualAwards[activeSession.code] || activeSession.manual_awards || {}}
                    onSetManualAward={handleSetManualAward}
                    onClearManualAward={handleClearManualAward}
                    onAwardItem={handleAwardItem}
                    onBatchAwardAll={handleBatchAwardAll}
                    onUpdateSupplierPrice={handleUpdateSupplierPrice}
                    onImportSapPrices={can('offers.award') ? handleImportSapPrices : undefined}
                    onNavigateToTracker={() => setActiveTab('tracker')}
                    onOpenSupplierPortal={() => setSupplierPortalSessionCode(activeSession.code)}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 5: Equipment Matcher & Decision Intelligence (دليل ومطابقة المعدات) */}
        {activeTab === 'equipment_matcher' && (
          <EquipmentMatcherTab
            session={activeSession}
            categorySelection={categorySelection}
            onCategorySelectionChange={applyCategorySelection}
            onApplyCategoryDecision={(itemId, cat) => {
              applyCategorySelection({ ...categorySelection, [itemId]: cat });
              showToast(`🎯 تم تحديد فئة البند إلى [${cat}]`);
            }}
            onApplyBatchDecisions={(decisions) => {
              applyCategorySelection({ ...categorySelection, ...decisions });
              showToast(`🎯 تم تطبيق التوصيات الفنية الذكية لـ ${Object.keys(decisions).length} صنف`);
              setActiveTab('compare');
            }}
            onNavigateToCompare={() => setActiveTab('compare')}
          />
        )}

        {/* Tab 6: Operations Live Dashboard (داشبورد العمليات) */}
        {activeTab === 'operations_dashboard' && profile.role_code === 'admin' && (
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
            session={activeSession}
            warehouseMode={profile.role_code === 'warehouse'}
            isAdmin={profile.role_code === 'admin'}
            onAdvanceStatus={handleAdvanceStatus}
            onOpenPoDetail={(po) => setSelectedPo(po)}
            onUpdateItemReceiving={handleUpdatePoItemReceiving}
            onDispatchToProject={handleDispatchToProject}
            onReassignSupplierItem={handleReassignSupplierItem}
            onCancelAndReallocatePo={handleCancelAndReallocatePo}
            onSyncLatestOffers={() => handleSyncLatestOffers(activeSession?.code || '')}
            onNavigateToCompare={() => setActiveTab('compare')}
            onExportSupplierPo={handleExportSupplierPo}
            onCreateManualPo={(poData) => {
              if (!requirePermission('po.create')) return;
              const now = new Date();
              const poNum = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(orders.length + 1).padStart(3, '0')}`;
              const newPo: PurchaseOrder = {
                id: `po-${Date.now()}`,
                po_number: poNum,
                rfq_code: poData.rfq_code || '',
                ...ownershipFields,
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

        {activeTab === 'project_inventory' && profile.role_code === 'project_warehouse' && (
          <ProjectWarehouseTab profile={profile} orders={orders} />
        )}

        {activeTab === 'project_requests' && can('project.request.read') && (
          <ProjectRequestsTab
            profile={profile}
            canManage={can('project.request.manage')}
            onNotify={showToast}
          />
        )}

        {activeTab === 'inventory_report' && can('inventory.read') && (
          <InventoryReportTab canManage={can('inventory.reconcile')} />
        )}

        {activeTab === 'users' && can('users.manage') && <UsersManagementTab />}
      </main>

      {/* PO Detail Modal */}
      {selectedPo && (
        <PoDetailModal
          po={selectedPo}
          session={sessions.find(item => item.code === selectedPo.rfq_code) || activeSession}
          allOrders={orders}
          onClose={() => setSelectedPo(null)}
          onAdvanceStatus={handleAdvanceStatus}
          onExportSupplierExcel={handleExportSupplierPo}
          onCancelAndReallocatePo={handleCancelAndReallocatePo}
          onUpdatePo={(updatedPo) => {
            if (!requirePermission('po.manage')) return;
            const now = new Date().toLocaleString('ar-EG');
            const finalPo = { ...updatedPo, updated_at: now };
            setOrders(prev => prev.map(o => o.id === finalPo.id ? finalPo : o));
            setSelectedPo(finalPo);
            showToast(`✅ تم حفظ التعديلات على أمر الشراء ${finalPo.po_number}`);
          }}
        />
      )}

      {/* Emergency Data Recovery & Backup Center Modal */}
      <DataRecoveryModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
        sessions={sessions}
        orders={orders}
        onRestoreDefaultData={handleRestoreDefaultData}
        onRestoreSnapshot={handleRestoreSnapshot}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onSafeClearData={handleSafeClearData}
      />

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
