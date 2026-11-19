import React, { useCallback, useEffect, useMemo, useState } from 'react';
import XLSX from '../services/xlsx';
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardList, Download, RefreshCw, Search } from 'lucide-react';
import { InventoryMovement, InventoryStockThreshold, MaintenanceCycle, PurchaseOrder, PurchaseOrderItem, UserProfile } from '../types/procurement';
import {
  createInventoryRequestId,
  loadInventoryMovements,
  loadInventoryStockThresholds,
  recordInventoryReconciliation,
  recordProjectStoreIssue,
  recordProjectStoreReceipt,
  saveInventoryStockThreshold
} from '../services/supabaseProcurement';
import { getFilterIdentity } from '../services/filterIdentity';

const CYCLES: MaintenanceCycle[] = ['A1', 'B1', 'A2', 'C', 'A3', 'B2', 'A4', 'D'];
const movementLabels: Record<InventoryMovement['movement_type'], string> = {
  central_receipt: 'استلام للمخزن 9004',
  project_transfer: 'تحويل إلى المشروع',
  project_receipt: 'استلام المشروع',
  project_issue: 'صرف لمعدة',
  stock_adjustment_in: 'تسوية زيادة جرد',
  stock_adjustment_out: 'تسوية عجز جرد'
};

const numberFormat = new Intl.NumberFormat('ar-EG');
const moneyFormat = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });

function itemName(item: PurchaseOrderItem): string {
  return item.desc || item.filter_no || 'صنف بدون اسم';
}

