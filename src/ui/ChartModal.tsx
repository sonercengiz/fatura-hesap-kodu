import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';

/** Ctrl+. ile açılan hesap kodu arama penceresi: kod ya da isimle arar, Enter ile atar. */
export function ChartModal() {
  const input = useRef<HTMLInputElement>(null);
  const results = S.chartResults.value;
  const idx = Math.min(S.chartIndex.value, Math.max(results.length - 1, 0));
  const q = S.chartQuery.value.trim();
  const inList = results.some((a) => a.code === q);
  const n = S.selected.value.size;
  const [addName, setAddName] = useState('');
  const adding = S.chartAdding.value;
  const setAdding = (v: boolean) => (S.chartAdding.value = v);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (adding) nameInput.current?.focus(); }, [adding]);
  useEffect(() => {
    document.querySelector<HTMLElement>('.chart-row.active')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); S.chartIndex.value = Math.min(idx + 1, results.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); S.chartIndex.value = Math.max(idx - 1, 0); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (adding) return;
      const pick = results[idx]?.code ?? (q || null);
      if (pick) S.pickFromChart(pick);
    } else if (e.key === 'Escape') { e.preventDefault(); S.closeChart(); }
    else if (e.key === 'Tab' && results[idx]) { e.preventDefault(); S.chartQuery.value = results[idx].code; }
  };

  return (
    <div class="modal-backdrop chart-backdrop" onClick={() => S.closeChart()}>
      <div class="chart-pop" onClick={(e) => e.stopPropagation()}>
        <div class="chart-head">
          <b>{S.firm.value.chartName || 'Hesap kodu listesi'}</b>
          <span class="muted">{S.accounts.value.length} kod{n > 0 ? ` · ${n} seçili faturaya toplu atanacak` : ''}</span>
          <div class="spacer" />
          <span class="muted small">↑↓ seç · Enter ata · Tab kodu al · Esc kapat</span>
        </div>
        <input
          ref={input}
          class="chart-input"
          placeholder="Kod ya da isim yazın: 770, kırtasiye, kargo…"
          value={S.chartQuery.value}
          onInput={(e) => { S.chartQuery.value = (e.currentTarget as HTMLInputElement).value; S.chartIndex.value = 0; }}
          onKeyDown={onKey}
        />
        <div class="chart-list">
          {results.map((a, i) => (
            <div class={`chart-row ${i === idx ? 'active' : ''}`} onMouseEnter={() => (S.chartIndex.value = i)} onClick={() => S.pickFromChart(a.code)}>
              <b class="chart-code">{a.code}</b>
              <span class="chart-name">{a.name || <span class="muted">(isim yok)</span>}</span>
              {S.slotIndexOf(a.code) >= 0 && <kbd>{S.firm.value.shortcuts[S.slotIndexOf(a.code)].key.toUpperCase()}</kbd>}
            </div>
          ))}
          {results.length === 0 && S.accounts.value.length === 0 && (
            <div class="chart-empty">Liste boş. Ayarlar → Hesap kodu listesi'nden ekleyin ya da aşağıdan şimdi kaydedin.</div>
          )}
          {results.length === 0 && S.accounts.value.length > 0 && q && <div class="chart-empty">"{q}" listede yok.</div>}
        </div>
        {q && /\d/.test(q) && !inList && (
          <div class="chart-add">
            {adding ? (
              <>
                <b class="chart-code">{q}</b>
                <input ref={nameInput} class="chart-add-name" placeholder="İsim (isteğe bağlı)" value={addName} onInput={(e) => setAddName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); S.upsertAccounts([{ code: q, name: addName }]).then(() => { setAdding(false); setAddName(''); S.showToast(`${q} listeye eklendi`); }); } else if (e.key === 'Escape') { e.preventDefault(); setAdding(false); input.current?.focus(); } }} />
                <button class="tiny primary" onClick={() => S.upsertAccounts([{ code: q, name: addName }]).then(() => { setAdding(false); setAddName(''); S.showToast(`${q} listeye eklendi`); })}>Kaydet</button>
              </>
            ) : (
              <>
                <span class="muted small">Enter: <b>{q}</b> kodunu listeye eklemeden ata</span>
                <button class="tiny" onClick={() => setAdding(true)}>+ Listeye ekle</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
