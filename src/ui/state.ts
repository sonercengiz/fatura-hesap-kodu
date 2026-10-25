import { signal, computed, batch as sbatch } from '@preact/signals';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUT_KEYS, type Settings, type Invoice, type PdfRef, type FilterMode } from '../core/types';
import { readEdmSheet, extractInvoices } from '../core/excel/readEdm';
import { buildOutputWorkbook, buildFileName, buildOutputRows } from '../core/excel/writeOutput';
import { matchPdfs, applyManualLinks, type UnmatchedSegment } from '../core/match/matcher';
import { ghostCandidates, supplierHint, type HistoryEntry } from '../core/suggest/engine';
import { sortInvoices } from '../core/sort';
import { db, DEFAULT_FIRM_ID, loadSettings, saveSettings, newId, type BatchRecord, type FileRecord, type LinkRecord, type AssignmentRecord, type AccountRecord, type AssignmentSource, type FirmRecord, type FirmHistoryEntry } from '../storage/db';
import { searchAccounts, type Account } from '../core/chart';
import { loadPdf, extractPageTexts, evictPdf } from '../pdf/pdfjs';

export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const firms = signal<FirmRecord[]>([]);
export const currentFirmId = signal<string>(DEFAULT_FIRM_ID);
const EMPTY_FIRM: FirmRecord = { id: DEFAULT_FIRM_ID, name: '', createdAt: 0, shortcuts: DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: 'Hesap kodu listem' };
/** Seçili firma; kısayollar, hesap listesi ve öneri geçmişi buna bağlıdır */
export const firm = computed<FirmRecord>(() => firms.value.find((f) => f.id === currentFirmId.value) ?? firms.value[0] ?? EMPTY_FIRM);
export const batchRec = signal<BatchRecord | null>(null);
export const batchList = signal<BatchRecord[]>([]);
export const assignments = signal<Map<string, string>>(new Map());
export const files = signal<FileRecord[]>([]);
export const currentIndex = signal(0);
export const mode = signal<'nav' | 'manual'>('nav');
export const manualText = signal('');
export const dirty = signal(false);
export const history = signal<HistoryEntry[]>([]);
export const recentCodes = signal<string[]>([]);
export const toast = signal<string | null>(null);
export const previewOpen = signal(false);
export const settingsOpen = signal(false);
export const guideOpen = signal(false);
export const links = signal<LinkRecord[]>([]);
/** Alt çubukta düzenlenen kısayol yuvası ve yazılan metin (global tuş yakalayıcı da kullanır) */
export const editingSlot = signal<number | null>(null);
export const editingText = signal('');
/** Elle bağlama penceresi: hangi eşleşmeyen parça bağlanacak */
export const linkTarget = signal<UnmatchedSegment | null>(null);
export const busy = signal<string | null>(null);
export const searchText = signal('');
/** Toplu atama ile kod alan faturalar (doğal gezinti bunları atlar) */
export const bulkNos = signal<Set<string>>(new Set());
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
export const FILTER_LABELS: Record<FilterMode, string> = { all: 'Tümü', unassigned: 'Atanmamış', manual: 'Elle atanmış', bulk: 'Toplu atanmış' };

const rawInvoices = computed<Invoice[]>(() => (batchRec.value ? extractInvoices(batchRec.value.sheet) : []));
/** Ekran listesi sırası; çıktı her zaman Excel satır sırasını korur. */
export const invoices = computed<Invoice[]>(() => sortInvoices(rawInvoices.value, settings.value.sortMode));
export const current = computed<Invoice | null>(() => invoices.value[currentIndex.value] ?? null);
export const knownNos = computed(() => new Set(invoices.value.map((i) => i.no)));
export const match = computed(() =>
  applyManualLinks(
    matchPdfs(
      knownNos.value,
      files.value.map((f) => ({ fileId: f.id, fileName: f.name, pages: f.pageTexts })),
    ),
    links.value.filter((l) => files.value.some((f) => f.id === l.fileId)),
  ),
);
export function manualLinkFor(no: string): LinkRecord | undefined {
  return links.value.find((l) => l.no === no && files.value.some((f) => f.id === l.fileId));
}
/** Kısayol yuvaları: yalnızca kullanıcının kaydettiği kodlar; kendiliğinden değişmez. */
export const slots = computed<(string | null)[]>(() => {
  const arr = firm.value.shortcuts.map((s) => s.code);
  while (arr.length < 6) arr.push(null);
  return arr.slice(0, 6);
});
/** Boş yuvalarda hayalet olarak gösterilecek aday (en sık kullanılan, kaydedilmemiş kod). */
export const ghost = computed(() => ghostCandidates(history.value, slots.value)[0] ?? null);
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
export const duplicateNos = computed(() => {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const i of invoices.value) (seen.has(i.no) ? dup : seen).add(i.no);
  return dup;
});

