import { signal, computed, batch as sbatch } from '@preact/signals';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUT_KEYS, LIST_COLUMNS, typeLabel, profileLabel, toDisplayDate, type Settings, type Invoice, type FilterMode, type ListColumnId } from '../../core/types';
import { buildTemplateWorkbook, buildFileName } from '../../core/excel/writeOutput';
import { buildTemplateRows, normalizeTemplate, codeColumnIndexOf, type OutputTemplate, type RowContext } from '../../core/excel/template';
import { supplierHint, type HistoryEntry } from '../../core/suggest/engine';
import { sortInvoices } from '../../core/sort';
import { db, DEFAULT_FIRM_ID, saveSettings, type BatchRecord, type InvoiceRecord, type AssignmentRecord, type AccountRecord, type AssignmentSource, type FirmRecord } from '../../storage/db';
import { searchAccounts, type Account } from '../../core/chart';
import { ensureXslt, transformToHtml, decorateHtml, cachedHtml, rememberHtml } from '../../render/xslt';
import { fallbackHtml } from '../../render/fallback';
import { matchRules, matchPermanent, activeRules, type Rule, type Cond } from '../../core/rules';
import { loadFirmData, notifyOtherTabs, updateFirm } from './firms';
import { ImportReport } from './importing';

export const settings = signal<Settings>(DEFAULT_SETTINGS);

export const firms = signal<FirmRecord[]>([]);

export const currentFirmId = signal<string>(DEFAULT_FIRM_ID);

export const EMPTY_FIRM: FirmRecord = { id: DEFAULT_FIRM_ID, name: '', createdAt: 0, shortcuts: DEFAULT_SHORTCUT_KEYS.map((key) => ({ key, code: null })), chartName: 'Hesap kodu listem' };

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

/** Ayarlar'da son açık sekme ve hesap kodu listesi penceresi */
export const settingsTab = signal<'firm' | 'batch' | 'output' | 'view' | 'screen' | 'backup' | 'keys'>('firm');

export const accountsOpen = signal(false);

export const guideOpen = signal(false);

/** Alt çubukta düzenlenen kısayol yuvası ve yazılan metin (global tuş yakalayıcı da kullanır) */
export const editingSlot = signal<number | null>(null);

export const editingText = signal('');

export const busy = signal<string | null>(null);

/** Veritabanı okunup firma/dönem açıldı mı (açılışta karşılama ekranı bir an yanlış görünmesin) */
export const ready = signal(false);

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
export const ruleDraft = signal<{ conds: Cond[]; code: string; scope?: RuleScope } | null>(null);
/** Panelden açılan rozetli hızlı kural penceresi: null kapalı; lineIndex = ⚡'ya basılan kalem (yoksa -1) */
export const quickRule = signal<{ lineIndex: number } | null>(null);

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

/** `at`: işlem yapılırken açık olan fatura (geri alınca oraya dönülür; fatura çıkarılsa da sıra kaymaz) */
/** Kural değişikliğinde değişen kuralların öncesi/sonrası (geri alınca kural da döner; listede olmayan id = yoktu) */
export interface RuleSnap { ids: string[]; before: Rule[]; after: Rule[] }

export interface UndoEntry { label: string; inverse: Change[]; redo: Change[]; at: string | null; rules?: RuleSnap }

export const undoStack = signal<UndoEntry[]>([]);

export const redoStack = signal<UndoEntry[]>([]);

/** Son dışa aktarma zamanı (ms); null = hiç */
export const lastExportAt = signal<number | null>(null);

export const backupDismissedAt = signal<number>(0);

export const DAY = 86_400_000;

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
    typeCode: r.typeCode,
    profile: profileLabel(r.profileId),
    hasView: !!r.xml,
    itemText: r.itemText ?? '',
    lines: r.lines ?? [],
    vatRates: r.vatRates ?? [],
    lineCount: r.lineCount,
    edm: r.edm,
  };
}

export const rawInvoices = computed<Invoice[]>(() => invoiceRecs.value.map(toInvoice));

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

export const dateKeyOf = (i: Invoice) => Number(i.isoDate.replace(/-/g, '')) || 0;

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

export let toastTimer: number | undefined;

export function showToast(msg: string, ms = 2200) {
  toast.value = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), ms);
}

export function slotIndexOf(code: string | null | undefined): number {
  if (!code) return -1;
  return slots.value.indexOf(code);
}

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

/** Tutarın aranabilir yazımları: "5748", "5748.5", "5.748,50", "5748,50" — kullanıcı nasıl yazarsa yazsın bulunsun */
function amountTexts(n: number): string[] {
  const tr = n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [String(n), tr, tr.replace(/\./g, '')];
}

export function matchesSearch(i: Invoice, q: string): boolean {
  return (
    i.no.toLocaleLowerCase('tr').includes(q) ||
    i.supplierName.toLocaleLowerCase('tr').includes(q) ||
    i.supplierVkn.includes(q) ||
    i.uuid.toLocaleLowerCase('tr').includes(q) ||
    (i.amount != null && amountTexts(i.amount).some((x) => x.includes(q)))
  );
}

/** Doğal gezinti: filtreye uyan ve toplu atanmamış satırlar. all=true (Ctrl) ise toplu atananlar da dahil. */
export function navigable(inv: Invoice, all: boolean): boolean {
  if (!passesFilter(inv)) return false;
  if (!all && bulkNos.value.has(inv.no) && filterMode.value !== 'bulk') return false;
  if (!all && ruleNos.value.has(inv.no) && filterMode.value !== 'rule') return false;
  return true;
}

