import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { COND_LABELS, MAX_CONDS, PRIORITY_TEXT, VAT_PRESETS, beats, condLabel, ruleLabel, ruleMatches, toRate, type Cond, type CondKind, type Rule } from '../core/rules';
import { TYPE_LABELS, type Invoice } from '../core/types';
import { fmtAmount } from './InvoiceCard';

const KINDS = Object.keys(COND_LABELS) as CondKind[];

/** Seçili faturadan koşul için uygun başlangıç değeri */
function seedCond(kind: CondKind, inv: Invoice | null): Cond {
  switch (kind) {
    case 'vkn': return { kind, text: inv?.supplierVkn ?? '' };
    case 'name': return { kind, text: inv?.supplierName ?? '' };
    case 'type': return { kind, text: inv?.typeCode || 'SATIS' };
    case 'vat': return { kind, text: inv?.vatRates.length ? String(inv.vatRates[0]) : '20' };
    case 'qty': case 'amount': return { kind, min: null, max: null };
    default: return { kind, text: '' };
  }
}

const numOrNull = (s: string): number | null => { const t = s.replace(',', '.').trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const numStr = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '' : String(n));

function CondRow({ c, i, total, inv, onChange, onRemove, inputRef }: { c: Cond; i: number; total: number; inv: Invoice | null; onChange: (c: Cond) => void; onRemove: () => void; inputRef?: (el: HTMLInputElement | null) => void }) {
  const stop = (e: KeyboardEvent) => e.stopPropagation();
  const vatPreset = c.kind === 'vat' && c.text !== undefined && VAT_PRESETS.includes(String(toRate(c.text) ?? ''));
  const [vatOther, setVatOther] = useState(c.kind === 'vat' && !vatPreset);
  return (
    <div class="cond-row">
      <div class="row-inline" style="justify-content:flex-start; gap:6px">
        <span class="cond-and">{i === 0 ? 'Eğer' : 've'}</span>
        <select class="cond-kind" value={c.kind} onKeyDown={stop} onChange={(e) => { const k = (e.currentTarget as HTMLSelectElement).value as CondKind; setVatOther(false); onChange(seedCond(k, inv)); }} title="Koşul türü">
          {KINDS.map((k) => <option value={k}>{COND_LABELS[k]}</option>)}
        </select>
      </div>
      <div class="cond-inputs">
        {(c.kind === 'vkn' || c.kind === 'name' || c.kind === 'item') && (
          <input ref={inputRef} class="cond-text" value={c.text ?? ''} onKeyDown={stop} onInput={(e) => onChange({ ...c, text: (e.currentTarget as HTMLInputElement).value })}
            placeholder={c.kind === 'vkn' ? 'VKN (10) / TCKN (11 rakam)' : c.kind === 'name' ? 'unvanda geçen metin, örn. güneş temizlik' : 'kalem adında geçen metin, örn. klasör'} />
        )}
        {c.kind === 'type' && (
          <select class="cond-text" value={(c.text ?? '').toUpperCase()} onKeyDown={stop} onChange={(e) => onChange({ ...c, text: (e.currentTarget as HTMLSelectElement).value })}>
            {Object.entries(TYPE_LABELS).map(([k, label]) => <option value={k}>{label}</option>)}
          </select>
        )}
        {c.kind === 'vat' && (
          <>
            <select class="cond-vat" value={vatOther ? '__other' : String(toRate(c.text) ?? '20')} onKeyDown={stop} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v === '__other') { setVatOther(true); onChange({ ...c, text: '' }); } else { setVatOther(false); onChange({ ...c, text: v }); } }}>
              {VAT_PRESETS.map((p) => <option value={p}>%{p}</option>)}
              <option value="__other">Başka oran…</option>
            </select>
            {vatOther && <input ref={inputRef} class="cond-vat-other" inputMode="decimal" placeholder="örn. 8" value={c.text ?? ''} onKeyDown={stop} onInput={(e) => onChange({ ...c, text: (e.currentTarget as HTMLInputElement).value })} />}
            <span class="unit">{inv?.vatRates.length ? `bu faturada: %${inv.vatRates.join(', %')}` : 'faturada bu oranlı KDV var'}</span>
          </>
        )}
        {(c.kind === 'qty' || c.kind === 'amount') && (
          <>
            <input ref={inputRef} class="cond-min" inputMode="decimal" placeholder="en az" value={numStr(c.min)} onKeyDown={stop} onInput={(e) => onChange({ ...c, min: numOrNull((e.currentTarget as HTMLInputElement).value) })} />
            <span class="unit">–</span>
            <input class="cond-max" inputMode="decimal" placeholder="en çok" value={numStr(c.max)} onKeyDown={stop} onInput={(e) => onChange({ ...c, max: numOrNull((e.currentTarget as HTMLInputElement).value) })} />
            <span class="unit">{c.kind === 'qty' ? 'adet/kg… (birini boş bırakabilirsiniz)' : '₺, KDV dahil (birini boş bırakabilirsiniz)'}</span>
          </>
        )}
      </div>
      <button class="ghost tiny cond-remove" title="Koşulu kaldır" disabled={total <= 1} onClick={onRemove}>✕</button>
    </div>
  );
}

