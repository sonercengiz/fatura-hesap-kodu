import Dexie, { type Table } from 'dexie';
import type { Settings, ShortcutSlot, CellValue } from '../core/types';
import { DEFAULT_SHORTCUT_KEYS } from '../core/types';
import type { HistoryEntry } from '../core/suggest/engine';
import { sheetToInvoices, type EdmSheet } from '../core/legacy';
import type { Rule } from '../core/rules';
import { edmTemplate, foldLegacyKdv, normalizeTemplate, type OutputTemplate } from '../core/excel/template';
import { itemTextOf, linesOf, taxExtrasOf, taxInclusiveOf, vatBreakdownOf, vatRatesOf, type LineInfo, type TaxExtras, type VatPart } from '../core/xml/parseUbl';
import { upgradeRule } from '../core/rules';

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
  /** Firmaya özel çıktı şablonu; yoksa genel şablon (ayarlar) kullanılır */
  outputTemplate?: OutputTemplate;
}

/** Dönem: bir dönemin faturaları (XML'ler peyderpey eklenebilir). */
export interface BatchRecord {
  id: string;
  firmId: string;
  name: string;
  /** Ad kullanıcı tarafından verilmediyse baskın aya göre kendiliğinden güncellenir */
  autoName: boolean;
  createdAt: number;
  updatedAt: number;
  /** Döneme özel çıktı şablonu; yoksa firmanınki ya da genel */
  outputTemplate?: OutputTemplate;
}

/** Bir fatura; XML'i (XSLT'si ayrılmış) ve başlık alanları. EDM listesinden gelen ya da XML'i kaldırılan faturada xml null. */
export interface InvoiceRecord {
  batchId: string;
  no: string;
  uuid: string;
  /** YYYY-AA-GG */
  issueDate: string;
  issueTime: string;
  profileId: string;
  typeCode: string;
  currency: string;
  supplierVkn: string;
  supplierName: string;
  payable: number | null;
  /** Vergiler dahil fatura toplamı; eski kayıtlarda v13 XML'den tamamlar */
  taxInclusive?: number | null;
  taxExclusive: number | null;
  taxAmount: number | null;
  lineCount: number | null;
  /** Kalem adları (normalize); kurallar için. Eski kayıtlarda boş olabilir */
  itemText: string;
  /** Kalemler (ad, miktar, birim, KDV); kurallar için. Eski kayıtlarda yok */
  lines?: LineInfo[];
  /** Faturadaki KDV oranları (yüzde) */
  vatRates?: number[];
  /** KDV oranına göre matrah ve vergi; eski kayıtlarda v12 XML'den tamamlar */
  vatBreakdown?: VatPart[];
  /** KDV dışı vergiler, tevkifat, kur; eski kayıtlarda v15 XML'den tamamlar */
  taxExtras?: TaxExtras;
  /** Excel çıktısına girmez (kullanıcı çıkardı) */
  excluded?: boolean;
  xml: string | null;
  xsltId: string | null;
  /** EDM Excel listesinden gelen ham sütunlar (başlık → değer) */
  edm?: Record<string, CellValue>;
  fileName: string;
  addedAt: number;
  order: number;
}

/** Gömülü görünüm şablonu; içerik özetiyle tekilleştirilir */
export interface XsltRecord {
  id: string;
  text: string;
}

export type AssignmentSource = 'manual' | 'bulk' | 'rule';

