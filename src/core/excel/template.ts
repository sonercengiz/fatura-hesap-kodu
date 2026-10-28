import type { CellValue, Invoice } from '../types';
import { EDM_HEADERS } from './edm';

/** Çıktı Excel'ine yazılabilecek alanlar */
export type OutputFieldId =
  | 'no' | 'date' | 'arrival' | 'type' | 'profile' | 'vkn' | 'name' | 'amount' | 'taxInclusive' | 'currency'
  | 'status' | 'responseStatus' | 'localStatus' | 'envelope' | 'kepObjection' | 'gibCancel' | 'officialObjection' | 'gibObjection' | 'branch' | 'hash' | 'tag'
  | 'code' | 'uuid' | 'taxExclusive' | 'tax' | 'lineCount' | 'source' | 'accountName' | 'firm' | 'batch' | 'blank'
  | 'vat0Base' | 'vat1Base' | 'vat1Tax' | 'vat8Base' | 'vat8Tax' | 'vat10Base' | 'vat10Tax' | 'vat18Base' | 'vat18Tax' | 'vat20Base' | 'vat20Tax' | 'vatOddTax';

export interface OutputColumn {
  id: OutputFieldId;
  header: string;
}

export type RowOrder = 'date-no' | 'date-supplier' | 'added';

/** Tarih sütunları Excel'e nasıl yazılır: metin (GG/AA/YYYY, EDM dosyası gibi) ya da gerçek Excel tarihi */
export type DateCells = 'text' | 'date';

export interface OutputTemplate {
  columns: OutputColumn[];
  rowOrder: RowOrder;
  sheetName: string;
  /** Yoksa metin */
  dateCells?: DateCells;
  /** Dönemde bütün faturalarda boş olan sütunlar da Excel'e yazılır. Yoksa (varsayılan) boş sütunlar atlanır */
  keepEmpty?: true;
}

export const DATE_CELLS_LABELS: Record<DateCells, string> = {
  text: 'Metin (GG/AA/YYYY, EDM listesi gibi)',
  date: 'Gerçek Excel tarihi (GG.AA.YYYY)',
};

