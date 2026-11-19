import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getFilterIdentity } from './filterIdentity';

describe('filter identity for receiving and dispatch', () => {
  it('keeps the requested SAP code with the supplier part number and brand', () => {
    const identity = getFilterIdentity({
      mat_code: 'M003-30201001-000050',
      desc: 'فلتر زيت Perkins 2654403',
      filter_no: 'B2',
      supplier_brand: 'Baldwin',
      sap_code: 'SUP-2654403',
      received_supplier_part_number: 'B2-R',
      received_supplier_brand: 'Baldwin',
      received_supplier_sap_code: 'SUP-2654403-R',
      received_supplier_identity_confirmed: true
    });

    assert.equal(identity.requestedSapCode, 'M003-30201001-000050');
    assert.equal(identity.requestedNumber, 'فلتر زيت Perkins 2654403');
    assert.equal(identity.supplierNumber, 'B2');
    assert.equal(identity.supplierBrand, 'Baldwin');
    assert.equal(identity.supplierSapCode, 'SUP-2654403');
    assert.equal(identity.receivedSupplierNumber, 'B2-R');
    assert.equal(identity.receivedSupplierBrand, 'Baldwin');
    assert.equal(identity.receivedSupplierSapCode, 'SUP-2654403-R');
    assert.equal(identity.hasSupplierAlternative, true);
  });

  it('falls back to the requested number when the supplier did not provide an alternative', () => {
    const identity = getFilterIdentity({
      mat_code: 'M003-30201001-000050',
      desc: 'فلتر زيت Perkins 2654403',
      filter_no: ''
    });

    assert.equal(identity.supplierNumber, 'فلتر زيت Perkins 2654403');
    assert.equal(identity.hasSupplierAlternative, false);
  });

  it('does not flag an alternative when the saved number is the requested one', () => {
    const identity = getFilterIdentity({
      mat_code: 'M003-30201001-000050',
      desc: 'فلتر زيت Perkins 2654403',
      filter_no: '  فلتر زيت Perkins 2654403  '
    });

    assert.equal(identity.supplierNumber, 'فلتر زيت Perkins 2654403');
    assert.equal(identity.hasSupplierAlternative, false);
  });

  it('treats placeholder dashes as an empty supplier number', () => {
    const identity = getFilterIdentity({
      mat_code: 'M003-30201001-000050',
      desc: 'فلتر زيت Perkins 2654403',
      filter_no: '—'
    });

    assert.equal(identity.supplierNumber, 'فلتر زيت Perkins 2654403');
    assert.equal(identity.hasSupplierAlternative, false);
  });

  it('does not claim that a missing received number matches the requested number', () => {
    const identity = getFilterIdentity({
      desc: 'F-100',
      filter_no: 'ALT-100',
      received_supplier_identity_confirmed: true
    });

    assert.equal(identity.supplierNumber, 'ALT-100');
    assert.equal(identity.receivedSupplierNumber, 'غير مسجل');
    assert.equal(identity.receivedSupplierBrand, 'غير مسجلة');
  });
});