export interface AssignmentRecord {
  batchId: string;
  no: string;
  code: string;
  at: number;
  /** Elle (uygulama içi) ya da toplu atama; eski kayıtlarda yoksa elle sayılır */
  source?: AssignmentSource;
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
  invoices!: Table<InvoiceRecord, [string, string]>;
  xslts!: Table<XsltRecord, string>;
  assignments!: Table<AssignmentRecord, [string, string]>;
  rules!: Table<Rule, string>;
  settings!: Table<SettingRecord, string>;
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
        await tx.table('batches').toCollection().modify((b: { firmId?: string }) => { if (!b.firmId) b.firmId = firmId; });
        const hist = await tx.table('history').toArray();
        if (hist.length) await tx.table('firmHistory').bulkPut(hist.map((h) => ({ ...h, firmId })));
        const acc = await tx.table('accounts').toArray();
        if (acc.length) await tx.table('firmAccounts').bulkPut(acc.map((a) => ({ ...a, firmId })));
        await tx.table('settings').put({ key: 'currentFirmId', value: firmId });
      });
    this.version(5).stores({ history: null, accounts: null });
    // v6: kaynak XML; Excel dönemleri fatura kayıtlarına çevrilir, PDF dosyaları ve elle bağlantılar kalkar
    this.version(6)
      .stores({
        batches: 'id, updatedAt, firmId',
        invoices: '[batchId+no], batchId, no',
        xslts: 'id',
        files: null,
        links: null,
      })
      .upgrade(async (tx) => {
        const batches = await tx.table('batches').toArray();
        const now = Date.now();
        for (const b of batches as (BatchRecord & { sheet?: EdmSheet; sourceFileName?: string })[]) {
          if (b.sheet) {
            const recs: InvoiceRecord[] = sheetToInvoices(b.sheet).map((f) => ({
              batchId: b.id,
              no: f.no,
              uuid: '',
              issueDate: f.issueDate,
              issueTime: '',
              profileId: f.profileId,
              typeCode: f.typeCode,
              currency: f.currency,
              supplierVkn: f.supplierVkn,
              supplierName: f.supplierName,
              payable: f.payable,
              taxExclusive: null,
              taxAmount: null,
              lineCount: null,
              itemText: '',
              xml: null,
              xsltId: null,
              fileName: b.sourceFileName ?? '',
              addedAt: b.createdAt ?? now,
              order: f.order,
            }));
            if (recs.length) await tx.table('invoices').bulkPut(recs);
          }
          const { sheet: _s, sourceFileName: _f, ...rest } = b;
          await tx.table('batches').put({ ...rest, autoName: false });
        }
        const s = (await tx.table('settings').get('settings'))?.value as Partial<Settings> & { sortMode?: string } | undefined;
        if (s && (s.sortMode as string) === 'excel') await tx.table('settings').put({ key: 'settings', value: { ...s, sortMode: 'added' } });
      });
    // v7: otomatik atama kuralları; faturalara kalem metni (kalem kuralları için)
    this.version(7)
      .stores({ rules: 'id, firmId' })
      .upgrade(async (tx) => {
        if (typeof DOMParser === 'undefined') return;
        await tx.table('invoices').toCollection().modify((r: InvoiceRecord) => {
          if (r.itemText !== undefined) return;
          r.itemText = '';
          if (!r.xml) return;
          try {
            const doc = new DOMParser().parseFromString(r.xml, 'application/xml');
            r.itemText = itemTextOf(doc.documentElement);
          } catch { /* kalem metni boş kalır */ }
        });
      });
    // v8: kural kapsamı (kalıcı / döneme özel)
    this.version(8).stores({ rules: 'id, firmId, batchId' }).upgrade(async (tx) => {
      await tx.table('rules').toCollection().modify((r: Rule) => { if (r.batchId === undefined) r.batchId = null; });
    });
    // v9: çok koşullu kurallar (kind+pattern → conds); faturalara kalemler ve KDV oranları
    this.version(9).stores({ rules: 'id, firmId, batchId' }).upgrade(async (tx) => {
      await tx.table('rules').toCollection().modify((r: Rule & { kind?: string; pattern?: string }, ref: { value: unknown }) => {
        const up = upgradeRule(r);
        if (!up) { delete ref.value; return; }
        delete r.kind; delete r.pattern;
        r.conds = up.conds; r.code = up.code; r.enabled = up.enabled;
      });
      if (typeof DOMParser === 'undefined') return;
      await tx.table('invoices').toCollection().modify((r: InvoiceRecord) => {
        if (r.lines !== undefined) return;
        r.lines = []; r.vatRates = [];
        if (!r.xml) return;
        try {
          const doc = new DOMParser().parseFromString(r.xml, 'application/xml');
          r.lines = linesOf(doc.documentElement);
          r.vatRates = vatRatesOf(doc.documentElement);
        } catch { /* kalem bilgisi boş kalır */ }
      });
    });
    // v10: kalemlere özgün ad (ekranda gösterim için); v11: birim fiyat ve kalem tutarı
    this.version(10).stores({});
    this.version(11).stores({}).upgrade(async (tx) => {
      if (typeof DOMParser === 'undefined') return;
      await tx.table('invoices').toCollection().modify((r: InvoiceRecord) => {
        if (!r.xml || !r.lines || r.lines.length === 0 || r.lines[0].price !== undefined) return;
        try {
          const doc = new DOMParser().parseFromString(r.xml, 'application/xml');
          r.lines = linesOf(doc.documentElement);
          r.vatRates = vatRatesOf(doc.documentElement);
        } catch { /* olduğu gibi kalır */ }
      });
    });
    // v12: KDV oranına göre matrah ve vergi (çıktı sütunları)
    this.version(12).stores({}).upgrade(async (tx) => {
      if (typeof DOMParser === 'undefined') return;
      await tx.table('invoices').toCollection().modify((r: InvoiceRecord) => {
        if (!r.xml || r.vatBreakdown) return;
        try {
          r.vatBreakdown = vatBreakdownOf(new DOMParser().parseFromString(r.xml, 'application/xml').documentElement);
        } catch { /* olduğu gibi kalır */ }
      });
    });
    // v13: vergiler dahil fatura toplamı (ödenecekten ayrı) ve matrahı yazılmamış KDV satırları için türetilmiş matrah
    this.version(13).stores({}).upgrade(async (tx) => {
      if (typeof DOMParser === 'undefined') return;
      await tx.table('invoices').toCollection().modify((r: InvoiceRecord) => {
        if (!r.xml) return;
        try {
          const root = new DOMParser().parseFromString(r.xml, 'application/xml').documentElement;
          r.vatBreakdown = vatBreakdownOf(root);
          r.taxInclusive = taxInclusiveOf(root);
        } catch { /* olduğu gibi kalır */ }
      });
    });
    // v14: şablon kapsamı genel › firma › dönem. Eskiden her firmaya şablonun bir kopyası yazılıyordu; firmalarda en çok kullanılan
    // şablon genel olur, onunla aynı olan firma kopyaları silinir (genele bağlanır). Her firmanın Excel'i birebir aynı kalır.
    this.version(14).stores({}).upgrade(async (tx) => {
      const sRec = await tx.table('settings').get('settings');
      const sv = (sRec?.value ?? {}) as { outputTemplate?: OutputTemplate; codeColumnIndex?: number; codeHeader?: string };
      const general = sv.outputTemplate ? normalizeTemplate(sv.outputTemplate) : edmTemplate(sv.codeColumnIndex ?? 3, sv.codeHeader ?? 'Hesap Kodu');
      const key = (t: OutputTemplate) => JSON.stringify(normalizeTemplate(t));
      const count = new Map<string, number>();
      for (const f of (await tx.table('firms').toArray()) as FirmRecord[]) if (f.outputTemplate) count.set(key(f.outputTemplate), (count.get(key(f.outputTemplate)) ?? 0) + 1);
      if (count.size === 0) return;
      const max = Math.max(...count.values());
      const top = [...count].filter(([, n]) => n === max).map(([k]) => k);
      const best = top.includes(key(general)) ? key(general) : top[0];
      if (best !== key(general)) await tx.table('settings').put({ key: 'settings', value: { ...sv, outputTemplate: JSON.parse(best) } });
      await tx.table('firms').toCollection().modify((f: FirmRecord) => { if (f.outputTemplate && key(f.outputTemplate) === best) delete f.outputTemplate; });
    });
    // v15: eski "+ KDV dökümü" düğmesinin 8 sütunu tek "KDV dökümü · Güncel oranlar + Diğer" öğesi olur (genel, firma, dönem şablonları);
    // XML'i olan faturalara KDV dışı vergiler, tevkifat ve kur eklenir
    this.version(15).stores({}).upgrade(async (tx) => {
      if (typeof DOMParser !== 'undefined') {
        await tx.table('invoices').toCollection().modify((r: InvoiceRecord) => {
          if (!r.xml) return;
          try { r.taxExtras = taxExtrasOf(new DOMParser().parseFromString(r.xml, 'application/xml').documentElement); } catch { /* olduğu gibi kalır */ }
        });
      }
      const fold = (t: OutputTemplate) => ({ ...t, columns: foldLegacyKdv(t.columns) });
      const sRec = await tx.table('settings').get('settings');
      const sv = sRec?.value as { outputTemplate?: OutputTemplate } | undefined;
      if (sv?.outputTemplate) await tx.table('settings').put({ key: 'settings', value: { ...sv, outputTemplate: fold(sv.outputTemplate) } });
      await tx.table('firms').toCollection().modify((f: FirmRecord) => { if (f.outputTemplate) f.outputTemplate = fold(f.outputTemplate); });
      await tx.table('batches').toCollection().modify((b: BatchRecord) => { if (b.outputTemplate) b.outputTemplate = fold(b.outputTemplate); });
    });
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
