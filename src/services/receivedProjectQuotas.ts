import { ProjectQuota } from '../types/procurement';

export function allocateReceivedProjectQuotas(
  awarded: readonly ProjectQuota[],
  current: readonly ProjectQuota[],
  newlyReceived: number
): ProjectQuota[] {
  if (!Number.isInteger(newlyReceived) || newlyReceived < 0) {
    throw new RangeError('كمية الاستلام الجديدة يجب أن تكون عددًا صحيحًا غير سالب.');
  }

  const awardedByProject = new Map<string, { qty: number; order: number }>();
  awarded.forEach((allocation, order) => {
    const project = allocation.project.trim();
    if (!project || !Number.isInteger(allocation.qty) || allocation.qty < 0) return;
    const previous = awardedByProject.get(project);
    awardedByProject.set(project, {
      qty: (previous?.qty || 0) + allocation.qty,
      order: previous?.order ?? order
    });
  });

  const currentByProject = new Map<string, number>();
  current.forEach(allocation => {
    const project = allocation.project.trim();
    if (!project || !Number.isInteger(allocation.qty) || allocation.qty <= 0) return;
    currentByProject.set(project, (currentByProject.get(project) || 0) + allocation.qty);
  });

  const rows = [...awardedByProject.entries()].map(([project, quota]) => {
    const allocated = currentByProject.get(project) || 0;
    const remaining = Math.max(0, quota.qty - allocated);
    return {
      project,
      order: quota.order,
      allocated,
      remaining,
      add: 0,
      remainder: 0
    };
  });
  const remainingCapacity = rows.reduce((sum, row) => sum + row.remaining, 0);
  const amountToAllocate = Math.min(newlyReceived, remainingCapacity);
  if (amountToAllocate > 0 && remainingCapacity > 0) {
    let allocatedWholeUnits = 0;
    rows.forEach(row => {
      const exactShare = amountToAllocate * row.remaining / remainingCapacity;
      row.add = Math.floor(exactShare);
      row.remainder = exactShare - row.add;
      allocatedWholeUnits += row.add;
    });

    const remainderOrder = [...rows].sort((left, right) =>
      right.remainder - left.remainder || left.order - right.order
    );
    for (let index = 0; index < amountToAllocate - allocatedWholeUnits; index += 1) {
      remainderOrder[index].add += 1;
    }
  }

  return rows
    .map(row => ({ project: row.project, qty: row.allocated + row.add }))
    .filter(allocation => allocation.qty > 0)
    .concat(
      [...currentByProject.entries()]
        .filter(([project]) => !awardedByProject.has(project))
        .map(([project, qty]) => ({ project, qty }))
    );
}
