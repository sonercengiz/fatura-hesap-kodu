import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { COND_SHORT, beats, condLabel, fmtDateTr, isRange, keywordOf, ruleMatches, unitLabel, validateRule, type Cond, type CondKind, type Rule } from '../core/rules';
import { TYPE_LABELS, type Invoice } from '../core/types';
import { parseTrNumber, fmtTrNumber } from '../core/num';

/** Rozet: işaretlenebilir koşul; sayılı olanlarda yön (≥/≤) ve eşik, metinlilerde anahtar kelime düzenlenebilir */
interface Chip {
  id: string;
  cond: Cond;
  on: boolean;
  /** Sayılı rozetlerde: 'min' = en az (≥), 'max' = en çok (≤) */
  dir?: 'min' | 'max';
  /** Kalem rozetleri hangi kaleme ait (gruplama için) */
  line?: number;
  /** Sayılı rozetlerde kutudaki metin (kullanıcı yazarken biçimlenmez; sayıya `parseTrNumber` ile çevrilir) */
  text?: string;
}

const fmtN = fmtTrNumber;

/**
 * "Bu faturadan kural": seçili faturanın bütün bilgileri rozet olarak; kullanıcı işaretler, eşiği/kelimeyi düzeltir,
 * kodu yazar, kaydeder. Kural penceresine girmeden çok koşullu kural kurar; "Gelişmiş…" aynı taslakla büyük pencereyi açar.
 */
export function QuickRuleModal() {
  const origin = S.quickRule.value;
  const live = S.current.value;
  // Pencere açıldığı andaki fatura dondurulur: kaydet sonrası sıradaki faturaya geçilse de rozetler ve kalem indeksleri eski faturaya ait kalır
  const frozen = useRef<{ origin: NonNullable<typeof origin>; inv: Invoice } | null>(null);
  if (!origin) { frozen.current = null; return null; }
  if (!frozen.current || frozen.current.origin !== origin) { if (!live) return null; frozen.current = { origin, inv: live }; }
  return <QuickRuleBody key={`${frozen.current.inv.no}|${origin.lineIndex}`} inv={frozen.current.inv} origin={origin} />;
}