/** Sütun harfi: 0 → A, 25 → Z, 26 → AA */
export function colName(i: number): string {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

export const ROW_ORDER_LABELS: Record<RowOrder, string> = {
  'date-no': 'Tarih (eskiden yeniye), aynı gün fatura numarası',
  'date-supplier': 'Tarih, aynı gün satıcı blokları, sonra fatura numarası',
  added: 'Yükleme sırası',
};

/** Satır bağlamı: atamalar, hesap adları, kaynaklar, firma/dönem adı */
export interface RowContext {
  codes: Map<string, string>;
  accountNames?: Map<string, string>;
  sources?: Map<string, 'manual' | 'bulk' | 'rule'>;
  firmName?: string;
  batchName?: string;
}

interface FieldDef {
  label: string;
  /** EDM listesindeki varsayılan başlık (EDM sütunu değilse önerilen başlık) */
  header: string;
  edm: boolean;
  /** Metin tipinde yazılmalı (sayıya dönüşmesin) */
  text?: boolean;
  /** Para biçimi (#,##0.00) */
  money?: boolean;
  /** Tarih: şablon seçerse gerçek Excel tarihi olarak yazılır */
  date?: boolean;
  value: (inv: Invoice, ctx: RowContext) => CellValue;
}

const SRC_LABEL = { manual: 'Elle', bulk: 'Toplu', rule: 'Kural' } as const;
/** EDM listesi yüklendiyse o sütunun ham değeri (EDM'nin verdiği birebir), yoksa XML'den türetilen varsayılan */
const edmOr = (header: string, fallback: (i: Invoice) => CellValue) => (i: Invoice): CellValue => {
  const v = i.edm?.[header];
  return v === undefined || v === null || v === '' ? fallback(i) : v;
};

const sameRate = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.005;
/** Faturanın o orandaki matrahı/KDV'si; faturada o oran yoksa boş hücre */
const vatOf = (rate: number, k: 'base' | 'tax') => (i: Invoice): CellValue => i.vatBreakdown.find((p) => sameRate(p.rate, rate))?.[k] ?? null;
/** Oranı vergisiyle uyuşmayan KDV satırlarının vergisi (matrahları başka satırın tekrarı, sayılmaz) */
const vatOdd = (i: Invoice): CellValue => {
  const ps = i.vatBreakdown.filter((p) => p.rate === null);
  return ps.length ? Math.round(ps.reduce((s, p) => s + p.tax, 0) * 100) / 100 : null;
};

export const FIELD_DEFS: Record<OutputFieldId, FieldDef> = {
  no: { label: 'Fatura No', header: 'Fatura No', edm: true, value: edmOr('Fatura No', (i) => i.no) },
  date: { label: 'Fatura Tarihi', header: 'Fatura Tarihi', edm: true, date: true, value: edmOr('Fatura Tarihi', (i) => i.date) },
  arrival: { label: 'Geliş Zamanı (EDM listesinden; yoksa boş)', header: 'Geliş Zamanı', edm: true, date: true, value: edmOr('Geliş Zamanı', () => '') },
  type: { label: 'Fatura Tipi (Satış, İstisna…)', header: 'Fatura Tipi', edm: true, value: edmOr('Fatura Tipi', (i) => i.invoiceType) },
  profile: { label: 'Fatura Türü (Temel, Ticari…)', header: 'Fatura Türü', edm: true, value: edmOr('Fatura Türü', (i) => i.profile) },
  vkn: { label: 'Gönderen VKN/TCKN', header: 'Gönderen VKN/TCKN', edm: true, text: true, value: edmOr('Gönderen VKN/TCKN', (i) => i.supplierVkn) },
  name: { label: 'Gönderen Unvan/Ad Soyad', header: 'Gönderen Unvan/Ad Soyad', edm: true, value: edmOr('Gönderen Unvan/Ad Soyad', (i) => i.supplierName) },
  amount: { label: 'Tutar (ödenecek)', header: 'Tutar', edm: true, money: true, value: edmOr('Tutar', (i) => i.amount) },
  taxInclusive: { label: 'Fatura toplamı (vergiler dahil; ödenecekten farklı olabilir)', header: 'Fatura Toplamı', edm: false, money: true, value: (i) => i.taxInclusive },
  currency: { label: 'Döviz Cinsi', header: 'Döviz Cinsi', edm: true, value: edmOr('Döviz Cinsi', (i) => i.currency || 'TRY') },
  status: { label: 'Durum (EDM listesinden; yoksa boş)', header: 'Durum', edm: true, value: edmOr('Durum', () => '') },
  responseStatus: { label: 'Yanıt Durumu (EDM listesinden; yoksa boş)', header: 'Yanıt Durumu', edm: true, value: edmOr('Yanıt Durumu', () => '') },
  localStatus: { label: 'Yerele Aktarım Durumu (EDM listesinden; yoksa boş)', header: 'Yerele Aktarım Durumu', edm: true, value: edmOr('Yerele Aktarım Durumu', () => '') },
  envelope: { label: 'Zarf No (EDM listesinden; yoksa boş)', header: 'Zarf No', edm: true, value: edmOr('Zarf No', () => '') },
  kepObjection: { label: 'KEP İtiraz Durumu (EDM listesinden; yoksa boş)', header: 'KEP İtiraz Durumu', edm: true, value: edmOr('KEP İtiraz Durumu', () => '') },
  gibCancel: { label: 'Gib Portal Fatura Iptal Durumu (EDM listesinden; yoksa boş)', header: 'Gib Portal Fatura Iptal Durumu', edm: true, value: edmOr('Gib Portal Fatura Iptal Durumu', () => '') },
  officialObjection: { label: 'Resmi Yazı İtiraz Durumu (EDM listesinden; yoksa boş)', header: 'Resmi Yazı İtiraz Durumu', edm: true, value: edmOr('Resmi Yazı İtiraz Durumu', () => '') },
  gibObjection: { label: 'Gib Portal Fatura İtiraz Durumu (EDM listesinden; yoksa boş)', header: 'Gib Portal Fatura İtiraz Durumu', edm: true, value: edmOr('Gib Portal Fatura İtiraz Durumu', () => '') },
  branch: { label: 'Şube (EDM listesinden; yoksa boş)', header: 'Şube', edm: true, value: edmOr('Şube', () => '') },
  hash: { label: 'Hash (EDM listesinden; yoksa boş)', header: 'Hash', edm: true, value: edmOr('Hash', () => '') },
  tag: { label: 'Etiket (EDM listesinden; yoksa boş)', header: 'Etiket', edm: true, value: edmOr('Etiket', () => '') },
  code: { label: 'Hesap Kodu (atanan)', header: 'Hesap Kodu', edm: false, text: true, value: (i, c) => c.codes.get(i.no) ?? '' },
  uuid: { label: 'ETTN (UUID)', header: 'ETTN', edm: false, text: true, value: (i) => i.uuid },
  taxExclusive: { label: 'Matrah (vergiler hariç)', header: 'Matrah', edm: false, money: true, value: (i) => i.taxExclusive },
  tax: { label: 'Vergi toplamı', header: 'Vergi', edm: false, money: true, value: (i) => i.taxAmount },
  lineCount: { label: 'Kalem sayısı', header: 'Kalem', edm: false, value: (i) => i.lineCount },
  source: { label: 'Atama kaynağı (Elle / Toplu / Kural)', header: 'Kaynak', edm: false, value: (i, c) => { const s = c.sources?.get(i.no); return s ? SRC_LABEL[s] : ''; } },
  accountName: { label: 'Hesap adı (listeden)', header: 'Hesap Adı', edm: false, value: (i, c) => { const code = c.codes.get(i.no); return code ? c.accountNames?.get(code) ?? '' : ''; } },
  firm: { label: 'Firma adı', header: 'Firma', edm: false, value: (_i, c) => c.firmName ?? '' },
  batch: { label: 'Dönem adı', header: 'Dönem', edm: false, value: (_i, c) => c.batchName ?? '' },
  vat0Base: { label: 'KDV %0 matrahı (istisna)', header: 'Matrah %0', edm: false, money: true, value: vatOf(0, 'base') },
  vat1Base: { label: 'KDV %1 matrahı', header: 'Matrah %1', edm: false, money: true, value: vatOf(1, 'base') },
  vat1Tax: { label: 'KDV %1 tutarı', header: 'KDV %1', edm: false, money: true, value: vatOf(1, 'tax') },
  vat8Base: { label: 'KDV %8 matrahı (Temmuz 2023 öncesi oran)', header: 'Matrah %8', edm: false, money: true, value: vatOf(8, 'base') },
  vat8Tax: { label: 'KDV %8 tutarı (Temmuz 2023 öncesi oran)', header: 'KDV %8', edm: false, money: true, value: vatOf(8, 'tax') },
  vat10Base: { label: 'KDV %10 matrahı', header: 'Matrah %10', edm: false, money: true, value: vatOf(10, 'base') },
  vat10Tax: { label: 'KDV %10 tutarı', header: 'KDV %10', edm: false, money: true, value: vatOf(10, 'tax') },
  vat18Base: { label: 'KDV %18 matrahı (Temmuz 2023 öncesi oran)', header: 'Matrah %18', edm: false, money: true, value: vatOf(18, 'base') },
  vat18Tax: { label: 'KDV %18 tutarı (Temmuz 2023 öncesi oran)', header: 'KDV %18', edm: false, money: true, value: vatOf(18, 'tax') },
  vat20Base: { label: 'KDV %20 matrahı', header: 'Matrah %20', edm: false, money: true, value: vatOf(20, 'base') },
  vat20Tax: { label: 'KDV %20 tutarı', header: 'KDV %20', edm: false, money: true, value: vatOf(20, 'tax') },
  vatOddTax: { label: 'Oranı uyuşmayan KDV satırları (bazı operatör faturalarında oran alanına tutar yazılmış; yalnızca vergi)', header: 'Oranı Uyuşmayan KDV', edm: false, money: true, value: vatOdd },
  blank: { label: 'Boş sütun', header: '', edm: false, value: () => '' },
};

/** "KDV dökümü" düğmesinin eklediği sütunlar: bugünkü oranlar (matrah, KDV) + oranı uyuşmayan satırlar. Eski %8/%18 ayrıca eklenir. */
export const KDV_FIELD_IDS: OutputFieldId[] = ['vat0Base', 'vat1Base', 'vat1Tax', 'vat10Base', 'vat10Tax', 'vat20Base', 'vat20Tax', 'vatOddTax'];

/** KDV oranı → o oranın sütunları */
const RATE_FIELDS: [number, OutputFieldId[]][] = [[0, ['vat0Base']], [1, ['vat1Base', 'vat1Tax']], [8, ['vat8Base', 'vat8Tax']], [10, ['vat10Base', 'vat10Tax']], [18, ['vat18Base', 'vat18Tax']], [20, ['vat20Base', 'vat20Tax']]];
const ALL_VAT_IDS = new Set<OutputFieldId>([...RATE_FIELDS.flatMap(([, ids]) => ids), 'vatOddTax']);

/**
 * Şablonda KDV dökümü varken faturanın Excel'e yazılamayan KDV oranları (sütunu eklenmemiş; null = oranı uyuşmayan
 * satırlar). Şablonda hiç KDV sütunu yoksa boş: kullanıcı KDV istemiyor demektir.
 */
export function vatUncovered(inv: Invoice, t: OutputTemplate): (number | null)[] {
  const ids = new Set(t.columns.map((c) => c.id));
  if (!usesVat(t)) return [];
  const out: (number | null)[] = [];
  for (const p of inv.vatBreakdown) {
    if (p.rate === null) { if (p.tax && !ids.has('vatOddTax')) out.push(null); continue; }
    const f = RATE_FIELDS.find(([r]) => sameRate(p.rate, r));
    if (!f || !f[1].some((id) => ids.has(id))) out.push(p.rate);
  }
  return out;
}

/** Bir KDV oranını Excel'e yazan sütunlar (null = oranı uyuşmayan satırlar) */
export function vatFieldsFor(rate: number | null): OutputFieldId[] {
  if (rate === null) return ['vatOddTax'];
  return RATE_FIELDS.find(([r]) => sameRate(rate, r))?.[1] ?? [];
}

/** Bugün kaydedilmiş şablon/seçimlerdeki kaldırılan kimlikler: "KDV Diğer" → oranı uyuşmayan KDV; "Matrah Diğer" atılır */
export const RENAMED_FIELDS: Record<string, OutputFieldId | null> = { vatOtherTax: 'vatOddTax', vatOtherBase: null };

/** EDM sütunlarının alan kimlikleri, EDM sırasıyla (EDM_HEADERS ile birebir) */
export const EDM_FIELD_IDS: OutputFieldId[] = ['no', 'date', 'arrival', 'type', 'profile', 'vkn', 'name', 'amount', 'currency', 'status', 'responseStatus', 'localStatus', 'envelope', 'kepObjection', 'gibCancel', 'officialObjection', 'gibObjection', 'branch', 'hash', 'tag'];

/** EDM 20 sütun + Hesap Kodu (1 tabanlı konuma araya) */
export function edmTemplate(codeColumnIndex = 3, codeHeader = 'Hesap Kodu', rowOrder: RowOrder = 'date-no'): OutputTemplate {
  const columns: OutputColumn[] = EDM_FIELD_IDS.map((id, k) => ({ id, header: EDM_HEADERS[k] }));
  const at = Math.min(Math.max(codeColumnIndex, 1), columns.length + 1) - 1;
  columns.splice(at, 0, { id: 'code', header: codeHeader || 'Hesap Kodu' });
  return { columns, rowOrder, sheetName: 'Sheet0' };
}

export const DEFAULT_OUTPUT_TEMPLATE: OutputTemplate = edmTemplate();

/** Bozuk/eksik kayıtları toparlar: bilinmeyen alan atılır, kaldırılan alanlar çevrilir, en az bir sütun */
export function normalizeTemplate(t: Partial<OutputTemplate> | undefined | null): OutputTemplate {
  const cols = (t?.columns ?? []).filter(Boolean).map((c) => {
    const old = c.id as string;
    const id = (old in RENAMED_FIELDS ? RENAMED_FIELDS[old] : old) as OutputFieldId | null;
    // Kaldırılan alanın varsayılan başlığı yenisininkiyle değişir; kullanıcının yazdığı başlık korunur
    const header = old !== id && c.header === 'KDV Diğer' && id ? FIELD_DEFS[id].header : String(c.header ?? '');
    return id && id in FIELD_DEFS ? { id, header } : null;
  }).filter((c): c is OutputColumn => c !== null);
  // Hesap Kodu zorunlu değil: uygulama yalnızca veri toplamak için de kullanılabilir
  if (cols.length === 0) return DEFAULT_OUTPUT_TEMPLATE;
  const rowOrder: RowOrder = t?.rowOrder && t.rowOrder in ROW_ORDER_LABELS ? t.rowOrder : 'date-no';
  return { columns: cols, rowOrder, sheetName: (t?.sheetName ?? '').trim() || 'Sheet0', ...(t?.dateCells === 'date' ? { dateCells: 'date' as const } : {}), ...(t?.keepEmpty === true ? { keepEmpty: true as const } : {}) };
}

/** Şablonun EDM varsayılanıyla aynı olup olmadığı (bilgi amaçlı) */
export function isEdmDefault(t: OutputTemplate): boolean {
  const d = DEFAULT_OUTPUT_TEMPLATE;
  return t.columns.length === d.columns.length && t.columns.every((c, k) => c.id === d.columns[k].id && c.header === d.columns[k].header);
}

/** Başlık + satırlar; verilen satır sırasıyla */
export function buildTemplateRows(invoices: Invoice[], t: OutputTemplate, ctx: RowContext): CellValue[][] {
  const out: CellValue[][] = [t.columns.map((c) => c.header)];
  for (const inv of invoices) out.push(t.columns.map((c) => FIELD_DEFS[c.id].value(inv, ctx)));
  return out;
}

/** Metin tipinde yazılması gereken sütun indeksleri (0 tabanlı) */
export function textColumns(t: OutputTemplate): number[] {
  return t.columns.map((c, k) => (FIELD_DEFS[c.id].text ? k : -1)).filter((k) => k >= 0);
}

/** Gerçek Excel tarihi olarak yazılacak sütunlar (şablon metin istiyorsa boş) */
export function dateColumns(t: OutputTemplate): number[] {
  if (t.dateCells !== 'date') return [];
  return t.columns.map((c, k) => (FIELD_DEFS[c.id].date ? k : -1)).filter((k) => k >= 0);
}

/** "GG/AA/YYYY", "GG.AA.YYYY", "YYYY-AA-GG" (isteğe bağlı saatle) → Excel seri günü; tanınmazsa null */
export function excelDateSerial(v: CellValue): { serial: number; time: boolean } | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let y: number, mo: number, d: number;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    y = +m[1]; mo = +m[2]; d = +m[3];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const day = (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
  const time = m[4] !== undefined;
  const frac = time ? (+m[4] * 3600 + +m[5] * 60 + +(m[6] ?? 0)) / 86400 : 0;
  return { serial: day + frac, time };
}

/** Şablonda KDV dökümü sütunu var mı */
export function usesVat(t: OutputTemplate): boolean {
  return t.columns.some((c) => ALL_VAT_IDS.has(c.id));
}

export function moneyColumns(t: OutputTemplate): number[] {
  return t.columns.map((c, k) => (FIELD_DEFS[c.id].money ? k : -1)).filter((k) => k >= 0);
}

export function codeColumnIndexOf(t: OutputTemplate): number {
  return t.columns.findIndex((c) => c.id === 'code');
}

/* Şablon düzenleme işlemleri (saf): şablon penceresi, önizleme ve liste aynı işlemleri kullanır */

export const withColumns = (t: OutputTemplate, columns: OutputColumn[]): OutputTemplate => ({ ...t, columns });
export const addColumn = (t: OutputTemplate, id: OutputFieldId, header = FIELD_DEFS[id].header): OutputTemplate => withColumns(t, [...t.columns, { id, header }]);
export const removeColumn = (t: OutputTemplate, k: number): OutputTemplate => withColumns(t, t.columns.filter((_, i) => i !== k));
export const renameColumn = (t: OutputTemplate, k: number, header: string): OutputTemplate => withColumns(t, t.columns.map((c, i) => (i === k ? { ...c, header } : c)));
export function moveColumn(t: OutputTemplate, from: number, to: number): OutputTemplate {
  if (from === to || from < 0 || to < 0 || from >= t.columns.length || to >= t.columns.length) return t;
  const cols = t.columns.slice();
  const [c] = cols.splice(from, 1);
  cols.splice(to, 0, c);
  return withColumns(t, cols);
}
/** Alanı şablona ekler (sona) ya da bütün sütunlarını çıkarır */
export const toggleField = (t: OutputTemplate, id: OutputFieldId, on: boolean): OutputTemplate =>
  on ? (t.columns.some((c) => c.id === id) ? t : addColumn(t, id)) : withColumns(t, t.columns.filter((c) => c.id !== id));

/** Basit görünümde alan grupları (sıra ekrandaki sıra) */
export const FIELD_GROUPS: { title: string; ids: OutputFieldId[] }[] = [
  { title: 'Fatura', ids: ['no', 'date', 'type', 'profile', 'uuid', 'currency', 'lineCount'] },
  { title: 'Satıcı', ids: ['name', 'vkn'] },
  { title: 'Tutarlar', ids: ['amount', 'taxInclusive', 'taxExclusive', 'tax'] },
  { title: 'KDV dökümü', ids: ['vat0Base', 'vat1Base', 'vat1Tax', 'vat10Base', 'vat10Tax', 'vat20Base', 'vat20Tax', 'vat8Base', 'vat8Tax', 'vat18Base', 'vat18Tax', 'vatOddTax'] },
  { title: 'Hesap kodu', ids: ['code', 'accountName', 'source'] },
  { title: 'EDM listesinden (yüklenmediyse boş)', ids: ['arrival', 'status', 'responseStatus', 'localStatus', 'envelope', 'kepObjection', 'gibCancel', 'officialObjection', 'gibObjection', 'branch', 'hash', 'tag'] },
  { title: 'Diğer', ids: ['firm', 'batch'] },
];

/**
 * Faturaların hepsinde boş olan sütunlar (şablondaki sıra). Bilerek eklenen "Boş sütun" ve Hesap Kodu hiç sayılmaz: onlar boş da olsa
 * yazılır (kod henüz atanmamış olabilir). Fatura yoksa hiçbir sütun boş sayılmaz.
 */
export function emptyColumns(t: OutputTemplate, invoices: Invoice[], ctx: RowContext): Set<number> {
  const out = new Set<number>();
  if (!invoices.length) return out;
  t.columns.forEach((c, k) => {
    if (c.id === 'blank' || c.id === 'code') return;
    if (invoices.every((i) => { const v = FIELD_DEFS[c.id].value(i, ctx); return v === null || v === undefined || v === ''; })) out.add(k);
  });
  return out;
}

/** Excel'e yazılacak şablon: "Boş sütunları atla" açıksa (varsayılan) boş sütunlar çıkar */
export function skipEmpty(t: OutputTemplate, empty: Set<number>): OutputTemplate {
  return t.keepEmpty || !empty.size ? t : withColumns(t, t.columns.filter((_, k) => !empty.has(k)));
}

/** Şablondaki her sütunun Excel'deki harfi; atlanan sütun null */
export function excelLettersOf(t: OutputTemplate, empty: Set<number>): (string | null)[] {
  let n = 0;
  return t.columns.map((_, k) => (!t.keepEmpty && empty.has(k) ? null : colName(n++)));
}

