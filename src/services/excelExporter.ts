import * as XLSX from 'xlsx';
import { RfqSession, FilterCategory, AwardCriteria } from '../types/procurement';

export function exportAnalysisExcel(
  analysisData: any,
  fileName: string = 'نظام_شراء_الفلاتر_SIAC.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: ملخص تنفيذي
  const summaryRows: any[] = [
    ['📋 نظام تحليل شراء الفلاتر — SIAC | مخزن 9004 المركزي مُدمج'],
    [`تاريخ التحليل: ${new Date().toLocaleDateString('ar-EG')} | عدد الأصناف للشراء: ${analysisData.rfqItems.length}`],
    [],
    ['المشروع', 'عدد الطلبات', 'مغطى بالمخزن', 'للشراء', 'رصيد 9004', 'المتبقي للشراء', 'الحالة']
  ];

  if (analysisData.projectAnalysis) {
    for (const [proj, items] of Object.entries<any[]>(analysisData.projectAnalysis)) {
      const total = items.length;
      const covered = items.filter(i => i.coveredProj).length;
      const needBuy = items.filter(i => !i.coveredProj).length;
      const c9 = items.filter(i => i.hasCentral && !i.coveredProj).length;
      const remaining = items.filter(i => i.netIfCentral > 0).length;
      const status = remaining === 0 ? 'مغطى بالكامل' : (c9 > 0 ? 'خصم جزئي 9004' : 'شراء خارجي');
      summaryRows.push([proj, total, covered, needBuy, c9, remaining, status]);
    }
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص تنفيذي');

  // Sheet 2: ورقة الشراء للموردين
  const supplierRows: any[] = [
    ['م', 'كود SAP', 'رقم/وصف الفلتر', 'نوع الفلتر', 'رصيد 9004', 'الأرقام البديلة', 'الكمية المطلوبة', 'المشاريع']
  ];

  analysisData.rfqItems.forEach((item: any, i: number) => {
    supplierRows.push([
      i + 1,
      item.mat_code || '—',
      item.primary_number || item.alt_numbers[0] || '—',
      item.filter_type || '—',
      item.central_avail || 0,
      item.alt_numbers ? item.alt_numbers.slice(1).join(' / ') : '—',
      item.qty_needed || 0,
      item.projects ? item.projects.join(' | ') : '—'
    ]);
  });

  const wsSupplier = XLSX.utils.aoa_to_sheet(supplierRows);
  XLSX.utils.book_append_sheet(wb, wsSupplier, 'ورقة الشراء للموردين');

  // Sheet 3: مغطى بالرصيد
  const coveredRows: any[] = [
    ['المشروع', 'نوع الفلتر', 'الكمية المطلوبة', 'رصيد 9004', 'الفائض', 'كود SAP']
  ];

  if (analysisData.coveredItems) {
    analysisData.coveredItems.forEach((item: any) => {
      coveredRows.push([
        item.project || '—',
        item.filterType || '—',
        item.qtyNeeded || 0,
        item.centralQty || 0,
        Math.max(0, (item.centralQty || 0) - (item.qtyNeeded || 0)),
        item.matCode || '—'
      ]);
    });
  }

  const wsCovered = XLSX.utils.aoa_to_sheet(coveredRows);
  XLSX.utils.book_append_sheet(wb, wsCovered, 'مغطى بالرصيد');

  XLSX.writeFile(wb, fileName);
}

export function exportComparisonExcel(
  session: RfqSession,
  categorySelection: Record<string, AwardCriteria>,
  fileName: string = `مقارنة_عروض_${session.code}.xlsx`
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: ملخص الترسية وأفضل العروض
  const bestOfferRows: any[] = [
    [`📊 مصفوفة مقارنة عروض الأسعار والترسية الذكية — كود الطلب: ${session.code}`],
    [`عنوان الطلب: ${session.title} | الموردين المشاركين: ${session.submissions.length}`],
    [],
    [
      'م',
      'كود SAP',
      'الفلتر المطلوب',
      'الكمية',
      'فئة الترسية المختارة',
      'أفضل سعر (ج.م.)',
      'المورد الفائز',
      'رقم الفلتر المعتمد',
      'إجمالي الصنف (ج.م.)',
      'آخر سعر SAP',
      'التوفير عن SAP'
    ]
  ];

  let grandTotal = 0;

  session.items.forEach((item, idx) => {
    const chosenCategory = categorySelection[item.id] || 'best_overall';
    const sap = session.sap_prices[item.mat_code];

    // Collect all valid offers matching the criteria
    const matchingOffers: {
      supplier: string;
      category: FilterCategory;
      unit_price: number;
      alt_no: string;
      notes?: string;
    }[] = [];

    session.submissions.forEach(sub => {
      const itemOffers = sub.offers[item.id] || [];
      itemOffers.forEach(o => {
        if (o.unit_price > 0) {
          if (chosenCategory === 'best_overall' || o.category === chosenCategory) {
            matchingOffers.push({
              supplier: sub.supplier_name,
              category: o.category,
              unit_price: o.unit_price,
              alt_no: o.alt_no,
              notes: o.notes
            });
          }
        }
      });
    });

    matchingOffers.sort((a, b) => a.unit_price - b.unit_price);
    const bestOffer = matchingOffers[0];

    const bestPrice = bestOffer ? bestOffer.unit_price : 0;
    const totalLine = bestPrice * item.qty_needed;
    grandTotal += totalLine;

    const sapLast = sap ? sap.last_price : 0;
    const diffVsSap = sapLast > 0 && bestPrice > 0 ? sapLast - bestPrice : 0;

    bestOfferRows.push([
      idx + 1,
      item.mat_code || '—',
      item.primary_number || item.alt_numbers[0] || '—',
      item.qty_needed,
      chosenCategory === 'best_overall' ? 'الأرخص عامة' : chosenCategory,
      bestPrice > 0 ? bestPrice : '—',
      bestOffer ? bestOffer.supplier : 'لا يوجد عرض مطابق',
      bestOffer ? bestOffer.alt_no : '—',
      totalLine > 0 ? totalLine : '—',
      sapLast > 0 ? sapLast : '—',
      diffVsSap !== 0 ? (diffVsSap > 0 ? `توفير: ${diffVsSap * item.qty_needed}` : `زيادة: ${Math.abs(diffVsSap) * item.qty_needed}`) : '—'
    ]);
  });

  bestOfferRows.push([]);
  bestOfferRows.push(['', '', '', '', 'الإجمالي الكلي للترسية', grandTotal, 'ج.م.']);

  const wsBest = XLSX.utils.aoa_to_sheet(bestOfferRows);
  XLSX.utils.book_append_sheet(wb, wsBest, 'ملخص الترسية وأفضل العروض');

  // Sheet 2: تفاصيل جميع عروض الموردين (بما فيها البدائل المتعددة)
  const allOffersRows: any[] = [
    [
      'م',
      'كود SAP',
      'الفلتر المطلوب',
      'الكمية المطلوبة',
      'اسم المورد',
      'الفئة',
      'رقم الفلتر عند المورد / الماركة',
      'سعر الوحدة (ج.م.)',
      'الكمية المتاحة',
      'ملاحظات المورد'
    ]
  ];

  session.items.forEach((item, idx) => {
    session.submissions.forEach(sub => {
      const itemOffers = sub.offers[item.id] || [];
      itemOffers.forEach(o => {
        allOffersRows.push([
          idx + 1,
          item.mat_code || '—',
          item.primary_number || item.alt_numbers[0] || '—',
          item.qty_needed,
          sub.supplier_name,
          o.category,
          o.alt_no || '—',
          o.unit_price,
          o.qty_avail || '—',
          o.notes || '—'
        ]);
      });
    });
  });

  const wsAllOffers = XLSX.utils.aoa_to_sheet(allOffersRows);
  XLSX.utils.book_append_sheet(wb, wsAllOffers, 'تفاصيل كافة العروض والبدائل');

  XLSX.writeFile(wb, fileName);
}
