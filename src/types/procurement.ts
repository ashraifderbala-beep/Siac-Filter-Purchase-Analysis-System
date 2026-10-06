export type FilterCategory = 'أصلي' | 'هاي كوبي' | 'صناعة محلي';

export type AwardCriteria = 'best_overall' | 'أصلي' | 'هاي كوبي' | 'صناعة محلي';

export type POStatus = 'draft' | 'sent' | 'awarded' | 'po_issued' | 'delivered' | 'closed';

export interface SapHistoricalPrice {
  mat_code: string;
  desc: string;
  last_price: number;
  last_date?: string;
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
}

export interface SupplierSubmission {
  supplier_name: string;
  phone?: string;
  submitted_at: string;
  // Map of item_id or mat_code -> array of offer options
  offers: Record<string, SupplierOfferOption[]>;
}

export interface RfqSession {
  code: string;
  title: string;
  created_at: string;
  deadline?: string;
  is_active: boolean;
  items: RfqItem[];
  sap_prices: Record<string, SapHistoricalPrice>;
  submissions: SupplierSubmission[];
}

export interface ProjectDispatchRecord {
  id: string;
  project: string;
  qty: number;
  voucher_no?: string;
  dispatched_at: string;
  notes?: string;
}

export interface PurchaseOrderItem {
  filter_no: string;
  desc?: string;
  mat_code?: string;
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

