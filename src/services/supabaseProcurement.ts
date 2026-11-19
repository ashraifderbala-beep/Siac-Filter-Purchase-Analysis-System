import { InventoryMovement, InventoryStockAlert, InventoryStockThreshold, PurchaseOrder, ReceivedSupplierIdentity, RfqSession, UserProfile } from '../types/procurement';
import { supabase } from './supabaseClient';
import { hydrateLegacyProjectQuotas } from './projectQuotas';

export interface SharedProcurementData {
  sessions: RfqSession[];
  orders: PurchaseOrder[];
}

export function createInventoryRequestId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('المتصفح لا يدعم إنشاء معرف آمن لحركة المخزون. حدّث المتصفح ثم أعد المحاولة.');
  }
  return globalThis.crypto.randomUUID();
}

const INVENTORY_MOVEMENT_TYPES = new Set(['central_receipt', 'project_transfer', 'project_receipt', 'project_issue', 'stock_adjustment_in', 'stock_adjustment_out']);
const MAINTENANCE_CYCLES = new Set(['A1', 'B1', 'A2', 'C', 'A3', 'B2', 'A4', 'D']);

function getClient() {
  if (!supabase) throw new Error('لم يتم إعداد اتصال Supabase.');
  return supabase;
}

function hydrateRecord<T extends object>(
  payload: unknown,
  requiredFields: string[],
  entityName: string,
  metadata: Record<string, unknown>
): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`سجل ${entityName} في Supabase غير صالح.`);
  }
  const record = payload as Record<string, unknown>;
  if (requiredFields.some(field => typeof record[field] !== 'string')) {
    throw new Error(`بيانات ${entityName} في Supabase لا تحتوي الحقول المطلوبة.`);
  }
  return { ...record, ...metadata } as T;
}

export async function loadSharedProcurementData(): Promise<SharedProcurementData> {
  const client = getClient();
  const [sessionsResult, ordersResult] = await Promise.all([
    client
      .from('rfq_sessions')
      .select('code,payload,created_by_user_id,created_by_email,department_id,department_name')
      .order('updated_at', { ascending: false }),
    client
      .from('purchase_orders')
      .select('id,rfq_code,payload,created_by_user_id,created_by_email,department_id,department_name')
      .order('updated_at', { ascending: false })
  ]);

  if (sessionsResult.error) throw new Error(`تعذر تحميل طلبات RFQ من Supabase: ${sessionsResult.error.message}`);
  if (ordersResult.error) throw new Error(`تعذر تحميل أوامر الشراء من Supabase: ${ordersResult.error.message}`);

  const sessions = (sessionsResult.data || []).map((row: Record<string, unknown>) => {
    const metadata = {
      created_by_user_id: row.created_by_user_id,
      created_by_email: row.created_by_email,
      department_id: row.department_id,
      department_name: row.department_name
    };
    const session = hydrateRecord<RfqSession>(row.payload, ['code'], 'RFQ', metadata);
    if (session.code !== row.code || !Array.isArray(session.items) || !Array.isArray(session.submissions)) {
      throw new Error('بيانات طلب RFQ في Supabase لا تطابق بنية النظام.');
    }
    return session;
  });
  const orders = (ordersResult.data || []).map((row: Record<string, unknown>) => {
    const metadata = {
      rfq_code: row.rfq_code,
      created_by_user_id: row.created_by_user_id,
      created_by_email: row.created_by_email,
      department_id: row.department_id,
      department_name: row.department_name
    };
    const order = hydrateRecord<PurchaseOrder>(row.payload, ['id', 'po_number'], 'أمر الشراء', metadata);
    if (order.id !== row.id || !Array.isArray(order.items) || !Array.isArray(order.events)) {
      throw new Error('بيانات أمر الشراء في Supabase لا تطابق بنية النظام.');
    }
    return order;
  });

  return { sessions, orders: hydrateLegacyProjectQuotas(sessions, orders) };
}

