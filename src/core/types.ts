import { DEFAULT_OUTPUT_TEMPLATE, type OutputFieldId, type OutputTemplate } from './excel/template';
import type { LineInfo, VatPart } from './xml/parseUbl';

export type CellValue = string | number | boolean | null;

/** Ekranda ve çıktıda kullanılan fatura özeti; XML'den (eski dönemlerde Excel satırından) türetilir. */
export interface Invoice {
  no: string;
  /** Döneme ekleniş sırası (0 tabanlı) */
  order: number;
  /** GG/AA/YYYY (ekran ve çıktı biçimi) */
  date: string;
  /** YYYY-AA-GG; bilinmiyorsa boş */
  isoDate: string;
  uuid: string;
  supplierVkn: string;
  supplierName: string;
  /** Ödenecek tutar */
  amount: number | null;
  /** Vergiler hariç toplam */
  taxExclusive: number | null;
  /** Toplam vergi */
  taxAmount: number | null;
  currency: string;
  /** Satış / İstisna / Tevkifat / İade … (etiket) */
  invoiceType: string;
  /** SATIS, IADE, TEVKIFAT… (XML'deki kod; kurallar için) */
  typeCode: string;
  /** Temel / Ticari … (etiket) */
  profile: string;
  /** XML + XSLT mevcut → fatura görseli çizilebilir */
  hasView: boolean;
  /** Kalem adları (normalize), kurallar için */
  itemText: string;
  lineCount: number | null;
  /** Kalemler (kurallar için); listeden gelen kayıtlarda boş */
  lines: LineInfo[];
  /** Faturadaki KDV oranları (yüzde) */
  vatRates: number[];
  /** KDV oranına göre matrah ve vergi; XML'siz kayıtlarda boş */
  vatBreakdown: VatPart[];
  /** EDM Excel listesinden gelen ham sütunlar (başlık → değer); XML'de olmayan alanlar çıktıda buradan dolar */
  edm?: Record<string, CellValue>;
}

export interface ShortcutSlot {
  key: string; // q w e a s d
  code: string | null; // sabitlenmiş kod; null ise öneri motoru doldurur
}

export type ViewMode = 'top' | 'last' | 'margin';
export type SortMode = 'date-supplier' | 'added';
export type FilterMode = 'all' | 'unassigned' | 'manual' | 'bulk' | 'rule';

export type Layout = 'hybrid' | 'list';
/** Liste görünümü sütunu: Excel çıktısının alanlarından biri ya da yalnızca listede olan "Dikkat" (uyarılar). Hesap Kodu hep vardır. */
export type ListColumnId = OutputFieldId | 'issues';
export const DEFAULT_LIST_COLUMNS: ListColumnId[] = ['no', 'date', 'name', 'vkn', 'type', 'amount', 'code', 'accountName', 'issues'];
/** Eski (15 sabit sütunlu) liste seçimindeki kimliklerin karşılıkları */
const LEGACY_LIST_IDS: Record<string, ListColumnId> = { supplier: 'name', lines: 'lineCount', account: 'accountName' };

/** Kayıtlı liste seçimini toparlar: eski kimlikler çevrilir, bilinmeyen/yinelenen atılır, Hesap Kodu yoksa eklenir */
export function normalizeListColumns(ids: unknown, valid: (id: string) => boolean): ListColumnId[] {
  if (!Array.isArray(ids)) return DEFAULT_LIST_COLUMNS;
  const out: ListColumnId[] = [];
  for (const raw of ids) {
    const id = (LEGACY_LIST_IDS[String(raw)] ?? raw) as ListColumnId;
    if ((id === 'issues' || (valid(id) && id !== 'blank')) && !out.includes(id)) out.push(id);
  }
  if (!out.includes('code')) out.push('code');
  return out.length > 1 ? out : DEFAULT_LIST_COLUMNS;
}

export interface Settings {
  /** Çıktı Excel şablonu: sütunlar, başlıklar, satır sırası, sayfa adı */
  outputTemplate: OutputTemplate;
  /** Ana ekran: görsel (görsel + panel) ya da yalın liste */
  layout: Layout;
  /** Liste görünümünde gösterilen sütunlar, sırasıyla (kendi seçimim) */
  listColumns: ListColumnId[];
  /** Liste görünümü açık firmanın Excel şablonundaki sütunları gösterir (ekranda ne varsa Excel'e o çıkar) */
  listFollowsTemplate: boolean;
  viewMode: ViewMode;
  marginPx: number;
  theme: 'light' | 'dark';
  sortMode: SortMode;
  /** Kod verince sıradaki faturaya kendiliğinden geç (varsayılan kapalı: kullanıcı atamayı görüp kendisi geçer) */
  autoAdvance: boolean;
  /** Fatura görüntüsü yakınlaştırması; null = kendiliğinden (sayfanın üst yarısı ekranı doldurur) */
  viewZoom: number | null;
}

export const DEFAULT_SHORTCUT_KEYS = ['q', 'w', 'e', 'a', 's', 'd'] as const;

export const DEFAULT_SETTINGS: Settings = {
  outputTemplate: DEFAULT_OUTPUT_TEMPLATE,
  layout: 'hybrid',
  listColumns: DEFAULT_LIST_COLUMNS,
  listFollowsTemplate: false,
  viewMode: 'top',
  marginPx: 0,
  theme: 'light',
  sortMode: 'date-supplier',
  autoAdvance: false,
  viewZoom: null,
};

/** UBL-TR InvoiceTypeCode → EDM listesindeki "Fatura Tipi" etiketi */
export const TYPE_LABELS: Record<string, string> = {
  SATIS: 'Satış',
  IADE: 'İade',
  TEVKIFAT: 'Tevkifat',
  ISTISNA: 'İstisna',
  OZELMATRAH: 'Özel Matrah',
  IHRACKAYITLI: 'İhraç Kayıtlı',
  SGK: 'SGK',
  KOMISYONCU: 'Komisyoncu',
  HKSSATIS: 'HKS Satış',
  HKSKOMISYONCU: 'HKS Komisyoncu',
  TEVKIFATIADE: 'Tevkifat İade',
  KONAKLAMAVERGISI: 'Konaklama Vergisi',
};

/** UBL-TR ProfileID → EDM listesindeki "Fatura Türü" etiketi */
export const PROFILE_LABELS: Record<string, string> = {
  TEMELFATURA: 'Temel',
  TICARIFATURA: 'Ticari',
  IHRACAT: 'İhracat',
  YOLCUBERABERFATURA: 'Yolcu Beraber',
  KAMU: 'Kamu',
  HKS: 'HKS',
  EARSIVFATURA: 'e-Arşiv',
  ENERJI: 'Enerji',
};

/** Kod bilinmiyorsa (ya da zaten etiketse) olduğu gibi döner */
export function typeLabel(code: string): string {
  const k = code.trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');
  return TYPE_LABELS[k] ?? code.trim();
}
export function profileLabel(code: string): string {
  const k = code.trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');
  return PROFILE_LABELS[k] ?? code.trim();
}

/** YYYY-AA-GG → GG/AA/YYYY; başka biçimse olduğu gibi */
export function toDisplayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
