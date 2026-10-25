import Dexie, { type Table } from 'dexie';
import type { EdmSheet, Settings, ShortcutSlot } from '../core/types';
import { DEFAULT_SHORTCUT_KEYS } from '../core/types';
import type { HistoryEntry } from '../core/suggest/engine';

export interface FirmHistoryEntry extends HistoryEntry {
  firmId: string;
}

/** Mükellef / firma: ad, kısayollar ve hesap listesi adı firmaya bağlıdır. */
export interface FirmRecord {
  id: string;
  name: string;
  createdAt: number;
  shortcuts: ShortcutSlot[];
  chartName: string;
}

export interface BatchRecord {
  id: string;
  firmId: string;
  name: string;
  sourceFileName: string;
  createdAt: number;
  updatedAt: number;
  savedAt: number | null;
  sheet: EdmSheet;
}

export type AssignmentSource = 'manual' | 'bulk';

export interface AssignmentRecord {
  batchId: string;
  no: string;
  code: string;
  at: number;
  /** Elle (uygulama içi) ya da toplu atama; eski kayıtlarda yoksa elle sayılır */
  source?: AssignmentSource;
}

export interface FileRecord {
  id: string;
  batchId: string;
  name: string;
  size: number;
  pageCount: number;
  pageTexts: string[];
  blob: Blob;
  addedAt: number;
}

/** Kullanıcının elle kurduğu PDF ↔ fatura bağlantısı. Dosya ad+boyut ile de tutulur ki PDF'ler yeniden eklenince bağlantı korunsun. */
export interface LinkRecord {
  id?: number;
  batchId: string;
  no: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  pageStart: number;
  pageEnd: number;
}

/** Kullanıcının kendi hesap kodu listesi (kod + isim), firmaya bağlı */
export interface AccountRecord {
  firmId: string;
  code: string;
  name: string;
  addedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

class AppDb extends Dexie {
  batches!: Table<BatchRecord, string>;
  assignments!: Table<AssignmentRecord, [string, string]>;
  files!: Table<FileRecord, string>;
  settings!: Table<SettingRecord, string>;
  links!: Table<LinkRecord, number>;
  firms!: Table<FirmRecord, string>;
  firmHistory!: Table<FirmHistoryEntry, [string, string, string]>;
  firmAccounts!: Table<AccountRecord, [string, string]>;

  constructor() {
    super('fatura-hesap-kodu');
    this.version(1).stores({
      batches: 'id, updatedAt',
      assignments: '[batchId+no], batchId, no',
      files: 'id, batchId',
      history: '[vkn+code], vkn, code',
      settings: 'key',
    });
    this.version(2).stores({
      batches: 'id, updatedAt',
      assignments: '[batchId+no], batchId, no',
      files: 'id, batchId',
      history: '[vkn+code], vkn, code',
      settings: 'key',
      links: '++id, batchId, fileId, no',
    });
    this.version(3).stores({
      batches: 'id, updatedAt',
      assignments: '[batchId+no], batchId, no',
      files: 'id, batchId',
      history: '[vkn+code], vkn, code',
      settings: 'key',
      links: '++id, batchId, fileId, no',
      accounts: 'code',
    });
    this.version(4)
      .stores({
        batches: 'id, updatedAt, firmId',
        firms: 'id, name',
        firmHistory: '[firmId+vkn+code], firmId',
        firmAccounts: '[firmId+code], firmId',
      })
      .upgrade(async (tx) => {
        // Mevcut veriler "varsayılan firma" altında toplanır
        const settings = (await tx.table('settings').get('settings'))?.value as Partial<Settings & { firmName?: string; shortcuts?: ShortcutSlot[]; chartName?: string }> | undefined;
        const firmId = DEFAULT_FIRM_ID;
        await tx.table('firms').put({
          id: firmId,
          name: settings?.firmName?.trim() || 'Firma 1',
          createdAt: Date.now(),
          shortcuts: settings?.shortcuts ?? DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })),
          chartName: settings?.chartName || 'Hesap kodu listem',
        });
        await tx.table('batches').toCollection().modify((b: BatchRecord) => { if (!b.firmId) b.firmId = firmId; });
        const hist = await tx.table('history').toArray();
        if (hist.length) await tx.table('firmHistory').bulkPut(hist.map((h) => ({ ...h, firmId })));
        const acc = await tx.table('accounts').toArray();
        if (acc.length) await tx.table('firmAccounts').bulkPut(acc.map((a) => ({ ...a, firmId })));
        await tx.table('settings').put({ key: 'currentFirmId', value: firmId });
      });
    this.version(5).stores({ history: null, accounts: null });
  }
}

export const DEFAULT_FIRM_ID = 'firm-default';

export const db = new AppDb();

export async function loadSettings(defaults: Settings): Promise<Settings> {
  const rec = await db.settings.get('settings');
  return { ...defaults, ...((rec?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.settings.put({ key: 'settings', value: s });
}


export function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
