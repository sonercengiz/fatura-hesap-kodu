import { signal, computed, batch as sbatch } from '@preact/signals';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUT_KEYS, LIST_COLUMNS, typeLabel, profileLabel, toDisplayDate, type Settings, type Invoice, type FilterMode, type ListColumnId } from '../core/types';
import { buildTemplateWorkbook, buildFileName } from '../core/excel/writeOutput';
import { buildTemplateRows, normalizeTemplate, edmTemplate, codeColumnIndexOf, type OutputTemplate, type RowContext } from '../core/excel/template';
import { parseUbl, decodeBytes, dominantMonth, UblParseError } from '../core/xml/parseUbl';
import { sha256 } from '../core/hash';
import { sheetToInvoices, type EdmSheet } from '../core/legacy';
import { supplierHint, type HistoryEntry } from '../core/suggest/engine';
import { sortInvoices, SORT_LABELS } from '../core/sort';
import { db, DEFAULT_FIRM_ID, loadSettings, saveSettings, newId, type BatchRecord, type InvoiceRecord, type AssignmentRecord, type AccountRecord, type AssignmentSource, type FirmRecord, type FirmHistoryEntry } from '../storage/db';
import { searchAccounts, type Account } from '../core/chart';
import { ensureXslt, transformToHtml, decorateHtml, cachedHtml, rememberHtml, forgetHtml } from '../render/xslt';
import { fallbackHtml } from '../render/fallback';
import { unzipSync } from 'fflate';
import { matchRules, matchPermanent, activeRules, validateRule, normPattern, parseRulesFile, type Rule, type RuleKind, type RulesFile } from '../core/rules';

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const firms = signal<FirmRecord[]>([]);
export const currentFirmId = signal<string>(DEFAULT_FIRM_ID);
const EMPTY_FIRM: FirmRecord = { id: DEFAULT_FIRM_ID, name: '', createdAt: 0, shortcuts: DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: 'Hesap kodu listem' };
/** Seçili firma; kısayollar, hesap listesi ve öneri geçmişi buna bağlıdır */
export const firm = computed<FirmRecord>(() => firms.value.find((f) => f.id === currentFirmId.value) ?? firms.value[0] ?? EMPTY_FIRM);
export const batchRec = signal<BatchRecord | null>(null);
export const batchList = signal<BatchRecord[]>([]);
/** Açık dönemin fatura kayıtları (XML dahil) */
export const invoiceRecs = signal<InvoiceRecord[]>([]);
export const assignments = signal<Map<string, string>>(new Map());
export const currentIndex = signal(0);
export const mode = signal<'nav' | 'manual'>('nav');
export const manualText = signal('');
export const history = signal<HistoryEntry[]>([]);
export const recentCodes = signal<string[]>([]);
export const toast = signal<string | null>(null);
export const previewOpen = signal(false);
export const settingsOpen = signal(false);
export const guideOpen = signal(false);
/** Alt çubukta düzenlenen kısayol yuvası ve yazılan metin (global tuş yakalayıcı da kullanır) */
export const editingSlot = signal<number | null>(null);
export const editingText = signal('');
export const busy = signal<string | null>(null);
export const searchText = signal('');
/** Toplu atama ile kod alan faturalar (doğal gezinti bunları atlar) */
export const bulkNos = signal<Set<string>>(new Set());
/** Kuralla kod alan faturalar (toplu gibi doğal gezintide atlanır) */
export const ruleNos = signal<Set<string>>(new Set());
/** Firmanın otomatik atama kuralları */
export const rules = signal<Rule[]>([]);
export const rulesOpen = signal(false);
/** Yazdırma planı penceresi ve çalışan yazdırma işi */
export const printOpen = signal(false);
/** Çıktı Excel şablonu penceresi */
export const templateOpen = signal(false);
/** Yükleme sonucu penceresi (okunamayan dosya varsa kendiliğinden açılır) ve son yükleme özeti */
export const importReport = signal<ImportReport | null>(null);
export const lastImportReport = signal<ImportReport | null>(null);
export interface PrintOpts { pageBreak: boolean; strip: boolean; summary: boolean; /** parça başına fatura; 0 = tek parça */ chunk: number }
export interface PrintJob { items: Invoice[]; opts: PrintOpts; parts: Invoice[][]; part: number }
export const printJob = signal<PrintJob | null>(null);
/** Kurallar penceresi açılırken forma önceden doldurulacak değerler */
export const ruleDraft = signal<{ kind: RuleKind; pattern: string; code: string; scope?: RuleScope } | null>(null);
/** Kural kapsamı: firma geneli (kalıcı) ya da yalnızca açık dönem */
export type RuleScope = 'firm' | 'batch';
/** Listede seçili faturalar (toplu atama için) */
export const selected = signal<Set<string>>(new Set());
export const lastClicked = signal<number>(-1);
/** Listede toplu seçim yardımcıları açık mı */
export const bulkMode = signal(false);
export const filterMode = signal<FilterMode>('all');
/** Kullanıcının hesap kodu listesi */
export const accounts = signal<AccountRecord[]>([]);
export const accountMap = computed(() => new Map(accounts.value.map((a) => [a.code, a.name])));
/** Ctrl+. hesap arama penceresi */
export const chartOpen = signal(false);
export const chartQuery = signal('');
export const chartIndex = signal(0);
/** Pencerede "listeye ekle" isim kutusu açık mı (tuşlar oraya gider) */
export const chartAdding = signal(false);
export const chartResults = computed<Account[]>(() => searchAccounts(accounts.value, chartQuery.value, 12));
/** Geri al / yinele yığınları */
export interface Change { no: string; code: string | null; source: AssignmentSource }
export interface UndoEntry { label: string; inverse: Change[]; redo: Change[]; index: number }
export const undoStack = signal<UndoEntry[]>([]);
export const redoStack = signal<UndoEntry[]>([]);
/** Son dışa aktarma zamanı (ms); null = hiç */
export const lastExportAt = signal<number | null>(null);
export const backupDismissedAt = signal<number>(0);
const DAY = 86_400_000;
/** Atama varsa ve 7 günden eski (ya da hiç) yedek yoksa hatırlat; "bugün değil" ile 1 gün ertelenir */
export const backupDue = computed(() => {
  if (assignments.value.size === 0 && batchList.value.length === 0) return false;
  if (Date.now() - backupDismissedAt.value < DAY) return false;
  return lastExportAt.value === null || Date.now() - lastExportAt.value > 7 * DAY;
});
export function dismissBackup() {
  backupDismissedAt.value = Date.now();
  try { localStorage.setItem('backupDismissedAt', String(backupDismissedAt.value)); } catch { /* yok say */ }
}
export const FILTER_LABELS: Record<FilterMode, string> = { all: 'Tümü', unassigned: 'Atanmamış', manual: 'Elle atanmış', bulk: 'Toplu atanmış', rule: 'Kuralla atanmış' };

export function toInvoice(r: InvoiceRecord): Invoice {
  return {
    no: r.no,
    order: r.order,
    date: toDisplayDate(r.issueDate),
    isoDate: /^\d{4}-\d{2}-\d{2}/.test(r.issueDate) ? r.issueDate.slice(0, 10) : '',
    uuid: r.uuid,
    supplierVkn: r.supplierVkn,
    supplierName: r.supplierName,
    amount: r.payable,
    taxExclusive: r.taxExclusive,
    taxAmount: r.taxAmount,
    currency: r.currency || 'TRY',
    invoiceType: typeLabel(r.typeCode),
    profile: profileLabel(r.profileId),
    hasView: !!r.xml,
    itemText: r.itemText ?? '',
    lineCount: r.lineCount,
  };
}

