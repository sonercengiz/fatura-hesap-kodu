import { useRef } from 'preact/hooks';
import * as S from './state';

export function Toolbar() {
  const xml = useRef<HTMLInputElement>(null);
  const dir = useRef<HTMLInputElement>(null);
  const b = S.batchRec.value;
  const n = S.invoices.value.length;
  const issues = S.invoices.value.filter((i) => S.attentionIssues(i).length > 0).length;

  return (
    <header class="toolbar">
      <div class="brand">Fatura Hesap Kodu</div>
      <select
        class="firm-select"
        value={S.firm.value.id}
        title="Firma (kısayollar, hesap listesi ve öneriler firmaya bağlıdır)"
        onChange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          if (v === '__new') {
            (e.currentTarget as HTMLSelectElement).value = S.firm.value.id;
            const name = prompt('Yeni firma adı:');
            if (name) S.createFirm(name);
          } else S.switchFirm(v);
        }}
      >
        {S.firms.value.map((f) => <option value={f.id}>{f.name}</option>)}
        <option value="__new">+ Yeni firma…</option>
      </select>
      <select
        class="batch-select"
        value={b?.id ?? ''}
        onChange={(e) => {
          const id = (e.currentTarget as HTMLSelectElement).value;
          if (id === '__new') {
            (e.currentTarget as HTMLSelectElement).value = b?.id ?? '';
            const name = prompt('Yeni parti adı (boş bırakılırsa yüklenen faturaların ayına göre adlanır):', '');
            if (name !== null) S.createBatch(name);
          } else if (id) S.openBatch(id);
        }}
        title="Parti (bir dönemin faturaları; XML'ler sonradan da eklenebilir)"
      >
        {!b && <option value="">Parti seçin</option>}
        {S.batchList.value.map((x) => (
          <option value={x.id}>
            {x.name} · {new Date(x.createdAt).toLocaleDateString('tr-TR')}
          </option>
        ))}
        <option value="__new">+ Yeni parti…</option>
      </select>
      <button class={b ? '' : 'primary'} onClick={() => xml.current?.click()} title={b ? 'Açık partiye e-Fatura XML dosyaları ekle' : 'e-Fatura XML dosyalarını yükle (yeni parti açılır)'}>XML yükle</button>
      <button onClick={() => dir.current?.click()} title="Bir klasördeki tüm XML'leri yükle">Klasör yükle</button>
      <div class="spacer" />
      {b && (
        <div class="progress" title="Atanan / toplam">
          <b>{S.assignedCount.value}</b>/{n} atandı
          {issues > 0 && <span class="warn"> · dikkat: {issues}</span>}
          {S.dirty.value ? <span class="dirty"> · kaydedilmedi</span> : b.savedAt ? <span class="saved"> · kayıtlı</span> : null}
        </div>
      )}
      <button class="ghost" onClick={() => S.undo()} disabled={!S.undoStack.value.length} title={S.undoStack.value.length ? `Geri al: ${S.undoStack.value[S.undoStack.value.length - 1].label} (Ctrl+Z)` : 'Geri alınacak işlem yok'}>↶</button>
      <button onClick={() => S.save()} disabled={!b} title="F2">Kaydet <kbd>F2</kbd></button>
      <button onClick={() => (S.previewOpen.value = true)} disabled={!b} title="F5">Önizle <kbd>F5</kbd></button>
      <button class="primary" onClick={() => S.exportExcel()} disabled={!b || n === 0} title="F1">Excel üret <kbd>F1</kbd></button>
      <button class="ghost" onClick={() => S.openRules()} title="Otomatik atama kuralları (satıcı → hesap kodu)">Kurallar{S.rules.value.length ? ` ${S.rules.value.length}` : ''}</button>
      <button class="ghost" onClick={() => (S.guideOpen.value = true)} title="Kullanım rehberi">Rehber</button>
      <button class="ghost theme-btn" onClick={() => S.updateSettings({ theme: S.settings.value.theme === 'dark' ? 'light' : 'dark' })} title={S.settings.value.theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}>
        {S.settings.value.theme === 'dark' ? '☀' : '☾'}
      </button>
      <button class="ghost" onClick={() => (S.settingsOpen.value = true)} title="Ayarlar">⚙</button>
      <input ref={xml} type="file" accept=".xml,text/xml,application/xml" multiple hidden onChange={(e) => {
        const fl = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
        if (fl.length) S.importXml(fl);
        (e.currentTarget as HTMLInputElement).value = '';
      }} />
      <input ref={dir} type="file" hidden {...({ webkitdirectory: true } as Record<string, unknown>)} onChange={(e) => {
        const fl = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
        if (fl.length) S.importXml(fl);
        (e.currentTarget as HTMLInputElement).value = '';
      }} />
    </header>
  );
}
