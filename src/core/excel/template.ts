import type { CellValue, Invoice } from '../types';
import { EDM_HEADERS } from './edm';

/** Çıktı Excel'ine yazılabilecek alanlar */
export type OutputFieldId =
  | 'no' | 'date' | 'arrival' | 'type' | 'profile' | 'vkn' | 'name' | 'amount' | 'currency'
  | 'status' | 'responseStatus' | 'localStatus' | 'envelope' | 'kepObjection' | 'gibCancel' | 'officialObjection' | 'gibObjection' | 'branch' | 'hash' | 'tag'
  | 'code' | 'uuid' | 'taxExclusive' | 'tax' | 'lineCount' | 'source' | 'accountName' | 'firm' | 'batch' | 'blank';

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

/** Satır bağlamı: atamalar, hesap adları, kaynaklar, firma/parti adı */
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
  value: (inv: Invoice, ctx: RowContext) => CellValue;
}

const SRC_LABEL = { manual: 'Elle', bulk: 'Toplu', rule: 'Kural' } as const;

export const FIELD_DEFS: Record<OutputFieldId, FieldDef> = {
  no: { label: 'Fatura No', header: 'Fatura No', edm: true, value: (i) => i.no },
  date: { label: 'Fatura Tarihi (GG/AA/YYYY)', header: 'Fatura Tarihi', edm: true, value: (i) => i.date },
  arrival: { label: 'Geliş Zamanı (XML\'de yok, boş)', header: 'Geliş Zamanı', edm: true, value: () => '' },
  type: { label: 'Fatura Tipi (Satış, İstisna…)', header: 'Fatura Tipi', edm: true, value: (i) => i.invoiceType },
  profile: { label: 'Fatura Türü (Temel, Ticari…)', header: 'Fatura Türü', edm: true, value: (i) => i.profile },
  vkn: { label: 'Gönderen VKN/TCKN', header: 'Gönderen VKN/TCKN', edm: true, text: true, value: (i) => i.supplierVkn },
  name: { label: 'Gönderen Unvan/Ad Soyad', header: 'Gönderen Unvan/Ad Soyad', edm: true, value: (i) => i.supplierName },
  amount: { label: 'Tutar (ödenecek)', header: 'Tutar', edm: true, value: (i) => i.amount },
  currency: { label: 'Döviz Cinsi', header: 'Döviz Cinsi', edm: true, value: (i) => i.currency || 'TRY' },
  status: { label: 'Durum (boş)', header: 'Durum', edm: true, value: () => '' },
  responseStatus: { label: 'Yanıt Durumu (boş)', header: 'Yanıt Durumu', edm: true, value: () => '' },
  localStatus: { label: 'Yerele Aktarım Durumu (boş)', header: 'Yerele Aktarım Durumu', edm: true, value: () => '' },
  envelope: { label: 'Zarf No (boş)', header: 'Zarf No', edm: true, value: () => '' },
  kepObjection: { label: 'KEP İtiraz Durumu (boş)', header: 'KEP İtiraz Durumu', edm: true, value: () => '' },
  gibCancel: { label: 'Gib Portal Fatura Iptal Durumu (boş)', header: 'Gib Portal Fatura Iptal Durumu', edm: true, value: () => '' },
  officialObjection: { label: 'Resmi Yazı İtiraz Durumu (boş)', header: 'Resmi Yazı İtiraz Durumu', edm: true, value: () => '' },
  gibObjection: { label: 'Gib Portal Fatura İtiraz Durumu (boş)', header: 'Gib Portal Fatura İtiraz Durumu', edm: true, value: () => '' },
  branch: { label: 'Şube (boş)', header: 'Şube', edm: true, value: () => '' },
  hash: { label: 'Hash (boş)', header: 'Hash', edm: true, value: () => '' },
  tag: { label: 'Etiket (boş)', header: 'Etiket', edm: true, value: () => '' },
  code: { label: 'Hesap Kodu (atanan)', header: 'Hesap Kodu', edm: false, text: true, value: (i, c) => c.codes.get(i.no) ?? '' },
  uuid: { label: 'ETTN (UUID)', header: 'ETTN', edm: false, text: true, value: (i) => i.uuid },
  taxExclusive: { label: 'Matrah (vergiler hariç)', header: 'Matrah', edm: false, value: (i) => i.taxExclusive },
  tax: { label: 'Vergi toplamı', header: 'Vergi', edm: false, value: (i) => i.taxAmount },
  lineCount: { label: 'Kalem sayısı', header: 'Kalem', edm: false, value: (i) => i.lineCount },
  source: { label: 'Atama kaynağı (Elle / Toplu / Kural)', header: 'Kaynak', edm: false, value: (i, c) => { const s = c.sources?.get(i.no); return s ? SRC_LABEL[s] : ''; } },
  accountName: { label: 'Hesap adı (listeden)', header: 'Hesap Adı', edm: false, value: (i, c) => { const code = c.codes.get(i.no); return code ? c.accountNames?.get(code) ?? '' : ''; } },
  firm: { label: 'Firma adı', header: 'Firma', edm: false, value: (_i, c) => c.firmName ?? '' },
  batch: { label: 'Parti adı', header: 'Parti', edm: false, value: (_i, c) => c.batchName ?? '' },
  blank: { label: 'Boş sütun', header: '', edm: false, value: () => '' },
};

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

export function codeColumnIndexOf(t: OutputTemplate): number {
  return t.columns.findIndex((c) => c.id === 'code');
}
