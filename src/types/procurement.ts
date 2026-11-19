export type FilterCategory = 'أصلي' | 'هاي كوبي' | 'صناعة محلي';

export type AwardCriteria = 'best_overall' | 'أصلي' | 'هاي كوبي' | 'صناعة محلي';

export type POStatus = 'draft' | 'sent' | 'awarded' | 'po_issued' | 'delivered' | 'closed' | 'cancelled';

export type AppRole =
  | 'admin'
  | 'procurement_manager'
  | 'warehouse'
  | 'project_warehouse'
  | 'supplier'
  | 'viewer';

export type AppPermission =
  | 'analysis.run'
  | 'rfq.create'
  | 'rfq.read'
  | 'rfq.manage'
  | 'offers.compare'
  | 'offers.award'
  | 'equipment.read'
  | 'operations.read'
  | 'po.read'
  | 'po.create'
  | 'po.manage'
  | 'po.receive'
  | 'po.dispatch'
  | 'inventory.read'
  | 'inventory.reconcile'
  | 'project.inventory.receive'
  | 'project.inventory.issue'
  | 'project.request.submit'
  | 'project.request.read'
  | 'project.request.manage'
  | 'backup.manage'
  | 'users.manage'
  | 'supplier.submit';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role_code: AppRole;
  department_id: string | null;
  department_name: string | null;
  supplier_name: string | null;
  project_store_name: string | null;
  is_active: boolean;
}

export interface SapHistoricalPrice {
  mat_code: string;
  desc: string;
  last_price: number;
  last_date?: string;
  last_vendor?: string;
  last_po?: string;
  last_batch?: string;
  max_price: number;
  currency: string;
}

export interface RfqItem {
  id: string;
  item_no?: number; // رقم المسلسل الدقيق (1, 2, 3 ... 180)
  mat_code: string;
  filter_type: string;
  primary_number: string;
  alt_numbers: string[];
  qty_needed: number;
  equip_code?: string;
  projects?: string[];
  central_avail?: number;
  proj_qty?: number;
}

export interface SupplierOfferOption {
  id: string;
  category: FilterCategory;
  alt_no: string; // Supplier part number / brand
  unit_price: number;
  qty_avail: number;
  notes?: string;
  brand_name?: string;
  sap_code?: string; // Supplier-specific SAP material code
}

export interface SupplierSubmission {
  supplier_name: string;
  phone?: string;
  submitted_at: string;
  // Map of item_id or mat_code -> array of offer options
  offers: Record<string, SupplierOfferOption[]>;
}

export interface ManualAwardSelection {
  supplier: string;
  category: FilterCategory;
  unit_price: number;
  alt_no?: string;
  notes?: string;
  brand?: string;
  reason?: string;
  awarded_at?: string;
  sap_code?: string; // Supplier-specific SAP material code
}

export interface RfqSession {
  code: string;
  title: string;
  created_at: string;
  created_by_user_id?: string;
  created_by_email?: string;
  department_id?: string | null;
  department_name?: string | null;
  deadline?: string;
  is_active: boolean;
  items: RfqItem[];
  sap_prices: Record<string, SapHistoricalPrice>;
  submissions: SupplierSubmission[];
  manual_awards?: Record<string, ManualAwardSelection>;
  category_selection?: Record<string, AwardCriteria>;
}

export interface ProjectDispatchRecord {
  id: string;
  project: string;
  qty: number;
  voucher_no?: string;
  dispatched_at: string;
  notes?: string;
}

export type InventoryMovementType =
  | 'central_receipt'
  | 'project_transfer'
  | 'project_receipt'
  | 'project_issue'
  | 'stock_adjustment_in'
  | 'stock_adjustment_out';

export type MaintenanceCycle = 'A1' | 'B1' | 'A2' | 'C' | 'A3' | 'B2' | 'A4' | 'D';

export interface InventoryMovement {
  id: string;
  movement_type: InventoryMovementType;
  po_id: string;
  po_number: string;
  item_index: number;
  project_name: string | null;
  quantity: number;
  item_name: string;
  sap_material_code: string;
  source_rfq_item_id?: string | null;
  requested_filter_no?: string | null;
  supplier_part_number?: string | null;
  supplier_brand?: string | null;
  supplier_sap_code?: string | null;
  stock_key: string;
  equipment_code: string | null;
  unit_price: number;
  maintenance_counter: number | null;
  maintenance_cycle: MaintenanceCycle | null;
  voucher_no: string;
  notes: string;
  actor_user_id: string;
  actor_name: string;
  created_at: string;
}

export interface InventoryStockThreshold {
  stock_key: string;
  location_type: 'central' | 'project';
  project_name: string;
  minimum_quantity: number;
}

export interface InventoryStockAlert extends InventoryStockThreshold {
  item_name: string;
  sap_material_code: string;
  current_quantity: number;
}

export interface ProjectQuota {
  project: string;
  qty: number;
}

export interface ReceivedSupplierIdentity {
  partNumber: string;
  brand: string;
  sapCode: string;
}

export interface PurchaseOrderItem {
  source_rfq_item_id?: string;
  filter_no: string;
  desc?: string;
  mat_code?: string;
  sap_code?: string;
  supplier_brand?: string;
  award_project_allocations?: ProjectQuota[];
  received_supplier_part_number?: string;
  received_supplier_brand?: string;
  received_supplier_sap_code?: string;
  received_supplier_identity_confirmed?: boolean;
  filter_type?: string;
  qty: number;
  unit_price: number;
  category: FilterCategory;
  total: number;
  notes?: string;
  // Receiving in Store 9004
  received_qty?: number;
  delivery_voucher?: string;
  receiving_notes?: string;
  received_at?: string;
  // Project Dispatches
  project_allocations?: ProjectQuota[];
  dispatches?: ProjectDispatchRecord[];
}

export interface POEvent {
  id: string;
  status: POStatus;
  note: string;
  happened_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  rfq_code?: string;
  created_by_user_id?: string;
  created_by_email?: string;
  department_id?: string | null;
  department_name?: string | null;
  title: string;
  supplier: string;
  total_value: number;
  currency: string;
  status: POStatus;
  created_at: string;
  updated_at: string;
  notes: string;
  items: PurchaseOrderItem[];
  events: POEvent[];
}

export interface ProjectStoreInfo {
  id: string;
  store_code: string; // رقم المخزن مثل 9004, 9021, 9055
  project_name: string; // مسمى المشروع
  location?: string;
  is_central?: boolean;
}