export function firstNavigable(): number {
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
export async function applyChanges(changes: Change[]): Promise<Change[]> {
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
  await bumpHistory(currentFirmId.value, delta, now);
  await db.batches.update(b.id, { updatedAt: now });
  notifyOtherTabs();
  return inverse.reverse();
}

/**
 * Satıcı geçmişi sayaçlarını değiştirir ("vkn|kod" → +/-). Sayaç = firmada o satıcıya o kodla yapılmış atama sayısı
 * (satıcı ipucu bundan); atama oluşan ya da silinen her yol buradan geçmeli.
 */
export async function bumpHistory(firmId: string, delta: Map<string, number>, now = Date.now()) {
  for (const [k, d] of delta) {
    if (d === 0) continue;
    const [vkn, code] = k.split('|');
    const cur = await db.firmHistory.get([firmId, vkn, code]);
    const count = (cur?.count ?? 0) + d;
    if (count <= 0) await db.firmHistory.delete([firmId, vkn, code]);
    else await db.firmHistory.put({ firmId, vkn, code, count, lastUsed: d > 0 ? now : cur?.lastUsed ?? now });
  }
  if (firmId === currentFirmId.value) history.value = await db.firmHistory.where('firmId').equals(firmId).toArray();
}

/** Atama kayıtlarından satıcı geçmişi farkı: sign=+1 eklenen, -1 silinen atamalar */
export function historyDelta(asg: { no: string; code: string }[], vknByNo: Map<string, string>, sign: 1 | -1): Map<string, number> {
  const delta = new Map<string, number>();
  for (const a of asg) {
    const vkn = vknByNo.get(a.no);
    if (vkn === undefined || !a.code) continue;
    const k = `${vkn}|${a.code}`;
    delta.set(k, (delta.get(k) ?? 0) + sign);
  }
  return delta;
}

export function pushUndo(label: string, inverse: Change[], redo: Change[], rules?: RuleSnap) {
  if (inverse.length === 0 && !rules) return;
  undoStack.value = [...undoStack.value.slice(-49), { label, inverse, redo, at: current.value?.no ?? null, rules }];
  redoStack.value = [];
}

/** Kod ver. `advance` verilmezse Ayarlar › Görünüm › "Kod verdikten sonra" seçimi geçerlidir. */
export async function assign(codeRaw: string, advance?: boolean) {
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
  if (advance ?? settings.value.autoAdvance) next();
}

export async function clearAssignment() {
  const inv = current.value;
  if (!inv || !batchRec.value || !assignments.value.get(inv.no)) return;
  const change: Change = { no: inv.no, code: null, source: 'manual' };
  const inverse = await applyChanges([change]);
  pushUndo(`${inv.no} atama kaldırıldı`, inverse, [change]);
}

/**
 * Kayıt sonrası başka yoldan (başka sekme, yedekten içe aktarma) kodu değişmiş fatura sayısı. Böyle bir kaydı
 * uygulamak o değişikliği sessizce ezerdi. Dönemden çıkarılmış faturalar sayılmaz (applyChanges onları atlar).
 */
function staleCount(expect: Change[]): number {
  return expect.filter((ch) => recByNo.value.has(ch.no) && (assignments.value.get(ch.no) ?? null) !== ch.code).length;
}

/** Geri al / yinele: kuralları kayıttaki hallerine getirir */
async function writeRules(ids: string[], snap: Rule[]) {
  const byId = new Map(snap.map((r) => [r.id, r]));
  for (const id of ids) { const r = byId.get(id); if (r) await db.rules.put(r); else await db.rules.delete(id); }
  rules.value = (await db.rules.where('firmId').equals(currentFirmId.value).toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  notifyOtherTabs();
}

export async function undo() {
  const e = undoStack.value[undoStack.value.length - 1];
  if (!e) { showToast('Geri alınacak işlem yok'); return; }
  undoStack.value = undoStack.value.slice(0, -1);
  const stale = staleCount(e.redo);
  if (stale) { showToast(`Geri alınamadı: ${e.label} — ${stale} faturanın kodu sonradan başka yerde (başka sekme ya da yedek) değişti.`, 5000); return; }
  if (e.rules) await writeRules(e.rules.ids, e.rules.before);
  await applyChanges(e.inverse);
  redoStack.value = [...redoStack.value, e];
  const idx = e.at ? invoices.value.findIndex((i) => i.no === e.at) : -1;
  if (idx >= 0) goTo(idx);
  showToast(`Geri alındı: ${e.label}`);
}

export async function redo() {
  const e = redoStack.value[redoStack.value.length - 1];
  if (!e) return;
  redoStack.value = redoStack.value.slice(0, -1);
  const stale = staleCount(e.inverse);
  if (stale) { showToast(`Yinelenemedi: ${e.label} — ${stale} faturanın kodu sonradan başka yerde değişti.`, 5000); return; }
  if (e.rules) await writeRules(e.rules.ids, e.rules.after);
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
  const bytes = await buildTemplateWorkbook(outputOrder.value, settings.value.outputTemplate, outputContext());
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
  notifyOtherTabs();
}

export function enterManual(initial = '') {
  manualText.value = initial;
  mode.value = 'manual';
}

export function exitManual() {
  manualText.value = '';
  mode.value = 'nav';
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

export const moveOpen = signal(false);
