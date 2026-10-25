import { useState } from 'preact/hooks';
import * as S from './state';

export function LinkModal() {
  const seg = S.linkTarget.value;
  const [q, setQ] = useState('');
  if (!seg) return null;
  const ql = q.trim().toLocaleLowerCase('tr');
  const cur = S.current.value;
  const list = S.invoices.value.filter((i) => !ql || i.no.toLocaleLowerCase('tr').includes(ql) || i.supplierName.toLocaleLowerCase('tr').includes(ql) || i.supplierVkn.includes(ql));
  return (
    <div class="modal-backdrop" onClick={() => (S.linkTarget.value = null)}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <b>PDF'i faturaya bağla</b>
          <span class="muted">{seg.fileName} · s.{seg.pageStart}{seg.pageEnd > seg.pageStart ? `–${seg.pageEnd}` : ''}</span>
          <div class="spacer" />
          <button class="ghost" onClick={() => (S.linkTarget.value = null)}>Vazgeç <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          {cur && (
            <button class="primary" onClick={() => S.linkSegment(seg, cur.no)}>
              Şu anki faturaya bağla: {cur.no} · {cur.supplierName}
            </button>
          )}
          <input autoFocus placeholder="Fatura no, satıcı veya VKN ile ara" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) S.linkSegment(seg, list[0].no); e.stopPropagation(); }} />
          <div class="list link-list">
            {list.slice(0, 200).map((i) => {
              const has = S.match.value.refs.has(i.no);
              return (
                <div class="row" onClick={() => S.linkSegment(seg, i.no)}>
                  <span class="row-main">
                    <span class="row-name">{i.supplierName}</span>
                    <span class="row-sub">{i.no} · {i.date} · {i.amount?.toLocaleString('tr-TR')} {i.currency}</span>
                  </span>
                  <span class="muted small">{has ? 'PDF var' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
