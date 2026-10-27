import { useEffect, useRef } from 'preact/hooks';
import * as S from './state';
import { completeCode } from '../core/suggest/engine';

function SlotButton({ i }: { i: number }) {
  const sc = S.firm.value.shortcuts[i];
  const code = S.slots.value[i];
  const ghost = S.ghost.value;
  const inv = S.current.value;
  const cur = inv ? S.assignments.value.get(inv.no) : undefined;
  const editing = S.editingSlot.value === i;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      const el = input.current;
      el?.focus();
      el?.select();
    }
  }, [editing]);

  const startEdit = (e: Event) => {
    e.stopPropagation();
    S.startSlotEdit(i, code ?? '');
  };

  if (editing) {
    return (
      <div class={`slot slot-${i} editing`}>
        <kbd>{sc.key.toUpperCase()}</kbd>
        <input
          ref={input}
          class="slot-input"
          value={S.editingText.value}
          placeholder="kod (boş = yuvayı temizle)"
          onInput={(e) => (S.editingText.value = (e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); S.commitSlotEdit(); }
            else if (e.key === 'Escape') { e.preventDefault(); S.cancelSlotEdit(); }
          }}
        />
        <button class="slot-icon" title="Kaydet (Enter)" onMouseDown={(e) => { e.preventDefault(); S.commitSlotEdit(); }}>✓</button>
        <button class="slot-icon" title="Vazgeç (Esc)" onMouseDown={(e) => { e.preventDefault(); S.cancelSlotEdit(); }}>✕</button>
      </div>
    );
  }

  if (code) {
    return (
      <button class={`slot slot-${i} ${code === cur ? 'active' : ''}`} disabled={!inv} onClick={() => S.assign(code)} title={`${sc.key.toUpperCase()}: ${code} ata`}>
        <kbd>{sc.key.toUpperCase()}</kbd>
        <span class="slot-code">{code}</span>
        <span class="slot-icon edit" role="button" title="Bu yuvanın kodunu değiştir" onClick={startEdit}>✎</span>
      </button>
    );
  }

  return (
    <div class={`slot slot-${i} empty ${ghost ? 'has-ghost' : ''}`}>
      <kbd>{sc.key.toUpperCase()}</kbd>
      {ghost ? (
        <>
          <span class="slot-code ghost" title={`${ghost.code} ${ghost.count} kez kullanıldı. Kaydederseniz ${sc.key.toUpperCase()} tuşuna bağlanır.`} onClick={() => S.pinSlot(i, ghost.code)}>{ghost.code}</span>
          <button class="slot-icon save" title={`${ghost.code} kodunu ${sc.key.toUpperCase()} tuşuna kaydet`} onClick={() => S.pinSlot(i, ghost.code)}>💾</button>
        </>
      ) : (
        <span class="slot-code ghost muted">—</span>
      )}
      <span class="slot-icon edit" role="button" title="Bu yuvaya kod yaz" onClick={startEdit}>✎</span>
    </div>
  );
}

/** Seçili faturanın atama durumu: yuva rengiyle dolu kart (atandı) ya da kesikli boş kart (atanmadı). */
function AssignStatus() {
  const inv = S.current.value;
  if (!inv) return <div class="status none" />;
  const code = S.assignments.value.get(inv.no);
  if (!code) {
    return (
      <div class="status empty" title="Bu faturaya henüz hesap kodu verilmedi">
        <span class="status-label">Bu fatura</span>
        <b class="status-code">Atanmadı</b>
        <span class="status-sub">Q–D kısayol · / elle yaz</span>
      </div>
    );
  }
  const si = S.slotIndexOf(code);
  const src = S.bulkNos.value.has(inv.no) ? 'toplu' : S.ruleNos.value.has(inv.no) ? 'kuralla' : 'elle';
  const name = S.accountMap.value.get(code);
  return (
    <div class={`status done slot-${si}`} title={`${inv.no} → ${code} (${src}). Backspace: kaldır`}>
      <span class="status-label">Atandı · {src}</span>
      <b class="status-code">{code}</b>
      <span class="status-sub">{name ?? (si >= 0 ? `${S.firm.value.shortcuts[si]?.key.toUpperCase()} kısayolu` : '\u00a0')}</span>
    </div>
  );
}

/** Parti ilerlemesi: atanmamış varken sessiz (zemin rengi), hepsi atanınca renklenir ve sıradaki adımı gösterir. */
function ProgressCard() {
  const total = S.invoices.value.length;
  if (total === 0) return null;
  const done = S.assignedCount.value;
  const left = total - done;
  if (left === 0) {
    return (
      <div class="status progress-card complete" title="Bu partideki tüm faturalar hesap kodu aldı">
        <span class="status-label">Tamamlandı</span>
        <b class="status-code">{done}/{total}</b>
        <span class="status-sub"><kbd>F1</kbd> Excel üret</span>
      </div>
    );
  }
  return (
    <div class="status progress-card" title={`${done} atandı, ${left} fatura kod bekliyor`}>
      <span class="status-label">Kalan</span>
      <b class="status-code">{left}</b>
      <span class="status-sub">{done}/{total} atandı · <kbd>Tab</kbd> sıradakine</span>
    </div>
  );
}

export function ShortcutBar() {
  const keys = S.firm.value.shortcuts;
  const manual = S.mode.value === 'manual';
  const input = useRef<HTMLInputElement>(null);
  const inv = S.current.value;

  useEffect(() => {
    if (manual) {
      input.current?.focus();
      const el = input.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [manual]);

  const sugg = manual ? completeCode(S.manualText.value, S.knownCodes.value, 6) : [];

  return (
    <footer class={`bar ${manual ? 'manual' : ''}`}>
      <div class="slots">
        {keys.map((_, i) => <SlotButton i={i} />)}
      </div>
      <div class="bar-mid">
        <AssignStatus />
        <ProgressCard />
      </div>
      <div class="manual-box">
        {manual ? (
          <>
            <input
              ref={input}
              class="manual-input"
              placeholder="Hesap kodu yazın, Enter ile atayın"
              value={S.manualText.value}
              onInput={(e) => (S.manualText.value = (e.currentTarget as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = S.manualText.value.trim() || sugg[0] || '';
                  if (v) S.assign(v);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  S.exitManual();
                } else if (e.key === 'Tab' && sugg[0]) {
                  e.preventDefault();
                  S.manualText.value = sugg[0];
                }
                e.stopPropagation();
              }}
            />
            <div class="sugg">
              {sugg.map((c) => (
                <button class="ghost tiny" onMouseDown={(e) => { e.preventDefault(); S.assign(c); }}>{c}</button>
              ))}
              <span class="muted">Esc: vazgeç · Tab: ilk öneri · Ctrl+.: listede ara</span>
            </div>
          </>
        ) : (
          <button class="ghost" onClick={() => S.enterManual()} disabled={!inv}>
            Manuel kod gir <kbd>/</kbd> <kbd>Enter</kbd> <kbd>0–9</kbd>
          </button>
        )}
      </div>
    </footer>
  );
}
