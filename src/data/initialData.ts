import { RfqSession, PurchaseOrder, SapHistoricalPrice } from '../types/procurement';

export const INITIAL_SAP_PRICES: Record<string, SapHistoricalPrice> = {
  'M003-30203001-000031': {
    mat_code: 'M003-30203001-000031',
    desc: 'حشو فلتر جاز ماركة مان رقم CE1372',
    last_price: 1850.00,
    last_date: '2026-06-15',
    max_price: 2100.00,
    currency: 'EGP'
  },
  'M003-30203001-000067': {
    mat_code: 'M003-30203001-000067',
    desc: 'حشو فلتر جاز ماركه LEXUS رقم YZZA1-23390',
    last_price: 980.00,
    last_date: '2026-07-20',
    max_price: 1150.00,
    currency: 'EGP'
  },
  'M003-30201002-000485': {
    mat_code: 'M003-30201002-000485',
    desc: 'فلتر زيت ماركه TAITURN رقم TO-927-0',
    last_price: 720.00,
    last_date: '2026-05-10',
    max_price: 850.00,
    currency: 'EGP'
  },
  'M003-30203001-000058': {
    mat_code: 'M003-30203001-000058',
    desc: 'حشو فلتر جاز ماركه FIOWIINE رقم 26560201',
    last_price: 1350.00,
    last_date: '2026-08-01',
    max_price: 1520.00,
    currency: 'EGP'
  },
  'M003-30203001-000001': {
    mat_code: 'M003-30203001-000001',
    desc: 'حشو فلتر جاز ماركه PERKINS رقم CH10930',
    last_price: 3400.00,
    last_date: '2026-04-12',
    max_price: 3950.00,
    currency: 'EGP'
  },
  'M003-30203001-000003': {
    mat_code: 'M003-30203001-000003',
    desc: 'حشو فلتر جاز ماركه Hengst رقم E500KP02D36',
    last_price: 1450.00,
    last_date: '2026-06-30',
    max_price: 1680.00,
    currency: 'EGP'
  },
  'M003-30201002-000114': {
    mat_code: 'M003-30201002-000114',
    desc: 'حشو فلتر زيت ماركه PERKINS رقم CH10929',
    last_price: 2900.00,
    last_date: '2026-07-05',
    max_price: 3300.00,
    currency: 'EGP'
  },
  'M003-30202001-000210': {
    mat_code: 'M003-30202001-000210',
    desc: 'فلتر هواء خارجي كاتربيلر CAT 110-6326',
    last_price: 4200.00,
    last_date: '2026-06-18',
    max_price: 4800.00,
    currency: 'EGP'
  },
  'M003-30204001-000088': {
    mat_code: 'M003-30204001-000088',
    desc: 'فلتر هيدروليك دونالدسون P164378',
    last_price: 2150.00,
    last_date: '2026-08-15',
    max_price: 2400.00,
    currency: 'EGP'
  }
};

