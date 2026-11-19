import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AwardOffer, allocateOfferQuantities } from './awardAllocator';

const offer = (
  supplier: string,
  unit_price: number,
  qty_avail: number,
  category: AwardOffer['category'] = 'أصلي'
): AwardOffer => ({
  supplier,
  category,
  unit_price,
  qty_avail,
  alt_no: `${supplier}-filter`
});

describe('allocateOfferQuantities', () => {
  it('splits required quantity across suppliers by ascending price and capacity', () => {
    const allocations = allocateOfferQuantities(10, [
      offer('Supplier B', 12, 4),
      offer('Supplier A', 10, 3),
      offer('Supplier C', 15, 5)
    ], 'best_overall');

    assert.deepEqual(allocations.map(({ supplier, qty, total }) => ({ supplier, qty, total })), [
      { supplier: 'Supplier A', qty: 3, total: 30 },
      { supplier: 'Supplier B', qty: 4, total: 48 },
      { supplier: 'Supplier C', qty: 3, total: 45 }
    ]);
  });

  it('does not allocate beyond reported supplier availability', () => {
    const allocations = allocateOfferQuantities(8, [
      offer('Supplier A', 10, 2)
    ], 'best_overall');

    assert.equal(allocations.reduce((sum, allocation) => sum + allocation.qty, 0), 2);
  });

  it('does not award offers with no reported available quantity', () => {
    const allocations = allocateOfferQuantities(8, [
      offer('Supplier A', 10, 0)
    ], 'best_overall');

    assert.deepEqual(allocations, []);
  });

  it('uses only the cheapest eligible offer from each supplier', () => {
    const allocations = allocateOfferQuantities(10, [
      offer('Supplier A', 5, 3),
      offer('supplier a', 7, 10),
      offer('Supplier B', 6, 10)
    ], 'best_overall');

    assert.deepEqual(allocations.map(({ supplier, qty }) => ({ supplier, qty })), [
      { supplier: 'Supplier A', qty: 3 },
      { supplier: 'Supplier B', qty: 7 }
    ]);
  });

  it('respects the selected category', () => {
    const allocations = allocateOfferQuantities(5, [
      offer('Supplier A', 5, 5, 'أصلي'),
      offer('Supplier B', 8, 5, 'هاي كوبي')
    ], 'هاي كوبي');

    assert.deepEqual(allocations.map(({ supplier, qty }) => ({ supplier, qty })), [
      { supplier: 'Supplier B', qty: 5 }
    ]);
  });

  it('keeps a manual award as a full-quantity override', () => {
    const allocations = allocateOfferQuantities(5, [], 'best_overall', {
      supplier: 'Supplier A',
      category: 'أصلي',
      unit_price: 20,
      alt_no: 'A-100'
    });

    assert.deepEqual(allocations.map(({ supplier, qty, total, isManual }) => ({
      supplier,
      qty,
      total,
      isManual
    })), [
      { supplier: 'Supplier A', qty: 5, total: 100, isManual: true }
    ]);
  });

  it('preserves the supplier brand and SAP code on allocated offers', () => {
    const allocations = allocateOfferQuantities(2, [{
      ...offer('Supplier A', 10, 2),
      brand_name: 'Brand A',
      sap_code: 'SUP-100'
    }], 'best_overall');

    assert.equal(allocations[0].brand_name, 'Brand A');
    assert.equal(allocations[0].sap_code, 'SUP-100');
  });
});
