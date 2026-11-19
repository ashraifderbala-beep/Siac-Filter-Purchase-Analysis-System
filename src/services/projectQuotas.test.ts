import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateProjectQuotas, hydrateLegacyProjectQuotas } from './projectQuotas';

describe('project quota allocation', () => {
  it('distributes an awarded item quantity by project demand without losing units', () => {
    assert.deepEqual(
      allocateProjectQuotas(['مشروع أ (3)', 'مشروع ب (1)'], [3]),
      [[{ project: 'مشروع أ', qty: 2 }, { project: 'مشروع ب', qty: 1 }]]
    );
  });

  it('breaks equal remainders in the source project order', () => {
    assert.deepEqual(
      allocateProjectQuotas(['مشروع أ (1)', 'مشروع ب (1)', 'مشروع ج (1)'], [2]),
      [[{ project: 'مشروع أ', qty: 1 }, { project: 'مشروع ب', qty: 1 }]]
    );
  });

  it('splits each supplier award while preserving exact total project quotas', () => {
    const result = allocateProjectQuotas(
      ['مشروع أ (1)', 'مشروع ب (1)'],
      [1, 1]
    );
    assert.deepEqual(result, [
      [{ project: 'مشروع أ', qty: 1 }],
      [{ project: 'مشروع ب', qty: 1 }]
    ]);
  });

  it('combines repeated source lines for the same project', () => {
    assert.deepEqual(
      allocateProjectQuotas(['مشروع أ (1)', 'مشروع أ (1)', 'مشروع ب (2)'], [2]),
      [[{ project: 'مشروع أ', qty: 1 }, { project: 'مشروع ب', qty: 1 }]]
    );
  });

  it('does not invent allocations for labels without a numeric project quantity', () => {
    assert.deepEqual(allocateProjectQuotas(['طلب يدوي'], [8]), [[]]);
  });

  it('reconstructs legacy order quotas from the source RFQ across supplier orders', () => {
    const sourceItem = {
      id: 'source-item',
      mat_code: 'M-1',
      filter_type: 'فلتر',
      primary_number: 'فلتر 1',
      alt_numbers: [],
      qty_needed: 2,
      projects: ['مشروع أ (1)', 'مشروع ب (1)']
    };
    const orders = ['po-b', 'po-a'].map(id => ({
      id,
      po_number: id,
      rfq_code: 'rfq-a',
      title: id,
      supplier: 'مورد',
      total_value: 0,
      currency: 'EGP',
      status: 'awarded' as const,
      created_at: '',
      updated_at: '',
      notes: '',
      events: [],
      items: [{
        filter_no: 'فلتر 1',
        desc: 'فلتر 1',
        mat_code: 'M-1',
        qty: 1,
        unit_price: 1,
        category: 'أصلي' as const,
        total: 1
      }]
    }));
    const hydrated = hydrateLegacyProjectQuotas([{
      code: 'rfq-a',
      title: 'طلب',
      created_at: '',
      is_active: true,
      items: [sourceItem],
      sap_prices: {},
      submissions: []
    }], orders);

    const allocationsByOrderId = new Map(
      hydrated.map(order => [order.id, order.items[0].award_project_allocations])
    );
    assert.deepEqual(allocationsByOrderId.get('po-a'), [{ project: 'مشروع أ', qty: 1 }]);
    assert.deepEqual(allocationsByOrderId.get('po-b'), [{ project: 'مشروع ب', qty: 1 }]);
    assert.deepEqual(hydrated.map(order => order.items[0].project_allocations), [[], []]);
  });

  it('hydrates fair received quotas from the received quantity, not the full PO amount', () => {
    const hydrated = hydrateLegacyProjectQuotas([{
      code: 'rfq-a',
      title: 'طلب',
      created_at: '',
      is_active: true,
      items: [{
        id: 'source-item',
        mat_code: 'M-1',
        filter_type: 'فلتر',
        primary_number: 'فلتر 1',
        alt_numbers: [],
        qty_needed: 10,
        projects: ['مشروع أ (6)', 'مشروع ب (4)']
      }],
      sap_prices: {},
      submissions: []
    }], [{
      id: 'po-partial',
      po_number: 'po-partial',
      rfq_code: 'rfq-a',
      title: 'أمر جزئي',
      supplier: 'مورد',
      total_value: 0,
      currency: 'EGP',
      status: 'awarded',
      created_at: '',
      updated_at: '',
      notes: '',
      events: [],
      items: [{
        filter_no: 'ALT-1',
        desc: 'فلتر 1',
        mat_code: 'M-1',
        qty: 10,
        received_qty: 5,
        unit_price: 1,
        category: 'أصلي',
        total: 10
      }]
    }]);

    assert.deepEqual(hydrated[0].items[0].award_project_allocations, [
      { project: 'مشروع أ', qty: 6 },
      { project: 'مشروع ب', qty: 4 }
    ]);
    assert.deepEqual(hydrated[0].items[0].project_allocations, [
      { project: 'مشروع أ', qty: 3 },
      { project: 'مشروع ب', qty: 2 }
    ]);
  });
});
