export type CellValue = string | number | boolean | null;

/** Ekranda ve çıktıda kullanılan fatura özeti; XML'den (eski partilerde Excel satırından) türetilir. */
export interface Invoice {
  no: string;
  /** Partiye ekleniş sırası (0 tabanlı) */
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
  /** Temel / Ticari … (etiket) */
  profile: string;
  /** XML + XSLT mevcut → fatura görseli çizilebilir */
  hasView: boolean;
}

export interface ShortcutSlot {
  key: string; // q w e a s d
  code: string | null; // sabitlenmiş kod; null ise öneri motoru doldurur
}

export type ViewMode = 'top' | 'last' | 'margin';
export type SortMode = 'date-supplier' | 'added';
export type FilterMode = 'all' | 'unassigned' | 'manual' | 'bulk';

export interface Settings {
  codeColumnIndex: number; // 1 tabanlı; varsayılan 3
  codeHeader: string; // varsayılan "Hesap Kodu"
  viewMode: ViewMode;
  marginPx: number;
  theme: 'light' | 'dark';
  sortMode: SortMode;
}

export const DEFAULT_SHORTCUT_KEYS = ['q', 'w', 'e', 'a', 's', 'd'] as const;

export const DEFAULT_SETTINGS: Settings = {
  codeColumnIndex: 3,
  codeHeader: 'Hesap Kodu',
  viewMode: 'top',
  marginPx: 0,
  theme: 'light',
  sortMode: 'date-supplier',
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