/** Otomatik atama kuralları: koşul kurucu, liste, uygulama, dosya olarak paylaşma */
export function RulesModal() {
  const draft = S.ruleDraft.value;
  const inv = S.current.value;
  const batch = S.batchRec.value;
  const [scope, setScope] = useState<S.RuleScope>(draft?.scope ?? 'firm');
  const [conds, setConds] = useState<Cond[]>(draft?.conds.length ? draft.conds : [seedCond('vkn', inv)]);
  const [code, setCode] = useState(draft?.code ?? (inv ? S.assignments.value.get(inv.no) ?? '' : ''));
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);
  const firstInput = useRef<HTMLInputElement | null>(null);
  const imp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (code ? firstInput : codeInput).current?.focus();
    if (code) firstInput.current?.select();
  }, []);

  const setCond = (i: number, c: Cond) => setConds((cs) => cs.map((x, k) => (k === i ? c : x)));
  const removeCond = (i: number) => setConds((cs) => cs.filter((_, k) => k !== i));
  const addCond = () => {
    if (conds.length >= MAX_CONDS) return;
    const used = new Set(conds.map((c) => c.kind));
    const kind = KINDS.find((k) => !used.has(k)) ?? 'item';
    setConds((cs) => [...cs, seedCond(kind, inv)]);
  };
  const reset = () => { setConds([seedCond('vkn', inv)]); setCode(''); setEditing(null); setErr(null); };

  const submit = async () => {
    const e = editing ? await S.updateRule(editing, { conds, code, batchId: scope === 'batch' ? batch?.id ?? null : null }) : await S.addRule(conds, code, scope);
    setErr(e);
    if (!e) { reset(); firstInput.current?.focus(); }
  };
  const startEdit = (r: Rule) => { setEditing(r.id); setConds(r.conds.map((c) => ({ ...c }))); setCode(r.code); setScope(r.batchId ? 'batch' : 'firm'); setErr(null); };

  const pending = S.rulePending.value.length;
  const invs = S.invoices.value;
  const hits = (r: Pick<Rule, 'conds'>) => invs.filter((i) => ruleMatches(r, i));
  // Canlı önizleme: taslak hangi faturalara uyar, kaçında başka bir kural önde olur
  const candidate: Rule = { id: editing ?? '__draft', firmId: '', batchId: scope === 'batch' ? batch?.id ?? null : null, conds, code: code || '?', enabled: true, createdAt: 0, updatedAt: Number.MAX_SAFE_INTEGER };
  const previewOk = conds.every((c) => (c.kind === 'qty' || c.kind === 'amount') ? (c.min ?? null) !== null || (c.max ?? null) !== null : !!(c.text ?? '').trim());
  const matched = previewOk ? hits(candidate) : [];
  const others = S.batchRules.value.filter((r) => r.id !== editing && r.enabled);
  const outranked = matched.filter((i) => others.some((o) => ruleMatches(o, i) && beats(o, candidate) && o.code !== candidate.code));
  const f = filter.trim().toLocaleLowerCase('tr');
  const list = S.batchRules.value.filter((r) => !f || ruleLabel(r).toLocaleLowerCase('tr').includes(f) || r.code.includes(f)).sort((a, b) => Number(!!b.batchId) - Number(!!a.batchId) || b.updatedAt - a.updatedAt);
  const otherBatchRules = S.rules.value.length - S.batchRules.value.length;

  return (
    <div class="modal-backdrop" onClick={() => S.closeRules()}>
      <div class="modal rules" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (editing) reset(); else S.closeRules(); } }}>
        <div class="modal-head">
          <b>Otomatik atama kuralları</b>
          <span class="muted">{S.firm.value.name} · {S.rules.value.length} kural</span>
          <div class="spacer" />
          <button class="ghost" onClick={() => S.closeRules()}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          <div class="muted small">
            Bir kural, koşulların <b>hepsi</b> tutunca faturaya kodu verir; uyan fatura <b>yüklenir yüklenmez</b> kodu alır ("kural" etiketi, Ctrl+Z ile geri alınır).
            Tek koşul da yeter (örn. yalnızca VKN); miktar ya da tutar aralığı gibi koşullarla aynı satıcıyı farklı kodlara ayırabilirsiniz.
            <span title={PRIORITY_TEXT}> Öncelik: döneme özel › daha çok koşullu › VKN › unvan › kalem › tip › KDV › miktar › tutar.</span>{' '}
            <b>Kalıcı</b> kural firmanın her döneminde, <b>döneme özel</b> kural yalnızca o ayda geçerlidir. Kurallar yalnızca bu tarayıcıda saklanır; yedeğe girer, kalıcılar dosya olarak paylaşılabilir.
          </div>
          <div class="scope-seg" role="radiogroup" aria-label="Kural kapsamı">
            <button class={scope === 'firm' ? 'on' : ''} onClick={() => setScope('firm')} title="Firmanın bütün dönemlerinde geçerli">Kalıcı · {S.firm.value.name}</button>
            <button class={scope === 'batch' ? 'on' : ''} disabled={!batch} onClick={() => setScope('batch')} title="Yalnızca açık dönemde geçerli; dönem silinince kural da gider">Yalnızca bu dönem · {batch?.name ?? '—'}</button>
          </div>
          <div class={`rule-form ${editing ? 'editing' : ''}`}>
            {editing && <div class="muted small">Kural düzenleniyor: <b>{ruleLabel(S.rules.value.find((r) => r.id === editing) ?? { conds: [] })}</b> → {S.rules.value.find((r) => r.id === editing)?.code}. <kbd>Esc</kbd> vazgeçer.</div>}
            {conds.map((c, i) => (
              <CondRow key={i} c={c} i={i} total={conds.length} inv={inv} onChange={(x) => setCond(i, x)} onRemove={() => removeCond(i)} inputRef={i === 0 ? (el) => { firstInput.current = el; } : undefined} />
            ))}
            <button class="ghost tiny add-cond" disabled={conds.length >= MAX_CONDS} onClick={addCond} title={`En çok ${MAX_CONDS} koşul`}>+ Koşul ekle{conds.length >= MAX_CONDS ? ` (en çok ${MAX_CONDS})` : ''}</button>
            <div class="rule-then">
              <span class="then-label">o zaman hesap kodu</span>
              <input ref={codeInput} class="rule-code" placeholder="hesap kodu, örn. 770.01" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
              <button class="primary rule-submit" onClick={submit} disabled={!code.trim()}>{editing ? 'Değişikliği kaydet' : scope === 'batch' ? 'Bu döneme kaydet' : 'Kaydet ve uygula'}</button>
              {editing ? <button class="ghost" onClick={reset}>Vazgeç</button> : <span />}
            </div>
            {err && <div class="issue">{err}</div>}
            {batch && previewOk && (
              <div class="rule-preview">
                <div>Bu dönemde uyan fatura: <b>{matched.length}</b> / {invs.length}{outranked.length > 0 && <span class="pv-warn" title={PRIORITY_TEXT}> · {outranked.length} tanesinde başka bir kural önde kalır</span>}{matched.length === 0 && conds.some((c) => c.kind === 'qty' || c.kind === 'item') && invs.some((i) => i.lines.length === 0) && <span> · kalem bilgisi olmayan (listeden gelen) faturalar eşleşmez</span>}</div>
                {matched.slice(0, 4).map((i) => <div class="pv-row"><span>{i.no}</span><span>{i.supplierName}</span><span>{fmtAmount(i.amount, i.currency)}</span><span>{S.assignments.value.get(i.no) ? `kodu var: ${S.assignments.value.get(i.no)}` : 'kod bekliyor'}</span></div>)}
                {matched.length > 4 && <div class="pv-row"><span>… {matched.length - 4} fatura daha</span></div>}
              </div>
            )}
          </div>

          <div class="row-inline" style="margin-top:4px">
            <input placeholder="Kurallarda ara" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.stopPropagation()} style="flex:1" />
            <button disabled={!pending} title="Dönemdeki kod almamış, kurala uyan faturalara kodlarını ver" onClick={() => S.applyRules(() => true).then((n) => S.showToast(n ? `${n} faturaya uygulandı` : 'Uygulanacak fatura yok'))}>Bu döneme uygula ({pending})</button>
          </div>
          <div class="acc-list rule-list">
            {list.length === 0 && <div class="chart-empty">{S.batchRules.value.length ? 'Aramaya uyan kural yok.' : 'Henüz kural yok. Yukarıdan ekleyin ya da panelde "Kural yap"a basın.'}</div>}
            {list.map((r) => {
              const ov = r.batchId ? S.overriddenBy(r) : null;
              const n = S.batchRec.value ? hits(r).length : null;
              return (
              <div class={`acc-row rule-row ${r.enabled ? '' : 'off'} ${r.batchId ? 'scoped' : ''} ${editing === r.id ? 'editing' : ''}`}>
                <input type="checkbox" checked={r.enabled} title={r.enabled ? 'Kuralı kapat' : 'Kuralı aç'} onChange={(e) => S.updateRule(r.id, { enabled: (e.currentTarget as HTMLInputElement).checked })} />
                <span class="rule-conds" title={ruleLabel(r)}>
                  {r.batchId ? <span class="bulk-tag scope-tag" title={`Yalnızca ${batch?.name ?? 'bu dönem'} döneminde geçerli`}>bu dönem</span> : null}
                  {r.conds.map((c) => <span class={`cond-chip k-${c.kind}`}>{condLabel(c)}</span>)}
                  {ov && ov.count > 0 && <span class="override-note" title={`Bu dönemde ${ov.count} faturada kalıcı kuralın (${ov.codes.join(', ')}) yerine geçiyor`}> · kalıcı {ov.codes.join(', ')} yerine</span>}
                </span>
                <span class="muted small rule-hits" title="Bu dönemde uyan fatura">{n === null ? '' : `${n} fatura`}</span>
                <input class="acc-name rule-code-edit" value={r.code} title="Hesap kodu" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) S.updateRule(r.id, { code: v }).then((er) => { if (er) S.showToast(er, 4000); }); }} />
                <button class="ghost tiny rule-edit" title="Koşulları düzenle" onClick={() => startEdit(r)}>✎</button>
                <button class="ghost tiny" title="Kuralı sil (yapılmış atamalar kalır)" onClick={() => { if (editing === r.id) reset(); S.deleteRule(r.id); }}>✕</button>
              </div>
              );
            })}
          </div>
          {otherBatchRules > 0 && <div class="muted small">Başka dönemlere özel {otherBatchRules} kural burada listelenmez; kendi dönemleri açılınca görünür.</div>}

          <div class="row-inline" style="justify-content:flex-start; flex-wrap:wrap">
            <button onClick={() => S.exportRules()} disabled={!S.rules.value.length}>Kuralları dışa aktar (.json)</button>
            <button onClick={() => imp.current?.click()}>Kural dosyası al</button>
            <input ref={imp} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) S.importRules(f); (e.currentTarget as HTMLInputElement).value = ''; }} />
            <span class="muted small">Dosyaya yalnızca kalıcı kurallar yazılır; başka bilgisayarda aynı firmaya alınır, aynı koşullar güncellenir, hiçbir kural silinmez. Çalışma alanı yedeği döneme özel kuralları da içerir.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
