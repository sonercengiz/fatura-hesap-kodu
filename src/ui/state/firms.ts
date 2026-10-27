import { batch as sbatch } from '@preact/signals';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUT_KEYS } from '../../core/types';
import { normalizeTemplate, edmTemplate, type OutputTemplate } from '../../core/excel/template';
import { SORT_LABELS } from '../../core/sort';
import { db, DEFAULT_FIRM_ID, loadSettings, newId, type BatchRecord, type FirmRecord } from '../../storage/db';
import { ensureXslt, forgetHtml } from '../../render/xslt';
import { accounts, assignments, backupDismissedAt, batchList, batchRec, bulkNos, current, currentFirmId, currentIndex, filterMode, firm, firms, firstNavigable, goTo, history, invoiceRecs, invoices, lastClicked, lastExportAt, mode, recentCodes, redoStack, ruleNos, rules, searchText, selected, settings, showToast, undoStack } from './core';

/** Diğer sekmelere "veri değişti" sinyali; alan sekme görünürse yeniler, değilse görünür olunca yeniler */
export const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fatura-hesap-kodu') : null;

export let staleFromOtherTab = false;

export let suppressBroadcast = false;

export function notifyOtherTabs() {
  if (suppressBroadcast) return;
  try { channel?.postMessage({ type: 'changed', at: Date.now() }); } catch { /* yok say */ }
}

/** Açık firma ve dönemi veritabanından yeniden okur; seçili fatura ve konum korunur */
export async function refreshFromDb() {
  suppressBroadcast = true;
  try {
    const keepNo = current.value?.no;
    const keepIdx = currentIndex.value;
    settings.value = { ...(await loadSettings(DEFAULT_SETTINGS)), outputTemplate: settings.value.outputTemplate };
    firms.value = await db.firms.orderBy('name').toArray();
    if (!firms.value.some((f) => f.id === currentFirmId.value)) { await switchFirm(firms.value[0]?.id ?? DEFAULT_FIRM_ID); return; }
    await loadFirmData();
    await refreshBatchList();
    const b = batchRec.value;
    if (b && (await db.batches.get(b.id))) {
      await openBatch(b.id);
      const idx = keepNo ? invoices.value.findIndex((i) => i.no === keepNo) : -1;
      goTo(idx >= 0 ? idx : keepIdx);
    } else if (batchList.value[0]) await openBatch(batchList.value[0].id);
    else { batchRec.value = null; invoiceRecs.value = []; assignments.value = new Map(); }
  } finally {
    suppressBroadcast = false;
  }
}

export function setupTabSync() {
  channel?.addEventListener('message', (e) => {
    if ((e.data as { type?: string })?.type !== 'changed') return;
    if (document.visibilityState === 'visible') { refreshFromDb().then(() => showToast('Başka sekmedeki değişiklikler alındı', 2500)); }
    else staleFromOtherTab = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && staleFromOtherTab) { staleFromOtherTab = false; refreshFromDb().then(() => showToast('Başka sekmedeki değişiklikler alındı', 2500)); }
  });
}

export async function init() {
  setupTabSync();
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

export async function ensureFirms() {
  firms.value = await db.firms.orderBy('name').toArray();
  if (firms.value.length === 0) {
    await db.firms.put({ id: DEFAULT_FIRM_ID, name: 'Firma 1', createdAt: Date.now(), shortcuts: DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: 'Hesap kodu listem' });
    firms.value = await db.firms.toArray();
  }
}

export async function loadFirmData() {
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
  notifyOtherTabs();
}

/** Firmayı ve ona bağlı her şeyi (dönemler, faturalar, atamalar, liste, geçmiş) siler */
export async function deleteFirm(id: string) {
  if (firms.value.length <= 1) { showToast('Son firma silinemez.'); return; }
  const batchIds = await db.batches.where('firmId').equals(id).primaryKeys();
  for (const bid of batchIds) await deleteBatch(bid);
  await db.rules.where('firmId').equals(id).delete(); // kalıcı kurallar (dönem kuralları deleteBatch ile gitti)
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
  notifyOtherTabs();
}

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  /** dönem id → yaklaşık XML boyutu (bayt) ve görselli fatura sayısı */
  batches: { id: string; name: string; firmName: string; bytes: number; withXml: number; total: number }[];
  xsltBytes: number;
}

/** Tarayıcı depolama durumu ve dönem başına yaklaşık boyut (XML metin uzunluğu) */
export async function storageInfo(): Promise<StorageInfo> {
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    usage = est?.usage ?? null;
    quota = est?.quota ?? null;
  } catch { /* desteklenmiyor */ }
  const batches = await db.batches.toArray();
  const firmName = new Map((await db.firms.toArray()).map((f) => [f.id, f.name]));
  const per = new Map<string, { bytes: number; withXml: number; total: number }>();
  await db.invoices.each((r) => {
    const p = per.get(r.batchId) ?? { bytes: 0, withXml: 0, total: 0 };
    p.total++;
    if (r.xml) { p.bytes += r.xml.length * 2; p.withXml++; }
    per.set(r.batchId, p);
  });
  let xsltBytes = 0;
  await db.xslts.each((x) => { xsltBytes += x.text.length * 2; });
  return {
    usage, quota, xsltBytes,
    batches: batches.map((b) => ({ id: b.id, name: b.name, firmName: firmName.get(b.firmId) ?? '', ...(per.get(b.id) ?? { bytes: 0, withXml: 0, total: 0 }) })).sort((a, b) => b.bytes - a.bytes),
  };
}

/** Dönemin görsellerini kaldırır: XML ve şablon bağı silinir; liste, atamalar, EDM sütunları ve çıktı aynen kalır. XML yeniden yüklenirse görsel geri gelir. */
export async function archiveBatchVisuals(batchId: string): Promise<number> {
  let n = 0;
  await db.invoices.where('batchId').equals(batchId).modify((r) => { if (r.xml) { r.xml = null; r.xsltId = null; n++; } });
  await cleanupXslts();
  forgetHtml(`${batchId}|`);
  if (batchRec.value?.id === batchId) { const idx = currentIndex.value; await openBatch(batchId); goTo(idx); }
  notifyOtherTabs();
  return n;
}

/** Depolama hatası mı (tarayıcı kotası doldu) */
export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? '';
  const msg = String((e as Error)?.message ?? e);
  return /QuotaExceeded|quota/i.test(name) || /quota|QuotaExceeded/i.test(msg);
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
  notifyOtherTabs();
  showToast(`${nos.length} fatura dönemden çıkarıldı`);
}

/** Hiçbir faturanın kullanmadığı XSLT kayıtlarını siler */
export async function cleanupXslts() {
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
  notifyOtherTabs();
}
