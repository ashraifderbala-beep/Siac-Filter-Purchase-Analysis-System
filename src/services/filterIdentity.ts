import { PurchaseOrderItem } from '../types/procurement';

type FilterIdentitySource = Pick<PurchaseOrderItem,
  | 'filter_no'
  | 'desc'
  | 'mat_code'
  | 'sap_code'
  | 'supplier_brand'
  | 'received_supplier_part_number'
  | 'received_supplier_brand'
  | 'received_supplier_sap_code'
  | 'received_supplier_identity_confirmed'
>;

export interface FilterIdentity {
  /** SAP material code requested for purchasing. */
  requestedSapCode: string;
  /** Description / part number requested for purchasing. */
  requestedNumber: string;
  /** Supplier part number or brand/number saved on the PO. Falls back to the requested number. */
  supplierNumber: string;
  supplierBrand: string;
  supplierSapCode: string;
  receivedSupplierNumber: string;
  receivedSupplierBrand: string;
  receivedSupplierSapCode: string;
  /** True only when the supplier supplied a different number/brand than the requested one. */
  hasSupplierAlternative: boolean;
}

const clean = (value?: string): string => {
  const cleaned = String(value ?? '').replace(/\u00a0/g, ' ').trim();
  return cleaned === '—' || cleaned === '-' || cleaned === 'NaN' ? '' : cleaned;
};

const normalize = (value: string): string =>
  value
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

/**
 * Resolves the two identities that must stay visible during receiving and
 * project dispatch: the number requested for purchasing, and the supplier
 * number/brand that was actually delivered. When the supplier did not provide
 * an alternative, the requested number is used as the fallback.
 */
export function getFilterIdentity(item: FilterIdentitySource): FilterIdentity {
  const requestedSapCode = clean(item.mat_code) || '—';
  const requestedNumber = clean(item.desc) || clean(item.filter_no) || clean(item.mat_code) || '—';
  const rawSupplierNumber = clean(item.filter_no);
  const supplierNumber = rawSupplierNumber || requestedNumber;
  const supplierBrand = clean(item.supplier_brand);
  const receiptIdentityConfirmed = item.received_supplier_identity_confirmed === true;
  const hasSupplierAlternative =
    Boolean(rawSupplierNumber) &&
    normalize(rawSupplierNumber) !== normalize(requestedNumber) &&
    normalize(rawSupplierNumber) !== normalize(requestedSapCode);

  return {
    requestedSapCode,
    requestedNumber,
    supplierNumber,
    supplierBrand,
    supplierSapCode: clean(item.sap_code) || '—',
    receivedSupplierNumber: receiptIdentityConfirmed
      ? clean(item.received_supplier_part_number) || 'غير مسجل'
      : clean(item.received_supplier_part_number) || supplierNumber,
    receivedSupplierBrand: receiptIdentityConfirmed
      ? clean(item.received_supplier_brand) || 'غير مسجلة'
      : clean(item.received_supplier_brand) || supplierBrand || '—',
    receivedSupplierSapCode: receiptIdentityConfirmed
      ? clean(item.received_supplier_sap_code) || 'غير مسجل'
      : clean(item.received_supplier_sap_code) || clean(item.sap_code) || '—',
    hasSupplierAlternative
  };
}
