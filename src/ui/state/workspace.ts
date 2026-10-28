import { DEFAULT_SHORTCUT_KEYS, type Settings } from '../../core/types';
import { isEdmDefault, normalizeTemplate } from '../../core/excel/template';
import { sheetToInvoices, type EdmSheet } from '../../core/legacy';
import { db, newId, type BatchRecord, type InvoiceRecord, type AssignmentRecord, type AccountRecord, type FirmRecord, type FirmHistoryEntry } from '../../storage/db';
import { upgradeRule, type Rule } from '../../core/rules';
import { batchList, batchRec, busy, currentFirmId, firm, firms, lastExportAt, settings, showToast, updateSettings } from './core';
import { loadFirmData, openBatch, refreshBatchList, reloadBatch } from './firms';
import { mergeRule } from './rules';

/** Yedekte XML ve XSLT taşınmaz (boyut); başlık alanları yeter, çıktı üretilebilir, görsel için XML yeniden yüklenir. */
export type InvoiceMeta = Omit<InvoiceRecord, 'xml' | 'xsltId'>;

export interface WorkspaceExport {
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
export interface LegacyBatchExport {
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
    batches: [] };
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
        await db.batches.put(b2);
      }
      // Faturalar: yerelde olmayanlar eklenir (XML'siz); yereldekiler korunur
      const metas: InvoiceMeta[] = invs ?? (sheet ? sheetToInvoices(sheet).map((f) => ({
        batchId: b2.id, no: f.no, uuid: '', issueDate: f.issueDate, issueTime: '', profileId: f.profileId, typeCode: f.typeCode, currency: f.currency,
        supplierVkn: f.supplierVkn, supplierName: f.supplierName, payable: f.payable, taxExclusive: null, taxAmount: null, lineCount: null,
        fileName: sourceFileName ?? '', addedAt: batch.createdAt, order: f.order })) : []);
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
      const up = upgradeRule(r);
      if (!up) continue;
      nr += await mergeRule({ ...(r as Rule), ...up, batchId: r.batchId ?? null, firmId: fid(r.firmId) }) ? 1 : 0;
    }
    // Çıktı şablonu: yedekteki özelleştirilmiş şablon, yerel şablon hâlâ EDM varsayılanıysa alınır (özelleştirilmiş yerel şablon ezilmez)
    let tplNote = '';
    const srcTpl = raw.settings?.outputTemplate ? normalizeTemplate(raw.settings.outputTemplate) : null;
    if (srcTpl && !isEdmDefault(srcTpl)) {
      if (isEdmDefault(settings.value.outputTemplate)) { await updateSettings({ outputTemplate: srcTpl }); tplNote = ', çıktı şablonu'; }
      else if (JSON.stringify(srcTpl) !== JSON.stringify(settings.value.outputTemplate)) tplNote = '; buradaki özelleştirilmiş çıktı şablonu korundu';
    }
    firms.value = await db.firms.orderBy('name').toArray();
    await loadFirmData();
    await refreshBatchList();
    const latest = batchList.value[0];
    if (batchRec.value) await reloadBatch();
    else if (latest) await openBatch(latest.id);
    showToast(`İçe aktarıldı: ${srcFirms.length} firma, ${nb} yeni dönem, ${ni} fatura, ${na} atama${nr ? `, ${nr} kural` : ''}${tplNote}`, 6000);
  } catch (e) {
    showToast((e as Error).message, 5000);
  } finally {
    busy.value = null;
  }
}