export const INITIAL_RFQ_ITEMS = [
  {
    id: 'item-1',
    mat_code: 'M003-30203001-000031',
    filter_type: 'فلتر جاز',
    primary_number: 'حشو فلتر جاز ماركه مان رقم CE1372',
    alt_numbers: ['CE1372', 'WK940/20', 'P550388'],
    qty_needed: 16,
    equip_code: 'GEN-014',
    projects: ['مشروع المونوريل (10)', 'مشروع العاصمة R5 (6)'],
    central_avail: 4,
    proj_qty: 2
  },
  {
    id: 'item-2',
    mat_code: 'M003-30203001-000067',
    filter_type: 'فلتر جاز',
    primary_number: 'حشو فلتر جاز ماركه LEXUS رقم YZZA1-23390',
    alt_numbers: ['YZZA1-23390', '23390-0L070', 'F-1901'],
    qty_needed: 14,
    equip_code: 'PU-088',
    projects: ['مشروع القطار السريع (8)', 'مشروع العلمين (6)'],
    central_avail: 0,
    proj_qty: 3
  },
  {
    id: 'item-3',
    mat_code: 'M003-30201002-000485',
    filter_type: 'فلتر زيت',
    primary_number: 'فلتر زيت ماركه TAITURN رقم TO-927-0',
    alt_numbers: ['TO-927-0', 'LF3349', 'P558615'],
    qty_needed: 28,
    equip_code: 'EXC-042',
    projects: ['مشروع المونوريل (14)', 'مشروع رأس الحكمة (14)'],
    central_avail: 6,
    proj_qty: 0
  },
  {
    id: 'item-4',
    mat_code: 'M003-30203001-000058',
    filter_type: 'فلتر جاز',
    primary_number: 'حشو فلتر جاز ماركه FIOWIINE رقم 26560201',
    alt_numbers: ['26560201', 'FS19732', 'P551433'],
    qty_needed: 12,
    equip_code: 'LOD-019',
    projects: ['مشروع العاصمة R5 (12)'],
    central_avail: 2,
    proj_qty: 1
  },
  {
    id: 'item-5',
    mat_code: 'M003-30203001-000001',
    filter_type: 'فلتر جاز رئيسي',
    primary_number: 'حشو فلتر جاز ماركه PERKINS رقم CH10930',
    alt_numbers: ['CH10930', 'SE429B/4', 'FS19870'],
    qty_needed: 8,
    equip_code: 'GEN-2000KVA',
    projects: ['مشروع الداتا سنتر (8)'],
    central_avail: 0,
    proj_qty: 0
  },
  {
    id: 'item-6',
    mat_code: 'M003-30203001-000003',
    filter_type: 'فلتر جاز',
    primary_number: 'حشو فلتر جاز ماركه Hengst رقم E500KP02D36',
    alt_numbers: ['E500KP02D36', 'PU936/2X', 'KX79D'],
    qty_needed: 24,
    equip_code: 'TRK-MERCEDES',
    projects: ['أسطول النقل المركزي (16)', 'مشروع السخنة (8)'],
    central_avail: 8,
    proj_qty: 4
  },
  {
    id: 'item-7',
    mat_code: 'M003-30201002-000114',
    filter_type: 'فلتر زيت محرك',
    primary_number: 'حشو فلتر زيت ماركه PERKINS رقم CH10929',
    alt_numbers: ['CH10929', 'LF16015', 'P550388'],
    qty_needed: 10,
    equip_code: 'GEN-2000KVA',
    projects: ['مشروع الداتا سنتر (10)'],
    central_avail: 0,
    proj_qty: 0
  },
  {
    id: 'item-8',
    mat_code: 'M003-30202001-000210',
    filter_type: 'فلتر هواء رئيسي',
    primary_number: 'فلتر هواء خارجي كاتربيلر CAT 110-6326',
    alt_numbers: ['110-6326', 'P532501', 'AF25125'],
    qty_needed: 18,
    equip_code: 'CAT-336D',
    projects: ['مشروع رأس الحكمة (10)', 'مشروع العلمين (8)'],
    central_avail: 4,
    proj_qty: 2
  }
];