function QuickRuleBody({ inv, origin }: { inv: Invoice; origin: { lineIndex: number } }) {
  const batch = S.batchRec.value;
  const close = () => (S.quickRule.value = null);
  const assigned = S.assignments.value.get(inv.no) ?? '';
  const [scope, setScope] = useState<S.RuleScope>('firm');
  const [code, setCode] = useState(assigned);
  const [err, setErr] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const fromLine = origin.lineIndex >= 0;

  const [chips, setChips] = useState<Chip[]>(() => {
    const out: Chip[] = [];
    out.push({ id: 'vkn', cond: { kind: 'vkn', text: inv.supplierVkn }, on: !fromLine });
    if (inv.supplierName) out.push({ id: 'name', cond: { kind: 'name', text: inv.supplierName }, on: false });
    if (inv.isoDate) out.push({ id: 'date', cond: { kind: 'date', from: inv.isoDate, to: inv.isoDate }, on: false });
    if (inv.typeCode) out.push({ id: 'type', cond: { kind: 'type', text: inv.typeCode }, on: false });
    for (const v of inv.vatRates) out.push({ id: `vat${v}`, cond: { kind: 'vat', text: String(v) }, on: false });
    if (inv.amount != null) out.push({ id: 'amount', cond: { kind: 'amount', min: inv.amount, max: null }, on: false, dir: 'min' });
    inv.lines.forEach((l, k) => {
      const sel = k === origin.lineIndex;
      out.push({ id: `item${k}`, cond: { kind: 'item', text: keywordOf(l.label ?? l.name) }, on: sel, line: k });
      if (l.qty != null) out.push({ id: `qty${k}`, cond: { kind: 'qty', min: l.qty, max: null }, on: sel, dir: 'min', line: k });
      if (l.price != null) out.push({ id: `price${k}`, cond: { kind: 'price', min: l.price, max: null }, on: false, dir: 'min', line: k });
      if (l.amount != null) out.push({ id: `lamt${k}`, cond: { kind: 'lineAmount', min: l.amount, max: null }, on: false, dir: 'min', line: k });
    });
    return out;
  });
  useEffect(() => { codeInput.current?.focus(); codeInput.current?.select(); }, []);

  const update = (id: string, f: (c: Chip) => Chip) => setChips((cs) => cs.map((c) => (c.id === id ? f(c) : c)));
  const toggle = (id: string) => update(id, (c) => ({ ...c, on: !c.on }));
  const setThreshold = (id: string, text: string) => update(id, (c) => { const n = parseTrNumber(text); const v = n === null || Number.isNaN(n) ? null : n; return { ...c, text, cond: c.dir === 'max' ? { ...c.cond, min: null, max: v } : { ...c.cond, min: v, max: null } }; });
  const flipDir = (id: string) => update(id, (c) => { const v = c.dir === 'max' ? c.cond.max ?? null : c.cond.min ?? null; const dir = c.dir === 'max' ? 'min' : 'max'; return { ...c, dir, cond: dir === 'max' ? { ...c.cond, min: null, max: v } : { ...c.cond, min: v, max: null } }; });

  const conds = chips.filter((c) => c.on).map((c) => c.cond);
  const invs = S.invoices.value;
  const candidate: Rule = { id: '__quick', firmId: '', batchId: scope === 'batch' ? batch?.id ?? null : null, conds, code: code || '?', enabled: true, createdAt: 0, updatedAt: Number.MAX_SAFE_INTEGER };
  const valid = conds.length > 0 && validateRule(conds, code || 'x') === null;
  const matched = useMemo(() => (valid ? invs.filter((i) => ruleMatches(candidate, i)) : []), [chips, invs, scope]);
  const outranked = matched.filter((i) => S.batchRules.value.some((o) => o.enabled && ruleMatches(o, i) && beats(o, candidate) && o.code !== candidate.code)).length;

  const save = async () => {
    const e = await S.addRule(conds, code, scope);
    setErr(e);
    if (!e) close();
  };
  const advanced = () => { const draft = { conds: conds.length ? conds : [{ kind: 'vkn' as CondKind, text: inv.supplierVkn }], code, scope }; close(); S.openRules(draft); };

  const chip = (c: Chip) => {
    const stop = (e: KeyboardEvent) => e.stopPropagation();
    const k = c.cond.kind;
    const unit = k === 'qty' ? unitLabel(inv.lines[c.line ?? 0]?.unit ?? '') : k === 'amount' || k === 'price' || k === 'lineAmount' ? '₺' : '';
    const thr = c.dir === 'max' ? c.cond.max : c.cond.min;
    return (
      <label class={`qchip ${c.on ? 'on' : ''} k-${k}`} key={c.id} title={c.on ? condLabel(c.cond) : `${COND_SHORT[k]}: işaretlemek için tıklayın`}>
        <input type="checkbox" checked={c.on} onChange={() => toggle(c.id)} />
        <span class="qchip-kind">{COND_SHORT[k]}</span>
        {k === 'item' && (c.on ? <input class="qchip-text" value={c.cond.text ?? ''} onKeyDown={stop} onInput={(e) => update(c.id, (x) => ({ ...x, cond: { ...x.cond, text: (e.currentTarget as HTMLInputElement).value } }))} title="Kalem adında aranacak kelime (düzeltebilirsiniz)" /> : <span class="qchip-val">"{c.cond.text}"</span>)}
        {(k === 'vkn' || k === 'name') && <span class="qchip-val">{c.cond.text}</span>}
        {k === 'type' && <span class="qchip-val">{TYPE_LABELS[(c.cond.text ?? '').toUpperCase()] ?? c.cond.text}</span>}
        {k === 'vat' && <span class="qchip-val">%{c.cond.text}</span>}
        {k === 'date' && <span class="qchip-val">{fmtDateTr(c.cond.from ?? '')}</span>}
        {isRange(k) && (
          c.on ? (
            <>
              <button class="qchip-dir" title="Yönü değiştir: en az (≥) / en çok (≤)" onClick={(e) => { e.preventDefault(); flipDir(c.id); }}>{c.dir === 'max' ? '≤' : '≥'}</button>
              <input class="qchip-num" inputMode="decimal" value={c.text ?? (thr == null ? '' : fmtN(thr))} onKeyDown={stop} onInput={(e) => setThreshold(c.id, (e.currentTarget as HTMLInputElement).value)} title="Eşik (düzeltebilirsiniz; virgül ondalık, nokta binlik: 3.000 = üç bin, 0,5 = yarım)" />
              <span class="qchip-unit">{unit}</span>
            </>
          ) : <span class="qchip-val">≥ {thr == null ? '?' : fmtN(thr)} {unit}</span>
        )}
      </label>
    );
  };
  const head = chips.filter((c) => c.line === undefined && (c.cond.kind === 'vkn' || c.cond.kind === 'name'));
  const facts = chips.filter((c) => c.line === undefined && c.cond.kind !== 'vkn' && c.cond.kind !== 'name');
  const lineIdx = Array.from(new Set(chips.filter((c) => c.line !== undefined).map((c) => c.line!)));
  const [allLines, setAllLines] = useState(false);
  const shownLines = allLines || lineIdx.length <= 6 ? lineIdx : lineIdx.filter((k) => k < 5 || k === origin.lineIndex);

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal quick-rule" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }}>
        <div class="modal-head">
          <b>⚡ Bu faturadan kural</b>
          <span class="muted">{inv.supplierName} · {inv.no}</span>
          <div class="spacer" />
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          <div class="row-inline" style="justify-content:flex-start; gap:12px; flex-wrap:wrap">
            <div class="scope-seg" role="radiogroup" aria-label="Kural kapsamı">
              <button class={scope === 'firm' ? 'on' : ''} onClick={() => setScope('firm')} title="Firmanın bütün dönemlerinde geçerli">Kalıcı · {S.firm.value.name}</button>
              <button class={scope === 'batch' ? 'on' : ''} disabled={!batch} onClick={() => setScope('batch')} title="Yalnızca açık dönemde geçerli">Yalnızca bu dönem · {batch?.name ?? '—'}</button>
            </div>
            <span class="muted small">İşaretlediğiniz bilgilerin <b>hepsi</b> tutan faturalar bu kodu alır. Sayıları ve kelimeleri düzeltebilirsiniz (örn. 3.000 → 1.000). Tek rozet de yeter.</span>
          </div>
          <div class="qgroup"><span class="qgroup-label">Satıcı</span><div class="qchips">{head.map(chip)}</div></div>
          <div class="qgroup"><span class="qgroup-label">Fatura</span><div class="qchips">{facts.map(chip)}</div></div>
          {shownLines.map((k) => (
            <div class="qgroup qline" key={k}>
              <span class="qgroup-label" title={inv.lines[k].label ?? inv.lines[k].name}>{k === 0 ? 'Kalem' : ''}<span class="qline-name">{inv.lines[k].label ?? inv.lines[k].name}</span></span>
              <div class="qchips">{chips.filter((c) => c.line === k).map(chip)}</div>
            </div>
          ))}
          {lineIdx.length > shownLines.length && <button class="ghost tiny" onClick={() => setAllLines(true)}>+ {lineIdx.length - shownLines.length} kalem daha</button>}
          <div class="qsummary muted small">
            {conds.length === 0 ? 'Henüz rozet işaretlenmedi.' : <>Kural: <b>{conds.map(condLabel).join(' + ')}</b>{batch && valid && <> · bu dönemde uyan <b>{matched.length}</b> fatura{outranked > 0 && <span class="pv-warn"> · {outranked} tanesinde başka kural önde</span>}</>}</>}
          </div>
          <div class="rule-then">
            <span class="then-label">o zaman hesap kodu</span>
            <input ref={codeInput} class="rule-code" placeholder="hesap kodu, örn. 153" value={code} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
            <button class="primary quick-save" disabled={!code.trim() || conds.length === 0} onClick={save}>{scope === 'batch' ? 'Bu döneme kaydet' : 'Kaydet ve uygula'}</button>
            <button class="ghost quick-advanced" title="Aralık, düzenleme ve kural listesi için büyük pencere" onClick={advanced}>Gelişmiş…</button>
          </div>
          {err && <div class="issue">{err}</div>}
        </div>
      </div>
    </div>
  );
}
