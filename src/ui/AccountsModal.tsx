import { useRef, useState } from 'preact/hooks';
import { parseAccountSheet, parseAccountText } from '../core/chart';
import * as S from './state';
import { askConfirm } from './dialog';

/** Firmanın hesap kodu listesi (kod + isim): yükleme, hızlı ekleme, düzenleme. Ctrl+. araması bu listeyi kullanır. */
export function AccountsModal() {
  const accFile = useRef<HTMLInputElement>(null);
  const [accText, setAccText] = useState('');
  const [accFilter, setAccFilter] = useState('');
  const accList = S.accounts.value.filter((a) => !accFilter || a.code.includes(accFilter) || a.name.toLocaleLowerCase('tr').includes(accFilter.toLocaleLowerCase('tr')));
  const close = () => (S.accountsOpen.value = false);
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }}>
        <div class="modal-head">
          <b>Hesap kodu listesi</b>
          <span class="muted">{S.firm.value.name} · {S.accounts.value.length} kod</span>
          <div class="spacer" />
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          <div class="muted small">Kod + isim listesi. <kbd>Ctrl+.</kbd> ile kod ya da isimle aranıp atanır; listede olmayan kodlar panelde ve önizlemede uyarılır. Liste firmaya bağlıdır ve yedeğe girer.</div>
          <label>
            <span>Liste adı</span>
            <input value={S.firm.value.chartName} onInput={(e) => S.updateFirm({ chartName: (e.currentTarget as HTMLInputElement).value })} placeholder="Hesap kodu listem" onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <div class="row-inline" style="justify-content:flex-start; flex-wrap:wrap">
            <button onClick={() => accFile.current?.click()}>Excel / CSV'den yükle</button>
            <input ref={accFile} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={async (e) => {
              const f = (e.currentTarget as HTMLInputElement).files?.[0];
              (e.currentTarget as HTMLInputElement).value = '';
              if (!f) return;
              try {
                const items = /\.(csv|txt)$/i.test(f.name) ? parseAccountText(await f.text()) : await parseAccountSheet(await f.arrayBuffer());
                const n = await S.upsertAccounts(items);
                S.showToast(`${n} hesap kodu yüklendi`);
              } catch (err) { S.showToast((err as Error).message, 5000); }
            }} />
            <span class="muted small">İlk sütun kod, ikinci sütun isim. Mevcut kodlar güncellenir, diğerleri korunur.</span>
          </div>
          <label>
            <span>Hızlı ekleme: her satıra "kod isim" (örn. 770.01 Kırtasiye giderleri)</span>
            <textarea class="acc-text" rows={3} value={accText} onInput={(e) => setAccText((e.currentTarget as HTMLTextAreaElement).value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
          <div class="row-inline" style="justify-content:flex-start">
            <button class="primary" disabled={!accText.trim()} onClick={async () => { const n = await S.upsertAccounts(parseAccountText(accText)); setAccText(''); S.showToast(`${n} kod eklendi/güncellendi`); }}>Listeye ekle</button>
            {S.accounts.value.length > 0 && <button class="danger" onClick={async () => { if (await askConfirm({ title: 'Listeyi temizle', message: 'Hesap kodu listesinin tamamı silinecek. Atamalar etkilenmez.', okLabel: 'Temizle', danger: true })) S.clearAccounts(); }}>Listeyi temizle</button>}
          </div>
          {S.accounts.value.length > 0 && (
            <>
              <input placeholder={`Listede ara (${S.accounts.value.length} kod)`} value={accFilter} onInput={(e) => setAccFilter((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.stopPropagation()} />
              <div class="acc-list">
                {accList.slice(0, 300).map((a) => (
                  <div class="acc-row">
                    <b class="chart-code">{a.code}</b>
                    <input class="acc-name" value={a.name} placeholder="isim" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => S.upsertAccounts([{ code: a.code, name: (e.currentTarget as HTMLInputElement).value }])} />
                    <button class="ghost tiny" title="Listeden çıkar" onClick={() => S.removeAccount(a.code)}>✕</button>
                  </div>
                ))}
                {accList.length > 300 && <div class="muted small">… {accList.length - 300} kod daha (aramayla daraltın)</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
