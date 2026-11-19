import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAwardGroups, reconcileAwardGroupsWithOrders } from './awardReport';
import { PurchaseOrder, RfqSession } from '../types/procurement';

const session = {
  code: 'RFQ-TEST',
  title: 'اختبار',
  created_at: '',
  status: 'open',
  items: [
    {
      id: 'item-1',
      item_no: 1,
      primary_number: 'F-1',
      mat_code: 'MAT-1',
      filter_type: 'فلتر زيت',
      qty_needed: 10,
      alt_numbers: [],
      projects: ['مشروع أ (6)', 'مشروع ب (4)'],
      equip_code: ''
    }
  ],
  submissions: [
    {
      supplier_name: 'مورد أ',
      contact: '',
      submitted_at: '',
      offers: {
        'item-1': [
          { id: 'o1', category: 'أصلي', alt_no: 'A-1', brand_name: 'Brand A', sap_code: 'SAP-A', unit_price: 100, qty_avail: 4 },
          { id: 'o2', category: 'أصلي', alt_no: 'A-2', unit_price: 120, brand_name: 'Brand A', qty_avail: 6 }
        ]
      }
    },
    {
      supplier_name: 'مورد ب',
      contact: '',
      submitted_at: '',
      offers: {
        'item-1': [
          { id: 'o3', category: 'أصلي', alt_no: 'B-1', sap_code: 'SAP-B', unit_price: 110, qty_avail: 10 }
        ]
      }
    }
  ],
  sap_prices: {}
} as unknown as RfqSession;

test('buildAwardGroups splits quantities by lowest price then availability', () => {
  const groups = buildAwardGroups(session, { 'item-1': 'أصلي' });
  assert.equal(groups.length, 2);
  const first = groups.find(group => group.supplier === 'مورد أ')!;
  const second = groups.find(group => group.supplier === 'مورد ب')!;
  assert.equal(first.items[0].qty, 4);
  assert.equal(second.items[0].qty, 6);
  assert.equal(first.items[0].source_rfq_item_id, 'item-1');
  assert.equal(first.items[0].sap_code, 'SAP-A');
  assert.equal(first.items[0].supplier_brand, 'Brand A');
  assert.deepEqual(first.items[0].award_project_allocations, [{ project: 'مشروع أ', qty: 4 }]);
  assert.deepEqual(first.items[0].project_allocations, []);
  assert.equal(first.total + second.total, 4 * 100 + 6 * 110);
});

test('reconciliation keeps PO identity and receiving history while updating the report values', () => {
  const existing: PurchaseOrder[] = [
    {
      id: 'po-1',
      po_number: 'PO-202610-001',
      rfq_code: 'RFQ-TEST',
      title: 'أمر قديم',
      supplier: 'مورد أ',
      total_value: 999,
      currency: 'EGP',
      status: 'awarded',
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
      notes: '',
      items: [
        {
          source_rfq_item_id: 'item-1',
          filter_no: 'OLD-A',
          desc: 'F-1',
          mat_code: 'MAT-1',
          qty: 4,
          unit_price: 900,
          category: 'أصلي',
          total: 3600,
          received_qty: 2,
          received_supplier_part_number: 'RECEIVED-A',
          received_supplier_brand: 'Brand A',
          received_supplier_sap_code: 'SAP-RECEIVED-A',
          received_supplier_identity_confirmed: true,
          dispatches: []
        }
      ],
      events: []
    }
  ];

  const groups = buildAwardGroups(session, { 'item-1': 'أصلي' });
  const result = reconcileAwardGroupsWithOrders({
    existingOrders: existing,
    rfqCode: 'RFQ-TEST',
    groups
  });

  const updated = result.orders.find(order => order.supplier === 'مورد أ')!;
  const created = result.orders.find(order => order.supplier === 'مورد ب')!;

  assert.equal(updated.id, 'po-1');
  assert.equal(updated.po_number, 'PO-202610-001');
  assert.equal(updated.items[0].received_qty, 2);
  assert.equal(updated.items[0].qty, 4);
  assert.equal(updated.items[0].unit_price, 100);
  assert.equal(updated.items[0].received_supplier_part_number, 'RECEIVED-A');
  assert.equal(updated.items[0].received_supplier_brand, 'Brand A');
  assert.equal(updated.items[0].received_supplier_sap_code, 'SAP-RECEIVED-A');
  assert.equal(updated.total_value, 400);
  assert.equal(created.status, 'awarded');
  assert.notEqual(created.po_number, updated.po_number);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
});

test('reconciliation keeps inventory item positions stable when the report reorders or drops items', () => {
  const existing: PurchaseOrder[] = [
    {
      id: 'po-active',
      po_number: 'PO-202610-777',
      rfq_code: 'RFQ-TEST',
      title: 'أمر به استلام',
      supplier: 'مورد أ',
      total_value: 900,
      currency: 'EGP',
      status: 'po_issued',
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
      notes: '',
      items: [
        {
          source_rfq_item_id: 'item-1',
          filter_no: 'A-1',
          desc: 'F-1',
          mat_code: 'MAT-1',
          qty: 4,
          unit_price: 900,
          category: 'أصلي',
          total: 3600,
          received_qty: 2
        },
        {
          filter_no: 'A-OLD',
          mat_code: 'MAT-OLD',
          qty: 5,
          unit_price: 10,
          category: 'أصلي',
          total: 50
        },
        {
          filter_no: 'A-3',
          mat_code: 'MAT-3',
          qty: 3,
          unit_price: 50,
          category: 'أصلي',
          total: 150,
          received_qty: 1,
          dispatches: [
            {
              id: 'd-1',
              project: 'مشروع أ',
              qty: 1,
              dispatched_at: '2026-10-02',
              voucher_no: 'V-1',
              notes: ''
            }
          ]
        }
      ],
      events: []
    }
  ];

  const groups = [
    {
      supplier: 'مورد أ',
      items: [
        {
          source_rfq_item_id: 'item-3',
          filter_no: 'A-3',
          desc: 'F-3',
          mat_code: 'MAT-3',
          qty: 3,
          unit_price: 70,
          category: 'أصلي' as const,
          total: 210
        },
        {
          source_rfq_item_id: 'item-1',
          filter_no: 'A-1',
          desc: 'F-1',
          mat_code: 'MAT-1',
          qty: 4,
          unit_price: 100,
          category: 'أصلي' as const,
          total: 400
        },
        {
          filter_no: 'A-4',
          mat_code: 'MAT-4',
          qty: 2,
          unit_price: 20,
          category: 'أصلي' as const,
          total: 40
        }
      ],
      total: 650
    }
  ];

  const result = reconcileAwardGroupsWithOrders({
    existingOrders: existing,
    rfqCode: 'RFQ-TEST',
    groups
  });

  const order = result.orders.find(current => current.id === 'po-active')!;
  assert.equal(order.po_number, 'PO-202610-777');
  assert.equal(order.items.length, 4);

  assert.equal(order.items[0].mat_code, 'MAT-1');
  assert.equal(order.items[0].received_qty, 2);
  assert.equal(order.items[0].unit_price, 100);

  assert.equal(order.items[1].mat_code, 'MAT-OLD');
  assert.equal(order.items[1].qty, 0);
  assert.equal(order.items[1].total, 0);

  assert.equal(order.items[2].mat_code, 'MAT-3');
  assert.equal(order.items[2].received_qty, 1);
  assert.equal(order.items[2].dispatches?.[0].id, 'd-1');
  assert.equal(order.items[2].unit_price, 70);

  assert.equal(order.items[3].mat_code, 'MAT-4');
  assert.equal(order.total_value, 400 + 210 + 40);
});