export async function loadAssignedProjectPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await getClient().rpc('load_assigned_project_purchase_orders');
  if (error) throw new Error(`تعذر تحميل أوامر مخزن المشروع: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('استجابة أوامر مخزن المشروع في Supabase غير صالحة.');
  return data.map((row: Record<string, unknown>) => {
    if (
      typeof row.id !== 'string' ||
      (row.rfq_code !== null && typeof row.rfq_code !== 'string') ||
      !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)
    ) {
      throw new Error('بيانات أمر مخزن المشروع في Supabase غير صالحة.');
    }
    const order = row.payload as Record<string, unknown>;
    if (order.id !== row.id || !Array.isArray(order.items) || !Array.isArray(order.events)) {
      throw new Error('بيانات أمر مخزن المشروع لا تطابق البنية المتوقعة.');
    }
    return { ...order, rfq_code: row.rfq_code } as PurchaseOrder;
  });
}

function ownership(profile: UserProfile) {
  return {
    created_by_user_id: profile.id,
    created_by_email: profile.email,
    department_id: profile.department_id,
    department_name: profile.department_name
  };
}

export async function insertRfqSession(session: RfqSession, profile: UserProfile): Promise<void> {
  const row = { ...ownership(profile), code: session.code, payload: session };
  const { error } = await getClient().from('rfq_sessions').insert(row);
  if (error) throw new Error(`تعذر حفظ طلب RFQ ${session.code} في Supabase: ${error.message}`);
}

export async function updateRfqSession(session: RfqSession): Promise<void> {
  const { data, error } = await getClient()
    .from('rfq_sessions')
    .update({ payload: session, updated_at: new Date().toISOString() })
    .eq('code', session.code)
    .select('code');
  if (error) throw new Error(`تعذر تحديث طلب RFQ ${session.code} في Supabase: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`لم تُحدّث بيانات RFQ ${session.code}; تحقق من صلاحية الإدارة والقسم.`);
}

export async function insertPurchaseOrder(order: PurchaseOrder, profile: UserProfile): Promise<void> {
  const row = {
    ...ownership(profile),
    id: order.id,
    rfq_code: order.rfq_code || null,
    payload: order
  };
  const { error } = await getClient().from('purchase_orders').insert(row);
  if (error) throw new Error(`تعذر حفظ أمر الشراء ${order.po_number} في Supabase: ${error.message}`);
}

