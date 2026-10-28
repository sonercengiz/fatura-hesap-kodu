import type { CellValue, Invoice } from '../types';
import { EDM_HEADERS } from './edm';

/** Çıktı Excel'ine yazılabilecek alanlar */
export type OutputFieldId =
  | 'no' | 'date' | 'arrival' | 'type' | 'profile' | 'vkn' | 'name' | 'amount' | 'currency'
  | 'status' | 'responseStatus' | 'localStatus' | 'envelope' | 'kepObjection' | 'gibCancel' | 'officialObjection' | 'gibObjection' | 'branch' | 'hash' | 'tag'
  | 'code' | 'uuid' | 'taxExclusive' | 'tax' | 'lineCount' | 'source' | 'accountName' | 'firm' | 'batch' | 'blank'
  | 'vat0Base' | 'vat1Base' | 'vat1Tax' | 'vat10Base' | 'vat10Tax' | 'vat20Base' | 'vat20Tax' | 'vatOtherBase' | 'vatOtherTax';

export interface OutputColumn {
  id: OutputFieldId;
  header: string;
}

export type RowOrder = 'date-no' | 'date-supplier' | 'added';

export interface OutputTemplate {
  columns: OutputColumn[];
  rowOrder: RowOrder;
  sheetName: string;
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
  value: (inv: Invoice, ctx: RowContext) => CellValue;
}

const SRC_LABEL = { manual: 'Elle', bulk: 'Toplu', rule: 'Kural' } as const;
/** EDM listesi yüklendiyse o sütunun ham değeri (EDM'nin verdiği birebir), yoksa XML'den türetilen varsayılan */
const edmOr = (header: string, fallback: (i: Invoice) => CellValue) => (i: Invoice): CellValue => {
  const v = i.edm?.[header];
  return v === undefined || v === null || v === '' ? fallback(i) : v;
};

/** Ayrı sütunu olan KDV oranları; diğerleri (eski %8, %18 gibi) "diğer oranlar" sütununda toplanır */
const KDV_RATES = [0, 1, 10, 20];
const sameRate = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.005;
/** Faturanın o orandaki matrahı/KDV'si; faturada o oran yoksa boş hücre */
const vatOf = (rate: number, k: 'base' | 'tax') => (i: Invoice): CellValue => i.vatBreakdown.find((p) => sameRate(p.rate, rate))?.[k] ?? null;
/** Diğer oranlar + oranı tutmayan KDV satırları (vergisi; matrahı tekrar olduğu için sayılmaz) */
const vatOther = (k: 'base' | 'tax') => (i: Invoice): CellValue => {
  const ps = i.vatBreakdown.filter((p) => !KDV_RATES.some((r) => sameRate(p.rate, r)) && (k === 'tax' || p.rate !== null));
  return ps.length ? Math.round(ps.reduce((s, p) => s + p[k], 0) * 100) / 100 : null;
};

export const FIELD_DEFS: Record<OutputFieldId, FieldDef> = {
  no: { label: 'Fatura No', header: 'Fatura No', edm: true, value: edmOr('Fatura No', (i) => i.no) },
  date: { label: 'Fatura Tarihi (GG/AA/YYYY)', header: 'Fatura Tarihi', edm: true, value: edmOr('Fatura Tarihi', (i) => i.date) },
  arrival: { label: 'Geliş Zamanı (EDM listesinden; yoksa boş)', header: 'Geliş Zamanı', edm: true, value: edmOr('Geliş Zamanı', () => '') },
  type: { label: 'Fatura Tipi (Satış, İstisna…)', header: 'Fatura Tipi', edm: true, value: edmOr('Fatura Tipi', (i) => i.invoiceType) },
  profile: { label: 'Fatura Türü (Temel, Ticari…)', header: 'Fatura Türü', edm: true, value: edmOr('Fatura Türü', (i) => i.profile) },
  vkn: { label: 'Gönderen VKN/TCKN', header: 'Gönderen VKN/TCKN', edm: true, text: true, value: edmOr('Gönderen VKN/TCKN', (i) => i.supplierVkn) },
  name: { label: 'Gönderen Unvan/Ad Soyad', header: 'Gönderen Unvan/Ad Soyad', edm: true, value: edmOr('Gönderen Unvan/Ad Soyad', (i) => i.supplierName) },
  amount: { label: 'Tutar (ödenecek)', header: 'Tutar', edm: true, money: true, value: edmOr('Tutar', (i) => i.amount) },
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
  vat10Base: { label: 'KDV %10 matrahı', header: 'Matrah %10', edm: false, money: true, value: vatOf(10, 'base') },
  vat10Tax: { label: 'KDV %10 tutarı', header: 'KDV %10', edm: false, money: true, value: vatOf(10, 'tax') },
  vat20Base: { label: 'KDV %20 matrahı', header: 'Matrah %20', edm: false, money: true, value: vatOf(20, 'base') },
  vat20Tax: { label: 'KDV %20 tutarı', header: 'KDV %20', edm: false, money: true, value: vatOf(20, 'tax') },
  vatOtherBase: { label: 'KDV diğer oranlar matrahı (%8, %18 gibi eski oranlar)', header: 'Matrah Diğer', edm: false, money: true, value: vatOther('base') },
  vatOtherTax: { label: 'KDV diğer oranlar tutarı (%8, %18 gibi eski oranlar; oranı tutarıyla uyuşmayan KDV satırları da)', header: 'KDV Diğer', edm: false, money: true, value: vatOther('tax') },
  blank: { label: 'Boş sütun', header: '', edm: false, value: () => '' },
};

/** "KDV dökümü" düğmesinin eklediği sütunlar, oran sırasıyla (matrah, KDV) */
export const KDV_FIELD_IDS: OutputFieldId[] = ['vat0Base', 'vat1Base', 'vat1Tax', 'vat10Base', 'vat10Tax', 'vat20Base', 'vat20Tax', 'vatOtherBase', 'vatOtherTax'];

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

/** Bozuk/eksik kayıtları toparlar: en az bir sütun, kod sütunu yoksa sona ekler */
export function normalizeTemplate(t: Partial<OutputTemplate> | undefined | null): OutputTemplate {
  const cols = (t?.columns ?? []).filter((c) => c && c.id in FIELD_DEFS).map((c) => ({ id: c.id, header: String(c.header ?? '') }));
  if (cols.length === 0) return DEFAULT_OUTPUT_TEMPLATE;
  if (!cols.some((c) => c.id === 'code')) cols.push({ id: 'code', header: 'Hesap Kodu' });
  const rowOrder: RowOrder = t?.rowOrder && t.rowOrder in ROW_ORDER_LABELS ? t.rowOrder : 'date-no';
  return { columns: cols, rowOrder, sheetName: (t?.sheetName ?? '').trim() || 'Sheet0' };
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

export function moneyColumns(t: OutputTemplate): number[] {
  return t.columns.map((c, k) => (FIELD_DEFS[c.id].money ? k : -1)).filter((k) => k >= 0);
}

export function codeColumnIndexOf(t: OutputTemplate): number {
  return t.columns.findIndex((c) => c.id === 'code');
}
