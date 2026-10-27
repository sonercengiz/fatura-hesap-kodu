import { type Invoice } from '../../core/types';
import { db, newId } from '../../storage/db';
import { validateRule, cleanCond, ruleKey, parseRulesFile, type Rule, type Cond, type RulesFile } from '../../core/rules';
import { Change, RuleScope, applyChanges, assignments, batchRec, current, currentFirmId, firm, invoices, next, pushUndo, ruleDraft, ruleFor, ruleNos, rules, rulesOpen, showToast } from './core';
import { notifyOtherTabs } from './firms';

/** Aynı firma + kapsamda aynı koşullar varsa onu günceller (daha yeniyse), yoksa ekler. true = yazıldı */
export async function mergeRule(r: Rule): Promise<boolean> {
  const conds = r.conds.map(cleanCond);
  const key = ruleKey(conds);
  const scope = r.batchId ?? null;
  const same = (await db.rules.where('firmId').equals(r.firmId).toArray()).find((x) => (x.batchId ?? null) === scope && ruleKey(x.conds ?? []) === key);
  if (same) {
    if ((r.updatedAt ?? 0) <= same.updatedAt && same.code === r.code) return false;
    await db.rules.put({ ...same, code: r.code, enabled: r.enabled ?? true, updatedAt: Math.max(same.updatedAt, r.updatedAt ?? 0) });
    return true;
  }
  const byId = r.id ? await db.rules.get(r.id) : undefined;
  await db.rules.put({ ...r, conds, batchId: scope, id: byId ? newId() : r.id || newId(), enabled: r.enabled ?? true, createdAt: r.createdAt ?? Date.now(), updatedAt: r.updatedAt ?? Date.now() });
  return true;
}

export async function reloadRules() {
  rules.value = (await db.rules.where('firmId').equals(currentFirmId.value).toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  notifyOtherTabs();
}

/** Kural ekler (aynı kapsamda aynı koşullar varsa günceller) ve dönemdeki atanmamış uyan faturalara hemen uygular. Hata metni ya da null. */
export async function addRule(condsRaw: Cond[], codeRaw: string, scope: RuleScope = 'firm'): Promise<string | null> {
  const conds = condsRaw.map(cleanCond);
  const code = codeRaw.trim();
  const err = validateRule(conds, code);
  if (err) return err;
  if (scope === 'batch' && !batchRec.value) return 'Döneme özel kural için açık bir dönem gerekir.';
  const now = Date.now();
  await mergeRule({ id: newId(), firmId: currentFirmId.value, batchId: scope === 'batch' ? batchRec.value!.id : null, conds, code, enabled: true, createdAt: now, updatedAt: now });
  await reloadRules();
  const n = await applyRules(() => true, true);
  showToast(n ? `Kural kaydedildi · ${n} faturaya uygulandı` : 'Kural kaydedildi', 3500);
  return null;
}

/** Kuralı günceller (kod, açık/kapalı, koşullar, kapsam). Koşul değişirse doğrulanır; hata metni ya da null. */
export async function updateRule(id: string, patch: Partial<Pick<Rule, 'code' | 'enabled' | 'conds' | 'batchId'>>): Promise<string | null> {
  const r = rules.value.find((x) => x.id === id);
  if (!r) return null;
  const nextRule: Rule = { ...r, ...patch, updatedAt: Date.now() };
  if (patch.conds) nextRule.conds = patch.conds.map(cleanCond);
  if (patch.conds || patch.code !== undefined) {
    const err = validateRule(nextRule.conds, nextRule.code);
    if (err) return err;
  }
  if (patch.batchId === undefined && !('batchId' in patch)) nextRule.batchId = r.batchId;
  await db.rules.put(nextRule);
  await reloadRules();
  if (patch.conds || patch.code !== undefined || patch.enabled) {
    // Kuralla verilmiş kodlar kuralı takip eder: bu dönemde "kural" kaynaklı atamalardan kuralın artık başka kod dediği olanlar düzeltilir
    const fix: Change[] = [];
    for (const inv of invoices.value) {
      if (!ruleNos.value.has(inv.no)) continue;
      const r = ruleFor.value.get(inv.no);
      const cur = assignments.value.get(inv.no);
      if (r && cur && r.code !== cur) fix.push({ no: inv.no, code: r.code, source: 'rule' });
    }
    if (fix.length) {
      const inverse = await applyChanges(fix);
      pushUndo(`kural güncellendi: ${fix.length} fatura`, inverse, fix);
    }
    const n = await applyRules(() => true, true);
    if (n || fix.length) showToast(`Kural güncellendi · ${[n ? `${n} faturaya uygulandı` : '', fix.length ? `${fix.length} faturanın kodu düzeltildi` : ''].filter(Boolean).join(', ')}`, 3500);
  }
  return null;
}

export async function deleteRule(id: string) {
  await db.rules.delete(id);
  await reloadRules();
}

/**
 * Kuralları dönemdeki kod almamış faturalara uygular (yalnızca `pick` ile seçilenler); kaynak "kural".
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
export function openRules(draft?: { conds: Cond[]; code: string; scope?: RuleScope }) {
  ruleDraft.value = draft ?? null;
  rulesOpen.value = true;
}

export function closeRules() {
  rulesOpen.value = false;
  ruleDraft.value = null;
}

export function exportRules() {
  const data: RulesFile = {
    app: 'fatura-hesap-kodu',
    kind: 'rules',
    version: 2,
    exportedAt: new Date().toISOString(),
    firmName: firm.value.name,
    rules: rules.value.filter((r) => r.batchId === null).map(({ conds, code, enabled }) => ({ conds, code, enabled })),
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

/** Kural dosyasını bu firmaya ekler (aynı koşullar güncellenir, hiçbir kural silinmez); eski tek belirteçli dosyalar da okunur */
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
