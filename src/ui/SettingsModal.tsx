import { useRef, useState } from 'preact/hooks';
import { parseAccountSheet, parseAccountText } from '../core/chart';
import * as S from './state';
import type { ViewMode } from '../core/types';
import { EDM_HEADERS } from '../core/excel/writeOutput';

export function SettingsModal() {
  const s = S.settings.value;
  const imp = useRef<HTMLInputElement>(null);
  const accFile = useRef<HTMLInputElement>(null);
  const [accText, setAccText] = useState('');
  const [accFilter, setAccFilter] = useState('');
  const accList = S.accounts.value.filter((a) => !accFilter || a.code.includes(accFilter) || a.name.toLocaleLowerCase('tr').includes(accFilter.toLocaleLowerCase('tr')));
  const width = EDM_HEADERS.length;
  return (
    <div class="modal-backdrop" onClick={() => (S.settingsOpen.value = false)}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <b>Ayarlar</b>
          <div class="spacer" />
          <button class="ghost" onClick={() => (S.settingsOpen.value = false)}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="form">
          <fieldset>
            <legend>Firma: {S.firm.value.name}</legend>
            <div class="muted small">Kısayollar, hesap kodu listesi, öneri geçmişi ve partiler firmaya bağlıdır. Üst çubuktaki firma menüsünden geçiş yapılır ve yeni firma eklenir.</div>
            <label style="margin-top:8px">
              <span>Firma adı (çıktı dosya adında kullanılır)</span>
              <input value={S.firm.value.name} onInput={(e) => S.updateFirm({ name: (e.currentTarget as HTMLInputElement).value })} placeholder="ABC LTD" />
            </label>
            <div class="row-inline" style="margin-top:8px">
              <span class="muted small">{S.firms.value.length} firma kayıtlı.</span>
              <span>
                <button onClick={() => { const n = prompt('Yeni firma adı:'); if (n) S.createFirm(n); }}>+ Yeni firma</button>{' '}
                {S.firms.value.length > 1 && <button class="danger" onClick={() => { const f = S.firm.value; if (confirm(`"${f.name}" firması, tüm partileri, faturaları, atamaları, hesap listesi ve geçmişiyle silinsin mi? Bu işlem geri alınamaz.`)) { S.deleteFirm(f.id); S.settingsOpen.value = false; } }}>Firmayı sil</button>}
              </span>
            </div>
          </fieldset>
          <div class="two">
            <label>
              <span>Hesap Kodu sütunu (1 = en başa)</span>
              <input type="number" min={1} max={width + 1} value={s.codeColumnIndex} onInput={(e) => {
                const v = Number((e.currentTarget as HTMLInputElement).value);
                if (v >= 1) S.updateSettings({ codeColumnIndex: Math.min(v, width + 1) });
              }} />
            </label>
            <label>
              <span>Sütun başlığı</span>
              <input value={s.codeHeader} onInput={(e) => S.updateSettings({ codeHeader: (e.currentTarget as HTMLInputElement).value || 'Hesap Kodu' })} />
            </label>
          </div>
          <div class="muted small">Çıktı, EDM fatura listesi düzenindedir (20 sütun); Hesap Kodu araya eklenir, diğer sütunlar sağa kayar. Varsayılan 3 (C sütunu).</div>

          <fieldset>
            <legend>Kısayollar — {S.firm.value.name} (yalnızca kaydedilen kodlar; kendiliğinden değişmez)</legend>
            <div class="shortcut-grid">
              {S.firm.value.shortcuts.map((sc, i) => (
                <label class={`slot-${i}`}>
                  <kbd>{sc.key.toUpperCase()}</kbd>
                  <input value={sc.code ?? ''} placeholder="boş" onInput={(e) => {
                    const v = (e.currentTarget as HTMLInputElement).value.trim();
                    const shortcuts = S.firm.value.shortcuts.map((x, k) => (k === i ? { ...x, code: v || null } : x));
                    S.updateFirm({ shortcuts });
                  }} />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Fatura görünümü: yeni faturaya geçince</legend>
            {([['top', 'En üstten başlasın'], ['last', 'Son kaldığım yerden başlasın'], ['margin', 'Belirli bir yükseklikten başlasın']] as [ViewMode, string][]).map(([v, label]) => (
              <label class="radio">
                <input type="radio" name="viewMode" checked={s.viewMode === v} onChange={() => S.updateSettings({ viewMode: v })} />
                <span>{label}</span>
                {v === 'margin' && (
                  <input type="number" class="inline" min={0} step={10} value={s.marginPx} disabled={s.viewMode !== 'margin'} onInput={(e) => S.updateSettings({ marginPx: Number((e.currentTarget as HTMLInputElement).value) || 0 })} />
                )}
                {v === 'margin' && <span class="muted">px</span>}
              </label>
            ))}
          </fieldset>

          <label class="radio">
            <input type="checkbox" checked={s.theme === 'dark'} onChange={(e) => S.updateSettings({ theme: (e.currentTarget as HTMLInputElement).checked ? 'dark' : 'light' })} />
            <span>Koyu tema</span>
          </label>

          <fieldset>
            <legend>Hesap kodu listesi — {S.firm.value.name} (Ctrl+. ile aranır; listede olmayan kodlar uyarılır)</legend>
            <label>
              <span>Liste adı</span>
              <input value={S.firm.value.chartName} onInput={(e) => S.updateFirm({ chartName: (e.currentTarget as HTMLInputElement).value })} placeholder="Hesap kodu listem" />
            </label>
            <div class="row-inline" style="justify-content:flex-start; flex-wrap:wrap">
              <button onClick={() => accFile.current?.click()}>Excel / CSV'den yükle</button>
              <input ref={accFile} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={async (e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                (e.currentTarget as HTMLInputElement).value = '';
                if (!f) return;
                try {
                  const items = /\.(csv|txt)$/i.test(f.name) ? parseAccountText(await f.text()) : parseAccountSheet(await f.arrayBuffer());
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
              {S.accounts.value.length > 0 && <button class="danger" onClick={() => { if (confirm('Hesap kodu listesinin tamamı silinsin mi? Atamalar etkilenmez.')) S.clearAccounts(); }}>Listeyi temizle</button>}
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
          </fieldset>

          <fieldset>
            <legend>Yedekleme ve bilgisayarlar arası paylaşım</legend>
            <div class="row-inline">
              <span class="muted">Tüm firmalar, partiler, fatura listeleri, atamalar, hesap kodu listeleri ve öneri geçmişi tek bir .json dosyasına yazılır; başka bilgisayarda içe aktarılınca mevcut veriyle <b>birleştirilir</b>, hiçbir şey silinmez. Fatura XML'leri (görseller) dosyaya dahil edilmez; gerekirse XML'ler yeniden yüklenir, atamalar korunur.</span>
            </div>
            <div class="row-inline" style="justify-content:flex-start; margin-top:8px">
              <button onClick={() => S.exportWorkspace()}>Dışa aktar (.json)</button>
              <button onClick={() => imp.current?.click()}>İçe aktar</button>
              <input ref={imp} type="file" accept=".json,application/json" hidden onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) S.importWorkspace(f);
                (e.currentTarget as HTMLInputElement).value = '';
              }} />
            </div>
          </fieldset>

          {S.batchRec.value && (
            <fieldset>
              <legend>Parti</legend>
              <label>
                <span>Parti adı{S.batchRec.value.autoName ? ' (yüklenen faturaların ayına göre kendiliğinden verildi)' : ''}</span>
                <input value={S.batchRec.value.name} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => S.renameBatch((e.currentTarget as HTMLInputElement).value)} />
              </label>
              <div class="row-inline" style="margin-top:8px">
                <span class="muted">{S.invoices.value.length} fatura. Partiyi, faturalarını ve atamalarını kalıcı olarak sil.</span>
                <button class="danger" onClick={() => {
                  const b = S.batchRec.value;
                  if (b && confirm(`"${b.name}" partisi, faturaları ve atamaları silinsin mi?`)) {
                    S.deleteBatch(b.id);
                    S.settingsOpen.value = false;
                  }
                }}>Partiyi sil</button>
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend>Klavye</legend>
            <div class="keys">
              <div><kbd>←</kbd><kbd>→</kbd> önceki / sonraki fatura</div>
              <div><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> kısayolla ata, sonrakine geç</div>
              <div><kbd>/</kbd> <kbd>Enter</kbd> <kbd>0–9</kbd> manuel kod girişi · <kbd>Esc</kbd> vazgeç</div>
              <div><kbd>Backspace</kbd> atamayı kaldır · <kbd>Ctrl+F</kbd> ara</div>
              <div><kbd>Ctrl+.</kbd> hesap kodu listesinde ara ve ata · <kbd>Ctrl+Z</kbd> geri al · <kbd>Ctrl+Y</kbd> yinele</div>
              <div><kbd>F2</kbd> kaydet · <kbd>F5</kbd> önizle · <kbd>F1</kbd> Excel üret · <kbd>Ctrl+P</kbd> faturayı yazdır</div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