const rawInvoices = computed<Invoice[]>(() => invoiceRecs.value.map(toInvoice));
/** Ekran listesi sırası. */
export const invoices = computed<Invoice[]>(() => sortInvoices(rawInvoices.value, settings.value.sortMode));
/** Çıktı dosyası sırası: şablondaki satır sırası (ekran sırasından bağımsız, kararlı). */
export const outputOrder = computed<Invoice[]>(() => {
  const o = settings.value.outputTemplate.rowOrder;
  if (o === 'added') return sortInvoices(rawInvoices.value, 'added');
  if (o === 'date-supplier') return sortInvoices(rawInvoices.value, 'date-supplier');
  // tarih, sonra fatura no
  return sortInvoices(rawInvoices.value, 'date-supplier').slice().sort((a, b) => (dateKeyOf(a) - dateKeyOf(b)) || (a.no < b.no ? -1 : a.no > b.no ? 1 : 0));
});
const dateKeyOf = (i: Invoice) => Number(i.isoDate.replace(/-/g, '')) || 0;
/** Çıktıda Hesap Kodu sütununun 0 tabanlı konumu */
export const outputCodeAt = computed(() => codeColumnIndexOf(settings.value.outputTemplate));
export const current = computed<Invoice | null>(() => invoices.value[currentIndex.value] ?? null);
export const recByNo = computed(() => new Map(invoiceRecs.value.map((r) => [r.no, r])));
/** Kısayol yuvaları: yalnızca kullanıcının kaydettiği kodlar; kendiliğinden değişmez. */
export const slots = computed<(string | null)[]>(() => {
  const arr = firm.value.shortcuts.map((s) => s.code);
  while (arr.length < 6) arr.push(null);
  return arr.slice(0, 6);
});
/** Seçili faturanın satıcısına daha önce en çok verilen kod. */
export const hint = computed(() => (current.value ? supplierHint(history.value, current.value.supplierVkn) : null));
export const knownCodes = computed(() => {
  const set = new Set<string>();
  for (const h of history.value) set.add(h.code);
  for (const c of assignments.value.values()) set.add(c);
  for (const s of firm.value.shortcuts) if (s.code) set.add(s.code);
  for (const a of accounts.value) set.add(a.code);
  return set;
});
export const assignedCount = computed(() => invoices.value.filter((i) => assignments.value.has(i.no)).length);
export const viewCount = computed(() => invoices.value.filter((i) => i.hasView).length);
/** Her fatura için uyan kural (varsa); sıralı listeyle aynı anda hesaplanır */
export const ruleFor = computed(() => {
  const m = new Map<string, Rule>();
  const rs = activeRules(rules.value, batchRec.value?.id ?? null);
  if (rs.length === 0) return m;
  for (const i of rawInvoices.value) {
    const r = matchRules(i, rs, batchRec.value?.id ?? null);
    if (r) m.set(i.no, r);
  }
  return m;
});
/** Bu dönemde geçerli kurallar (kalıcılar + bu dönemdekiler) */
export const batchRules = computed(() => activeRules(rules.value, batchRec.value?.id ?? null));
/** Dönem kuralının bu dönemde geçersiz kıldığı kalıcı kural(lar): fatura sayısı ve kodlar */
export function overriddenBy(rule: Rule): { count: number; codes: string[] } {
  if (!rule.batchId) return { count: 0, codes: [] };
  const codes = new Set<string>();
  let count = 0;
  for (const i of rawInvoices.value) {
    if (ruleFor.value.get(i.no)?.id !== rule.id) continue;
    const p = matchPermanent(i, rules.value);
    if (p && p.code !== rule.code) { count++; codes.add(p.code); }
  }
  return { count, codes: Array.from(codes) };
}
/** Dönemde kurala uyan ama henüz kod almamış faturalar */
export const rulePending = computed(() => invoices.value.filter((i) => !assignments.value.has(i.no) && ruleFor.value.has(i.no)));

export type IssueKind = 'no-code' | 'not-in-chart' | 'type' | 'no-view';
export function issuesFor(inv: Invoice): IssueKind[] {
  const out: IssueKind[] = [];
  const code = assignments.value.get(inv.no);
  if (!code) out.push('no-code');
  else if (accounts.value.length > 0 && !accountMap.value.has(code)) out.push('not-in-chart');
  if (/tevkifat|iade/i.test(inv.invoiceType)) out.push('type');
  if (!inv.hasView) out.push('no-view');
  return out;
}
export const ISSUE_LABEL: Record<IssueKind, string> = {
  'no-code': 'Hesap kodu atanmamış',
  'not-in-chart': 'Kod hesap kodu listesinde yok',
  type: 'Tevkifat / İade faturası, kontrol edin',
  'no-view': 'XML yok (eski Excel dönemi); görsel çizilemez',
};

/** Toolbar ve listede gösterilecek uyarılar: atanmamış kod ve görsel eksikliği hariç. */
export function attentionIssues(inv: Invoice): IssueKind[] {
  return issuesFor(inv).filter((k) => k !== 'no-code' && k !== 'no-view');
}

let toastTimer: number | undefined;
export function showToast(msg: string, ms = 2200) {
  toast.value = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), ms);
}

export function slotIndexOf(code: string | null | undefined): number {
  if (!code) return -1;
  return slots.value.indexOf(code);
}

// ---------- fatura görseli ----------

export interface InvoiceView {
  html: string;
  /** Resmî şablon (XSLT) ile mi çizildi, yoksa sade yedek görünüm mü */
  official: boolean;
}

/** Faturanın HTML görünümü; sonuç bellekte önbelleklenir. */
export async function getInvoiceView(no: string): Promise<InvoiceView | null> {
  const b = batchRec.value;
  const rec = recByNo.value.get(no);
  if (!b || !rec) return null;
  const key = `${b.id}|${no}`;
  const hit = cachedHtml(key);
  if (hit !== undefined) return { html: hit, official: !hit.startsWith('<!--fallback-->') };
  const inv = toInvoice(rec);
  let html: string;
  let official = false;
  if (rec.xml && rec.xsltId) {
    const xslt = await db.xslts.get(rec.xsltId);
    try {
      if (!xslt) throw new Error('XSLT kaydı yok');
      await ensureXslt();
      html = decorateHtml(transformToHtml(rec.xml, xslt.text));
      official = true;
    } catch (e) {
      console.warn('Fatura görseli çizilemedi', no, e);
      html = '<!--fallback-->' + fallbackHtml(inv, rec.xml, 'Faturanın kendi şablonu çizilemedi; XML içeriği sade biçimde gösteriliyor.');
    }
  } else if (rec.xml) {
    html = '<!--fallback-->' + fallbackHtml(inv, rec.xml, 'Bu faturada görünüm şablonu (XSLT) yok; XML içeriği sade biçimde gösteriliyor.');
  } else {
    // XML'siz (eski Excel dönemi): ekranda kart gösterilir, yazdırmada sade özet
    return { html: '<!--fallback-->' + fallbackHtml(inv, null, 'Bu faturanın XML\'i yok (eski Excel dönemi); yalnızca liste bilgileri.'), official: false };
  }
  rememberHtml(key, html);
  return { html, official };
}

// ---------- yükleme ----------

export async function init() {
  settings.value = await loadSettings(DEFAULT_SETTINGS);
  // Eski ayarlar (sütun konumu + başlık) → şablon
  const legacy = ((await db.settings.get('settings'))?.value ?? {}) as { codeColumnIndex?: number; codeHeader?: string; outputTemplate?: unknown };
  settings.value = { ...settings.value, outputTemplate: legacy.outputTemplate ? normalizeTemplate(legacy.outputTemplate as OutputTemplate) : edmTemplate(legacy.codeColumnIndex ?? 3, legacy.codeHeader ?? 'Hesap Kodu') };
  if (!(settings.value.sortMode in SORT_LABELS)) settings.value = { ...settings.value, sortMode: 'date-supplier' };
  if (!Array.isArray(settings.value.listColumns) || !settings.value.listColumns.includes('code')) settings.value = { ...settings.value, listColumns: DEFAULT_SETTINGS.listColumns };
  lastExportAt.value = ((await db.settings.get('lastExportAt'))?.value as number | undefined) ?? null;
  try { backupDismissedAt.value = Number(localStorage.getItem('backupDismissedAt') ?? 0) || 0; } catch { /* yok say */ }
  await ensureFirms();
  const cur = (await db.settings.get('currentFirmId'))?.value as string | undefined;
  currentFirmId.value = cur && firms.value.some((f) => f.id === cur) ? cur : firms.value[0].id;
  await loadFirmData();
  await refreshBatchList();
  const latest = batchList.value[0];
  if (latest) await openBatch(latest.id);
  // Motoru arka planda ısıt (polyfill gerekiyorsa ilk fatura beklemesin)
  ensureXslt().catch(() => undefined);
}

