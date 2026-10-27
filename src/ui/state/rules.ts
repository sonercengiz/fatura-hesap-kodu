import { type Invoice } from '../../core/types';
import { db, newId } from '../../storage/db';
import { validateRule, normPattern, parseRulesFile, type Rule, type RuleKind, type RulesFile } from '../../core/rules';
import { Change, RuleScope, applyChanges, assignments, batchRec, current, currentFirmId, firm, invoices, next, pushUndo, ruleDraft, ruleFor, ruleNos, rules, rulesOpen, showToast } from './core';
import { notifyOtherTabs } from './firms';

/** Aynı firma + kapsamda aynı tür+belirteç varsa onu günceller (daha yeniyse), yoksa ekler. true = yazıldı */
export async function mergeRule(r: Rule): Promise<boolean> {
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

export async function reloadRules() {
  rules.value = (await db.rules.where('firmId').equals(currentFirmId.value).toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  notifyOtherTabs();
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
