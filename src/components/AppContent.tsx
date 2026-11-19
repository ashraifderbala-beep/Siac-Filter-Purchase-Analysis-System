import React from 'react';
import { 
  RfqSession, 
  PurchaseOrder, 
  AwardCriteria, 
  POStatus, 
  PurchaseOrderItem, 
  FilterCategory, 
  ProjectDispatchRecord, 
  SupplierSubmission,
  ReceivedSupplierIdentity
} from '../types/procurement';
import { AnalysisTab } from './AnalysisTab';
import { RfqCreateTab } from './RfqCreateTab';
import { RfqSessionsTab } from './RfqSessionsTab';
import { ComparisonTab } from './ComparisonTab';
import { EquipmentMatcherTab } from './EquipmentMatcherTab';
import { TrackerTab } from './TrackerTab';
import { OperationsDashboardTab } from './OperationsDashboardTab';
import { PoDetailModal } from './PoDetailModal';
import { DataRecoveryModal } from './DataRecoveryModal';
import { RotateCcw, ShieldCheck, BarChart3, Sparkles, ExternalLink } from 'lucide-react';
import { REAL_RFQ_SESSION_182 } from '../data/siacRealRfqSession';

interface AppContentProps {
  activeTab: string;
  sessions: RfqSession[];
  orders: PurchaseOrder[];
  categorySelection: Record<string, AwardCriteria>;
  activeSession: RfqSession | undefined;
  activeSessionCode: string;
  selectedPo: PurchaseOrder | null;
  isRecoveryModalOpen: boolean;
  supplierPortalSessionCode: string | null;
  stagedRfqItems: any[];
  hasData: boolean;
  onSetActiveTab: (tab: string) => void;
  onSetCategorySelection: (selection: Record<string, AwardCriteria>) => void;
  onSetActiveSessionCode: (code: string) => void;
  onSetSelectedPo: (po: PurchaseOrder | null) => void;
  onSetIsRecoveryModalOpen: (open: boolean) => void;
  onSetSupplierPortalSessionCode: (code: string | null) => void;
  onSetStagedRfqItems: (items: any[]) => void;
  onUseItemsForRfq: (items: any[]) => void;
  onCreateRfq: (session: RfqSession) => void;
  onOpenPortal: (code: string) => void;
  onSelectSessionForCompare: (code: string) => void;
  onToggleSessionActive: (code: string) => void;
  onAwardItem: (rfqCode: string, awards: { supplierName: string; item: PurchaseOrderItem; notes: string }[]) => void;
  onBatchAwardAll: (rfqCode: string, awardedOrders: { supplier: string; items: PurchaseOrderItem[]; total: number }[]) => void;
  onUpdateSupplierPrice: (rfqCode: string, supplierName: string, itemId: string, category: FilterCategory, newUnitPrice: number, notes?: string, sapCode?: string) => void;
  onNavigateToTracker: () => void;
  onOpenSupplierPortal: () => void;
  onApplyCategoryDecision: (itemId: string, cat: FilterCategory) => void;
  onApplyBatchDecisions: (decisions: Record<string, FilterCategory>) => void;
  onNavigateToCompare: () => void;
  onNavigateToTab: (tab: string) => void;
  onAdvanceStatus: (poId: string, status: POStatus, note?: string) => void;
  onOpenPoDetail: (po: PurchaseOrder) => void;
  onUpdateItemReceiving: (
    poId: string,
    itemIdx: number,
    receivedQty: number,
    voucherNo: string,
    notes: string,
    receivedSupplierIdentity: ReceivedSupplierIdentity
  ) => Promise<boolean>;
  onDispatchToProject: (poId: string, itemIdx: number, record: ProjectDispatchRecord) => Promise<boolean>;
  onReassignSupplierItem: (sourcePoId: string, targetSupplier: string, itemIdx: number, transferQty: number, newUnitPrice: number, newCategory: FilterCategory, reason: string) => void;
  onCancelAndReallocatePo: (sourcePoId: string, targetSupplier: string, updatedItems: PurchaseOrderItem[], reason: string, actionType: 'reallocate' | 'cancel_only') => void;
  onSyncLatestOffers: () => void;
  onNavigateToCompareFromTracker: () => void;
  onCreateManualPo: (poData: any) => void;
  onUpdatePo: (po: PurchaseOrder) => void;
  onRestoreDefaultData: () => void;
  onRestoreSnapshot: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onSafeClearData: () => void;
  onSubmitQuote: (sessionCode: string, submission: SupplierSubmission) => void;
  onBackToAdmin: () => void;
  showToast: (msg: string) => void;
}
