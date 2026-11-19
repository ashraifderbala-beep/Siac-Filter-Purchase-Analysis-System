import {
  AwardCriteria,
  ManualAwardSelection,
  POStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  RfqSession
} from '../types/procurement';
import { allocateOfferQuantities, AwardOffer } from './awardAllocator';
import { allocateProjectQuotas } from './projectQuotas';
import { sumPurchaseOrderItems } from './purchaseOrderTotals';

export interface AwardGroup {
  supplier: string;
  items: PurchaseOrderItem[];
  total: number;
}

export interface ReconciliationResult {
  orders: PurchaseOrder[];
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  keptForHistory: string[];
}

const normalizeKey = (value?: string) => (value || '').trim().toLocaleLowerCase();

const itemKey = (item: PurchaseOrderItem) =>
  normalizeKey(item.source_rfq_item_id)
    || normalizeKey(item.mat_code) || normalizeKey(item.filter_no) || normalizeKey(item.desc);

const legacyItemKey = (item: PurchaseOrderItem) =>
  normalizeKey(item.mat_code) || normalizeKey(item.filter_no) || normalizeKey(item.desc);

const itemHasInventoryActivity = (item: PurchaseOrderItem) =>
  (item.received_qty || 0) > 0 || (item.dispatches?.length || 0) > 0;

const orderHasInventoryActivity = (order: PurchaseOrder) =>
  (order.items || []).some(itemHasInventoryActivity);

const ADVANCED_STATUSES: POStatus[] = ['sent', 'po_issued', 'delivered', 'closed'];

export function buildAwardGroups(
  session: RfqSession,
  categorySelection: Record<string, AwardCriteria>,
  manualAwards?: Record<string, ManualAwardSelection>
): AwardGroup[] {
  const groups = new Map<string, AwardGroup>();

  const sortedItems = [...(session.items || [])].sort((left, right) => {
    const leftNo = typeof left.item_no === 'number' ? left.item_no : parseInt(String(left.item_no || ''), 10);
    const rightNo = typeof right.item_no === 'number' ? right.item_no : parseInt(String(right.item_no || ''), 10);
    return (Number.isFinite(leftNo) ? leftNo : 0) - (Number.isFinite(rightNo) ? rightNo : 0);
  });

  sortedItems.forEach(item => {
    const chosenCriteria = categorySelection[item.id] || 'best_overall';
    const allOffers: AwardOffer[] = [];

    (session.submissions || []).forEach(submission => {
      const itemOffers = submission.offers[item.id] || submission.offers[`item-${item.item_no}`] || [];
      itemOffers.forEach(offer => {
        if (!Number.isFinite(offer.unit_price) || offer.unit_price <= 0) return;
        allOffers.push({
          supplier: submission.supplier_name,
          category: offer.category,
          unit_price: offer.unit_price,
          alt_no: offer.alt_no,
          qty_avail: offer.qty_avail,
          notes: offer.notes,
          sap_code: offer.sap_code,
          brand_name: offer.brand_name
        });
      });
    });

    const manualSelection = (manualAwards && manualAwards[item.id]) || session.manual_awards?.[item.id];
    const allocations = allocateOfferQuantities(
      item.qty_needed,
      allOffers,
      chosenCriteria,
      manualSelection
    );
    if (allocations.length === 0) return;

    const projectQuotas = allocateProjectQuotas(
      item.projects,
      allocations.map(allocation => allocation.qty)
    );

    allocations.forEach((allocation, allocationIndex) => {
      const key = normalizeKey(allocation.supplier);
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, { supplier: allocation.supplier, items: [], total: 0 });
      }
      const group = groups.get(key)!;
      const notes = allocation.isManual
        ? `${allocation.notes ? `${allocation.notes} | ` : ''}ترسية معتمدة بالماركة (${allocation.brand || allocation.alt_no || allocation.category})`
        : allocation.notes;

      group.items.push({
        source_rfq_item_id: item.id,
        filter_no: allocation.alt_no || item.primary_number,
        desc: item.primary_number,
        mat_code: item.mat_code,
        sap_code: allocation.sap_code,
        supplier_brand: allocation.brand_name || allocation.brand || undefined,
        filter_type: item.filter_type || 'فلتر',
        qty: allocation.qty,
        project_allocations: [],
        award_project_allocations: projectQuotas[allocationIndex],
        unit_price: allocation.unit_price,
        category: allocation.category,
        total: allocation.total,
        notes,
        received_qty: 0
      });
      group.total += allocation.total;
    });
  });

  return Array.from(groups.values());
}

