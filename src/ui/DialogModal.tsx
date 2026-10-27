import { useEffect, useRef, useState } from 'preact/hooks';
import { dialog, closeDialog } from './dialog';

export function DialogModal() {
  const d = dialog.value;
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(d?.kind === 'name' ? d.initial ?? '' : '');
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  if (!d) return null;
  const ok = () => {
    if (d.kind === 'name') { const v = value.trim(); if (!v && !d.allowEmpty) return; closeDialog(v); }
    else closeDialog(true);
  };
  return (
    <div class="modal-backdrop dialog-backdrop" onClick={() => closeDialog(null)}>
      <div class="modal dialog" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeDialog(null); } else if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); ok(); } e.stopPropagation(); }}>
        <div class="modal-head"><b>{d.title}</b></div>
        <div class="form">
          {d.kind === 'name' ? (
            <label>
              {d.label && <span>{d.label}</span>}
              <input ref={input} value={value} placeholder={d.placeholder} onInput={(e) => setValue((e.currentTarget as HTMLInputElement).value)} />
              {d.hint && <span class="muted small">{d.hint}</span>}
            </label>
          ) : (
            <div class="dialog-msg">{d.message}</div>
          )}
          <div class="row-inline" style="justify-content:flex-end; gap:8px">
            <button class="ghost" onClick={() => closeDialog(null)}>Vazgeç <kbd>Esc</kbd></button>
            <button ref={d.kind === 'confirm' ? (el) => el?.focus() : undefined} class={d.kind === 'confirm' && d.danger ? 'danger' : 'primary'} disabled={d.kind === 'name' && !value.trim() && !d.allowEmpty} onClick={ok}>{d.okLabel ?? (d.kind === 'name' ? 'Tamam' : 'Evet')} <kbd>Enter</kbd></button>
          </div>
        </div>
      </div>
    </div>
  );
}