export const INITIAL_RFQ_SESSIONS: RfqSession[] = [
  {
    code: 'RFQ-20261004-1557',
    title: 'طلب عروض فلاتر الصيانة الدورية — الربع الأخير 2026',
    created_at: '2026-10-04 10:30',
    deadline: '2026-10-15',
    is_active: true,
    items: INITIAL_RFQ_ITEMS,
    sap_prices: INITIAL_SAP_PRICES,
    submissions: [
      {
        supplier_name: 'شركة النيل لتجارة الفلاتر والمعدات',
        phone: '01012345678',
        submitted_at: '2026-10-04 11:20',
        offers: {
          'item-1': [
            { id: 'opt-1-1', category: 'أصلي', alt_no: 'MANN CE1372 (ألماني)', unit_price: 1720, qty_avail: 16, notes: 'وكيل معتمد ضمان 6 شهور', brand_name: 'Mann Filter' },
            { id: 'opt-1-2', category: 'هاي كوبي', alt_no: 'Fleetguard FS1280 (تركي)', unit_price: 1100, qty_avail: 30, notes: 'جودة ممتازة درجة أولى', brand_name: 'Fleetguard' }
          ],
          'item-2': [
            { id: 'opt-2-1', category: 'أصلي', alt_no: 'TOYOTA/LEXUS 23390-0L070', unit_price: 890, qty_avail: 20, notes: 'وارد اليابان أصلي' }
          ],
          'item-3': [
            { id: 'opt-3-1', category: 'أصلي', alt_no: 'Donaldson P558615 (USA)', unit_price: 680, qty_avail: 40, notes: 'تسليم فوري من المخزن' },
            { id: 'opt-3-2', category: 'صناعة محلي', alt_no: 'الهندسية للفلاتر EF-927', unit_price: 380, qty_avail: 50, notes: 'مطابق للمواصفة القياسية' }
          ],
          'item-4': [
            { id: 'opt-4-1', category: 'أصلي', alt_no: 'Perkins 26560201 (UK)', unit_price: 1240, qty_avail: 12, notes: 'أصلي بيركنز إنجليزي' }
          ],
          'item-5': [
            { id: 'opt-5-1', category: 'أصلي', alt_no: 'Perkins CH10930 (UK)', unit_price: 3100, qty_avail: 8, notes: 'أصلي هولوجرام' },
            { id: 'opt-5-2', category: 'هاي كوبي', alt_no: 'SE429B/4 High Copy', unit_price: 2150, qty_avail: 15, notes: 'صناعة تركي خامة ممتازة' }
          ],
          'item-6': [
            { id: 'opt-6-1', category: 'أصلي', alt_no: 'Hengst E500KP02D36', unit_price: 1380, qty_avail: 24, notes: 'ألماني أصلي' }
          ],
          'item-7': [
            { id: 'opt-7-1', category: 'أصلي', alt_no: 'Perkins CH10929 (UK)', unit_price: 2750, qty_avail: 10, notes: 'أصلي بيركنز' }
          ],
          'item-8': [
            { id: 'opt-8-1', category: 'أصلي', alt_no: 'CAT 110-6326 (USA)', unit_price: 3950, qty_avail: 18, notes: 'أصلي وكيل مانتراك' }
          ]
        }
      },
      {
        supplier_name: 'الأهرام للتوريدات الهندسية والقطع',
        phone: '01223456789',
        submitted_at: '2026-10-04 12:45',
        offers: {
          'item-1': [
            { id: 'opt-1-3', category: 'أصلي', alt_no: 'MANN CE1372', unit_price: 1780, qty_avail: 20 },
            { id: 'opt-1-4', category: 'هاي كوبي', alt_no: 'Sure Filter S-1372 (إندونيسي)', unit_price: 950, qty_avail: 25, notes: 'هاي كوبي ممتاز' },
            { id: 'opt-1-5', category: 'صناعة محلي', alt_no: 'الفرسان كود F-137', unit_price: 520, qty_avail: 50, notes: 'صناعة محلية' }
          ],
          'item-2': [
            { id: 'opt-2-2', category: 'أصلي', alt_no: 'LEXUS YZZA1', unit_price: 920, qty_avail: 14 },
            { id: 'opt-2-3', category: 'هاي كوبي', alt_no: 'JS Asakashi FE0022 (كوري)', unit_price: 580, qty_avail: 30 }
          ],
          'item-3': [
            { id: 'opt-3-3', category: 'أصلي', alt_no: 'Fleetguard LF3349', unit_price: 640, qty_avail: 30, notes: 'أصلي هندي' },
            { id: 'opt-3-4', category: 'هاي كوبي', alt_no: 'Hi-Fi Filter SO3349', unit_price: 430, qty_avail: 35 }
          ],
          'item-4': [
            { id: 'opt-4-2', category: 'أصلي', alt_no: 'Donaldson P551433', unit_price: 1190, qty_avail: 15 },
            { id: 'opt-4-3', category: 'هاي كوبي', alt_no: 'Baldwin BF7925 (صيني درجة 1)', unit_price: 790, qty_avail: 20 }
          ],
          'item-5': [
            { id: 'opt-5-3', category: 'أصلي', alt_no: 'Perkins CH10930', unit_price: 3250, qty_avail: 10 },
            { id: 'opt-5-4', category: 'هاي كوبي', alt_no: 'Baldwin BF7930 (تركي)', unit_price: 1980, qty_avail: 12, notes: 'بديل هاي كوبي عالي الكفاءة' }
          ],
          'item-6': [
            { id: 'opt-6-2', category: 'أصلي', alt_no: 'Mann PU936/2X', unit_price: 1420, qty_avail: 30 },
            { id: 'opt-6-3', category: 'هاي كوبي', alt_no: 'Wix Filters 936 (بولندي)', unit_price: 880, qty_avail: 40 }
          ],
          'item-7': [
            { id: 'opt-7-2', category: 'أصلي', alt_no: 'Perkins CH10929', unit_price: 2800, qty_avail: 12 },
            { id: 'opt-7-3', category: 'هاي كوبي', alt_no: 'Fleetguard LF16015 (High Copy)', unit_price: 1850, qty_avail: 16 }
          ],
          'item-8': [
            { id: 'opt-8-2', category: 'أصلي', alt_no: 'Donaldson P532501', unit_price: 3800, qty_avail: 20, notes: 'أصلي دونالدسون' },
            { id: 'opt-8-3', category: 'صناعة محلي', alt_no: 'فلتر هواء محلي مقوى', unit_price: 1750, qty_avail: 25 }
          ]
        }
      },
      {
        supplier_name: 'المتحدة لاستيراد قطع غيار الشاحنات والمعدات',
        phone: '01198765432',
        submitted_at: '2026-10-04 14:10',
        offers: {
          'item-1': [
            { id: 'opt-1-6', category: 'أصلي', alt_no: 'Hengst E1372 (ألماني)', unit_price: 1690, qty_avail: 16, notes: 'سعر خاص للكميات' }
          ],
          'item-2': [
            { id: 'opt-2-4', category: 'أصلي', alt_no: 'Toyota 23390-0L070', unit_price: 860, qty_avail: 18, notes: 'أصلي ياباني مختوم' },
            { id: 'opt-2-5', category: 'صناعة محلي', alt_no: 'محلي جودة عالية', unit_price: 320, qty_avail: 40 }
          ],
          'item-3': [
            { id: 'opt-3-5', category: 'أصلي', alt_no: 'Baldwin B1441 (USA)', unit_price: 660, qty_avail: 50 },
            { id: 'opt-3-6', category: 'صناعة محلي', alt_no: 'محلي معتمد', unit_price: 360, qty_avail: 60 }
          ],
          'item-4': [
            { id: 'opt-4-4', category: 'أصلي', alt_no: 'Fleetguard FS19732', unit_price: 1210, qty_avail: 12 },
            { id: 'opt-4-5', category: 'صناعة محلي', alt_no: 'محلي بتروفلتر', unit_price: 620, qty_avail: 30 }
          ],
          'item-5': [
            { id: 'opt-5-5', category: 'أصلي', alt_no: 'Perkins CH10930 (Original)', unit_price: 3050, qty_avail: 8, notes: 'أقل سعر للأصلي' }
          ],
          'item-6': [
            { id: 'opt-6-4', category: 'أصلي', alt_no: 'Hengst E500KP02D36', unit_price: 1350, qty_avail: 24 },
            { id: 'opt-6-5', category: 'صناعة محلي', alt_no: 'محلي كود E500', unit_price: 590, qty_avail: 50, notes: 'ورق ترشيح مستورد' }
          ],
          'item-7': [
            { id: 'opt-7-4', category: 'أصلي', alt_no: 'Perkins CH10929', unit_price: 2680, qty_avail: 10, notes: 'سعر ترويجي' }
          ],
          'item-8': [
            { id: 'opt-8-4', category: 'أصلي', alt_no: 'CAT 110-6326', unit_price: 3890, qty_avail: 18 },
            { id: 'opt-8-5', category: 'هاي كوبي', alt_no: 'Donaldson High Copy', unit_price: 2450, qty_avail: 20 }
          ]
        }
      }
    ]
  }
];