export type IssueKind = 'no-code' | 'not-in-chart' | 'type' | 'no-pdf' | 'dup-pdf' | 'dup-no';
export function issuesFor(inv: Invoice): IssueKind[] {
  const out: IssueKind[] = [];
  const code = assignments.value.get(inv.no);
  if (!code) out.push('no-code');
  else if (accounts.value.length > 0 && !accountMap.value.has(code)) out.push('not-in-chart');
  if (/tevkifat|iade/i.test(inv.invoiceType)) out.push('type');
  if (files.value.length > 0 && !match.value.refs.has(inv.no)) out.push('no-pdf');
  if (match.value.duplicates.includes(inv.no)) out.push('dup-pdf');
  if (duplicateNos.value.has(inv.no)) out.push('dup-no');
  return out;
}
export const ISSUE_LABEL: Record<IssueKind, string> = {
  'no-code': 'Hesap kodu atanmamış',
  'not-in-chart': 'Kod hesap kodu listesinde yok',
  type: 'Tevkifat / İade faturası, kontrol edin',
  'no-pdf': 'PDF eşleşmedi',
  'dup-pdf': 'Birden fazla PDF eşleşti',
  'dup-no': 'Aynı fatura no birden fazla satırda',
};

/** Toolbar ve listede gösterilecek uyarılar: atanmamış kod ve PDF eksikliği hariç. */
export function attentionIssues(inv: Invoice): IssueKind[] {
  return issuesFor(inv).filter((k) => k !== 'no-code' && k !== 'no-pdf');
}

export function refFor(no: string): PdfRef | null {
  return match.value.refs.get(no)?.[0] ?? null;
}