async function ensureFirms() {
  firms.value = await db.firms.orderBy('name').toArray();
  if (firms.value.length === 0) {
    await db.firms.put({ id: DEFAULT_FIRM_ID, name: 'Firma 1', createdAt: Date.now(), shortcuts: DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: 'Hesap kodu listem' });
    firms.value = await db.firms.toArray();
  }
}

async function loadFirmData() {
  const id = currentFirmId.value;
  history.value = await db.firmHistory.where('firmId').equals(id).toArray();
  accounts.value = (await db.firmAccounts.where('firmId').equals(id).toArray()).sort((a, b) => a.code.localeCompare(b.code));
  rules.value = (await db.rules.where('firmId').equals(id).toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Firma değiştir: kısayollar, hesap listesi, geçmiş ve dönem listesi birlikte değişir */
export async function switchFirm(id: string) {
  if (!firms.value.some((f) => f.id === id)) return;
  currentFirmId.value = id;
  await db.settings.put({ key: 'currentFirmId', value: id });
  await loadFirmData();
  sbatch(() => {
    batchRec.value = null;
    invoiceRecs.value = [];
    assignments.value = new Map();
    bulkNos.value = new Set();
    ruleNos.value = new Set();
    selected.value = new Set();
    undoStack.value = [];
    redoStack.value = [];
  });
  await refreshBatchList();
  const latest = batchList.value[0];
  if (latest) await openBatch(latest.id);
}

export async function createFirm(name: string) {
  const n = name.trim();
  if (!n) return;
  const dup = firms.value.find((f) => f.name.trim().toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'));
  if (dup) {
    showToast(`"${dup.name}" adında bir firma zaten var; ona geçildi.`, 4000);
    await switchFirm(dup.id);
    return;
  }
  const rec: FirmRecord = { id: newId(), name: n, createdAt: Date.now(), shortcuts: DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: 'Hesap kodu listem' };
  await db.firms.put(rec);
  firms.value = await db.firms.orderBy('name').toArray();
  await switchFirm(rec.id);
  showToast(`"${n}" firması oluşturuldu`);
}

export async function updateFirm(patch: Partial<Omit<FirmRecord, 'id'>>) {
  const f = firm.value;
  await db.firms.update(f.id, patch);
  firms.value = await db.firms.orderBy('name').toArray();
}

/** Firmayı ve ona bağlı her şeyi (dönemler, faturalar, atamalar, liste, geçmiş) siler */
export async function deleteFirm(id: string) {
  if (firms.value.length <= 1) { showToast('Son firma silinemez.'); return; }
  const batchIds = await db.batches.where('firmId').equals(id).primaryKeys();
  for (const bid of batchIds) await deleteBatch(bid);
  await db.firmHistory.where('firmId').equals(id).delete();
  await db.firmAccounts.where('firmId').equals(id).delete();
  await db.firms.delete(id);
  firms.value = await db.firms.orderBy('name').toArray();
  if (currentFirmId.value === id) await switchFirm(firms.value[0].id);
}

export async function refreshBatchList() {
  batchList.value = (await db.batches.where('firmId').equals(currentFirmId.value).toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function openBatch(id: string) {
  const rec = await db.batches.get(id);
  if (!rec) return;
  const asg = await db.assignments.where('batchId').equals(id).toArray();
  const recs = (await db.invoices.where('batchId').equals(id).toArray()).sort((a, b) => a.order - b.order);
  sbatch(() => {
    batchRec.value = rec;
    invoiceRecs.value = recs;
    assignments.value = new Map(asg.map((a) => [a.no, a.code]));
    bulkNos.value = new Set(asg.filter((a) => a.source === 'bulk').map((a) => a.no));
    ruleNos.value = new Set(asg.filter((a) => a.source === 'rule').map((a) => a.no));
    selected.value = new Set();
    lastClicked.value = -1;
    filterMode.value = 'all';
    undoStack.value = [];
    redoStack.value = [];
    recentCodes.value = asg.sort((a, b) => a.at - b.at).slice(-10).map((a) => a.code);
    mode.value = 'nav';
    searchText.value = '';
  });
  // ilk atanmamış faturaya git
  const idx = invoices.value.findIndex((i) => !assignments.value.has(i.no));
  currentIndex.value = idx >= 0 ? idx : firstNavigable();
}

/** Yeni, boş dönem oluşturur ve açar. Ad verilmezse ilk XML yüklemesinde baskın aya göre adlanır. */
export async function createBatch(name?: string) {
  const now = Date.now();
  const n = (name ?? '').trim();
  const rec: BatchRecord = {
    id: newId(),
    firmId: currentFirmId.value,
    name: n || `Yeni dönem ${new Date(now).toLocaleDateString('tr-TR')}`,
    autoName: !n,
    createdAt: now,
    updatedAt: now,
    savedAt: null,
  };
  await db.batches.put(rec);
  await refreshBatchList();
  await openBatch(rec.id);
  return rec;
}

export async function renameBatch(name: string) {
  const b = batchRec.value;
  const n = name.trim();
  if (!b || !n) return;
  await db.batches.update(b.id, { name: n, autoName: false });
  batchRec.value = { ...b, name: n, autoName: false };
  await refreshBatchList();
}

/** ZIP dosyalarını açar (iç içe bir düzey dahil); XML'leri dosya olarak döndürür, diğerlerini olduğu gibi geçirir. */
export async function expandZips(list: File[], depth = 0): Promise<File[]> {
  const out: File[] = [];
  for (const f of list) {
    if (!/\.zip$/i.test(f.name) && f.type !== 'application/zip' && f.type !== 'application/x-zip-compressed') { out.push(f); continue; }
    try {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      const inner: File[] = [];
      for (const [path, bytes] of Object.entries(entries)) {
        if (path.endsWith('/') || /(^|\/)__MACOSX\//.test(path) || /(^|\/)\./.test(path)) continue;
        const name = path.split('/').pop() || path;
        const type = /\.xml$/i.test(name) ? 'application/xml' : /\.zip$/i.test(name) ? 'application/zip' : '';
        inner.push(new File([bytes as BlobPart], name, { type }));
      }
      const xmlsOrZips = inner.filter((x) => /\.(xml|zip)$/i.test(x.name));
      if (xmlsOrZips.length === 0) { out.push(new File([], `${f.name} (içinde XML yok)`, { type: '' })); continue; }
      out.push(...(depth < 1 ? await expandZips(xmlsOrZips, depth + 1) : xmlsOrZips.filter((x) => /\.xml$/i.test(x.name))));
    } catch {
      out.push(new File([], `${f.name} (ZIP açılamadı)`, { type: '' }));
    }
  }
  return out;
}

export interface ImportReport {
  added: number;
  skipped: number;
  /** Zaten dönemde olduğu için atlanan dosyalar */
  skippedFiles: { file: string; no: string }[];
  /** Kuralla kendiliğinden atanan */
  ruled: number;
  failed: { file: string; reason: string }[];
}

/**
 * e-Fatura XML dosyalarını açık döneme ekler (dönem yoksa oluşturur). Aynı fatura no dönemde varsa atlanır.
 * XSLT'ler özetleriyle tekilleştirilir; daha önce başka dönemde atanmış faturaların kodu taşınır.
 */
export async function importXml(rawList: File[]): Promise<ImportReport> {
  const report: ImportReport = { added: 0, skipped: 0, skippedFiles: [], ruled: 0, failed: [] };
  busy.value = rawList.some((f) => /\.zip$/i.test(f.name)) ? 'ZIP açılıyor…' : busy.value;
  const list = await expandZips(rawList);
  const isXml = (f: File) => /\.xml$/i.test(f.name) || f.type === 'text/xml' || f.type === 'application/xml';
  const xmls = list.filter(isXml);
  for (const f of list) if (!isXml(f) && !/^\.|\.ds_store$/i.test(f.name)) report.failed.push({ file: f.name, reason: /\(içinde XML yok\)|\(ZIP açılamadı\)$/.test(f.name) ? 'ZIP içeriği kullanılamadı' : 'XML dosyası değil (yalnızca .xml ve .zip yüklenir)' });
  if (xmls.length === 0) {
    busy.value = null;
    if (report.failed.length) importReport.value = report;
    else showToast('XML dosyası seçilmedi. e-Fatura XML dosyalarını (.xml ya da .zip) yükleyin.', 4000);
    return report;
  }
  busy.value = 'XML okunuyor…';
  try {
    const b = batchRec.value ?? (await createBatch());
    const existing = new Set(invoiceRecs.value.map((r) => r.no));
    const seenNow = new Set<string>();
    const recs: InvoiceRecord[] = [];
    const xsltTexts = new Map<string, string>();
    let order = invoiceRecs.value.reduce((m, r) => Math.max(m, r.order + 1), 0);
    const now = Date.now();
    let n = 0;
    for (const f of xmls) {
      n++;
      if (n % 10 === 0 || n === xmls.length) busy.value = `XML okunuyor ${n}/${xmls.length}`;
      try {
        const text = decodeBytes(new Uint8Array(await f.arrayBuffer()));
        const u = parseUbl(text);
        const no = u.no.toUpperCase();
        if (existing.has(no) || seenNow.has(no)) { report.skipped++; report.skippedFiles.push({ file: f.name, no }); continue; }
        seenNow.add(no);
        let xsltId: string | null = null;
        if (u.xslt) {
          xsltId = await sha256(u.xslt);
          if (!xsltTexts.has(xsltId)) xsltTexts.set(xsltId, u.xslt);
        }
        recs.push({
          batchId: b.id,
          no,
          uuid: u.uuid,
          issueDate: u.issueDate,
          issueTime: u.issueTime,
          profileId: u.profileId,
          typeCode: u.typeCode,
          currency: u.currency,
          supplierVkn: u.supplierVkn,
          supplierName: u.supplierName,
          payable: u.payable,
          taxExclusive: u.taxExclusive,
          taxAmount: u.taxAmount,
          lineCount: u.lineCount,
          itemText: u.itemText,
          xml: u.xml,
          xsltId,
          fileName: f.name,
          addedAt: now,
          order: order++,
        });
      } catch (e) {
        report.failed.push({ file: f.name, reason: e instanceof UblParseError ? e.message : /\.xml$/i.test(f.name) ? 'Dosya okunamadı (bozuk ya da yarım inmiş olabilir)' : 'XML dosyası değil' });
      }
    }
    if (recs.length) {
      busy.value = 'Kaydediliyor…';
      if (xsltTexts.size) {
        const have = new Set((await db.xslts.where('id').anyOf(Array.from(xsltTexts.keys())).primaryKeys()) as string[]);
        const put = Array.from(xsltTexts, ([id, text]) => ({ id, text })).filter((x) => !have.has(x.id));
        if (put.length) await db.xslts.bulkPut(put);
      }
      await db.invoices.bulkPut(recs);
      // Daha önce başka dönemde atanmış aynı faturalar varsa atamayı taşı
      const prior = (await db.assignments.where('no').anyOf(recs.map((r) => r.no)).toArray()).filter((a) => a.batchId !== b.id);
      if (prior.length) {
        const latestByNo = new Map<string, AssignmentRecord>();
        for (const a of prior) {
          const cur = latestByNo.get(a.no);
          if (!cur || a.at > cur.at) latestByNo.set(a.no, a);
        }
        const own = new Set((await db.assignments.where('batchId').equals(b.id).primaryKeys()).map((k) => k[1]));
        await db.assignments.bulkPut(Array.from(latestByNo.values()).filter((a) => !own.has(a.no)).map((a) => ({ ...a, batchId: b.id })));
      }
      const patch: Partial<BatchRecord> = { updatedAt: now };
      if (b.autoName) {
        const all = [...invoiceRecs.value, ...recs].map((r) => r.issueDate);
        const month = dominantMonth(all);
        if (month) patch.name = month;
      }
      await db.batches.update(b.id, patch);
      report.added = recs.length;
      await refreshBatchList();
      const keepNo = current.value?.no;
      await openBatch(b.id);
      if (keepNo && existing.size) {
        const idx = invoices.value.findIndex((i) => i.no === keepNo);
        if (idx >= 0) currentIndex.value = idx;
      }
      // Kurallar: yeni gelen ve kod almamış faturalara kendiliğinden uygula
      const newNos = new Set(recs.map((r) => r.no));
      report.ruled = await applyRules((i) => newNos.has(i.no), true);
    }
    const parts = [`${report.added} fatura eklendi`];
    if (report.ruled) parts.push(`${report.ruled} kuralla atandı`);
    if (report.skipped) parts.push(`${report.skipped} zaten vardı`);
    if (report.failed.length) parts.push(`${report.failed.length} dosya okunamadı`);
    showToast(parts.join(' · '), 3500);
    if (report.failed.length) { console.warn('Okunamayan XML dosyaları', report.failed); importReport.value = report; }
    else lastImportReport.value = report;
  } finally {
    busy.value = null;
  }
  return report;
}

/** Faturaları dönemden çıkarır (atamalarıyla birlikte). */
export async function removeInvoices(nos: string[]) {
  const b = batchRec.value;
  if (!b || nos.length === 0) return;
  await db.transaction('rw', db.invoices, db.assignments, db.batches, async () => {
    await db.invoices.bulkDelete(nos.map((no) => [b.id, no] as [string, string]));
    await db.assignments.bulkDelete(nos.map((no) => [b.id, no] as [string, string]));
    await db.batches.update(b.id, { updatedAt: Date.now() });
  });
  for (const no of nos) forgetHtml(`${b.id}|${no}`);
  const idx = currentIndex.value;
  await openBatch(b.id);
  goTo(idx);
  await cleanupXslts();
  showToast(`${nos.length} fatura dönemden çıkarıldı`);
}

/** Hiçbir faturanın kullanmadığı XSLT kayıtlarını siler */
async function cleanupXslts() {
  const used = new Set<string>();
  await db.invoices.each((r) => { if (r.xsltId) used.add(r.xsltId); });
  const all = (await db.xslts.toCollection().primaryKeys()) as string[];
  const orphan = all.filter((id) => !used.has(id));
  if (orphan.length) await db.xslts.bulkDelete(orphan);
}

export async function deleteBatch(id: string) {
  await db.transaction('rw', db.batches, db.assignments, db.invoices, db.rules, async () => {
    await db.batches.delete(id);
    await db.assignments.where('batchId').equals(id).delete();
    await db.invoices.where('batchId').equals(id).delete();
    await db.rules.where('batchId').equals(id).delete();
  });
  rules.value = rules.value.filter((r) => r.batchId !== id);
  forgetHtml(`${id}|`);
  if (batchRec.value?.id === id) {
    batchRec.value = null;
    invoiceRecs.value = [];
    assignments.value = new Map();
  }
  await cleanupXslts();
  await refreshBatchList();
  const latest = batchList.value[0];
  if (latest && !batchRec.value) await openBatch(latest.id);
}

// ---------- atama ----------

export function goTo(i: number) {
  const n = invoices.value.length;
  if (n === 0) return;
  currentIndex.value = Math.min(Math.max(i, 0), n - 1);
}

/** Satır listede görünür mü (filtre + arama) */
export function passesFilter(inv: Invoice): boolean {
  const code = assignments.value.get(inv.no);
  const bulk = bulkNos.value.has(inv.no);
  switch (filterMode.value) {
    case 'unassigned': if (code) return false; break;
    case 'manual': if (!code || bulk || ruleNos.value.has(inv.no)) return false; break;
    case 'bulk': if (!bulk) return false; break;
    case 'rule': if (!ruleNos.value.has(inv.no)) return false; break;
  }
  const q = searchText.value.trim().toLocaleLowerCase('tr');
  return !q || matchesSearch(inv, q);
}
export function matchesSearch(i: Invoice, q: string): boolean {
  return (
    i.no.toLocaleLowerCase('tr').includes(q) ||
    i.supplierName.toLocaleLowerCase('tr').includes(q) ||
    i.supplierVkn.includes(q) ||
    i.uuid.toLocaleLowerCase('tr').includes(q) ||
    (i.amount != null && String(i.amount).includes(q.replace(',', '.')))
  );
}
/** Doğal gezinti: filtreye uyan ve toplu atanmamış satırlar. all=true (Ctrl) ise toplu atananlar da dahil. */
function navigable(inv: Invoice, all: boolean): boolean {
  if (!passesFilter(inv)) return false;
  if (!all && bulkNos.value.has(inv.no) && filterMode.value !== 'bulk') return false;
  if (!all && ruleNos.value.has(inv.no) && filterMode.value !== 'rule') return false;
  return true;
}
function firstNavigable(): number {
  const i = invoices.value.findIndex((x) => navigable(x, false));
  return i >= 0 ? i : 0;
}
/** dir=+1/-1; uygun satır yoksa yerinde kalır */
export function step(dir: 1 | -1, all = false) {
  const list = invoices.value;
  for (let i = currentIndex.value + dir; i >= 0 && i < list.length; i += dir) {
    if (navigable(list[i], all)) {
      currentIndex.value = i;
      return;
    }
  }
}
export function next(all = false) {
  step(1, all);
}
export function prev(all = false) {
  step(-1, all);
}
export function first(all = false) {
  const i = invoices.value.findIndex((x) => navigable(x, all));
  if (i >= 0) currentIndex.value = i;
}
export function last(all = false) {
  const list = invoices.value;
  for (let i = list.length - 1; i >= 0; i--) if (navigable(list[i], all)) { currentIndex.value = i; return; }
}
/** Sonraki / önceki atanmamış faturaya atla (filtre ve aramaya uyanlar içinde). Yoksa yerinde kalır ve bildirir. */
export function jumpUnassigned(dir: 1 | -1) {
  const list = invoices.value;
  for (let i = currentIndex.value + dir; i >= 0 && i < list.length; i += dir) {
    if (passesFilter(list[i]) && !assignments.value.has(list[i].no)) { currentIndex.value = i; return; }
  }
  const left = list.filter((x) => passesFilter(x) && !assignments.value.has(x.no)).length;
  showToast(left === 0 ? 'Atanmamış fatura kalmadı.' : dir > 0 ? 'İleride atanmamış fatura yok (geride var).' : 'Geride atanmamış fatura yok (ileride var).');
}
export function setFilter(mode: FilterMode) {
  filterMode.value = mode;
  if (current.value && !passesFilter(current.value)) first(true);
}

/**
 * Tüm atama değişiklikleri buradan geçer: bellek, veritabanı ve öneri geçmişi birlikte güncellenir;
 * tersi (geri alma için) döndürülür.
 */
async function applyChanges(changes: Change[]): Promise<Change[]> {
  const b = batchRec.value;
  if (!b || changes.length === 0) return [];
  const byNo = new Map(invoices.value.map((i) => [i.no, i]));
  const m = new Map(assignments.value);
  const bn = new Set(bulkNos.value);
  const rn = new Set(ruleNos.value);
  const inverse: Change[] = [];
  const puts: AssignmentRecord[] = [];
  const dels: [string, string][] = [];
  const delta = new Map<string, number>(); // "vkn|code" -> +/-
  const bump = (vkn: string, code: string, d: number) => delta.set(`${vkn}|${code}`, (delta.get(`${vkn}|${code}`) ?? 0) + d);
  const now = Date.now();
  for (const ch of changes) {
    const inv = byNo.get(ch.no);
    if (!inv) continue;
    const prev = m.get(ch.no) ?? null;
    inverse.push({ no: ch.no, code: prev, source: bn.has(ch.no) ? 'bulk' : rn.has(ch.no) ? 'rule' : 'manual' });
    if (prev && prev !== ch.code) bump(inv.supplierVkn, prev, -1);
    if (ch.code && prev !== ch.code) bump(inv.supplierVkn, ch.code, +1);
    if (ch.code) {
      m.set(ch.no, ch.code);
      if (ch.source === 'bulk') bn.add(ch.no); else bn.delete(ch.no);
      if (ch.source === 'rule') rn.add(ch.no); else rn.delete(ch.no);
      puts.push({ batchId: b.id, no: ch.no, code: ch.code, at: now, source: ch.source });
    } else {
      m.delete(ch.no);
      bn.delete(ch.no);
      rn.delete(ch.no);
      dels.push([b.id, ch.no]);
    }
  }
  sbatch(() => {
    assignments.value = m;
    bulkNos.value = bn;
    ruleNos.value = rn;
  });
  if (puts.length) await db.assignments.bulkPut(puts);
  if (dels.length) await db.assignments.bulkDelete(dels);
  for (const [k, d] of delta) {
    if (d === 0) continue;
    const [vkn, code] = k.split('|');
    const fid = currentFirmId.value;
    const cur = await db.firmHistory.get([fid, vkn, code]);
    const count = (cur?.count ?? 0) + d;
    if (count <= 0) await db.firmHistory.delete([fid, vkn, code]);
    else await db.firmHistory.put({ firmId: fid, vkn, code, count, lastUsed: d > 0 ? now : cur?.lastUsed ?? now });
  }
  history.value = await db.firmHistory.where('firmId').equals(currentFirmId.value).toArray();
  await db.batches.update(b.id, { updatedAt: now });
  return inverse.reverse();
}

function pushUndo(label: string, inverse: Change[], redo: Change[]) {
  if (inverse.length === 0) return;
  undoStack.value = [...undoStack.value.slice(-49), { label, inverse, redo, index: currentIndex.value }];
  redoStack.value = [];
}

export async function assign(codeRaw: string, advance = true) {
  const inv = current.value;
  const code = codeRaw.trim();
  if (!inv || !batchRec.value || !code) return;
  const change: Change = { no: inv.no, code, source: 'manual' };
  const inverse = await applyChanges([change]);
  pushUndo(`${inv.no} → ${code}`, inverse, [change]);
  sbatch(() => {
    recentCodes.value = [...recentCodes.value.slice(-9), code];
    mode.value = 'nav';
    manualText.value = '';
  });
  if (advance) next();
}

export async function clearAssignment() {
  const inv = current.value;
  if (!inv || !batchRec.value || !assignments.value.get(inv.no)) return;
  const change: Change = { no: inv.no, code: null, source: 'manual' };
  const inverse = await applyChanges([change]);
  pushUndo(`${inv.no} atama kaldırıldı`, inverse, [change]);
}

export async function undo() {
  const e = undoStack.value[undoStack.value.length - 1];
  if (!e) { showToast('Geri alınacak işlem yok'); return; }
  undoStack.value = undoStack.value.slice(0, -1);
  await applyChanges(e.inverse);
  redoStack.value = [...redoStack.value, e];
  goTo(e.index);
  showToast(`Geri alındı: ${e.label}`);
}

export async function redo() {
  const e = redoStack.value[redoStack.value.length - 1];
  if (!e) return;
  redoStack.value = redoStack.value.slice(0, -1);
  await applyChanges(e.redo);
  undoStack.value = [...undoStack.value, e];
  showToast(`Yinelendi: ${e.label}`);
}

export function outputContext(): RowContext {
  const codes = new Map<string, string>();
  for (const [no, c] of assignments.value) if (c) codes.set(no, c);
  const sources = new Map<string, 'manual' | 'bulk' | 'rule'>();
  for (const no of codes.keys()) sources.set(no, bulkNos.value.has(no) ? 'bulk' : ruleNos.value.has(no) ? 'rule' : 'manual');
  return { codes, accountNames: accountMap.value, sources, firmName: firm.value.name, batchName: batchRec.value?.name ?? '' };
}

export function outputRows() {
  if (!batchRec.value) return [];
  return buildTemplateRows(outputOrder.value, settings.value.outputTemplate, outputContext());
}

export async function setOutputTemplate(t: OutputTemplate) {
  await updateSettings({ outputTemplate: normalizeTemplate(t) });
}

export async function exportExcel() {
  const b = batchRec.value;
  if (!b) return;
  const bytes = buildTemplateWorkbook(outputOrder.value, settings.value.outputTemplate, outputContext());
  const name = buildFileName(firm.value.name, outputOrder.value);
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(`İndirildi: ${name}`, 4000);
}

/** Görsel ↔ liste görünümü; isteğe bağlı olarak belirli bir faturaya gider */
export async function setLayout(layout: Settings['layout'], no?: string) {
  await updateSettings({ layout });
  if (no) {
    const idx = invoices.value.findIndex((i) => i.no === no);
    if (idx >= 0) currentIndex.value = idx;
  }
}
export async function toggleColumn(id: ListColumnId) {
  if (id === 'code') return;
  const cur = settings.value.listColumns;
  const next = cur.includes(id) ? cur.filter((c) => c !== id) : LIST_COLUMNS.map((c) => c.id).filter((c) => c === id || cur.includes(c));
  await updateSettings({ listColumns: next });
}

export async function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
  await saveSettings(settings.value);
}

export function enterManual(initial = '') {
  manualText.value = initial;
  mode.value = 'manual';
}
export function exitManual() {
  manualText.value = '';
  mode.value = 'nav';
}

// ---------- çalışma alanı dışa/içe aktarma ----------

/** Yedekte XML ve XSLT taşınmaz (boyut); başlık alanları yeter, çıktı üretilebilir, görsel için XML yeniden yüklenir. */
type InvoiceMeta = Omit<InvoiceRecord, 'xml' | 'xsltId'>;

interface WorkspaceExport {
  app: 'fatura-hesap-kodu';
  version: 3;
  exportedAt: string;
  settings: Settings;
  firms: FirmRecord[];
  history: FirmHistoryEntry[];
  accounts: AccountRecord[];
  rules?: Rule[];
  batches: { batch: BatchRecord; assignments: AssignmentRecord[]; invoices: InvoiceMeta[] }[];
}

/** Eski (v1/v2) yedek dönem biçimi */
interface LegacyBatchExport {
  batch: BatchRecord & { sheet?: EdmSheet; sourceFileName?: string };
  assignments: AssignmentRecord[];
  invoices?: InvoiceMeta[];
}

export async function exportWorkspace() {
  const batches = await db.batches.toArray();
  const data: WorkspaceExport = {
    app: 'fatura-hesap-kodu',
    version: 3,
    exportedAt: new Date().toISOString(),
    settings: settings.value,
    firms: await db.firms.toArray(),
    history: await db.firmHistory.toArray(),
    accounts: await db.firmAccounts.toArray(),
    rules: await db.rules.toArray(),
    batches: [],
  };
  for (const batch of batches) {
    const assignments = await db.assignments.where('batchId').equals(batch.id).toArray();
    const invs = await db.invoices.where('batchId').equals(batch.id).toArray();
    data.batches.push({ batch, assignments, invoices: invs.map(({ xml: _x, xsltId: _s, ...rest }) => rest) });
  }
  const d = new Date();
  const name = `fatura-hesap-kodu-calisma-alani-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  lastExportAt.value = Date.now();
  await db.settings.put({ key: 'lastExportAt', value: lastExportAt.value });
  showToast(`Dışa aktarıldı: ${name} (${data.firms.length} firma, ${batches.length} dönem)`, 5000);
}

/** Birleştirir, silmez. Firmalar önce kimlikle, sonra adla eşlenir; eşleşmeyen firma yeni oluşturulur. */
export async function importWorkspace(file: File) {
  busy.value = 'Çalışma alanı içe aktarılıyor…';
  try {
    const raw = JSON.parse(await file.text()) as Partial<WorkspaceExport> & { app?: string; version?: number; batches?: LegacyBatchExport[] };
    if (raw?.app !== 'fatura-hesap-kodu' || !Array.isArray(raw.batches)) throw new Error('Bu dosya bir çalışma alanı yedeği değil.');
    // Sürüm 1 (firmasız) yedekler: her şey "varsayılan firma"ya
    const legacyFirm = currentFirmId.value;
    const srcFirms: FirmRecord[] = (raw.version ?? 1) >= 2 && raw.firms?.length ? raw.firms : [{ ...firm.value, id: legacyFirm }];
    const firmMap = new Map<string, string>(); // kaynak id → yerel id
    const local = await db.firms.toArray();
    for (const f of srcFirms) {
      const byId = local.find((x) => x.id === f.id);
      const byName = local.find((x) => x.name.trim().toLocaleLowerCase('tr') === f.name.trim().toLocaleLowerCase('tr'));
      const target = byId ?? byName;
      if (target) {
        firmMap.set(f.id, target.id);
        // Yerelde boş olan kısayol yuvalarını kaynaktan doldur
        const merged = target.shortcuts.map((sc, i) => (sc.code ? sc : { ...sc, code: f.shortcuts?.[i]?.code ?? null }));
        const untouched = !byName && (await db.batches.where('firmId').equals(target.id).count()) === 0;
        await db.firms.update(target.id, untouched ? { shortcuts: merged, name: f.name, chartName: f.chartName || target.chartName } : { shortcuts: merged });
      } else {
        const id = f.id && !local.some((x) => x.id === f.id) ? f.id : newId();
        await db.firms.put({ ...f, id, createdAt: f.createdAt ?? Date.now(), shortcuts: f.shortcuts ?? DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: f.chartName || 'Hesap kodu listem' });
        firmMap.set(f.id, id);
      }
    }
    const fid = (src?: string) => firmMap.get(src ?? '') ?? firmMap.get(legacyFirm) ?? currentFirmId.value;
    let nb = 0;
    let na = 0;
    let ni = 0;
    for (const { batch, assignments: asg, invoices: invs } of raw.batches) {
      const { sheet, sourceFileName, ...plain } = batch;
      const b2: BatchRecord = { ...plain, firmId: fid(batch.firmId), autoName: batch.autoName ?? false };
      const cur = await db.batches.get(b2.id);
      if (!cur) {
        await db.batches.put(b2);
        nb++;
      } else if (b2.updatedAt > cur.updatedAt) {
        await db.batches.put({ ...b2, savedAt: cur.savedAt ?? b2.savedAt });
      }
      // Faturalar: yerelde olmayanlar eklenir (XML'siz); yereldekiler korunur
      const metas: InvoiceMeta[] = invs ?? (sheet ? sheetToInvoices(sheet).map((f) => ({
        batchId: b2.id, no: f.no, uuid: '', issueDate: f.issueDate, issueTime: '', profileId: f.profileId, typeCode: f.typeCode, currency: f.currency,
        supplierVkn: f.supplierVkn, supplierName: f.supplierName, payable: f.payable, taxExclusive: null, taxAmount: null, lineCount: null,
        fileName: sourceFileName ?? '', addedAt: batch.createdAt, order: f.order,
      })) : []);
      for (const m of metas) {
        const have = await db.invoices.get([b2.id, m.no]);
        if (!have) {
          await db.invoices.put({ ...m, batchId: b2.id, xml: null, xsltId: null });
          ni++;
        }
      }
      for (const a of asg ?? []) {
        const c = await db.assignments.get([a.batchId, a.no]);
        if (!c || a.at > c.at) {
          await db.assignments.put(a);
          na++;
        }
      }
    }
    for (const h of raw.history ?? []) {
      const key: [string, string, string] = [fid((h as FirmHistoryEntry).firmId), h.vkn, h.code];
      const c = await db.firmHistory.get(key);
      if (!c) await db.firmHistory.put({ firmId: key[0], vkn: h.vkn, code: h.code, count: h.count, lastUsed: h.lastUsed });
      else await db.firmHistory.put({ ...c, count: Math.max(c.count, h.count), lastUsed: Math.max(c.lastUsed, h.lastUsed) });
    }
    for (const a of raw.accounts ?? []) {
      await db.firmAccounts.put({ firmId: fid((a as AccountRecord).firmId), code: a.code, name: a.name, addedAt: a.addedAt ?? Date.now() });
    }
    let nr = 0;
    for (const r of raw.rules ?? []) {
      if (!r?.kind || !r.pattern || !r.code) continue;
      nr += await mergeRule({ ...r, batchId: r.batchId ?? null, firmId: fid(r.firmId) }) ? 1 : 0;
    }
    firms.value = await db.firms.orderBy('name').toArray();
    await loadFirmData();
    await refreshBatchList();
    const latest = batchList.value[0];
    if (latest) await openBatch(batchRec.value?.id ?? latest.id);
    showToast(`İçe aktarıldı: ${srcFirms.length} firma, ${nb} yeni dönem, ${ni} fatura, ${na} atama${nr ? `, ${nr} kural` : ''}`, 5000);
  } catch (e) {
    showToast((e as Error).message, 5000);
  } finally {
    busy.value = null;
  }
}

export function startSlotEdit(index: number, initial: string) {
  editingText.value = initial;
  editingSlot.value = index;
}
export function cancelSlotEdit() {
  editingSlot.value = null;
  editingText.value = '';
}
export async function commitSlotEdit() {
  const i = editingSlot.value;
  if (i === null) return;
  const text = editingText.value;
  cancelSlotEdit();
  await pinSlot(i, text);
}

/** Bir yuvaya kod kaydet (boş/boşluk → yuvayı temizle). */
export async function pinSlot(index: number, codeRaw: string | null) {
  const code = (codeRaw ?? '').trim() || null;
  const shortcuts = firm.value.shortcuts.map((sc, i) => (i === index ? { ...sc, code } : code && sc.code === code ? { ...sc, code: null } : sc));
  await updateFirm({ shortcuts });
  if (code) showToast(`${shortcuts[index].key.toUpperCase()} → ${code} kaydedildi`);
}

export async function setSortMode(mode: Settings['sortMode']) {
  const no = current.value?.no;
  await updateSettings({ sortMode: mode });
  if (no) {
    const idx = invoices.value.findIndex((i) => i.no === no);
    if (idx >= 0) currentIndex.value = idx;
  }
}

// ---------- toplu seçim ve atama ----------

export function toggleSelect(no: string) {
  const set = new Set(selected.value);
  if (set.has(no)) set.delete(no); else set.add(no);
  selected.value = set;
}
export function selectRange(fromIdx: number, toIdx: number) {
  const [a, b] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const set = new Set(selected.value);
  for (let i = a; i <= b; i++) {
    const inv = invoices.value[i];
    if (inv && passesFilter(inv)) set.add(inv.no);
  }
  selected.value = set;
}
export function selectVisible() {
  selected.value = new Set(invoices.value.filter(passesFilter).map((i) => i.no));
}
export function selectSupplier(vkn: string) {
  const set = new Set(selected.value);
  for (const i of invoices.value) if (i.supplierVkn === vkn && passesFilter(i)) set.add(i.no);
  selected.value = set;
}
export function clearSelection() {
  selected.value = new Set();
}

/** Seçili faturalara tek seferde kod ver; kaynak "toplu" olarak işaretlenir, doğal gezinti bunları atlar. */
export async function assignBulk(codeRaw: string) {
  const code = codeRaw.trim();
  const nos = Array.from(selected.value);
  if (!batchRec.value || !code || nos.length === 0) return;
  const changes: Change[] = nos.map((no) => ({ no, code, source: 'bulk' }));
  const inverse = await applyChanges(changes);
  pushUndo(`${nos.length} faturaya toplu ${code}`, inverse, changes);
  selected.value = new Set();
  showToast(`${nos.length} faturaya toplu olarak ${code} atandı`);
  if (current.value && bulkNos.value.has(current.value.no)) next();
}

// ---------- hesap kodu listesi ----------

export async function upsertAccounts(items: Account[]) {
  const now = Date.now();
  const fid = currentFirmId.value;
  const recs = items.filter((a) => a.code.trim()).map((a) => ({ firmId: fid, code: a.code.trim(), name: a.name.trim(), addedAt: now }));
  if (!recs.length) return 0;
  await db.firmAccounts.bulkPut(recs);
  await loadFirmData();
  return recs.length;
}
export async function removeAccount(code: string) {
  await db.firmAccounts.delete([currentFirmId.value, code]);
  await loadFirmData();
}
export async function clearAccounts() {
  await db.firmAccounts.where('firmId').equals(currentFirmId.value).delete();
  accounts.value = [];
}

export function openChart(initial = '') {
  chartQuery.value = initial;
  chartIndex.value = 0;
  chartOpen.value = true;
}
export function closeChart() {
  chartOpen.value = false;
  chartAdding.value = false;
  chartQuery.value = '';
}
/** Pencereden seçilen kodu seçili faturaya (seçim varsa toplu) ata */
export async function pickFromChart(code: string) {
  closeChart();
  if (selected.value.size > 0) await assignBulk(code);
  else await assign(code);
}

// ---------- otomatik atama kuralları ----------

/** Aynı firma + kapsamda aynı tür+belirteç varsa onu günceller (daha yeniyse), yoksa ekler. true = yazıldı */
async function mergeRule(r: Rule): Promise<boolean> {
  const key = normPattern(r.kind, r.pattern);
  const scope = r.batchId ?? null;
  const same = (await db.rules.where('firmId').equals(r.firmId).toArray()).find((x) => (x.batchId ?? null) === scope && x.kind === r.kind && normPattern(x.kind, x.pattern) === key);
  if (same) {
    if ((r.updatedAt ?? 0) <= same.updatedAt && same.code === r.code) return false;
    await db.rules.put({ ...same, code: r.code, enabled: r.enabled ?? true, updatedAt: Math.max(same.updatedAt, r.updatedAt ?? 0) });
    return true;
  }
  const byId = r.id ? await db.rules.get(r.id) : undefined;
  await db.rules.put({ ...r, batchId: scope, id: byId ? newId() : r.id || newId(), enabled: r.enabled ?? true, createdAt: r.createdAt ?? Date.now(), updatedAt: r.updatedAt ?? Date.now() });
  return true;
}

async function reloadRules() {
  rules.value = (await db.rules.where('firmId').equals(currentFirmId.value).toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Kural ekler (aynı kapsamda aynı belirteç varsa günceller) ve partideki atanmamış uyan faturalara hemen uygular. */
export async function addRule(kind: RuleKind, patternRaw: string, codeRaw: string, scope: RuleScope = 'firm'): Promise<string | null> {
  const pattern = patternRaw.trim();
  const code = codeRaw.trim();
  const err = validateRule(kind, pattern, code);
  if (err) return err;
  if (scope === 'batch' && !batchRec.value) return 'Döneme özel kural için açık bir dönem gerekir.';
  const now = Date.now();
  await mergeRule({ id: newId(), firmId: currentFirmId.value, batchId: scope === 'batch' ? batchRec.value!.id : null, kind, pattern: kind === 'vkn' ? normPattern(kind, pattern) : pattern, code, enabled: true, createdAt: now, updatedAt: now });
  await reloadRules();
  const n = await applyRules(() => true, true);
  showToast(n ? `Kural kaydedildi · ${n} faturaya uygulandı` : 'Kural kaydedildi', 3500);
  return null;
}

export async function updateRule(id: string, patch: Partial<Pick<Rule, 'code' | 'enabled' | 'pattern'>>) {
  const r = rules.value.find((x) => x.id === id);
  if (!r) return;
  await db.rules.put({ ...r, ...patch, updatedAt: Date.now() });
  await reloadRules();
}

export async function deleteRule(id: string) {
  await db.rules.delete(id);
  await reloadRules();
}

/**
 * Kuralları partideki kod almamış faturalara uygular (yalnızca `pick` ile seçilenler); kaynak "kural".
 * Geri alınabilir. Uygulanan sayıyı döndürür.
 */
export async function applyRules(pick: (inv: Invoice) => boolean, pushToUndo = true): Promise<number> {
  if (!batchRec.value || rules.value.length === 0) return 0;
  const changes: Change[] = [];
  for (const inv of invoices.value) {
    if (assignments.value.has(inv.no) || !pick(inv)) continue;
    const r = ruleFor.value.get(inv.no);
    if (r) changes.push({ no: inv.no, code: r.code, source: 'rule' });
  }
  if (changes.length === 0) return 0;
  const inverse = await applyChanges(changes);
  if (pushToUndo) pushUndo(`${changes.length} faturaya kural`, inverse, changes);
  if (current.value && ruleNos.value.has(current.value.no)) next();
  return changes.length;
}

/** Panelden: seçili faturanın satıcısı için kural taslağıyla pencereyi aç */
export function openRules(draft?: { kind: RuleKind; pattern: string; code: string; scope?: RuleScope }) {
  ruleDraft.value = draft ?? null;
  rulesOpen.value = true;
}
export function closeRules() {
  rulesOpen.value = false;
  ruleDraft.value = null;
}

// ---------- başka firmaya taşıma ----------

export const moveOpen = signal(false);

/** Satıcı geçmişi sayaçlarını bir firmadan diğerine aktarır (öneriler doğru firmada kalsın) */
async function transferHistory(fromFirm: string, toFirm: string, pairs: { vkn: string; code: string }[]) {
  const now = Date.now();
  for (const { vkn, code } of pairs) {
    const a = await db.firmHistory.get([fromFirm, vkn, code]);
    if (a) { if (a.count <= 1) await db.firmHistory.delete([fromFirm, vkn, code]); else await db.firmHistory.put({ ...a, count: a.count - 1 }); }
    const b = await db.firmHistory.get([toFirm, vkn, code]);
    await db.firmHistory.put({ firmId: toFirm, vkn, code, count: (b?.count ?? 0) + 1, lastUsed: Math.max(b?.lastUsed ?? 0, a?.lastUsed ?? now) });
  }
}

/** Açık dönemi tüm faturaları, atamaları ve döneme özel kurallarıyla başka firmaya taşır; oraya geçer. */
export async function moveBatchToFirm(targetFirmId: string) {
  const b = batchRec.value;
  if (!b || targetFirmId === b.firmId || !firms.value.some((f) => f.id === targetFirmId)) return;
  const asg = await db.assignments.where('batchId').equals(b.id).toArray();
  const vknByNo = new Map(invoiceRecs.value.map((r) => [r.no, r.supplierVkn]));
  await db.transaction('rw', db.batches, db.rules, async () => {
    await db.batches.update(b.id, { firmId: targetFirmId, updatedAt: Date.now() });
    await db.rules.where('batchId').equals(b.id).modify({ firmId: targetFirmId });
  });
  await transferHistory(b.firmId, targetFirmId, asg.map((a) => ({ vkn: vknByNo.get(a.no) ?? '', code: a.code })));
  const name = firms.value.find((f) => f.id === targetFirmId)?.name ?? '';
  await switchFirm(targetFirmId);
  await openBatch(b.id);
  showToast(`"${b.name}" dönemi ${name} firmasına taşındı. Geri almak için aynı pencereyi kullanın.`, 5000);
}

/**
 * Seçili faturaları başka firmaya taşır: hedef dönem verilmezse orada yeni dönem açılır.
 * Atamalar faturayla gider; döneme özel kurallar gitmez.
 */
export async function moveInvoicesToFirm(nos: string[], targetFirmId: string, targetBatchId: string | null) {
  const b = batchRec.value;
  if (!b || nos.length === 0 || !firms.value.some((f) => f.id === targetFirmId)) return;
  const set = new Set(nos);
  const recs = invoiceRecs.value.filter((r) => set.has(r.no));
  if (recs.length === 0) return;
  const asg = (await db.assignments.where('batchId').equals(b.id).toArray()).filter((a) => set.has(a.no));
  const now = Date.now();
  let target = targetBatchId ? await db.batches.get(targetBatchId) : undefined;
  if (!target || target.firmId !== targetFirmId) {
    target = { id: newId(), firmId: targetFirmId, name: dominantMonth(recs.map((r) => r.issueDate)) ?? `Yeni dönem ${new Date(now).toLocaleDateString('tr-TR')}`, autoName: true, createdAt: now, updatedAt: now, savedAt: null };
    await db.batches.put(target);
  }
  const existing = new Set((await db.invoices.where('batchId').equals(target.id).primaryKeys()).map((k) => k[1]));
  const order0 = (await db.invoices.where('batchId').equals(target.id).toArray()).reduce((m, r) => Math.max(m, r.order + 1), 0);
  let skipped = 0;
  await db.transaction('rw', db.invoices, db.assignments, db.batches, async () => {
    let order = order0;
    for (const r of recs) {
      await db.invoices.delete([b.id, r.no]);
      await db.assignments.delete([b.id, r.no]);
      if (existing.has(r.no)) { skipped++; continue; }
      await db.invoices.put({ ...r, batchId: target!.id, order: order++ });
      const a = asg.find((x) => x.no === r.no);
      if (a) await db.assignments.put({ ...a, batchId: target!.id });
    }
    await db.batches.update(b.id, { updatedAt: now });
    await db.batches.update(target!.id, { updatedAt: now });
  });
  if (b.firmId !== targetFirmId) await transferHistory(b.firmId, targetFirmId, asg.map((a) => ({ vkn: recs.find((r) => r.no === a.no)?.supplierVkn ?? '', code: a.code })));
  for (const no of nos) forgetHtml(`${b.id}|${no}`);
  selected.value = new Set();
  const name = firms.value.find((f) => f.id === targetFirmId)?.name ?? '';
  await refreshBatchList();
  await openBatch(b.id);
  showToast(`${recs.length - skipped} fatura ${name} › "${target.name}" dönemine taşındı${skipped ? ` (${skipped} orada zaten vardı, bırakıldı)` : ''}.`, 5000);
}

// ---------- yazdırma ----------

export function openPrint() {
  if (!batchRec.value || invoices.value.length === 0) { showToast('Yazdırılacak fatura yok.'); return; }
  printOpen.value = true;
}
export function closePrint() {
  printOpen.value = false;
}
export function startPrint(items: Invoice[], opts: PrintOpts) {
  if (items.length === 0) return;
  printOpen.value = false;
  const size = opts.chunk > 0 ? opts.chunk : items.length;
  const parts: Invoice[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  printJob.value = { items, opts, parts, part: 0 };
}
/** Bir parça yazdırıldı: sıradaki varsa ona geç, yoksa bitir */
export function nextPrintPart() {
  const j = printJob.value;
  if (!j) return;
  if (j.part + 1 < j.parts.length) {
    showToast(`Parça ${j.part + 1}/${j.parts.length} gönderildi · ${j.part + 2}/${j.parts.length} hazırlanıyor`, 3000);
    printJob.value = { ...j, part: j.part + 1 };
  } else {
    if (j.parts.length > 1) showToast(`Parçalı yazdırma tamamlandı (${j.parts.length} parça, ${j.items.length} fatura)`, 4000);
    finishPrint();
  }
}
export function finishPrint() {
  printJob.value = null;
  busy.value = null;
}

export function exportRules() {
  const data: RulesFile = {
    app: 'fatura-hesap-kodu',
    kind: 'rules',
    version: 1,
    exportedAt: new Date().toISOString(),
    firmName: firm.value.name,
    rules: rules.value.filter((r) => r.batchId === null).map(({ kind, pattern, code, enabled }) => ({ kind, pattern, code, enabled })),
  };
  const name = `kurallar-${(firm.value.name || 'firma').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(`${data.rules.length} kural dışa aktarıldı: ${name}`, 4000);
}

/** Kural dosyasını bu firmaya ekler (aynı belirteç güncellenir, hiçbir kural silinmez) */
export async function importRules(file: File) {
  try {
    const f = parseRulesFile(await file.text());
    const now = Date.now();
    let n = 0;
    for (const r of f.rules) n += (await mergeRule({ id: newId(), firmId: currentFirmId.value, batchId: null, ...r, createdAt: now, updatedAt: now })) ? 1 : 0;
    await reloadRules();
    const applied = await applyRules(() => true, true);
    showToast(`${n} kural alındı${f.firmName ? ` (${f.firmName})` : ''}${applied ? ` · ${applied} faturaya uygulandı` : ''}`, 4500);
  } catch (e) {
    showToast((e as Error).message, 5000);
  }
}