function itemKey(orderId: string, index: number): string {
  return `${orderId}:${index}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-EG');
}

function localDateValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface ProjectWarehouseTabProps {
  profile: UserProfile;
  orders: PurchaseOrder[];
}

interface IssueDraft {
  equipmentCode: string;
  itemName: string;
  sapCode: string;
  quantity: number;
  counter: string;
  cycle: MaintenanceCycle | '';
  voucher: string;
  notes: string;
}

export const ProjectWarehouseTab: React.FC<ProjectWarehouseTabProps> = ({ profile, orders }) => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [receiveVoucher, setReceiveVoucher] = useState<Record<string, string>>({});
  const [receiveRequests, setReceiveRequests] = useState<Record<string, { fingerprint: string; id: string }>>({});
  const [issueKey, setIssueKey] = useState<string | null>(null);
  const [issueRequest, setIssueRequest] = useState<{ fingerprint: string; id: string } | null>(null);
  const [issueDraft, setIssueDraft] = useState<IssueDraft>({
    equipmentCode: '',
    itemName: '',
    sapCode: '',
    quantity: 1,
    counter: '',
    cycle: '',
    voucher: '',
    notes: ''
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMovements(await loadInventoryMovements());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل سجل مخزن المشروع.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectName = profile.project_store_name?.trim() || '';
  const projectOrders = useMemo(() => orders
    .map(order => ({
      order,
      items: order.items.map((item, index) => ({ item, index }))
        .filter(({ item }) => item.project_allocations?.some(allocation => allocation.project === projectName))
    }))
    .filter(entry => entry.items.length > 0), [orders, projectName]);

  const eventTotals = (orderId: string, index: number) => {
    const itemMovements = movements.filter(movement =>
      movement.po_id === orderId && movement.item_index === index && movement.project_name === projectName
    );
    const totalFor = (type: InventoryMovement['movement_type']) =>
      itemMovements.filter(movement => movement.movement_type === type).reduce((sum, movement) => sum + movement.quantity, 0);
    return {
      transferred: totalFor('project_transfer'),
      received: totalFor('project_receipt'),
      issued: totalFor('project_issue'),
      adjustment: totalFor('stock_adjustment_in') - totalFor('stock_adjustment_out'),
      events: itemMovements
    };
  };

  const receiveItem = async (order: PurchaseOrder, index: number, pending: number) => {
    const key = itemKey(order.id, index);
    const quantity = receiveQty[key] ?? pending;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > pending) {
      setError('كمية الاستلام يجب أن تكون عدداً صحيحاً ضمن الكمية المحولة المتبقية.');
      return;
    }
    const voucherNo = receiveVoucher[key] || '';
    const fingerprint = JSON.stringify([order.id, index, quantity, voucherNo]);
    const requestId = receiveRequests[key]?.fingerprint === fingerprint
      ? receiveRequests[key].id
      : createInventoryRequestId();
    setReceiveRequests(current => ({ ...current, [key]: { fingerprint, id: requestId } }));
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await recordProjectStoreReceipt(order.id, index, quantity, voucherNo, '', requestId);
      setReceiveRequests(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await refresh();
      setNotice(`تم تسجيل استلام ${numberFormat.format(quantity)} من ${itemName(order.items[index])}.`);
    } catch (receiveError) {
      setError(receiveError instanceof Error ? receiveError.message : 'تعذر تسجيل استلام المشروع.');
    } finally {
      setBusyKey(null);
    }
  };

  const startIssue = (order: PurchaseOrder, index: number, item: PurchaseOrderItem) => {
    const key = itemKey(order.id, index);
    setIssueKey(key);
    setIssueRequest(null);
    setIssueDraft({
      equipmentCode: '',
      itemName: itemName(item),
      sapCode: item.mat_code || '',
      quantity: 1,
      counter: '',
      cycle: '',
      voucher: '',
      notes: ''
    });
    setError(null);
    setNotice(null);
  };

  const submitIssue = async (order: PurchaseOrder, index: number) => {
    const key = itemKey(order.id, index);
    const quantity = Number(issueDraft.quantity);
    const counter = issueDraft.counter.trim() ? Number(issueDraft.counter) : null;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('كمية الصرف يجب أن تكون عدداً صحيحاً أكبر من صفر.');
      return;
    }
    if (counter !== null && (!Number.isFinite(counter) || counter < 0)) {
      setError('عداد الصيانة يجب أن يكون رقماً غير سالب.');
      return;
    }
    const issueArgs = [
      order.id,
      index,
      quantity,
      issueDraft.equipmentCode,
      issueDraft.itemName,
      issueDraft.sapCode,
      counter,
      issueDraft.cycle || null,
      issueDraft.voucher,
      issueDraft.notes
    ] as const;
    const fingerprint = JSON.stringify(issueArgs);
    const requestId = issueRequest?.fingerprint === fingerprint
      ? issueRequest.id
      : createInventoryRequestId();
    setIssueRequest({ fingerprint, id: requestId });
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await recordProjectStoreIssue(
        ...issueArgs,
        requestId
      );
      setIssueKey(null);
      setIssueRequest(null);
      await refresh();
      setNotice(`تم تسجيل صرف ${numberFormat.format(quantity)} إلى المعدة ${issueDraft.equipmentCode}.`);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'تعذر تسجيل صرف الفلتر للمعدة.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-700" />
            مخزن المشروع: {projectName || 'غير محدد'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">تأكيد استلام المحول من 9004، ثم تسجيل الصرف لكل معدة.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث الحركات
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {loading && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">جارٍ تحميل أرصدة وحركات المشروع...</p>}
      {!loading && projectOrders.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">لا توجد أصناف مخصصة لهذا المخزن حالياً. تحقق من تطابق اسم المخزن مع اسم المشروع في طلبات الشراء.</p>
      )}

      <div className="space-y-4">
        {projectOrders.map(({ order, items }) => (
          <article key={order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="font-black text-slate-900">{order.po_number} — {order.supplier}</h3>
                <p className="text-xs text-slate-500">{order.title}</p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{items.length} صنف مخصص</span>
            </header>
            <div className="divide-y divide-slate-100">
              {items.map(({ item, index }) => {
                const totals = eventTotals(order.id, index);
                const identity = getFilterIdentity(item);
                const inTransit = Math.max(0, totals.transferred - totals.received);
                const balance = totals.received - totals.issued + totals.adjustment;
                const key = itemKey(order.id, index);
                return (
                  <div key={key} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-[220px] flex-1">
                        <p className="font-bold text-slate-900">{itemName(item)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          الرقم المطلوب: <strong className="font-mono">{identity.requestedNumber}</strong>
                          {' · '}SAP المطلوب: <span dir="ltr">{identity.requestedSapCode}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          المستلم من المورد: <strong className="font-mono text-blue-700">{identity.receivedSupplierNumber}</strong>
                          {' · '}الماركة: <strong>{identity.receivedSupplierBrand}</strong>
                        </p>
                        <p className="mt-1 text-xs font-mono text-slate-500" dir="ltr">
                          SAP المورد المستلم: {identity.receivedSupplierSapCode}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">سعر الوحدة: {moneyFormat.format(item.unit_price)} جنيه</p>
                        {(() => {
                          const allocationQty = item.project_allocations?.find(
                            allocation => allocation.project === projectName
                          )?.qty;
                          if (allocationQty === undefined) return null;
                          const shortage = Math.max(0, allocationQty - totals.transferred);
                          return (
                            <p className={`mt-1 text-xs font-bold ${shortage > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              حصة المشروع: {numberFormat.format(allocationQty)} · تم تحويله من 9004: {numberFormat.format(totals.transferred)}
                              {shortage > 0 ? ` · عجز لم يُحوَّل بعد: ${numberFormat.format(shortage)}` : ' · تم التحويل بالكامل'}
                            </p>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-amber-50 px-3 py-2"><b className="block text-amber-800">{numberFormat.format(inTransit)}</b><span>بالطريق</span></div>
                        <div className="rounded-lg bg-emerald-50 px-3 py-2"><b className="block text-emerald-800">{numberFormat.format(balance)}</b><span>رصيد المشروع</span></div>
                        <div className="rounded-lg bg-slate-100 px-3 py-2"><b className="block text-slate-800">{numberFormat.format(totals.issued)}</b><span>مصروف للمعدات</span></div>
                      </div>
                    </div>

                    {inTransit > 0 && (
                      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                        <label className="text-xs font-bold text-slate-700">
                          الكمية المستلمة
                          <input type="number" min={1} max={inTransit} step={1} value={receiveQty[key] ?? inTransit}
                            onChange={event => setReceiveQty(current => ({ ...current, [key]: Number(event.target.value) }))}
                            className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">
                          رقم إذن الاستلام
                          <input value={receiveVoucher[key] || ''} onChange={event => setReceiveVoucher(current => ({ ...current, [key]: event.target.value }))}
                            className="mt-1 block w-44 rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <button type="button" disabled={busyKey === key} onClick={() => void receiveItem(order, index, inTransit)}
                          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                          <ArrowDownToLine className="h-4 w-4" /> تأكيد الاستلام
                        </button>
                      </div>
                    )}

                    {balance > 0 && issueKey !== key && (
                      <button type="button" onClick={() => startIssue(order, index, item)}
                        className="flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800">
                        <ArrowUpFromLine className="h-4 w-4" /> صرف لمعدة
                      </button>
                    )}

                    {issueKey === key && (
                      <div className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-xs font-bold text-slate-700">كود المعدة *
                          <input value={issueDraft.equipmentCode} onChange={event => setIssueDraft(draft => ({ ...draft, equipmentCode: event.target.value }))}
                            placeholder="مثال: 2/3/008" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">اسم الفلتر *
                          <input value={issueDraft.itemName} onChange={event => setIssueDraft(draft => ({ ...draft, itemName: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">كود SAP *
                          <input value={issueDraft.sapCode} onChange={event => setIssueDraft(draft => ({ ...draft, sapCode: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">الكمية *
                          <input type="number" min={1} max={balance} step={1} value={issueDraft.quantity}
                            onChange={event => setIssueDraft(draft => ({ ...draft, quantity: Number(event.target.value) }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">عداد الصيانة (اختياري)
                          <input type="number" min={0} step="any" value={issueDraft.counter} onChange={event => setIssueDraft(draft => ({ ...draft, counter: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">بند الصيانة
                          <select value={issueDraft.cycle} onChange={event => setIssueDraft(draft => ({ ...draft, cycle: event.target.value as MaintenanceCycle | '' }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2">
                            <option value="">غير محدد</option>
                            {CYCLES.map(cycle => <option key={cycle} value={cycle}>{cycle}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-bold text-slate-700">رقم إذن الصرف
                          <input value={issueDraft.voucher} onChange={event => setIssueDraft(draft => ({ ...draft, voucher: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <label className="text-xs font-bold text-slate-700">ملاحظات
                          <input value={issueDraft.notes} onChange={event => setIssueDraft(draft => ({ ...draft, notes: event.target.value }))}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2" />
                        </label>
                        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
                          <button type="button" disabled={busyKey === key || issueDraft.quantity > balance} onClick={() => void submitIssue(order, index)}
                            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">تسجيل الصرف</button>
                          <button type="button" onClick={() => setIssueKey(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700">إلغاء</button>
                          <span className="text-xs text-slate-500">المتاح: {numberFormat.format(balance)} — سعر الوحدة: {moneyFormat.format(item.unit_price)} جنيه</span>
                        </div>
                      </div>
                    )}

                    {totals.events.length > 0 && (
                      <details className="rounded-lg border border-slate-200 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-bold text-slate-700">عرض حركة هذا الصنف ({totals.events.length})</summary>
                        <div className="mt-2 space-y-2">
                          {totals.events.map(movement => (
                            <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                              <span>
                                {movementLabels[movement.movement_type]} · {numberFormat.format(movement.quantity)}
                                {movement.supplier_part_number ? ` · رقم المورد ${movement.supplier_part_number}` : ''}
                                {movement.supplier_brand ? ` · ${movement.supplier_brand}` : ''}
                              </span>
                              <span>{movement.equipment_code ? `المعدة ${movement.equipment_code} · ` : ''}{movement.actor_name} · {dateLabel(movement.created_at)}</span>
                              <span>{movement.voucher_no || 'بدون رقم إذن'}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

interface InventoryReportTabProps {
  canManage: boolean;
}

export const InventoryReportTab: React.FC<InventoryReportTabProps> = ({ canManage }) => {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [thresholds, setThresholds] = useState<InventoryStockThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLocationKey, setSelectedLocationKey] = useState('');
  const [minimumQuantity, setMinimumQuantity] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [reconciliationNotes, setReconciliationNotes] = useState('');
  const [reconciliationRequest, setReconciliationRequest] = useState<{ fingerprint: string; id: string } | null>(null);
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState<InventoryMovement['movement_type'] | 'all'>('all');
  const [project, setProject] = useState('all');
  const [actor, setActor] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextMovements, nextThresholds] = await Promise.all([
        loadInventoryMovements(),
        loadInventoryStockThresholds()
      ]);
      setMovements(nextMovements);
      setThresholds(nextThresholds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل تقرير المخزون.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stockLocations = useMemo(() => {
    const locations = new Map<string, InventoryStockThreshold & { item_name: string; sap_material_code: string }>();
    for (const movement of movements) {
      const locationType = movement.project_name ? 'project' : 'central';
      if (locationType === 'central' && !['central_receipt', 'stock_adjustment_in', 'stock_adjustment_out'].includes(movement.movement_type)) continue;
      const projectName = movement.project_name || '';
      const key = JSON.stringify([movement.stock_key, locationType, projectName]);
      if (!locations.has(key)) locations.set(key, {
        stock_key: movement.stock_key,
        location_type: locationType,
        project_name: projectName,
        minimum_quantity: 0,
        item_name: movement.item_name,
        sap_material_code: movement.sap_material_code
      });
    }
    return [...locations.entries()].map(([key, value]) => ({ ...value, key }));
  }, [movements]);

  const selectedStockLocation = stockLocations.find(location => location.key === selectedLocationKey);
  const selectedLocationThreshold = selectedStockLocation && thresholds.find(threshold =>
    threshold.stock_key === selectedStockLocation.stock_key
      && threshold.location_type === selectedStockLocation.location_type
      && threshold.project_name === selectedStockLocation.project_name
  );
  const selectedLocationBalance = selectedStockLocation ? movements.reduce((balance, movement) => {
    if (movement.stock_key !== selectedStockLocation.stock_key) return balance;
    if (selectedStockLocation.location_type === 'central') {
      if (movement.movement_type === 'central_receipt') return balance + movement.quantity;
      if (movement.movement_type === 'project_transfer' || movement.movement_type === 'stock_adjustment_out' && movement.project_name === null) return balance - movement.quantity;
      if (movement.movement_type === 'stock_adjustment_in' && movement.project_name === null) return balance + movement.quantity;
      return balance;
    }
    if (movement.project_name !== selectedStockLocation.project_name) return balance;
    if (movement.movement_type === 'project_receipt' || movement.movement_type === 'stock_adjustment_in') return balance + movement.quantity;
    if (movement.movement_type === 'project_issue' || movement.movement_type === 'stock_adjustment_out') return balance - movement.quantity;
    return balance;
  }, 0) : 0;

  const chooseStockLocation = (key: string) => {
    setSelectedLocationKey(key);
    const location = stockLocations.find(option => option.key === key);
    const threshold = location && thresholds.find(value =>
      value.stock_key === location.stock_key
      && value.location_type === location.location_type
      && value.project_name === location.project_name
    );
    setMinimumQuantity(threshold ? String(threshold.minimum_quantity) : '');
    setCountedQuantity('');
    setReconciliationRequest(null);
    setError(null);
    setNotice(null);
  };

  const saveThreshold = async (event: React.FormEvent) => {
    event.preventDefault();
    const minimum = Number(minimumQuantity);
    if (!canManage || !selectedStockLocation || !Number.isInteger(minimum) || minimum < 0) {
      setError('اختر موقعاً للمخزون وأدخل حداً أدنى صحيحاً (صفر أو أكثر).');
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await saveInventoryStockThreshold({
        stock_key: selectedStockLocation.stock_key,
        location_type: selectedStockLocation.location_type,
        project_name: selectedStockLocation.project_name,
        minimum_quantity: minimum
      });
      await refresh();
      setNotice('تم حفظ حد التنبيه لهذا الصنف والمخزن.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ حد تنبيه المخزون.');
    }
  };

  const submitReconciliation = async (event: React.FormEvent) => {
    event.preventDefault();
    const counted = Number(countedQuantity);
    const notes = reconciliationNotes.trim();
    if (!canManage || !selectedStockLocation || !Number.isInteger(counted) || counted < 0 || !notes) {
      setError('أدخل الكمية الفعلية كعدد صحيح غير سالب، وسبب التسوية.');
      return;
    }
    const difference = counted - selectedLocationBalance;
    if (difference === 0) {
      setError('الكمية الفعلية مطابقة لرصيد النظام؛ لا توجد تسوية.');
      return;
    }
    if (!window.confirm(`سيتم تسجيل ${Math.abs(difference)} ${difference > 0 ? 'زيادة' : 'عجز'} وتسوية الرصيد إلى ${counted}. هل تريد المتابعة؟`)) return;

    const fingerprint = JSON.stringify([selectedStockLocation.stock_key, selectedStockLocation.location_type,
      selectedStockLocation.project_name, counted, notes]);
    const requestId = reconciliationRequest?.fingerprint === fingerprint
      ? reconciliationRequest.id
      : createInventoryRequestId();
    setReconciliationRequest({ fingerprint, id: requestId });
    setError(null);
    setNotice(null);
    try {
      await recordInventoryReconciliation(
        selectedStockLocation.stock_key,
        selectedStockLocation.location_type,
        selectedStockLocation.project_name,
        counted,
        notes,
        requestId
      );
      setReconciliationRequest(null);
      setReconciliationNotes('');
      setCountedQuantity('');
      await refresh();
      setNotice('تم تسجيل تسوية الجرد وتحديث الرصيد من خلال حركة موثقة.');
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : 'تعذر تسجيل تسوية الجرد.');
    }
  };

  const reportRows = useMemo(() => {
    const byItem = new Map<string, {
      key: string;
      code: string;
      name: string;
      central: number;
      projects: Map<string, { inTransit: number; balance: number }>;
    }>();
    const getRow = (key: string, code: string, name: string) => {
      let row = byItem.get(key);
      if (!row) {
        row = { key, code, name, central: 0, projects: new Map() };
        byItem.set(key, row);
      }
      if (code && !row.code) row.code = code;
      if (name && !row.name) row.name = name;
      return row;
    };
    for (const movement of movements) {
      const row = getRow(movement.stock_key, movement.sap_material_code, movement.item_name);
      const projectName = movement.project_name || '';
      if (movement.movement_type === 'central_receipt') row.central += movement.quantity;
      if (movement.movement_type === 'project_transfer') {
        row.central -= movement.quantity;
        const project = row.projects.get(projectName) || { inTransit: 0, balance: 0 };
        project.inTransit += movement.quantity;
        row.projects.set(projectName, project);
      }
      if (movement.movement_type === 'project_receipt') {
        const project = row.projects.get(projectName) || { inTransit: 0, balance: 0 };
        project.inTransit -= movement.quantity;
        project.balance += movement.quantity;
        row.projects.set(projectName, project);
      }
      if (movement.movement_type === 'project_issue') {
        const project = row.projects.get(projectName) || { inTransit: 0, balance: 0 };
        project.balance -= movement.quantity;
        row.projects.set(projectName, project);
      }
      if (movement.movement_type === 'stock_adjustment_in' && !movement.project_name) row.central += movement.quantity;
      if (movement.movement_type === 'stock_adjustment_out' && !movement.project_name) row.central -= movement.quantity;
      if (movement.movement_type === 'stock_adjustment_in' && movement.project_name) {
        const project = row.projects.get(projectName) || { inTransit: 0, balance: 0 };
        project.balance += movement.quantity;
        row.projects.set(projectName, project);
      }
      if (movement.movement_type === 'stock_adjustment_out' && movement.project_name) {
        const project = row.projects.get(projectName) || { inTransit: 0, balance: 0 };
        project.balance -= movement.quantity;
        row.projects.set(projectName, project);
      }
    }
    return [...byItem.values()];
  }, [movements]);

  const equipmentIssues = movements.filter(movement => movement.movement_type === 'project_issue');
  const projects = useMemo(() => [...new Set(movements
    .map(movement => movement.project_name)
    .filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ar')), [movements]);
  const actors = useMemo(() => [...new Map(movements.map(movement => [
    movement.actor_user_id,
    { id: movement.actor_user_id, name: movement.actor_name || movement.actor_user_id }
  ])).values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')), [movements]);
  const filteredMovements = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return movements.filter(movement => {
      const movementDate = localDateValue(movement.created_at);
      if (movementType !== 'all' && movement.movement_type !== movementType) return false;
      if (project !== 'all' && movement.project_name !== project) return false;
      if (actor !== 'all' && movement.actor_user_id !== actor) return false;
      if (fromDate && (!movementDate || movementDate < fromDate)) return false;
      if (toDate && (!movementDate || movementDate > toDate)) return false;
      if (!query) return true;
      return [
        movementLabels[movement.movement_type],
        movement.project_name,
        movement.item_name,
        movement.requested_filter_no,
        movement.sap_material_code,
        movement.supplier_part_number,
        movement.supplier_brand,
        movement.supplier_sap_code,
        movement.stock_key,
        movement.equipment_code,
        movement.po_number,
        movement.po_id,
        movement.voucher_no,
        movement.actor_name,
        movement.actor_user_id,
        movement.notes,
        movement.maintenance_cycle
      ].some(value => value?.toLocaleLowerCase().includes(query));
    });
  }, [actor, fromDate, movementType, movements, project, search, toDate]);

  const exportAuditTrail = () => {
    try {
      const rows = filteredMovements.map(movement => ({
        'التاريخ والوقت': dateLabel(movement.created_at),
        'نوع الحركة': movementLabels[movement.movement_type],
        'المشروع': movement.project_name || '',
        'الصنف': movement.item_name,
        'رقم الفلتر المطلوب': movement.requested_filter_no || '',
        'كود SAP': movement.sap_material_code,
        'رقم المورد': movement.supplier_part_number || '',
        'ماركة المورد': movement.supplier_brand || '',
        'كود SAP المورد': movement.supplier_sap_code || '',
        'معرف بند RFQ': movement.source_rfq_item_id || '',
        'مفتاح الصنف': movement.stock_key,
        'الكمية': movement.quantity,
        'سعر الوحدة': movement.unit_price,
        'كود المعدة': movement.equipment_code || '',
        'عداد الصيانة': movement.maintenance_counter ?? '',
        'بند الصيانة': movement.maintenance_cycle || '',
        'أمر الشراء': movement.po_number,
        'معرف أمر الشراء': movement.po_id,
        'رقم الإذن': movement.voucher_no,
        'المنفذ': movement.actor_name,
        'معرف المستخدم': movement.actor_user_id,
        'ملاحظات': movement.notes
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'سجل الحركات');
      XLSX.writeFile(workbook, `سجل-حركات-المخزون-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? `تعذر تصدير سجل الحركات: ${exportError.message}` : 'تعذر تصدير سجل الحركات.');
    }
  };

  return (
    <section className="space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ArrowLeftRight className="h-5 w-5 text-blue-700" /> تقرير حركة المخزون على مستوى الشركة
          </h2>
          <p className="mt-1 text-xs text-slate-500">رصيد 9004، الكميات بالطريق، أرصدة المشروعات، والصرف المسجل على المعدات.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث التقرير
        </button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {loading && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">جارٍ تحميل سجل الحركات...</p>}
      {!loading && movements.length === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" /> لا توجد حركات مسجلة بعد. سجل الاستلام أو الصرف من 9004 لإنشاء سجل التتبع.
        </p>
      )}

      <div className="space-y-3 md:hidden">
        {reportRows.map(row => (
          <article key={row.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-slate-900">{row.name}</h3>
            <p className="mt-1 break-all font-mono text-xs text-slate-500" dir="ltr">{row.code || 'كود SAP غير مسجل'}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-blue-50 p-2"><b className="block text-base text-blue-900">{numberFormat.format(row.central)}</b><span>رصيد 9004</span></div>
              <div className="rounded-lg bg-emerald-50 p-2"><b className="block text-base text-emerald-900">{numberFormat.format([...row.projects.values()].reduce((sum, value) => sum + value.balance, 0))}</b><span>إجمالي رصيد المشروعات</span></div>
            </div>
            {[...row.projects.entries()].map(([projectName, project]) => (
              <div key={`${row.key}:${projectName}`} className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                <span className="min-w-0 font-bold text-slate-700">{projectName || 'مشروع غير محدد'}</span>
                <span className="shrink-0 text-slate-500">بالطريق {numberFormat.format(project.inTransit)} · الرصيد {numberFormat.format(project.balance)}</span>
              </div>
            ))}
          </article>
        ))}
        {!reportRows.length && !loading && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">لا توجد أرصدة لعرضها.</p>}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[720px] text-right text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr><th className="p-3">كود SAP</th><th className="p-3">الصنف</th><th className="p-3">رصيد 9004</th><th className="p-3">حركة المشروع</th><th className="p-3">الرصيد</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reportRows.map(row => (
              <React.Fragment key={row.key}>
                <tr>
                  <td className="p-3 font-mono text-xs" dir="ltr">{row.code || 'غير مسجل'}</td>
                  <td className="p-3 font-bold">{row.name}</td>
                  <td className="p-3">{numberFormat.format(row.central)}</td>
                  <td className="p-3 text-xs text-slate-500">{row.projects.size ? [...row.projects.keys()].join('، ') : '—'}</td>
                  <td className="p-3">{[...row.projects.values()].reduce((sum, project) => sum + project.balance, 0)}</td>
                </tr>
                {[...row.projects.entries()].map(([projectName, project]) => (
                  <tr key={`${row.key}:${projectName}`} className="bg-slate-50/60 text-xs">
                    <td className="p-2"></td><td className="p-2 text-slate-600">{projectName || 'مشروع غير محدد'}</td>
                    <td className="p-2">بالطريق: {numberFormat.format(project.inTransit)}</td><td className="p-2">رصيد المشروع</td>
                    <td className="p-2 font-bold">{numberFormat.format(project.balance)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 bg-slate-50 p-4">
          <h3 className="font-black text-slate-900">حدود التنبيه وتسوية الجرد الفعلي</h3>
          <p className="mt-1 text-xs text-slate-500">حدد حداً أدنى مستقلاً لكل صنف وموقع. التسوية لا تعدّل الرصيد مباشرة؛ تسجل حركة زيادة أو عجز باسم المستخدم وسببها.</p>
        </header>
        {canManage ? (
          <div className="grid gap-5 p-4 xl:grid-cols-2">
            <form onSubmit={event => void saveThreshold(event)} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-black text-slate-800">إعداد حد إعادة الطلب</h4>
              <label className="block text-xs font-bold text-slate-600">الصنف وموقع التخزين
                <select value={selectedLocationKey} onChange={event => chooseStockLocation(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value="">اختر الصنف والمخزن/المشروع</option>
                  {stockLocations.map(location => (
                    <option key={location.key} value={location.key}>
                      {location.item_name} · {location.sap_material_code || location.stock_key} · {location.location_type === 'central' ? '9004' : location.project_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-600">الحد الأدنى للكمية
                <input type="number" min="0" step="1" required value={minimumQuantity} onChange={event => setMinimumQuantity(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </label>
              {selectedStockLocation && <p className="text-xs text-slate-600">الرصيد الحالي: {numberFormat.format(selectedLocationBalance)}{selectedLocationThreshold ? ` · الحد المحفوظ: ${numberFormat.format(selectedLocationThreshold.minimum_quantity)}` : ''}</p>}
              <button type="submit" disabled={loading || !selectedStockLocation} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">حفظ الحد</button>
            </form>
            <form onSubmit={event => void submitReconciliation(event)} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <h4 className="text-sm font-black text-slate-800">تسجيل جرد فعلي وتسوية موثقة</h4>
              <p className="text-xs text-slate-600">الرصيد الحالي للموقع المختار: <strong>{numberFormat.format(selectedLocationBalance)}</strong></p>
              <label className="block text-xs font-bold text-slate-600">الكمية التي تم عدّها فعلياً
                <input type="number" min="0" step="1" required value={countedQuantity} onChange={event => setCountedQuantity(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="block text-xs font-bold text-slate-600">سبب الفرق / مرجع محضر الجرد
                <textarea value={reconciliationNotes} onChange={event => setReconciliationNotes(event.target.value)} rows={2} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
              </label>
              <button type="submit" disabled={loading || !selectedStockLocation} className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">تسجيل التسوية</button>
            </form>
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-600">إعداد الحدود وتسويات الجرد متاحان للمسؤول المخول فقط.</p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4">
          <div>
            <h3 className="font-black text-slate-900">سجل تدقيق حركات المخزون</h3>
            <p className="mt-1 text-xs text-slate-500">بحث وتصفية حسب الحركة والمشروع والمنفذ والتاريخ، مع تصدير النتائج الظاهرة.</p>
          </div>
          <button
            type="button"
            onClick={exportAuditTrail}
            disabled={filteredMovements.length === 0}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> تصدير Excel ({numberFormat.format(filteredMovements.length)})
          </button>
        </header>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative md:col-span-2">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث بالصنف، SAP، الإذن، المعدة أو المنفذ"
              className="w-full rounded-xl border border-slate-300 py-2 pe-9 ps-3 text-sm"
              aria-label="البحث في سجل حركات المخزون"
            />
          </label>
          <select value={movementType} onChange={event => setMovementType(event.target.value as InventoryMovement['movement_type'] | 'all')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" aria-label="تصفية حسب نوع الحركة">
            <option value="all">كل أنواع الحركات</option>
            {Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={project} onChange={event => setProject(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" aria-label="تصفية حسب المشروع">
            <option value="all">كل المشروعات</option>
            {projects.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={actor} onChange={event => setActor(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" aria-label="تصفية حسب منفذ الحركة">
            <option value="all">كل المنفذين</option>
            {actors.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
          </select>
          <label className="text-xs text-slate-600">
            من تاريخ
            <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-600">
            إلى تاريخ
            <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <p className="self-end pb-2 text-xs font-bold text-slate-600">
            المعروض {numberFormat.format(filteredMovements.length)} من {numberFormat.format(movements.length)} حركة
          </p>
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <div className="space-y-3 p-3 lg:hidden">
            {filteredMovements.map(movement => (
              <article key={movement.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{movement.item_name}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-slate-500" dir="ltr">{movement.sap_material_code || movement.stock_key}</p>
                    <p className="mt-1 text-[11px] text-blue-800">
                      المطلوب: {movement.requested_filter_no || '—'} · المورد: {movement.supplier_part_number || '—'}
                      {movement.supplier_brand ? ` · ${movement.supplier_brand}` : ''}
                    </p>
                    {movement.supplier_sap_code && (
                      <p className="font-mono text-[11px] text-slate-500" dir="ltr">SAP المورد: {movement.supplier_sap_code}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-800">{movementLabels[movement.movement_type]}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-slate-500">التاريخ</dt><dd className="mt-0.5 text-slate-800">{dateLabel(movement.created_at)}</dd></div>
                  <div><dt className="text-slate-500">الكمية / السعر</dt><dd className="mt-0.5 text-slate-800">{numberFormat.format(movement.quantity)} · {moneyFormat.format(movement.unit_price)}</dd></div>
                  <div><dt className="text-slate-500">المشروع</dt><dd className="mt-0.5 break-words text-slate-800">{movement.project_name || 'المخزن المركزي 9004'}</dd></div>
                  <div><dt className="text-slate-500">المعدة / الصيانة</dt><dd className="mt-0.5 break-words text-slate-800">{movement.equipment_code || '—'}{movement.maintenance_cycle ? ` · ${movement.maintenance_cycle}` : ''}{movement.maintenance_counter !== null ? ` · ${movement.maintenance_counter}` : ''}</dd></div>
                  <div><dt className="text-slate-500">أمر الشراء / الإذن</dt><dd className="mt-0.5 break-words text-slate-800">{movement.po_number} · {movement.voucher_no || 'بدون إذن'}</dd></div>
                  <div><dt className="text-slate-500">المنفذ</dt><dd className="mt-0.5 break-words text-slate-800">{movement.actor_name || '—'}</dd></div>
                  {movement.notes && <div className="col-span-2"><dt className="text-slate-500">ملاحظات</dt><dd className="mt-0.5 break-words text-slate-800">{movement.notes}</dd></div>}
                </dl>
              </article>
            ))}
            {filteredMovements.length === 0 && <p className="p-4 text-center text-sm text-slate-500">لا توجد حركات مطابقة لمعايير البحث.</p>}
          </div>
          <div className="hidden lg:block">
          <table className="w-full min-w-[1450px] text-right text-xs">
            <thead className="sticky top-0 bg-white text-slate-500 shadow-sm"><tr>
              <th className="p-3">التاريخ والوقت</th><th className="p-3">نوع الحركة</th><th className="p-3">المشروع</th>
              <th className="p-3">الصنف / SAP</th><th className="p-3">الكمية</th><th className="p-3">سعر الوحدة</th>
              <th className="p-3">المعدة / الصيانة</th><th className="p-3">أمر الشراء / الإذن</th><th className="p-3">المنفذ / المعرف</th><th className="p-3">ملاحظات</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.map(movement => (
                <tr key={movement.id}>
                  <td className="whitespace-nowrap p-3">{dateLabel(movement.created_at)}</td>
                  <td className="p-3 font-bold">{movementLabels[movement.movement_type]}</td>
                  <td className="p-3">{movement.project_name || '—'}</td>
                  <td className="p-3">
                    <span className="font-bold">{movement.item_name}</span><br />
                    <span className="font-mono text-slate-500" dir="ltr">SAP المطلوب: {movement.sap_material_code || '—'}</span><br />
                    <span className="text-blue-800">المطلوب: {movement.requested_filter_no || '—'} · المورد: {movement.supplier_part_number || '—'}{movement.supplier_brand ? ` · ${movement.supplier_brand}` : ''}</span><br />
                    <span className="font-mono text-slate-500" dir="ltr">SAP المورد: {movement.supplier_sap_code || '—'}</span>
                  </td>
                  <td className="p-3">{numberFormat.format(movement.quantity)}</td>
                  <td className="p-3">{moneyFormat.format(movement.unit_price)}</td>
                  <td className="p-3">{movement.equipment_code || '—'}{movement.maintenance_counter !== null ? ` · ${movement.maintenance_counter}` : ''}{movement.maintenance_cycle ? ` · ${movement.maintenance_cycle}` : ''}</td>
                  <td className="p-3">{movement.po_number}<br /><span className="text-slate-500">{movement.voucher_no || 'بدون إذن'}</span></td>
                  <td className="p-3">{movement.actor_name || '—'}<br /><span className="font-mono text-slate-500" dir="ltr">{movement.actor_user_id}</span></td>
                  <td className="max-w-64 whitespace-normal p-3">{movement.notes || '—'}</td>
                </tr>
              ))}
              {filteredMovements.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-500">لا توجد حركات مطابقة لمعايير البحث.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 p-4">
          <ArrowUpFromLine className="h-4 w-4 text-blue-700" />
          <h3 className="font-black text-slate-900">تفاصيل الفلاتر المصروفة للمعدات</h3>
          <span className="text-xs text-slate-500">({equipmentIssues.length})</span>
        </header>
        <div className="space-y-3 p-3 lg:hidden">
          {equipmentIssues.map(movement => (
            <article key={movement.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-bold text-slate-900">{movement.item_name}</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-500" dir="ltr">SAP: {movement.sap_material_code || '—'} · {movement.equipment_code || 'كود المعدة غير مسجل'}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-slate-500">المشروع</dt><dd>{movement.project_name || '—'}</dd></div>
                <div><dt className="text-slate-500">الكمية / السعر</dt><dd>{numberFormat.format(movement.quantity)} · {moneyFormat.format(movement.unit_price)}</dd></div>
                <div><dt className="text-slate-500">العداد / بند الصيانة</dt><dd>{movement.maintenance_counter ?? '—'} · {movement.maintenance_cycle || '—'}</dd></div>
                <div><dt className="text-slate-500">أمر الشراء / الإذن</dt><dd className="break-words">{movement.po_number} · {movement.voucher_no || '—'}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">التاريخ / سجل الصرف</dt><dd>{dateLabel(movement.created_at)} · {movement.actor_name || '—'}</dd></div>
              </dl>
            </article>
          ))}
          {equipmentIssues.length === 0 && <p className="text-sm text-slate-500">لا توجد حركات صرف للمعدات.</p>}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1050px] text-right text-xs">
            <thead className="bg-white text-slate-500"><tr>
              <th className="p-3">التاريخ</th><th className="p-3">المشروع</th><th className="p-3">كود المعدة</th>
              <th className="p-3">اسم الفلتر</th><th className="p-3">كود SAP</th><th className="p-3">الكمية</th>
              <th className="p-3">سعر الوحدة</th><th className="p-3">العداد</th><th className="p-3">بند الصيانة</th>
              <th className="p-3">أمر الشراء / إذن</th><th className="p-3">سجل الصرف</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {equipmentIssues.map(movement => (
                <tr key={movement.id}>
                  <td className="p-3">{dateLabel(movement.created_at)}</td><td className="p-3">{movement.project_name}</td>
                  <td className="p-3 font-mono" dir="ltr">{movement.equipment_code}</td><td className="p-3 font-bold">{movement.item_name}</td>
                  <td className="p-3 font-mono" dir="ltr">{movement.sap_material_code}</td><td className="p-3">{numberFormat.format(movement.quantity)}</td>
                  <td className="p-3">{moneyFormat.format(movement.unit_price)}</td><td className="p-3">{movement.maintenance_counter ?? '—'}</td>
                  <td className="p-3">{movement.maintenance_cycle || '—'}</td><td className="p-3">{movement.po_number} · {movement.voucher_no || '—'}</td>
                  <td className="p-3">{movement.actor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};
