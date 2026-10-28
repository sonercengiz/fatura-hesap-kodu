import { type Invoice } from '../../core/types';
import { db, newId } from '../../storage/db';
import { validateRule, cleanCond, ruleKey, parseRulesFile, activeRules, matchRules, type Rule, type Cond, type RulesFile } from '../../core/rules';
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

/**
 * Açık dönemde kuralla verilmiş kodları kurallara eşitler: "kural" kaynaklı kod, ona artık hangi kural uyuyorsa onun
 * kodunu alır, hiçbiri uymuyorsa kalkar; kodu olmayan ve bir kurala uyan fatura kodunu alır. Elle ve toplu verilen
 * kodlara dokunulmaz. Geçmiş dönemler değişmez (Excel'leri büyük olasılıkla aktarıldı).
 */
function syncRuleCodes(): Change[] {
  const changes: Change[] = [];
  for (const inv of invoices.value) {
    const cur = assignments.value.get(inv.no) ?? null;
    const want = ruleFor.value.get(inv.no)?.code ?? null;
    if (ruleNos.value.has(inv.no) ? want !== cur : !cur && want) changes.push({ no: inv.no, code: want, source: 'rule' });
  }
  return changes;
}

/**
 * Kuralları değiştiren her yol buradan geçer: değişiklik yapılır, açık dönemin kodları kurallara eşitlenir ve
 * kural + kodlar birlikte tek adımda geri alınabilir. Bildirim metni döner (başlık + ne oldu).
 */
async function changeRules(label: string, head: string | (() => string), mutate: () => Promise<void>): Promise<string> {
  const before = rules.value;
  await mutate();
  await reloadRules();
  const after = rules.value;
  const same = (a?: Rule, b?: Rule) => JSON.stringify(a) === JSON.stringify(b);
  const ids = [...new Set([...before, ...after].map((r) => r.id))].filter((id) => !same(before.find((r) => r.id === id), after.find((r) => r.id === id)));
  const changes = batchRec.value ? syncRuleCodes() : [];
  let applied = 0, fixed = 0, removed = 0;
  for (const ch of changes) { if (!assignments.value.has(ch.no)) applied++; else if (ch.code) fixed++; else removed++; }
  const inverse = await applyChanges(changes);
  if (ids.length) pushUndo(label, inverse, changes, { ids, before: before.filter((r) => ids.includes(r.id)), after: after.filter((r) => ids.includes(r.id)) });
  if (current.value && ruleNos.value.has(current.value.no) && changes.some((c) => c.no === current.value!.no && c.code)) next();
  const parts = [applied ? `${applied} faturaya uygulandı` : '', fixed ? `${fixed} faturanın kodu düzeltildi` : '', removed ? `${removed} faturanın kuralla verilmiş kodu kaldırıldı` : ''].filter(Boolean);
  return `${typeof head === 'string' ? head : head()}${parts.length ? ` · ${parts.join(', ')}` : ''}${ids.length ? ' (Ctrl+Z geri alır)' : ''}`;
}

/** Kural ekler (aynı kapsamda aynı koşullar varsa günceller) ve dönemdeki atanmamış uyan faturalara hemen uygular. Hata metni ya da null. */
export async function addRule(condsRaw: Cond[], codeRaw: string, scope: RuleScope = 'firm'): Promise<string | null> {
  const conds = condsRaw.map(cleanCond);
  const code = codeRaw.trim();
  const err = validateRule(conds, code);
  if (err) return err;
  if (scope === 'batch' && !batchRec.value) return 'Döneme özel kural için açık bir dönem gerekir.';
  const now = Date.now();
  const msg = await changeRules(`kural eklendi → ${code}`, 'Kural kaydedildi', async () => {
    await mergeRule({ id: newId(), firmId: currentFirmId.value, batchId: scope === 'batch' ? batchRec.value!.id : null, conds, code, enabled: true, createdAt: now, updatedAt: now });
  });
  showToast(msg, 3500);
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
  const [label, head] = patch.enabled === false ? ['kural kapatıldı', 'Kural kapatıldı'] : patch.enabled === true ? ['kural açıldı', 'Kural açıldı'] : ['kural güncellendi', 'Kural güncellendi'];
  const msg = await changeRules(`${label}: ${nextRule.code}`, head, async () => { await db.rules.put(nextRule); });
  showToast(msg, 3500);
  return null;
}

/** Kural silinince bu dönemde o kuralla verilmiş kaç kod kalkar / başka kurala geçer (silme onayı için) */
export function ruleRemovalEffect(id: string): { removed: number; reassigned: number } {
  const rest = activeRules(rules.value.filter((r) => r.id !== id), batchRec.value?.id ?? null);
  let removed = 0, reassigned = 0;
  for (const inv of invoices.value) {
    if (!ruleNos.value.has(inv.no) || ruleFor.value.get(inv.no)?.id !== id) continue;
    const other = matchRules(inv, rest, batchRec.value?.id ?? null);
    if (!other) removed++; else if (other.code !== assignments.value.get(inv.no)) reassigned++;
  }
  return { removed, reassigned };
}

export async function deleteRule(id: string) {
  const r = rules.value.find((x) => x.id === id);
  if (!r) return;
  showToast(await changeRules(`kural silindi: ${r.code}`, 'Kural silindi', async () => { await db.rules.delete(id); }), 4500);
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
    const msg = await changeRules('kural dosyası alındı', () => `${n} kural alındı${f.firmName ? ` (${f.firmName})` : ''}`, async () => {
      for (const r of f.rules) n += (await mergeRule({ id: newId(), firmId: currentFirmId.value, batchId: null, ...r, createdAt: now, updatedAt: now })) ? 1 : 0;
    });
    showToast(msg, 4500);
  } catch (e) {
    showToast((e as Error).message, 5000);
  }
}
