export type CellValue = string | number | boolean | null;

/** EDM'den gelen Excel, olduğu gibi: başlık satırı + hücre matrisi. */
export interface EdmSheet {
  sheetName: string;
  headers: string[];
  rows: CellValue[][];
}

/** Excel satırından türetilen fatura özeti. rowIndex = rows[] içindeki indeks. */
export interface Invoice {
  no: string;
  rowIndex: number;
  date: string;
  supplierVkn: string;
  supplierName: string;
  amount: number | null;
  currency: string;
  invoiceType: string; // Satış / İstisna / Tevkifat / İade
  profile: string; // Ticari / Temel
}

/** Bir faturanın bir PDF dosyasındaki sayfa aralığı (1 tabanlı, kapsayıcı). */
export interface PdfRef {
  fileId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
}

export interface ShortcutSlot {
  key: string; // q w e a s d
  code: string | null; // sabitlenmiş kod; null ise öneri motoru doldurur
}

export type ViewMode = 'top' | 'last' | 'margin';
export type SortMode = 'excel' | 'date-supplier';
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
  sortMode: 'excel',
};
