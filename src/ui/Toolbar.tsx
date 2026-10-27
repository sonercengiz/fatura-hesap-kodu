import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { askName } from './dialog';
import { overflowItems } from '../core/layout';

/**
 * Üst çubuk. Firma, dönem, Yükle, ilerleme, Excel üret ve ⚙ her zaman görünür; diğer düğmeler sığmadıkça yerinde kalır,
 * sığmayınca en az kullanılandan başlayarak ⋯ menüsüne taşınır (ölçüm ResizeObserver ile; medya sorgusu değil, çünkü
 * arayüz ölçeği (zoom) gerçek pencereyi değiştirmez).
 */
type ActId = 'layout' | 'undo' | 'preview' | 'print' | 'rules' | 'guide' | 'theme';

/** Menüye alınma sırası: önce gidecek önce */
const DROP_ORDER: ActId[] = ['theme', 'undo', 'guide', 'print', 'preview', 'layout', 'rules'];

export function Toolbar() {
  const xml = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLElement>(null);
  const b = S.batchRec.value;
  const n = S.invoices.value.length;
  const issues = S.invoices.value.filter((i) => S.attentionIssues(i).length > 0).length;
  const [hidden, setHidden] = useState<ActId[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Menü üst çubuğun dışında (sabit konum) çizilir: çubuk taşmayı kırptığı için içinde kalamaz; ölçek (zoom) için koordinatlar bölünür */
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const openMenu = (btn: HTMLElement) => {
    const r = btn.getBoundingClientRect(); const z = S.uiScale.value || 1;
    setMenuPos({ top: r.bottom / z + 6, right: (window.innerWidth - r.right) / z });
    setMenuOpen(true);
  };
  const [tick, setTick] = useState(0);
  const isList = S.settings.value.layout === 'list';
  const dark = S.settings.value.theme === 'dark';

  // Eylemler: etiket, ipucu, tuş, tıklama; sıra = çubuktaki sıra
  const acts: { id: ActId; label: string; title: string; kbd?: string; cls?: string; disabled?: boolean; on: () => void }[] = [
    { id: 'layout', label: isList ? '▣ Görsel' : '☰ Liste', title: isList ? 'Görsel görünüme geç (fatura görüntüsü + panel)' : 'Liste görünümüne geç (yalnızca tablo)', cls: `ghost layout-btn ${isList ? 'on' : ''}`, disabled: !b, on: () => S.setLayout(isList ? 'hybrid' : 'list') },
    { id: 'undo', label: '↶', title: S.undoStack.value.length ? `Geri al: ${S.undoStack.value[S.undoStack.value.length - 1].label} (Ctrl+Z)` : 'Geri alınacak işlem yok', kbd: 'Ctrl+Z', cls: 'ghost', disabled: !S.undoStack.value.length, on: () => S.undo() },
    { id: 'preview', label: 'Önizle', title: 'Çıktıyı önizle (F5)', kbd: 'F5', disabled: !b, on: () => (S.previewOpen.value = true) },
    { id: 'print', label: '🖨 Yazdır', title: 'Yazdırma planı: faturaları istediğiniz sırada yazdırın ya da PDF kaydedin (Ctrl+Shift+P)', kbd: 'Ctrl+Shift+P', cls: 'ghost', disabled: !b || n === 0, on: () => S.openPrint() },
    { id: 'rules', label: `Kurallar${S.batchRules.value.length ? ` ${S.batchRules.value.length}` : ''}`, title: 'Otomatik atama kuralları (satıcı → hesap kodu)', cls: 'ghost', on: () => S.openRules() },
    { id: 'guide', label: 'Rehber', title: 'Kullanım rehberi', cls: 'ghost', on: () => (S.guideOpen.value = true) },
    { id: 'theme', label: dark ? '☀' : '☾', title: dark ? 'Açık temaya geç' : 'Koyu temaya geç', cls: 'ghost theme-btn', on: () => S.updateSettings({ theme: dark ? 'light' : 'dark' }) },
  ];
  const menuLabel = (a: (typeof acts)[number]) => (a.id === 'undo' ? 'Geri al' : a.id === 'theme' ? (dark ? 'Açık tema' : 'Koyu tema') : a.id === 'print' ? 'Yazdır' : a.label);

  // Pencere ya da içerik değişince yeniden ölç
  useEffect(() => {
    const el = bar.current; if (!el) return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = bar.current; if (!el) return;
    const btns = Array.from(el.querySelectorAll<HTMLElement>('[data-act]'));
    const menu = el.querySelector<HTMLElement>('.tb-more');
    const brand = el.querySelector<HTMLElement>('.brand');
    const gap = parseFloat(getComputedStyle(el).gap) || 0;
    for (const x of btns) x.classList.remove('tb-hidden');
    if (menu) menu.classList.add('tb-hidden');
    // Önce marka yazısı gider (menüye girmez), sonra düğmeler
    if (brand) { brand.classList.remove('tb-hidden'); if (el.scrollWidth - el.clientWidth > 0) brand.classList.add('tb-hidden'); }
    const overflow = el.scrollWidth - el.clientWidth;
    let next: ActId[] = [];
    if (overflow > 0) {
      if (menu) menu.classList.remove('tb-hidden');
      const menuW = menu ? menu.offsetWidth + gap : 0;
      const widths = btns.map((x) => x.offsetWidth + gap);
      const ids = btns.map((x) => x.dataset.act as ActId);
      const drop = DROP_ORDER.map((id) => ids.indexOf(id)).filter((i) => i >= 0);
      next = overflowItems(widths, drop, overflow, menuW).map((i) => ids[i]);
    }
    for (const x of btns) x.classList.toggle('tb-hidden', next.includes(x.dataset.act as ActId));
    if (menu) menu.classList.toggle('tb-hidden', next.length === 0);
    setHidden((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
  });

  // Dinleyiciler eşzamanlı (layout) etkide bağlanır: menü açıldığı karede Esc / dışarı tık işlesin
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest('.tb-menu, .tb-more')) setMenuOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key, true); };
  }, [menuOpen]);
  useEffect(() => { if (hidden.length === 0) setMenuOpen(false); }, [hidden.length]);
  void tick;

  return (
    <header class="toolbar" ref={bar}>
      <div class="brand">Fatura Hesap Kodu</div>
      <select
        class="firm-select"
        value={S.firm.value.id}
        title="Firma (kısayollar, hesap listesi ve öneriler firmaya bağlıdır)"
        onChange={(e) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          if (v === '__new') {
            (e.currentTarget as HTMLSelectElement).value = S.firm.value.id;
            askName({ title: 'Yeni firma', label: 'Firma adı', placeholder: 'Örnek Kırtasiye Ltd. Şti.' }).then((name) => { if (name) S.createFirm(name); });
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
            askName({ title: 'Yeni dönem', label: 'Dönem adı', placeholder: 'örn. Eylül 2026', hint: 'Boş bırakırsanız yüklenen faturaların ayına göre kendiliğinden adlanır.', allowEmpty: true, okLabel: 'Oluştur' }).then((name) => { if (name !== null) S.createBatch(name); });
          } else if (id) S.openBatch(id);
        }}
        title="Dönem (bir dönemin faturaları; XML'ler sonradan da eklenebilir)"
      >
        {!b && <option value="">Dönem seçin</option>}
        {S.batchList.value.map((x) => (
          <option value={x.id}>
            {x.name} · {new Date(x.createdAt).toLocaleDateString('tr-TR')}
          </option>
        ))}
        <option value="__new">+ Yeni dönem…</option>
      </select>
      <button class={b ? '' : 'primary'} onClick={() => xml.current?.click()} title={(b ? 'Açık döneme e-Fatura XML ya da ZIP dosyaları ekle' : 'e-Fatura XML ya da ZIP dosyalarını yükle (yeni dönem açılır)') + '. EDM fatura listesi (Excel) de yüklenebilir: boş kalan sütunları doldurur. Klasörü pencereye sürükleyerek de yükleyebilirsiniz.'}>Yükle</button>
      <div class="spacer" />
      {b && (
        <div class={`progress ${n > 0 && S.assignedCount.value === n ? 'complete' : ''}`} title={`Atanan / toplam${issues ? ` · dikkat gerektiren: ${issues}` : ''} · her atama anında bu tarayıcıya kaydedilir`}>
          <b>{S.assignedCount.value}</b>/{n} atandı
          {issues > 0 && <span class="warn"> · dikkat: {issues}</span>}
          {n > 0 && S.assignedCount.value === n ? <span class="saved"> · tamam, <kbd class="always">F1</kbd> Excel üret</span> : <span class="saved" title="Her atama anında bu tarayıcıya kaydedilir; ayrıca kaydetmeniz gerekmez"> · ✓ anında kaydedilir</span>}
        </div>
      )}
      {acts.slice(0, 3).map((a) => <button data-act={a.id} class={a.cls ?? ''} onClick={a.on} disabled={a.disabled} title={a.title}>{a.label}{a.kbd && a.id === 'preview' && <kbd>F5</kbd>}</button>)}
      <button class="primary excel-btn" onClick={() => S.exportExcel()} disabled={!b || n === 0} title="Excel üret (F1)">Excel üret <kbd>F1</kbd></button>
      {acts.slice(3).map((a) => <button data-act={a.id} class={a.cls ?? ''} onClick={a.on} disabled={a.disabled} title={a.title}>{a.label}</button>)}
      <div class="tb-more-wrap">
        <button class={`ghost tb-more ${menuOpen ? 'on' : ''}`} title="Diğer düğmeler (sığmayanlar burada)" aria-haspopup="menu" aria-expanded={menuOpen} onClick={(e) => (menuOpen ? setMenuOpen(false) : openMenu(e.currentTarget as HTMLElement))}>⋯</button>
        {menuOpen && hidden.length > 0 && (
          <div class="tb-menu" role="menu" style={`top:${menuPos.top}px;right:${menuPos.right}px`}>
            {acts.filter((a) => hidden.includes(a.id)).map((a) => (
              <button role="menuitem" class="tb-menu-item" disabled={a.disabled} title={a.title} onClick={() => { setMenuOpen(false); a.on(); }}>
                <span>{menuLabel(a)}</span>
                {a.kbd && <kbd>{a.kbd}</kbd>}
              </button>
            ))}
            <div class="muted small tb-menu-note">Pencere genişleyince bu düğmeler üst çubuğa döner. Ayarlar › Ekran'dan arayüz küçültülebilir.</div>
          </div>
        )}
      </div>
      <button class="ghost settings-btn" onClick={() => (S.settingsOpen.value = true)} title="Ayarlar">⚙</button>
      <input ref={xml} type="file" accept=".xml,.zip,.xlsx,.xls,text/xml,application/xml,application/zip,application/x-zip-compressed,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden onChange={(e) => {
        const fl = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
        if (fl.length) S.importXml(fl);
        (e.currentTarget as HTMLInputElement).value = '';
      }} />
    </header>
  );
}
