import { dominantMonth } from '../../core/xml/parseUbl';
import { db, newId } from '../../storage/db';
import { forgetHtml } from '../../render/xslt';
import { batchRec, firms, invoiceRecs, selected, showToast } from './core';
import { openBatch, refreshBatchList, reloadBatch, switchFirm } from './firms';

/** Satıcı geçmişi sayaçlarını bir firmadan diğerine aktarır (öneriler doğru firmada kalsın) */
export async function transferHistory(fromFirm: string, toFirm: string, pairs: { vkn: string; code: string }[]) {
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
 * Seçili faturaları başka firmaya ya da aynı firmanın başka dönemine taşır: hedef dönem verilmezse (ya da açık dönemse) yeni dönem açılır.
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
  if (!target || target.firmId !== targetFirmId || target.id === b.id) {
    // Hedef firmada aynı adlı dönem varsa (örn. aynı firmada "Eylül 2026"dan bölünen) "(2)" eklenir: dönem listesinde karışmasın
    const base = dominantMonth(recs.map((r) => r.issueDate)) ?? `Yeni dönem ${new Date(now).toLocaleDateString('tr-TR')}`;
    const taken = new Set((await db.batches.where('firmId').equals(targetFirmId).toArray()).map((x) => x.name));
    let name = base;
    for (let k = 2; taken.has(name); k++) name = `${base} (${k})`;
    target = { id: newId(), firmId: targetFirmId, name, autoName: name === base, createdAt: now, updatedAt: now }; // ekli ad yüklemede ay adına geri dönmesin
    await db.batches.put(target);
  }
  const existing = new Set((await db.invoices.where('batchId').equals(target.id).primaryKeys()).map((k) => k[1]));
  const order0 = (await db.invoices.where('batchId').equals(target.id).toArray()).reduce((m, r) => Math.max(m, r.order + 1), 0);
  let skipped = 0;
  await db.transaction('rw', db.invoices, db.assignments, db.batches, async () => {
    let order = order0;
    for (const r of recs) {
      if (existing.has(r.no)) { skipped++; continue; } // hedefte zaten var: kaynakta olduğu gibi bırakılır
      await db.invoices.delete([b.id, r.no]);
      await db.assignments.delete([b.id, r.no]);
      await db.invoices.put({ ...r, batchId: target!.id, order: order++ });
      const a = asg.find((x) => x.no === r.no);
      if (a) await db.assignments.put({ ...a, batchId: target!.id });
    }
    await db.batches.update(b.id, { updatedAt: now });
    await db.batches.update(target!.id, { updatedAt: now });
  });
  const moved = recs.filter((r) => !existing.has(r.no));
  if (b.firmId !== targetFirmId) await transferHistory(b.firmId, targetFirmId, asg.filter((a) => !existing.has(a.no)).map((a) => ({ vkn: recs.find((r) => r.no === a.no)?.supplierVkn ?? '', code: a.code })));
  for (const r of moved) forgetHtml(`${b.id}|${r.no}`);
  selected.value = new Set();
  const name = firms.value.find((f) => f.id === targetFirmId)?.name ?? '';
  await refreshBatchList();
  await reloadBatch();
  showToast(`${moved.length} fatura ${b.firmId === targetFirmId ? '' : `${name} › `}"${target.name}" dönemine taşındı${skipped ? ` · ${skipped} fatura orada zaten vardı, burada bırakıldı` : ''}.`, 5000);
}
