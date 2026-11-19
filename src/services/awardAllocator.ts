import { AwardCriteria, FilterCategory, ManualAwardSelection } from '../types/procurement';

export interface AwardOffer {
  supplier: string;
  category: FilterCategory;
  unit_price: number;
  alt_no: string;
  qty_avail: number;
  notes?: string;
  sap_code?: string;
  brand_name?: string;
}

export interface AwardAllocation extends AwardOffer {
  qty: number;
  total: number;
  isManual?: boolean;
  brand?: string;
  brand_name?: string;
}

export function allocateOfferQuantities(
  requiredQty: number,
  offers: AwardOffer[],
  criteria: AwardCriteria,
  manualSelection?: ManualAwardSelection
): AwardAllocation[] {
  if (!Number.isFinite(requiredQty) || requiredQty <= 0) return [];

  if (manualSelection) {
    if (!manualSelection.supplier.trim() || !Number.isFinite(manualSelection.unit_price) || manualSelection.unit_price <= 0) {
      return [];
    }

    return [{
      supplier: manualSelection.supplier,
      category: manualSelection.category,
      unit_price: manualSelection.unit_price,
      alt_no: manualSelection.alt_no || manualSelection.brand || '',
      qty_avail: requiredQty,
      qty: requiredQty,
      total: requiredQty * manualSelection.unit_price,
      notes: manualSelection.notes,
      isManual: true,
      brand: manualSelection.brand || manualSelection.alt_no,
      sap_code: manualSelection.sap_code,
      brand_name: manualSelection.brand || undefined
    }];
  }

  const cheapestOfferBySupplier = new Map<string, { offer: AwardOffer; index: number }>();
  offers.forEach((offer, index) => {
    const supplierKey = offer.supplier.trim().toLocaleLowerCase();
    const matchesCriteria = criteria === 'best_overall' || offer.category === criteria;
    if (
      !supplierKey ||
      !matchesCriteria ||
      !Number.isFinite(offer.unit_price) ||
      offer.unit_price <= 0 ||
      !Number.isFinite(offer.qty_avail) ||
      offer.qty_avail <= 0
    ) {
      return;
    }

    const current = cheapestOfferBySupplier.get(supplierKey);
    if (!current || offer.unit_price < current.offer.unit_price) {
      cheapestOfferBySupplier.set(supplierKey, { offer, index });
    }
  });

  const rankedOffers = Array.from(cheapestOfferBySupplier.values())
    .sort((a, b) => a.offer.unit_price - b.offer.unit_price || a.index - b.index);

  const allocations: AwardAllocation[] = [];
  let remainingQty = requiredQty;
  for (const { offer } of rankedOffers) {
    if (remainingQty <= 0) break;

    const qty = Math.min(remainingQty, offer.qty_avail);
    allocations.push({
      ...offer,
      qty,
      total: qty * offer.unit_price,
      brand_name: offer.brand_name
    });
    remainingQty -= qty;
  }

  return allocations;
}
