import * as XLSX from 'xlsx';
import { RfqItem } from '../types/procurement';

export interface AnalysisStats {
  raw_requests: number;
  demand_lines: number;
  projects: number;
  central_9004_items: number;
  central_9004_qty: number;
  supplier_items: number;
  alternatives_groups: number;
  covered: number;
}

export interface AnalysisResult {
  stats: AnalysisStats;
  rfqItems: RfqItem[];
  projectAnalysis: Record<string, any[]>;
  central9004Stock: Record<string, { desc: string; qty: number }>;
  coveredItems: any[];
}

function getM003(val: any): string {
  if (!val) return '';
  const s = String(val);
  const m = s.match(/(M003-\d+-\d+)/);
  return m ? m[1].trim() : '';
}

export async function processSapFiles(
  mapFile: File | ArrayBuffer,
  invFile: File | ArrayBuffer,
  prFile: File | ArrayBuffer
): Promise<AnalysisResult> {
  // Read buffers
  const mapBuf = mapFile instanceof File ? await mapFile.arrayBuffer() : mapFile;
  const invBuf = invFile instanceof File ? await invFile.arrayBuffer() : invFile;
  const prBuf = prFile instanceof File ? await prFile.arrayBuffer() : prFile;

  // 1. Warehouse map
  const wbMap = XLSX.read(mapBuf, { type: 'array' });
  const wsMap = wbMap.Sheets[wbMap.SheetNames[0]];
  const mapRows: any[][] = XLSX.utils.sheet_to_json(wsMap, { header: 1 });
  const storeToProject: Record<string, string> = {};

  for (let i = 1; i < mapRows.length; i++) {
    const row = mapRows[i];
    if (row && row[0]) {
      const storeId = String(row[0]).trim();
      const projName = String(row[2] || row[1] || '').trim();
      storeToProject[storeId] = projName;
    }
  }

  // 2. Inventory (Split store 9004 vs project stores)
  const wbInv = XLSX.read(invBuf, { type: 'array' });
  const wsInv = wbInv.Sheets[wbInv.SheetNames[0]];
  const invRows: any[][] = XLSX.utils.sheet_to_json(wsInv, { header: 1 });

  const central9004: Record<string, { desc: string; qty: number }> = {};
  const inventory: Record<string, Record<string, { desc: string; qty: number }>> = {};

  const centralStores = new Set(['9002', '9003', '9004', '9005', '9006']);

  for (let i = 1; i < invRows.length; i++) {
    const row = invRows[i];
    if (!row || !row[1]) continue;
    const sid = String(row[1]).trim();
    const mc = row[3] ? String(row[3]).trim() : '';
    const md = row[4] ? String(row[4]).trim() : '';
    const qty = row[7] != null ? Number(row[7]) || 0 : 0;
    if (!mc) continue;

    if (sid === '9004') {
      if (!central9004[mc]) {
        central9004[mc] = { desc: md, qty: 0 };
      }
      central9004[mc].desc = md;
      central9004[mc].qty += qty;
    } else if (!centralStores.has(sid)) {
      const proj = storeToProject[sid] || `مخزن ${sid}`;
      if (!inventory[proj]) inventory[proj] = {};
      if (!inventory[proj][mc]) {
        inventory[proj][mc] = { desc: md, qty: 0 };
      }
      inventory[proj][mc].qty += qty;
    }
  }

  // 3. Purchase Requests
  const wbPr = XLSX.read(prBuf, { type: 'array' });
  const wsPr = wbPr.Sheets[wbPr.SheetNames[0]];
  const prRows: any[][] = XLSX.utils.sheet_to_json(wsPr, { header: 1 });

  const rawRequests: any[] = [];
  for (let i = 1; i < prRows.length; i++) {
    const row = prRows[i];
    if (!row || !row[2]) continue;
    const project = String(row[2]).trim();
    const rawFilter = row[3] ? String(row[3]).trim() : '';
    const filterType = row[4] ? String(row[4]).trim() : '';
    const equipCode = row[5] ? String(row[5]).trim().replace(/\s+/g, '') : '';
    const qtyReq = row[6] != null ? Number(row[6]) || 0 : 0;
    const notesRaw = row[7] ? String(row[7]).trim() : '';
    const matCode = getM003(notesRaw) || getM003(rawFilter) || '';

    if (qtyReq <= 0) continue;
    rawRequests.push({
      project,
      rawFilter,
      filterType,
      equipCode,
      qtyReq,
      notes: notesRaw,
      matCode
    });
  }

  // 4. Group Alternatives
  const grouped: Record<string, any[]> = {};
  for (const r of rawRequests) {
    const key = `${r.project}__${r.equipCode}__${r.filterType}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const demandLines: any[] = [];
  let alternativesGroupsCount = 0;

  for (const items of Object.values(grouped)) {
    const seen: Record<string, any> = {};
    for (const item of items) {
      const k = item.rawFilter.trim().toUpperCase().slice(0, 60);
      if (!seen[k]) seen[k] = item;
    }
    const uniqueItems = Object.values(seen);
    const isAlt = uniqueItems.length > 1;
    if (isAlt) alternativesGroupsCount++;

    const qtyNeeded = isAlt
      ? Math.max(...uniqueItems.map((i: any) => i.qtyReq))
      : uniqueItems[0].qtyReq;

    const altNumbers = uniqueItems.map((i: any) => i.rawFilter);
    const matCodes = uniqueItems.map((i: any) => i.matCode).filter(Boolean);

    demandLines.push({
      project: uniqueItems[0].project,
      equipCode: uniqueItems[0].equipCode,
      filterType: uniqueItems[0].filterType,
      qtyNeeded,
      altNumbers,
      matCode: matCodes[0] || '',
      notes: uniqueItems[0].notes,
      isAlternatives: isAlt
    });
  }

  // 5. Match Inventory + 9004
  const projectAnalysis: Record<string, any[]> = {};
  const centralAlloc: Record<string, any[]> = {};

  for (const line of demandLines) {
    const projInv = inventory[line.project] || {};
    let projQty = 0;
    let projCode = '';

    if (line.matCode && projInv[line.matCode]) {
      projQty = projInv[line.matCode].qty;
      projCode = line.matCode;
    }

    let centralQty = 0;
    let centralCode = '';

    if (line.matCode && central9004[line.matCode]) {
      centralQty = central9004[line.matCode].qty;
      centralCode = line.matCode;
    } else {
      for (const fn of line.altNumbers) {
        const m = getM003(fn);
        if (m && central9004[m]) {
          centralQty = central9004[m].qty;
          centralCode = m;
          break;
        }
      }
    }

    const netIfCentral = Math.max(0, line.qtyNeeded - centralQty);
    const coveredByCentral = centralQty >= line.qtyNeeded;

    const analyzedItem = {
      ...line,
      projQty,
      projCode,
      centralQty,
      centralCode,
      netNeeded: line.qtyNeeded,
      netIfCentral,
      coveredProj: coveredByCentral,
      hasCentral: centralQty > 0
    };

    if (!projectAnalysis[line.project]) projectAnalysis[line.project] = [];
    projectAnalysis[line.project].push(analyzedItem);

    if (centralQty > 0 && line.qtyNeeded > 0 && centralCode) {
      if (!centralAlloc[centralCode]) centralAlloc[centralCode] = [];
      centralAlloc[centralCode].push({
        project: line.project,
        netNeeded: line.qtyNeeded
      });
    }
  }

  // 6. Aggregate Supplier RFQ Items
  const supplierDict: Record<string, RfqItem> = {};
  let idx = 1;

  for (const [proj, items] of Object.entries(projectAnalysis)) {
    for (const item of items) {
      const netToBuy = item.netIfCentral;
      if (netToBuy <= 0) continue;

      const key = item.matCode || item.altNumbers[0]?.slice(0, 50) || `item-${idx}`;

      if (!supplierDict[key]) {
        supplierDict[key] = {
          id: `item-${idx++}`,
          mat_code: item.matCode || '',
          filter_type: item.filterType || 'فلتر',
          primary_number: item.altNumbers[0] || key,
          alt_numbers: [...item.altNumbers],
          qty_needed: 0,
          equip_code: item.equipCode,
          projects: [],
          central_avail: item.centralQty,
          proj_qty: item.projQty
        };
      }

      const existingSet = new Set(supplierDict[key].alt_numbers);
      for (const fn of item.altNumbers) {
        if (!existingSet.has(fn)) {
          supplierDict[key].alt_numbers.push(fn);
          existingSet.add(fn);
        }
      }

      supplierDict[key].qty_needed += netToBuy;
      supplierDict[key].central_avail = Math.max(
        supplierDict[key].central_avail || 0,
        item.centralQty
      );
      if (!supplierDict[key].projects) supplierDict[key].projects = [];
      supplierDict[key].projects!.push(`${proj} (${netToBuy})`);
    }
  }

  const rfqItems = Object.values(supplierDict).map((item, index) => ({
    ...item,
    item_no: index + 1
  }));
  const coveredItems: any[] = [];
  for (const [proj, items] of Object.entries(projectAnalysis)) {
    for (const item of items) {
      if (item.coveredProj) {
        coveredItems.push({ ...item, project: proj });
      }
    }
  }

  const totalCentralQty = Object.values(central9004).reduce((sum, v) => sum + v.qty, 0);

  const stats: AnalysisStats = {
    raw_requests: rawRequests.length,
    demand_lines: demandLines.length,
    projects: Object.keys(projectAnalysis).length,
    central_9004_items: Object.keys(central9004).length,
    central_9004_qty: Math.round(totalCentralQty),
    supplier_items: rfqItems.length,
    alternatives_groups: alternativesGroupsCount,
    covered: coveredItems.length
  };

  return {
    stats,
    rfqItems,
    projectAnalysis,
    central9004Stock: central9004,
    coveredItems
  };
}
