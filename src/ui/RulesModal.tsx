import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { RULE_KIND_LABELS, ruleMatches, type RuleKind } from '../core/rules';

/** Otomatik atama kuralları: liste, ekleme, uygulama, dosya olarak paylaşma */
export function RulesModal() {
  const draft = S.ruleDraft.value;
  const inv = S.current.value;
  const [kind, setKind] = useState<RuleKind>(draft?.kind ?? 'vkn');
  const [pattern, setPattern] = useState(draft?.pattern ?? inv?.supplierVkn ?? '');
  const [code, setCode] = useState(draft?.code ?? (inv ? S.assignments.value.get(inv.no) ?? '' : ''));
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);
  const patInput = useRef<HTMLInputElement>(null);
  const imp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (code ? patInput : codeInput).current?.focus();
    if (code) patInput.current?.select();
  }, []);

  // Tür değişince panelden uygun öneriyi doldur
  const pick = (k: RuleKind) => {
    setKind(k);
    if (!inv) return;
    if (k === 'vkn') setPattern(inv.supplierVkn);
    else if (k === 'name') setPattern(inv.supplierName);
    else setPattern('');
  };

  const submit = async () => {
    const e = await S.addRule(kind, pattern, code);
    setErr(e);
    if (!e) { setPattern(''); setCode(''); setKind('vkn'); patInput.current?.focus(); }
  };

  const pending = S.rulePending.value.length;
  const invs = S.invoices.value;
  const hits = (r: Parameters<typeof ruleMatches>[0]) => invs.filter((i) => ruleMatches(r, i)).length;
  const f = filter.trim().toLocaleLowerCase('tr');
  const list = S.rules.value.filter((r) => !f || r.pattern.toLocaleLowerCase('tr').includes(f) || r.code.includes(f));

  return (
    <div class="modal-backdrop" onClick={() => S.closeRules()}>
      <div class="modal rules" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); S.closeRules(); } }}>
        <div class="modal-head">
          <b>Otomatik atama kuralları</b>
          <span class="muted">{S.firm.value.name} · {S.rules.value.length} kural</span>
          <div class="spacer" />
          <button class="ghost" onClick={() => S.closeRules()}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          <div class="muted small">
            Bu firmada tekrar eden satıcılar için kod sabitleyin: belirteç uyan her fatura <b>yüklenir yüklenmez</b> o kodu alır ("kural" etiketi, Ctrl+Z ile geri alınır).
            Öncelik: VKN/TCKN › unvan › kalem adı. Kurallar yalnızca bu tarayıcıda saklanır; yedeğe girer ve dosya olarak paylaşılabilir.
          </div>
          <div class="rule-form">
            <select value={kind} onChange={(e) => pick((e.currentTarget as HTMLSelectElement).value as RuleKind)} onKeyDown={(e) => e.stopPropagation()}>
              {(Object.keys(RULE_KIND_LABELS) as RuleKind[]).map((k) => <option value={k}>{RULE_KIND_LABELS[k]}</option>)}
            </select>
            <input ref={patInput} class="rule-pattern" placeholder={kind === 'vkn' ? 'VKN (10) / TCKN (11 rakam)' : kind === 'name' ? 'unvanda geçen metin, örn. güneş temizlik' : 'kalem adında geçen metin, örn. kargo'} value={pattern} onInput={(e) => setPattern((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); codeInput.current?.focus(); } }} />
            <input ref={codeInput} class="rule-code" placeholder="hesap kodu" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
            <button class="primary" onClick={submit} disabled={!pattern.trim() || !code.trim()}>Kaydet ve uygula</button>
          </div>
          {err && <div class="issue">{err}</div>}
          {pattern.trim() && S.batchRec.value && (
            <div class="muted small">Bu partide uyan fatura: <b>{hits({ id: '', firmId: '', kind, pattern, code: '', enabled: true, createdAt: 0, updatedAt: 0 })}</b> / {invs.length}</div>
          )}

          <div class="row-inline" style="margin-top:4px">
            <input placeholder="Kurallarda ara" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.stopPropagation()} style="flex:1" />
            <button disabled={!pending} title="Partideki kod almamış, kurala uyan faturalara kodlarını ver" onClick={() => S.applyRules(() => true).then((n) => S.showToast(n ? `${n} faturaya uygulandı` : 'Uygulanacak fatura yok'))}>Bu partiye uygula ({pending})</button>
          </div>
          <div class="acc-list rule-list">
            {list.length === 0 && <div class="chart-empty">{S.rules.value.length ? 'Aramaya uyan kural yok.' : 'Henüz kural yok. Yukarıdan ekleyin ya da panelde "Kural yap"a basın.'}</div>}
            {list.map((r) => (
              <div class={`acc-row rule-row ${r.enabled ? '' : 'off'}`}>
                <input type="checkbox" checked={r.enabled} title={r.enabled ? 'Kuralı kapat' : 'Kuralı aç'} onChange={(e) => S.updateRule(r.id, { enabled: (e.currentTarget as HTMLInputElement).checked })} />
                <span class="rule-kind">{RULE_KIND_LABELS[r.kind]}</span>
                <span class="rule-pat" title={r.pattern}>{r.pattern}</span>
                <span class="muted small rule-hits" title="Bu partide uyan fatura">{S.batchRec.value ? `${hits(r)} fatura` : ''}</span>
                <input class="acc-name rule-code-edit" value={r.code} title="Hesap kodu" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) S.updateRule(r.id, { code: v }); }} />
                <button class="ghost tiny" title="Kuralı sil (yapılmış atamalar kalır)" onClick={() => S.deleteRule(r.id)}>✕</button>
              </div>
            ))}
          </div>

          <div class="row-inline" style="justify-content:flex-start; flex-wrap:wrap">
            <button onClick={() => S.exportRules()} disabled={!S.rules.value.length}>Kuralları dışa aktar (.json)</button>
            <button onClick={() => imp.current?.click()}>Kural dosyası al</button>
            <input ref={imp} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) S.importRules(f); (e.currentTarget as HTMLInputElement).value = ''; }} />
            <span class="muted small">Dosya başka bilgisayarda aynı firmaya alınır; aynı belirteç güncellenir, hiçbir kural silinmez. Çalışma alanı yedeği de kuralları içerir.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
