import { ProjectQuota, PurchaseOrder, RfqSession } from '../types/procurement';
import { allocateReceivedProjectQuotas } from './receivedProjectQuotas';

export function allocateProjectQuotas(
  projectLabels: string[] | undefined,
  awardQuantities: number[]
): ProjectQuota[][] {
  const projectDemand = new Map<string, { qty: number; order: number }>();
  (projectLabels || []).forEach((label, order) => {
    const match = label.trim().match(/^(.*)\s+\((\d+(?:\.\d+)?)\)$/);
    if (!match) return;
    const project = match[1].trim();
    const qty = Number(match[2]);
    if (!project || !Number.isFinite(qty) || qty <= 0) return;
    const existing = projectDemand.get(project);
    projectDemand.set(project, {
      qty: (existing?.qty || 0) + qty,
      order: existing?.order ?? order
    });
  });
  const projects = [...projectDemand.entries()].map(([project, demand]) => ({
    project,
    ...demand
  }));
  const quantities = awardQuantities.map(quantity =>
    Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
  );
  const totalAwarded = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const totalDemand = projects.reduce((sum, project) => sum + project.qty, 0);
  if (totalAwarded <= 0 || totalDemand <= 0 || totalAwarded > totalDemand) {
    return quantities.map(() => []);
  }

  const shares = projects.map(project => {
    const exact = totalAwarded * project.qty / totalDemand;
    return { ...project, qty: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = totalAwarded - shares.reduce((sum, share) => sum + share.qty, 0);
  const byRemainder = [...shares].sort((left, right) =>
    right.remainder - left.remainder || left.order - right.order
  );
  for (let index = 0; remaining > 0; index = (index + 1) % byRemainder.length) {
    byRemainder[index].qty += 1;
    remaining -= 1;
  }

  const quotasByAward = quantities.map(() => [] as ProjectQuota[]);
  let projectIndex = 0;
  let projectRemaining = shares[0]?.qty || 0;

  quantities.forEach((awardQuantity, awardIndex) => {
    let awardRemaining = awardQuantity;
    while (awardRemaining > 0 && projectIndex < shares.length) {
      if (projectRemaining === 0) {
        projectIndex += 1;
        projectRemaining = shares[projectIndex]?.qty || 0;
        continue;
      }
      const assigned = Math.min(awardRemaining, projectRemaining);
      const current = quotasByAward[awardIndex].find(
        allocation => allocation.project === shares[projectIndex].project
      );
      if (current) current.qty += assigned;
      else quotasByAward[awardIndex].push({
        project: shares[projectIndex].project,
        qty: assigned
      });
      awardRemaining -= assigned;
      projectRemaining -= assigned;
    }
  });

  return quotasByAward;
}

export function hydrateLegacyProjectQuotas(
  sessions: RfqSession[],
  orders: PurchaseOrder[]
): PurchaseOrder[] {
  const sessionsByCode = new Map(sessions.map(session => [session.code, session]));
  const groupedLines = new Map<string, {
    projects: string[] | undefined;
    lines: Array<{ orderIndex: number; itemIndex: number; qty: number }>;
  }>();

  orders.forEach((order, orderIndex) => {
    if (order.status === 'cancelled') return;
    const session = order.rfq_code ? sessionsByCode.get(order.rfq_code) : undefined;
    if (!session) return;
    order.items.forEach((poItem, itemIndex) => {
      const materialCode = poItem.mat_code?.trim().toLowerCase();
      const descriptions = [poItem.desc, poItem.filter_no]
        .filter((value): value is string => Boolean(value))
        .map(value => value.trim().toLowerCase());
      const sourceItem = session.items.find(item => {
        if (materialCode && item.mat_code?.trim().toLowerCase() === materialCode) return true;
        if (materialCode) return false;
        return [item.primary_number, ...(item.alt_numbers || [])]
          .some(value => descriptions.includes(value.trim().toLowerCase()));
      });
      if (!sourceItem) return;

      const groupKey = `${session.code}:${sourceItem.id}`;
      const group = groupedLines.get(groupKey) || {
        projects: sourceItem.projects,
        lines: []
      };
      group.lines.push({ orderIndex, itemIndex, qty: poItem.qty });
      groupedLines.set(groupKey, group);
    });
  });

  let hydratedOrders = orders;
  for (const group of groupedLines.values()) {
    group.lines.sort((left, right) => {
      const leftOrder = orders[left.orderIndex];
      const rightOrder = orders[right.orderIndex];
      const leftKey = `${leftOrder.po_number}\u0000${leftOrder.id}`;
      const rightKey = `${rightOrder.po_number}\u0000${rightOrder.id}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : left.itemIndex - right.itemIndex;
    });
    const quotas = allocateProjectQuotas(
      group.projects,
      group.lines.map(line => line.qty)
    );
    group.lines.forEach((line, index) => {
      const item = orders[line.orderIndex].items[line.itemIndex];
      const hasAwardAllocations = Array.isArray(item.award_project_allocations);
      const awarded = hasAwardAllocations
        ? item.award_project_allocations || []
        : item.project_allocations?.length
          ? item.project_allocations
          : quotas[index];
      if (awarded.length === 0) return;
      const currentAllocations = hasAwardAllocations
        ? item.project_allocations || []
        : [];
      const dispatchesByProject = new Map<string, number>();
      (item.dispatches || []).forEach(dispatch => {
        dispatchesByProject.set(
          dispatch.project,
          (dispatchesByProject.get(dispatch.project) || 0) + dispatch.qty
        );
      });
      const dispatched = [...dispatchesByProject.values()].reduce((sum, qty) => sum + qty, 0);
      const receivedAllocations = hasAwardAllocations
        ? currentAllocations
        : allocateReceivedProjectQuotas(
          awarded,
          [...dispatchesByProject.entries()].map(([project, qty]) => ({ project, qty })),
          Math.max(0, (item.received_qty || 0) - dispatched)
        );
      if (
        hasAwardAllocations &&
        JSON.stringify(item.project_allocations || []) === JSON.stringify(receivedAllocations) &&
        JSON.stringify(item.award_project_allocations || []) === JSON.stringify(awarded)
      ) return;
      if (hydratedOrders === orders) hydratedOrders = orders.map(order => ({ ...order, items: [...order.items] }));
      hydratedOrders[line.orderIndex].items[line.itemIndex] = {
        ...item,
        award_project_allocations: awarded,
        project_allocations: receivedAllocations
      };
    });
  }
  return hydratedOrders;
}