export function fileById(id: string): FileRecord | undefined {
  return files.value.find((f) => f.id === id);
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

// ---------- yükleme ----------

export async function init() {
  settings.value = await loadSettings(DEFAULT_SETTINGS);
  lastExportAt.value = ((await db.settings.get('lastExportAt'))?.value as number | undefined) ?? null;
  try { backupDismissedAt.value = Number(localStorage.getItem('backupDismissedAt') ?? 0) || 0; } catch { /* yok say */ }
  await ensureFirms();
  const cur = (await db.settings.get('currentFirmId'))?.value as string | undefined;
  currentFirmId.value = cur && firms.value.some((f) => f.id === cur) ? cur : firms.value[0].id;
  await loadFirmData();
  await refreshBatchList();
  const latest = batchList.value[0];
  if (latest) await openBatch(latest.id);
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
}

/** Firma değiştir: kısayollar, hesap listesi, geçmiş ve parti listesi birlikte değişir */
export async function switchFirm(id: string) {
  if (!firms.value.some((f) => f.id === id)) return;
  currentFirmId.value = id;
  await db.settings.put({ key: 'currentFirmId', value: id });
  await loadFirmData();
  sbatch(() => {
    batchRec.value = null;
    assignments.value = new Map();
    bulkNos.value = new Set();
    files.value = [];
    links.value = [];
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

/** Firmayı ve ona bağlı her şeyi (partiler, atamalar, PDF'ler, liste, geçmiş) siler */
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
  const fl = await db.files.where('batchId').equals(id).toArray();
  const lk = await db.links.where('batchId').equals(id).toArray();
  for (const f of files.value) evictPdf(f.id);
  sbatch(() => {
    batchRec.value = rec;
    assignments.value = new Map(asg.map((a) => [a.no, a.code]));
    bulkNos.value = new Set(asg.filter((a) => a.source === 'bulk').map((a) => a.no));
    selected.value = new Set();
    lastClicked.value = -1;
    filterMode.value = 'all';
    undoStack.value = [];
    redoStack.value = [];
    files.value = fl.sort((a, b) => a.addedAt - b.addedAt);
    links.value = lk;
    linkTarget.value = null;
    recentCodes.value = asg.sort((a, b) => a.at - b.at).slice(-10).map((a) => a.code);
    dirty.value = false;
    mode.value = 'nav';
    searchText.value = '';
  });
  // ilk atanmamış faturaya git
  const idx = invoices.value.findIndex((i) => !assignments.value.has(i.no));
  currentIndex.value = idx >= 0 ? idx : firstNavigable();
}

export async function importExcel(file: File) {
  busy.value = 'Excel okunuyor…';
  try {
    const sheet = readEdmSheet(await file.arrayBuffer());
    const now = Date.now();
    const rec: BatchRecord = {
      id: newId(),
      firmId: currentFirmId.value,
      name: file.name.replace(/\.xlsx?$/i, ''),
      sourceFileName: file.name,
      createdAt: now,
      updatedAt: now,
      savedAt: null,
      sheet,
    };
    await db.batches.put(rec);
    // Daha önce başka partide atanmış aynı faturalar varsa atamayı taşı
    const nos = extractInvoices(sheet).map((i) => i.no);
    const prior = await db.assignments.where('no').anyOf(nos).toArray();
    if (prior.length) {
      const latestByNo = new Map<string, { code: string; at: number; source?: 'manual' | 'bulk' }>();
      for (const a of prior) {
        const cur = latestByNo.get(a.no);
        if (!cur || a.at > cur.at) latestByNo.set(a.no, { code: a.code, at: a.at, source: a.source });
      }
      await db.assignments.bulkPut(Array.from(latestByNo, ([no, v]) => ({ batchId: rec.id, no, code: v.code, at: v.at, source: v.source })));
    }
    await refreshBatchList();
    await openBatch(rec.id);
    showToast(`${sheet.rows.length} fatura yüklendi`);
  } catch (e) {
    showToast((e as Error).message, 5000);
  } finally {
    busy.value = null;
  }
}

export async function addPdfs(list: File[]) {
  const b = batchRec.value;
  if (!b) {
    showToast('Önce EDM Excel dosyasını yükleyin.');
    return;
  }
  const pdfs = list.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (pdfs.length === 0) return;
  const existing = new Set(files.value.map((f) => `${f.name}|${f.size}`));
  let n = 0;
  const added: FileRecord[] = [];
  for (const f of pdfs) {
    n++;
    busy.value = `PDF okunuyor ${n}/${pdfs.length}: ${f.name}`;
    if (existing.has(`${f.name}|${f.size}`)) continue;
    try {
      const buf = await f.arrayBuffer();
      const doc = await loadPdf(buf.slice(0));
      const pageTexts = await extractPageTexts(doc);
      const rec: FileRecord = {
        id: newId(),
        batchId: b.id,
        name: f.name,
        size: f.size,
        pageCount: doc.numPages,
        pageTexts,
        blob: new Blob([buf], { type: 'application/pdf' }),
        addedAt: Date.now(),
      };
      await doc.loadingTask.destroy();
      await db.files.put(rec);
      added.push(rec);
    } catch (e) {
      console.warn('PDF okunamadı', f.name, e);
    }
  }
  // Daha önce elle bağlanmış (ad+boyut aynı) dosyalar yeniden eklendiyse bağlantıyı yeni id'ye taşı
  for (const rec of added) {
    const stale = links.value.filter((l) => l.fileName === rec.name && l.fileSize === rec.size && l.fileId !== rec.id);
    for (const l of stale) await db.links.update(l.id!, { fileId: rec.id });
  }
  files.value = [...files.value, ...added];
  links.value = await db.links.where('batchId').equals(b.id).toArray();
  busy.value = null;
  const m = match.value;
  showToast(`${added.length} PDF eklendi · ${m.refs.size} fatura eşleşti · ${m.unmatched.length} eşleşmedi`, 4000);
}

export async function removeFile(id: string) {
  await db.files.delete(id);
  evictPdf(id);
  files.value = files.value.filter((f) => f.id !== id);
}

export async function deleteBatch(id: string) {
  const fl = await db.files.where('batchId').equals(id).primaryKeys();
  await db.transaction('rw', db.batches, db.assignments, db.files, db.links, async () => {
    await db.batches.delete(id);
    await db.assignments.where('batchId').equals(id).delete();
    await db.files.bulkDelete(fl);
    await db.links.where('batchId').equals(id).delete();
  });
  if (batchRec.value?.id === id) {
    batchRec.value = null;
    assignments.value = new Map();
    files.value = [];
  }
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
    case 'manual': if (!code || bulk) return false; break;
    case 'bulk': if (!bulk) return false; break;
  }
  const q = searchText.value.trim().toLocaleLowerCase('tr');
  return !q || matchesSearch(inv, q);
}
export function matchesSearch(i: Invoice, q: string): boolean {
  return (
    i.no.toLocaleLowerCase('tr').includes(q) ||
    i.supplierName.toLocaleLowerCase('tr').includes(q) ||
    i.supplierVkn.includes(q) ||
    (i.amount != null && String(i.amount).includes(q.replace(',', '.')))
  );
}
/** Doğal gezinti: filtreye uyan ve toplu atanmamış satırlar. all=true (Ctrl) ise toplu atananlar da dahil. */
function navigable(inv: Invoice, all: boolean): boolean {
  if (!passesFilter(inv)) return false;
  if (!all && bulkNos.value.has(inv.no) && filterMode.value !== 'bulk') return false;
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
    inverse.push({ no: ch.no, code: prev, source: bn.has(ch.no) ? 'bulk' : 'manual' });
    if (prev && prev !== ch.code) bump(inv.supplierVkn, prev, -1);
    if (ch.code && prev !== ch.code) bump(inv.supplierVkn, ch.code, +1);
    if (ch.code) {
      m.set(ch.no, ch.code);
      if (ch.source === 'bulk') bn.add(ch.no); else bn.delete(ch.no);
      puts.push({ batchId: b.id, no: ch.no, code: ch.code, at: now, source: ch.source });
    } else {
      m.delete(ch.no);
      bn.delete(ch.no);
      dels.push([b.id, ch.no]);
    }
  }
  sbatch(() => {
    assignments.value = m;
    bulkNos.value = bn;
    dirty.value = true;
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

export async function save() {
  const b = batchRec.value;
  if (!b) return;
  const now = Date.now();
  await db.batches.update(b.id, { savedAt: now, updatedAt: now });
  batchRec.value = { ...b, savedAt: now, updatedAt: now };
  dirty.value = false;
  await refreshBatchList();
  showToast(`Kaydedildi · ${assignedCount.value}/${invoices.value.length} atandı`);
}

export function outputRows() {
  const b = batchRec.value;
  if (!b) return [];
  return buildOutputRows(b.sheet, codesByRow());
}

function codesByRow() {
  const codes = new Map<number, string>();
  for (const inv of invoices.value) {
    const c = assignments.value.get(inv.no);
    if (c) codes.set(inv.rowIndex, c);
  }
  return { codeColumnIndex: settings.value.codeColumnIndex, codeHeader: settings.value.codeHeader, codes };
}

export async function exportExcel() {
  const b = batchRec.value;
  if (!b) return;
  if (dirty.value) await save();
  const bytes = buildOutputWorkbook(b.sheet, codesByRow());
  const name = buildFileName(firm.value.name);
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

// ---------- elle PDF bağlama ----------

export async function linkSegment(seg: { fileId: string; fileName: string; pageStart: number; pageEnd: number }, no: string) {
  const b = batchRec.value;
  const f = fileById(seg.fileId);
  if (!b || !f) return;
  // Aynı fatura için eski elle bağlantı varsa değiştir
  const old = links.value.filter((l) => l.no === no);
  for (const l of old) await db.links.delete(l.id!);
  await db.links.add({ batchId: b.id, no, fileId: seg.fileId, fileName: f.name, fileSize: f.size, pageStart: seg.pageStart, pageEnd: seg.pageEnd });
  links.value = await db.links.where('batchId').equals(b.id).toArray();
  linkTarget.value = null;
  const idx = invoices.value.findIndex((i) => i.no === no);
  if (idx >= 0) goTo(idx);
  showToast(`${f.name} → ${no} bağlandı`);
}

export async function unlink(no: string) {
  const b = batchRec.value;
  if (!b) return;
  const old = links.value.filter((l) => l.no === no);
  for (const l of old) await db.links.delete(l.id!);
  links.value = await db.links.where('batchId').equals(b.id).toArray();
  showToast('Elle bağlantı kaldırıldı');
}

// ---------- çalışma alanı dışa/içe aktarma ----------

interface WorkspaceExport {
  app: 'fatura-hesap-kodu';
  version: 2;
  exportedAt: string;
  settings: Settings;
  firms: FirmRecord[];
  history: FirmHistoryEntry[];
  accounts: AccountRecord[];
  batches: { batch: BatchRecord; assignments: AssignmentRecord[]; links: Omit<LinkRecord, 'id' | 'fileId'>[] }[];
}

export async function exportWorkspace() {
  const batches = await db.batches.toArray();
  const data: WorkspaceExport = {
    app: 'fatura-hesap-kodu',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: settings.value,
    firms: await db.firms.toArray(),
    history: await db.firmHistory.toArray(),
    accounts: await db.firmAccounts.toArray(),
    batches: [],
  };
  for (const batch of batches) {
    const assignments = await db.assignments.where('batchId').equals(batch.id).toArray();
    const lk = await db.links.where('batchId').equals(batch.id).toArray();
    data.batches.push({ batch, assignments, links: lk.map(({ id: _id, fileId: _f, ...rest }) => rest) });
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
  showToast(`Dışa aktarıldı: ${name} (${data.firms.length} firma, ${batches.length} parti)`, 5000);
}

/** Birleştirir, silmez. Firmalar önce kimlikle, sonra adla eşlenir; eşleşmeyen firma yeni oluşturulur. */
export async function importWorkspace(file: File) {
  busy.value = 'Çalışma alanı içe aktarılıyor…';
  try {
    const raw = JSON.parse(await file.text()) as Partial<WorkspaceExport> & { app?: string; version?: number };
    if (raw?.app !== 'fatura-hesap-kodu' || !Array.isArray(raw.batches)) throw new Error('Bu dosya bir çalışma alanı yedeği değil.');
    // Sürüm 1 (firmasız) yedekler: her şey "varsayılan firma"ya
    const legacyFirm = currentFirmId.value;
    const srcFirms: FirmRecord[] = raw.version === 2 && raw.firms?.length ? raw.firms : [{ ...firm.value, id: legacyFirm }];
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
    for (const { batch, assignments: asg, links: lk } of raw.batches) {
      const b2 = { ...batch, firmId: fid(batch.firmId) };
      const cur = await db.batches.get(b2.id);
      if (!cur) {
        await db.batches.put(b2);
        nb++;
      } else if (b2.updatedAt > cur.updatedAt) {
        await db.batches.put({ ...b2, savedAt: cur.savedAt ?? b2.savedAt });
      }
      for (const a of asg ?? []) {
        const c = await db.assignments.get([a.batchId, a.no]);
        if (!c || a.at > c.at) {
          await db.assignments.put(a);
          na++;
        }
      }
      for (const l of lk ?? []) {
        const exists = await db.links.where('batchId').equals(l.batchId).filter((x) => x.no === l.no).count();
        if (!exists) {
          const f = await db.files.where('batchId').equals(l.batchId).filter((x) => x.name === l.fileName && x.size === l.fileSize).first();
          await db.links.add({ ...l, fileId: f?.id ?? '' });
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
    firms.value = await db.firms.orderBy('name').toArray();
    await loadFirmData();
    await refreshBatchList();
    const latest = batchList.value[0];
    if (latest) await openBatch(batchRec.value?.id ?? latest.id);
    showToast(`İçe aktarıldı: ${srcFirms.length} firma, ${nb} yeni parti, ${na} atama`, 5000);
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