function nextPoNumberFactory(existingOrders: PurchaseOrder[], now: Date) {
  const prefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const usedNumbers = new Set(existingOrders.map(order => order.po_number));
  const maxSequence = existingOrders.reduce((max, order) => {
    const match = order.po_number.match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  let sequence = maxSequence;
  return () => {
    let candidate = '';
    do {
      sequence += 1;
      candidate = `${prefix}${String(sequence).padStart(3, '0')}`;
    } while (usedNumbers.has(candidate));
    usedNumbers.add(candidate);
    return candidate;
  };
}

export function reconcileAwardGroupsWithOrders(params: {
  existingOrders: PurchaseOrder[];
  rfqCode: string;
  groups: AwardGroup[];
  ownership?: Partial<PurchaseOrder>;
  now?: Date;
}): ReconciliationResult {
  const now = params.now || new Date();
  const nowLabel = now.toLocaleString('ar-EG');
  const nextPoNumber = nextPoNumberFactory(params.existingOrders, now);
  const usedIds = new Set(params.existingOrders.map(order => order.id));
  let generatedIdCounter = 0;

  const createId = () => {
    let id = '';
    do {
      generatedIdCounter += 1;
      id = `po-${now.getTime()}-${generatedIdCounter}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };

  const rfqOrders = params.existingOrders.filter(order => order.rfq_code === params.rfqCode);
  const untouchedOrders = params.existingOrders.filter(order => order.rfq_code !== params.rfqCode);

  const ordersBySupplier = new Map<string, PurchaseOrder>();
  const surplusRfqOrders: PurchaseOrder[] = [];

  rfqOrders.forEach(order => {
    if (order.status === 'cancelled') {
      surplusRfqOrders.push(order);
      return;
    }
    const key = normalizeKey(order.supplier);
    if (!ordersBySupplier.has(key)) ordersBySupplier.set(key, order);
    else surplusRfqOrders.push(order);
  });

  const resultOrders: PurchaseOrder[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const keptForHistory: string[] = [];
  const matchedKeys = new Set<string>();

  params.groups.forEach(group => {
    const key = normalizeKey(group.supplier);
    matchedKeys.add(key);
    const existing = ordersBySupplier.get(key);

    if (existing) {
      const oldItems = existing.items || [];
      const existingHasActivity = orderHasInventoryActivity(existing);
      let mergedItems: PurchaseOrderItem[];

      if (!existingHasActivity) {
        // Nothing depends on item positions yet, so rebuild the PO from the report.
        mergedItems = group.items.map(item => ({ ...item }));
      } else {
        // Inventory movements reference items by their array index. Keep every
        // existing item in its original slot and append new report items at the
        // end so receiving/dispatch history never points at the wrong item.
        const remainingNewItems = [...group.items];
        const takeNewItem = (oldItem: PurchaseOrderItem) => {
          const oldSourceId = normalizeKey(oldItem.source_rfq_item_id);
          const matchIndex = remainingNewItems.findIndex(newItem =>
            oldSourceId
              ? normalizeKey(newItem.source_rfq_item_id) === oldSourceId
              : legacyItemKey(newItem) === legacyItemKey(oldItem)
          );
          return matchIndex < 0 ? undefined : remainingNewItems.splice(matchIndex, 1)[0];
        };

        let retainedActiveItems = 0;
        mergedItems = oldItems.map(oldItem => {
          const newItem = takeNewItem(oldItem);
          if (newItem) {
            return {
              ...newItem,
              received_qty: oldItem.received_qty ?? newItem.received_qty,
              delivery_voucher: oldItem.delivery_voucher,
              receiving_notes: oldItem.receiving_notes,
              received_at: oldItem.received_at,
              received_supplier_part_number: oldItem.received_supplier_part_number,
              received_supplier_brand: oldItem.received_supplier_brand,
              received_supplier_sap_code: oldItem.received_supplier_sap_code,
              dispatches: oldItem.dispatches?.length ? oldItem.dispatches : newItem.dispatches,
              award_project_allocations: Array.isArray(newItem.award_project_allocations)
                ? newItem.award_project_allocations
                : oldItem.award_project_allocations || oldItem.project_allocations,
              project_allocations: itemHasInventoryActivity(oldItem)
                ? oldItem.project_allocations
                : Array.isArray(newItem.project_allocations)
                  ? newItem.project_allocations
                  : oldItem.project_allocations
            };
          }
          if (itemHasInventoryActivity(oldItem)) {
            retainedActiveItems += 1;
            return oldItem;
          }
          // Keep the slot so later active items keep their index, but remove the
          // value of an item that the current award report no longer includes.
          return {
            ...oldItem,
            qty: 0,
            total: 0,
            project_allocations: [],
            notes: oldItem.notes
              ? `${oldItem.notes} — غير مُرسّى في تقرير الترسية الحالي`
              : 'غير مُرسّى في تقرير الترسية الحالي'
          };
        });

        if (retainedActiveItems > 0) {
          keptForHistory.push(
            `${group.supplier}: ${retainedActiveItems} بند مسجل عليه استلام/صرف تم الاحتفاظ به`
          );
        }

        mergedItems.push(...remainingNewItems);
      }

      const newTotal = sumPurchaseOrderItems(mergedItems);
      const itemsChanged = JSON.stringify(mergedItems) !== JSON.stringify(oldItems);
      const totalChanged = Math.abs((existing.total_value || 0) - newTotal) > 0.005;
      const status = existing.status === 'draft' ? 'awarded' : existing.status;
      const statusChanged = status !== existing.status;

      if (itemsChanged || totalChanged || statusChanged) {
        updated += 1;
        resultOrders.push({
          ...existing,
          items: mergedItems,
          total_value: newTotal,
          status,
          updated_at: nowLabel,
          events: [
            ...(existing.events || []),
            {
              id: `ev-${now.getTime()}-${updated}-report`,
              status,
              note: `تحديث أمر الشراء تلقائياً من تقرير الترسية المعتمد (${mergedItems.length} بند — ${newTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م)`,
              happened_at: nowLabel
            }
          ]
        });
      } else {
        unchanged += 1;
        resultOrders.push(existing);
      }
      return;
    }

    const newItems = group.items;
    const newTotal = sumPurchaseOrderItems(newItems);
    added += 1;
    resultOrders.push({
      id: createId(),
      po_number: nextPoNumber(),
      rfq_code: params.rfqCode,
      ...params.ownership,
      title: `أمر شراء ترسية ${params.rfqCode} — ${group.supplier}`,
      supplier: group.supplier,
      total_value: newTotal,
      currency: 'EGP',
      status: 'awarded',
      created_at: nowLabel,
      updated_at: nowLabel,
      notes: `ترسية شاملة لـ ${newItems.length} صنف فلاتر (توليد تلقائي من تقرير الترسية المعتمد)`,
      items: newItems,
      events: [
        {
          id: `ev-${now.getTime()}-${added}-draft`,
          status: 'draft',
          note: 'إنشاء أمر الشراء من تقرير الترسية',
          happened_at: nowLabel
        },
        {
          id: `ev-${now.getTime()}-${added}-awarded`,
          status: 'awarded',
          note: `اعتماد الترسية لـ ${group.supplier}`,
          happened_at: nowLabel
        }
      ]
    });
  });

  let removed = 0;
  [...ordersBySupplier.entries()].forEach(([key, order]) => {
    if (matchedKeys.has(key)) return;
    if (orderHasInventoryActivity(order) || ADVANCED_STATUSES.includes(order.status)) {
      resultOrders.push(order);
      keptForHistory.push(`${order.supplier}: أمر ${order.po_number} بحالة ${order.status} تم الاحتفاظ به`);
    } else {
      removed += 1;
    }
  });

  surplusRfqOrders.forEach(order => {
    if (order.status === 'cancelled') {
      resultOrders.push(order);
      return;
    }
    if (orderHasInventoryActivity(order) || ADVANCED_STATUSES.includes(order.status)) {
      resultOrders.push(order);
      keptForHistory.push(`${order.supplier}: أمر مكرر ${order.po_number} تم الاحتفاظ به`);
    } else {
      removed += 1;
    }
  });

  return {
    orders: [...resultOrders, ...untouchedOrders],
    added,
    updated,
    unchanged,
    removed,
    keptForHistory
  };
}
