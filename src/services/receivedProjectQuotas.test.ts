import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateReceivedProjectQuotas } from './receivedProjectQuotas';

describe('received stock project quotas', () => {
  it('allocates each receipt delta proportionally to the remaining awarded demand', () => {
    const awarded = [
      { project: 'مشروع أ', qty: 6 },
      { project: 'مشروع ب', qty: 4 }
    ];

    const firstReceipt = allocateReceivedProjectQuotas(awarded, [], 5);
    assert.deepEqual(firstReceipt, [
      { project: 'مشروع أ', qty: 3 },
      { project: 'مشروع ب', qty: 2 }
    ]);

    assert.deepEqual(allocateReceivedProjectQuotas(awarded, firstReceipt, 5), [
      { project: 'مشروع أ', qty: 6 },
      { project: 'مشروع ب', qty: 4 }
    ]);
  });

  it('breaks equal fractional shares in the original project order', () => {
    assert.deepEqual(allocateReceivedProjectQuotas([
      { project: 'مشروع أ', qty: 1 },
      { project: 'مشروع ب', qty: 1 }
    ], [], 1), [{ project: 'مشروع أ', qty: 1 }]);
  });

  it('caps allocations at awarded project quotas and preserves prior dispatches', () => {
    assert.deepEqual(allocateReceivedProjectQuotas([
      { project: 'مشروع أ', qty: 2 },
      { project: 'مشروع ب', qty: 3 }
    ], [{ project: 'مشروع أ', qty: 2 }], 8), [
      { project: 'مشروع أ', qty: 2 },
      { project: 'مشروع ب', qty: 3 }
    ]);
  });

  it('rejects invalid receipt deltas', () => {
    assert.throws(() => allocateReceivedProjectQuotas([], [], -1), RangeError);
    assert.throws(() => allocateReceivedProjectQuotas([], [], 1.5), RangeError);
  });
});