export async function updatePurchaseOrder(order: PurchaseOrder, profile?: UserProfile): Promise<void> {
  const { data, error } = await getClient()
    .from('purchase_orders')
    .update({
      rfq_code: order.rfq_code || null,
      payload: order,
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id)
    .select('id');

  if (error) {
    const blockedByInventoryGuard = /الاستلام|الصرف|inventory/i.test(error.message || '');
    const hasInventoryActivity = (order.items || []).some(item =>
      (item.received_qty || 0) > 0 || (item.dispatches?.length || 0) > 0
    );

    // POs without any receiving/dispatch history can safely be re-created with the
    // new award report values when the inventory protection trigger rejects the
    // payload because the item list changed (added/removed/reordered items).
    if (blockedByInventoryGuard && profile && !hasInventoryActivity) {
      const { data: deleted, error: deleteError } = await getClient()
        .from('purchase_orders')
        .delete()
        .eq('id', order.id)
        .select('id');

      if (deleteError) {
        throw new Error(`تعذر إعادة إنشاء أمر الشراء ${order.po_number}: ${deleteError.message}`);
      }
      if (!deleted || deleted.length === 0) {
        throw new Error(
          `تعذر تحديث أمر الشراء ${order.po_number}: لا تملك صلاحية إعادة إنشائه. راجع صلاحيات الإدارة أو طبّق تحديث قاعدة البيانات الخاص بحماية المخزون.`
        );
      }

      await insertPurchaseOrder(order, profile);
      return;
    }

    throw new Error(`تعذر تحديث أمر الشراء ${order.po_number}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    if (profile) {
      await insertPurchaseOrder(order, profile);
      return;
    }
    throw new Error(`لم يُحدّث أمر الشراء ${order.po_number}; تحقق من صلاحية الإدارة والقسم.`);
  }
}

async function runWarehouseAction(
  functionName: string,
  args: Record<string, string | number | null>
): Promise<PurchaseOrder> {
  const { data, error } = await getClient().rpc(functionName, args);
  if (error) {
    const details = [
      error.message,
      error.code ? `code: ${error.code}` : '',
      error.details ? `details: ${error.details}` : '',
      error.hint ? `hint: ${error.hint}` : ''
    ].filter(Boolean).join(' · ');

    const missingFunction =
      error.code === 'PGRST202' || /could not find the function|schema cache/i.test(error.message || '');
    const blockedByGuard = /الاستلام|الصرف|inventory/i.test(error.message || '');

    const guidance = missingFunction
      ? ' دالة المخزون غير موجودة على قاعدة البيانات؛ طبّق ترحيل هوية المورد والتوزيع العادل supabase/migrations/20261119000000_fair_received_filter_distribution.sql بعد ترحيلات المخزون.'
      : blockedByGuard
        ? ' نسخة دالة الاستلام/الصرف على قاعدة البيانات قديمة ولا تسجل الحركة عبر واجهة المخزون؛ طبّق ملف الترحيل supabase/migrations/20261022000000_repair_warehouse_inventory_functions.sql ثم أعد المحاولة.'
        : '';

    throw new Error(`تعذر حفظ حركة المخزن: ${details}.${guidance}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('استجابة حركة المخزن من Supabase غير صالحة.');
  }
  const order = data as PurchaseOrder;
  if (typeof order.id !== 'string' || !Array.isArray(order.items) || !Array.isArray(order.events)) {
    throw new Error('البيانات المحفوظة لحركة المخزن لا تطابق بنية أمر الشراء.');
  }
  return order;
}

export function recordPurchaseOrderReceipt(
  orderId: string,
  itemIndex: number,
  receivedQty: number,
  voucherNo: string,
  notes: string,
  receivedSupplierIdentity: ReceivedSupplierIdentity
): Promise<PurchaseOrder> {
  return runWarehouseAction('record_purchase_order_receipt_with_identity', {
    target_order_id: orderId,
    target_item_index: itemIndex,
    new_received_qty: receivedQty,
    receipt_voucher_no: voucherNo,
    receipt_notes: notes,
    actual_supplier_part_number: receivedSupplierIdentity.partNumber,
    actual_supplier_brand: receivedSupplierIdentity.brand,
    actual_supplier_sap_code: receivedSupplierIdentity.sapCode
  });
}

export function recordPurchaseOrderDispatch(
  orderId: string,
  itemIndex: number,
  project: string,
  quantity: number,
  voucherNo: string,
  notes: string,
  requestId: string
): Promise<PurchaseOrder> {
  return runWarehouseAction('record_purchase_order_dispatch_once', {
    target_order_id: orderId,
    target_item_index: itemIndex,
    target_project: project,
    dispatch_quantity: quantity,
    dispatch_voucher_no: voucherNo,
    dispatch_notes: notes,
    action_request_id: requestId
  });
}

export async function loadInventoryMovements(): Promise<InventoryMovement[]> {
  const { data, error } = await getClient()
    .from('inventory_movements')
    .select('id,movement_type,po_id,po_number,item_index,project_name,quantity,item_name,sap_material_code,source_rfq_item_id,requested_filter_no,supplier_part_number,supplier_brand,supplier_sap_code,stock_key,equipment_code,unit_price,maintenance_counter,maintenance_cycle,voucher_no,notes,actor_user_id,actor_name,created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`تعذر تحميل سجل حركات المخزون: ${error.message}`);
  return (data || []).map((row: Record<string, unknown>) => {
    if (
      typeof row.id !== 'string' ||
      typeof row.movement_type !== 'string' ||
      !INVENTORY_MOVEMENT_TYPES.has(row.movement_type) ||
      typeof row.po_id !== 'string' ||
      typeof row.po_number !== 'string' ||
      typeof row.item_index !== 'number' ||
      typeof row.quantity !== 'number' ||
      typeof row.item_name !== 'string' ||
      typeof row.sap_material_code !== 'string' ||
      (row.source_rfq_item_id !== null && typeof row.source_rfq_item_id !== 'string') ||
      (row.requested_filter_no !== null && typeof row.requested_filter_no !== 'string') ||
      (row.supplier_part_number !== null && typeof row.supplier_part_number !== 'string') ||
      (row.supplier_brand !== null && typeof row.supplier_brand !== 'string') ||
      (row.supplier_sap_code !== null && typeof row.supplier_sap_code !== 'string') ||
      typeof row.stock_key !== 'string' ||
      typeof row.unit_price !== 'number' ||
      typeof row.actor_user_id !== 'string' ||
      typeof row.actor_name !== 'string' ||
      typeof row.created_at !== 'string' ||
      (row.project_name !== null && typeof row.project_name !== 'string') ||
      (row.equipment_code !== null && typeof row.equipment_code !== 'string') ||
      typeof row.voucher_no !== 'string' ||
      typeof row.notes !== 'string' ||
      (row.maintenance_counter !== null && typeof row.maintenance_counter !== 'number') ||
      (row.maintenance_cycle !== null && (typeof row.maintenance_cycle !== 'string' || !MAINTENANCE_CYCLES.has(row.maintenance_cycle)))
    ) {
      throw new Error('سجل حركة المخزون في Supabase لا يطابق البنية المتوقعة.');
    }
    return {
      id: row.id,
      movement_type: row.movement_type as InventoryMovement['movement_type'],
      po_id: row.po_id,
      po_number: row.po_number,
      item_index: row.item_index,
      project_name: row.project_name,
      quantity: row.quantity,
      item_name: row.item_name,
      sap_material_code: row.sap_material_code,
      source_rfq_item_id: row.source_rfq_item_id as string | null,
      requested_filter_no: row.requested_filter_no as string | null,
      supplier_part_number: row.supplier_part_number as string | null,
      supplier_brand: row.supplier_brand as string | null,
      supplier_sap_code: row.supplier_sap_code as string | null,
      stock_key: row.stock_key,
      equipment_code: row.equipment_code,
      unit_price: row.unit_price,
      maintenance_counter: row.maintenance_counter,
      maintenance_cycle: row.maintenance_cycle as InventoryMovement['maintenance_cycle'],
      voucher_no: row.voucher_no,
      notes: row.notes,
      actor_user_id: row.actor_user_id,
      actor_name: row.actor_name,
      created_at: row.created_at
    };
  });
}

export async function loadInventoryStockThresholds(): Promise<InventoryStockThreshold[]> {
  try {
    const { data, error } = await getClient()
      .from('inventory_stock_thresholds')
      .select('stock_key,location_type,project_name,minimum_quantity')
      .order('stock_key');
    if (error) {
      console.warn('InventoryStockThresholds not available, skipping:', error.message);
      return [];
    }
    return (data || []).map((row: Record<string, unknown>) => {
      if (
        typeof row.stock_key !== 'string' ||
        (row.location_type !== 'central' && row.location_type !== 'project') ||
        typeof row.project_name !== 'string' ||
        typeof row.minimum_quantity !== 'number' ||
        row.minimum_quantity < 0
      ) {
        return null;
      }
      return {
        stock_key: row.stock_key,
        location_type: row.location_type,
        project_name: row.project_name,
        minimum_quantity: row.minimum_quantity
      };
    }).filter((item): item is InventoryStockThreshold => item !== null);
  } catch (error) {
    console.warn('Failed to load inventory stock thresholds:', error);
    return [];
  }
}

export async function saveInventoryStockThreshold(threshold: InventoryStockThreshold): Promise<void> {
  const { error } = await getClient().rpc('set_inventory_stock_threshold', {
    target_stock_key: threshold.stock_key,
    target_location_type: threshold.location_type,
    target_project_name: threshold.project_name,
    target_minimum_quantity: threshold.minimum_quantity
  });
  if (error) throw new Error(`تعذر حفظ حد تنبيه المخزون: ${error.message}`);
}

export async function recordInventoryReconciliation(
  stockKey: string,
  locationType: InventoryStockThreshold['location_type'],
  projectName: string,
  countedQuantity: number,
  notes: string,
  requestId: string
): Promise<void> {
  const { error } = await getClient().rpc('record_inventory_reconciliation', {
    target_stock_key: stockKey,
    target_location_type: locationType,
    target_project_name: projectName,
    counted_quantity: countedQuantity,
    reconciliation_notes: notes,
    action_request_id: requestId
  });
  if (error) throw new Error(`تعذر تسجيل تسوية الجرد: ${error.message}`);
}

export async function loadInventoryStockAlerts(): Promise<InventoryStockAlert[]> {
  const [movements, thresholds] = await Promise.all([
    loadInventoryMovements(),
    loadInventoryStockThresholds()
  ]);
  const balances = new Map<string, number>();
  const scopedKey = (stockKey: string, locationType: string, projectName: string) =>
    `${stockKey}\u0000${locationType}\u0000${projectName}`;
  const addBalance = (stockKey: string, locationType: string, projectName: string, quantity: number) => {
    const key = scopedKey(stockKey, locationType, projectName);
    balances.set(key, (balances.get(key) || 0) + quantity);
  };
  for (const movement of movements) {
    if (movement.movement_type === 'central_receipt') {
      addBalance(movement.stock_key, 'central', '', movement.quantity);
    } else if (movement.movement_type === 'project_transfer') {
      addBalance(movement.stock_key, 'central', '', -movement.quantity);
    } else if (movement.movement_type === 'project_receipt' || movement.movement_type === 'project_issue') {
      if (movement.project_name) addBalance(movement.stock_key, 'project', movement.project_name,
        movement.movement_type === 'project_receipt' ? movement.quantity : -movement.quantity);
    } else if (movement.movement_type === 'stock_adjustment_in' || movement.movement_type === 'stock_adjustment_out') {
      const adjustmentLocation = movement.project_name ? 'project' : 'central';
      const adjustmentProject = movement.project_name || '';
      addBalance(movement.stock_key, adjustmentLocation, adjustmentProject,
        movement.movement_type === 'stock_adjustment_in' ? movement.quantity : -movement.quantity);
    }
  }

  return thresholds.flatMap(threshold => {
    const matching = movements.find(movement => movement.stock_key === threshold.stock_key
      && (threshold.location_type === 'central'
        ? movement.project_name === null && movement.movement_type !== 'project_transfer'
        : movement.project_name === threshold.project_name));
    if (!matching) return [];
    const currentQuantity = balances.get(scopedKey(
      threshold.stock_key,
      threshold.location_type,
      threshold.location_type === 'project' ? threshold.project_name : ''
    )) || 0;
    return currentQuantity < threshold.minimum_quantity ? [{
      ...threshold,
      item_name: matching.item_name,
      sap_material_code: matching.sap_material_code,
      current_quantity: currentQuantity
    }] : [];
  });
}

async function recordProjectMovement(functionName: string, args: Record<string, string | number | null>): Promise<void> {
  const { error } = await getClient().rpc(functionName, args);
  if (error) throw new Error(`تعذر تسجيل حركة مخزن المشروع: ${error.message}`);
}

export function recordProjectStoreReceipt(
  orderId: string,
  itemIndex: number,
  quantity: number,
  voucherNo: string,
  notes: string,
  requestId: string
): Promise<void> {
  return recordProjectMovement('record_project_store_receipt_once', {
    target_order_id: orderId,
    target_item_index: itemIndex,
    received_quantity: quantity,
    receipt_voucher_no: voucherNo,
    receipt_notes: notes,
    action_request_id: requestId
  });
}

export function recordProjectStoreIssue(
  orderId: string,
  itemIndex: number,
  quantity: number,
  equipmentCode: string,
  itemName: string,
  sapMaterialCode: string,
  maintenanceCounter: number | null,
  maintenanceCycle: string | null,
  voucherNo: string,
  notes: string,
  requestId: string
): Promise<void> {
  return recordProjectMovement('record_project_store_issue_once', {
    target_order_id: orderId,
    target_item_index: itemIndex,
    issued_quantity: quantity,
    target_equipment_code: equipmentCode,
    issued_item_name: itemName,
    issued_sap_material_code: sapMaterialCode,
    maintenance_counter_value: maintenanceCounter,
    maintenance_cycle_value: maintenanceCycle,
    issue_voucher_no: voucherNo,
    issue_notes: notes,
    action_request_id: requestId
  });
}

export async function deleteMissingProcurementRecords(
  entity: 'rfq_sessions' | 'purchase_orders',
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const column = entity === 'rfq_sessions' ? 'code' : 'id';
  const { data, error } = await getClient().from(entity).delete().in(column, ids).select(column);
  if (error) throw new Error(`تعذر حذف سجلات ${entity} من Supabase: ${error.message}`);
  if ((data || []).length !== ids.length) {
    throw new Error(`حُذف ${data?.length ?? 0} من أصل ${ids.length} سجل من ${entity}; راجع صلاحيات القسم.`);
  }
}

export async function importMissingLocalData(
  localData: SharedProcurementData,
  profile: UserProfile
): Promise<{ sessions: number; orders: number }> {
  const client = getClient();
  const [existingSessions, existingOrders] = await Promise.all([
    client.from('rfq_sessions').select('code'),
    client.from('purchase_orders').select('id')
  ]);
  if (existingSessions.error) throw new Error(`تعذر فحص طلبات RFQ الموجودة: ${existingSessions.error.message}`);
  if (existingOrders.error) throw new Error(`تعذر فحص أوامر الشراء الموجودة: ${existingOrders.error.message}`);

  const sessionCodes = new Set((existingSessions.data || []).map((row: { code: string }) => row.code));
  const orderIds = new Set((existingOrders.data || []).map((row: { id: string }) => row.id));
  const sessionsToImport = localData.sessions
    .filter(session => !sessionCodes.has(session.code))
    .map(session => {
      const payload = { ...session, ...ownership(profile) };
      return { ...ownership(profile), code: session.code, payload };
    });
  const ordersToImport = localData.orders
    .filter(order => !orderIds.has(order.id))
    .map(order => {
      const payload = { ...order, ...ownership(profile) };
      return {
        ...ownership(profile),
        id: order.id,
        rfq_code: order.rfq_code || null,
        payload
      };
    });

  if (sessionsToImport.length > 0) {
    const { error } = await client.from('rfq_sessions').insert(sessionsToImport);
    if (error) throw new Error(`تعذر ترحيل طلبات RFQ المحلية: ${error.message}`);
  }
  if (ordersToImport.length > 0) {
    const { error } = await client.from('purchase_orders').insert(ordersToImport);
    if (error) throw new Error(`تعذر ترحيل أوامر الشراء المحلية: ${error.message}`);
  }

  return { sessions: sessionsToImport.length, orders: ordersToImport.length };
}