export const INITIAL_POS: PurchaseOrder[] = [
  {
    id: 'po-1',
    po_number: 'PO-202610-001',
    rfq_code: 'RFQ-20261004-1557',
    title: 'ترسية فلاتر الجاز والزيت — مشروع المونوريل والداتا سنتر',
    supplier: 'المتحدة لاستيراد قطع غيار الشاحنات والمعدات',
    total_value: 84640.00,
    currency: 'EGP',
    status: 'awarded',
    created_at: '2026-10-04 14:30',
    updated_at: '2026-10-04 14:30',
    notes: 'تمت الترسية لأفضل سعر فئة أصلي للفلاتر الحرجة',
    items: [
      { filter_no: 'Hengst E1372 (ألماني)', desc: 'حشو فلتر جاز ماركه مان رقم CE1372', mat_code: 'M003-30203001-000031', qty: 16, unit_price: 1690, category: 'أصلي', total: 27040 },
      { filter_no: 'Perkins CH10930 (Original)', desc: 'حشو فلتر جاز ماركه PERKINS رقم CH10930', mat_code: 'M003-30203001-000001', qty: 8, unit_price: 3050, category: 'أصلي', total: 24400 },
      { filter_no: 'Perkins CH10929', desc: 'حشو فلتر زيت ماركه PERKINS رقم CH10929', mat_code: 'M003-30201002-000114', qty: 10, unit_price: 2680, category: 'أصلي', total: 26800 },
      { filter_no: 'Hengst E500KP02D36', desc: 'حشو فلتر جاز ماركه Hengst رقم E500KP02D36', mat_code: 'M003-30203001-000003', qty: 24, unit_price: 1350, category: 'أصلي', total: 32400 }
    ],
    events: [
      { id: 'ev-1', status: 'draft', note: 'إنشاء مسودة أمر الشراء', happened_at: '2026-10-04 14:15' },
      { id: 'ev-2', status: 'awarded', note: 'اعتماد قرار الترسية المالي والفني لأفضل سعر فئة الأصلي', happened_at: '2026-10-04 14:30' }
    ]
  },
  {
    id: 'po-2',
    po_number: 'PO-202609-089',
    rfq_code: 'RFQ-20260915-0900',
    title: 'توريد فلاتر هواء وزيت لشاحنات مرسيدس',
    supplier: 'شركة النيل لتجارة الفلاتر والمعدات',
    total_value: 45200.00,
    currency: 'EGP',
    status: 'delivered',
    created_at: '2026-09-16 09:00',
    updated_at: '2026-09-28 11:30',
    notes: 'تم الاستلام والفحص الفني بالمخزن المركزي 9004 ومطابقة الباركود',
    items: [
      { filter_no: 'Donaldson P558615 (USA)', desc: 'فلتر زيت ماركه TAITURN رقم TO-927-0', mat_code: 'M003-30201002-000485', qty: 28, unit_price: 680, category: 'أصلي', total: 19040 },
      { filter_no: 'Perkins 26560201 (UK)', desc: 'حشو فلتر جاز ماركه FIOWIINE رقم 26560201', mat_code: 'M003-30203001-000058', qty: 12, unit_price: 1240, category: 'أصلي', total: 14880 },
      { filter_no: 'Fleetguard FS1280 (تركي)', desc: 'حشو فلتر جاز ماركه مان رقم CE1372', mat_code: 'M003-30203001-000031', qty: 10, unit_price: 1100, category: 'هاي كوبي', total: 11000 }
    ],
    events: [
      { id: 'ev-10', status: 'draft', note: 'إنشاء المسودة', happened_at: '2026-09-16 09:00' },
      { id: 'ev-11', status: 'sent', note: 'إرسال أمر الشراء للمورد عبر البريد والواتساب', happened_at: '2026-09-16 11:00' },
      { id: 'ev-12', status: 'awarded', note: 'تأكيد الترسية', happened_at: '2026-09-17 10:00' },
      { id: 'ev-13', status: 'po_issued', note: 'إصدار أمر الشراء الرسمي رقم PO-202609-089', happened_at: '2026-09-18 14:00' },
      { id: 'ev-14', status: 'delivered', note: 'تم الاستلام وإذن الإضافة لمخزن 9004 بالكامل مطابق للمواصفات', happened_at: '2026-09-28 11:30' }
    ]
  }
];
