import { useEffect, useState } from 'preact/hooks';
import * as S from './state';
import { Toolbar } from './Toolbar';
import { SidePanel } from './SidePanel';
import { ShortcutBar } from './ShortcutBar';
import { InvoiceView, printCurrentInvoice } from './InvoiceView';
import { InvoiceCard } from './InvoiceCard';
import { PreviewModal } from './PreviewModal';
import { SettingsModal } from './SettingsModal';
import { GuideModal } from './GuideModal';
import { ChartModal } from './ChartModal';
import { RulesModal } from './RulesModal';
import { QuickRuleModal } from './QuickRuleModal';
import { ListView } from './ListView';
import { PrintModal } from './PrintModal';
import { PrintRoot } from './PrintRoot';
import { ImportReportModal } from './ImportReportModal';
import { MoveModal } from './MoveModal';
import { TemplateModal } from './TemplateModal';
import { filesFromDataTransfer } from './dnd';
import { DialogModal } from './DialogModal';
import { AccountsModal } from './AccountsModal';
import { dialog } from './dialog';

export function App() {
  const [drag, setDrag] = useState(false);
  const inv = S.current.value;
  const code = inv ? S.assignments.value.get(inv.no) : undefined;
  const slotIdx = S.slotIndexOf(code);

  useEffect(() => {
    try {
      if (!localStorage.getItem('guideSeen')) {
        S.guideOpen.value = true;
        localStorage.setItem('guideSeen', '1');
      }
    } catch { /* yoksay */ }
  }, []);

  // Tema: ayarlar veritabanından gelene kadar dokunma (index.html'deki satır içi betik localStorage'dan ilk kareyi doğru çizer)
  const themeReady = S.ready.value;
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = S.settings.value.theme;
    try { localStorage.setItem('theme', S.settings.value.theme); } catch { /* yok say */ }
  }, [S.settings.value.theme, themeReady]);

  // Arayüz ölçeği: kök öğede CSS zoom (pencere ölçüsünden kendiliğinden ya da Ayarlar › Ekran'dan sabit)
  const scale = S.uiScale.value;
  useEffect(() => {
    document.documentElement.style.zoom = scale === 1 ? '' : String(scale);
  }, [scale]);
  const density = S.density.value;
  const appCls = `app ${drag ? 'drag' : ''} density-${density} ${S.narrow.value ? 'narrow' : ''} ${S.stacked.value ? 'stacked' : ''} ${S.effSize.value.w >= 1600 ? 'wide' : ''}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Yalnızca yazı girişleri tuşları yutar; onay kutusu / radyo odaklıyken kısayollar ve Esc çalışmaya devam eder
      const inInput = !!t && ((t.tagName === 'INPUT' && !/^(checkbox|radio|button)$/.test((t as HTMLInputElement).type)) || t.tagName === 'TEXTAREA' || t.isContentEditable);

      // Açık pencere varken genel kısayollar (F1/F5/Ctrl+P/Ctrl+F/Ctrl+./Ctrl+Z) çalışmaz: arkada pencere açılmasın, odak çalınmasın, görünmeyen geri alma olmasın.
      // İstisnalar: önizlemede F1 (başlıkta yazıyor) ve F5 (önizlemeyi kapatır); hesap listesinde Ctrl+. (kapatır); Kurallar'da Ctrl+Z/Y.
      const modalOpen = S.settingsOpen.value || S.guideOpen.value || S.rulesOpen.value || S.printOpen.value || !!S.quickRule.value || S.moveOpen.value || S.templateOpen.value || S.accountsOpen.value || !!S.importReport.value || !!dialog.value;
      const onlyPreview = S.previewOpen.value && !modalOpen && !S.chartOpen.value;
      if (e.key === 'F1' || e.key === 'F5') {
        e.preventDefault();
        if (!S.batchRec.value || modalOpen || S.chartOpen.value) return;
        if (e.key === 'F1') S.exportExcel();
        else S.previewOpen.value = !S.previewOpen.value;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        // Ctrl+P: seçili faturayı yazdır; Ctrl+Shift+P: yazdırma planı
        e.preventDefault();
        if (modalOpen || S.previewOpen.value || S.chartOpen.value) return;
        if (e.shiftKey) S.openPrint();
        else if (S.current.value?.hasView) printCurrentInvoice();
        else S.openPrint();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (modalOpen || S.previewOpen.value || S.chartOpen.value) return; // pencerenin kendi araması ya da tarayıcı araması
        e.preventDefault();
        document.getElementById('search')?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '.' || e.code === 'Period')) {
        e.preventDefault();
        if (!S.batchRec.value) return;
        if (S.chartOpen.value) S.closeChart(); else if (!modalOpen && !S.previewOpen.value) { S.exitManual(); S.openChart(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !inInput && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        // Kurallar penceresinde de çalışır: kural değişikliği orada görünür (kural + kodları birlikte döner)
        const rulesOnly = S.rulesOpen.value && !dialog.value;
        if (!S.batchRec.value || (modalOpen && !rulesOnly) || onlyPreview || S.chartOpen.value) return;
        if (e.key.toLowerCase() === 'y' || e.shiftKey) S.redo(); else S.undo();
        return;
      }
      if (S.chartOpen.value) {
        // Pencere odak almadan gelen tuşları kaybetme
        if (!inInput && !S.chartAdding.value) {
          const res = S.chartResults.value;
          if (e.key === 'Escape') S.closeChart();
          else if (e.key === 'ArrowDown') { e.preventDefault(); S.chartIndex.value = Math.min(S.chartIndex.value + 1, Math.max(res.length - 1, 0)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); S.chartIndex.value = Math.max(S.chartIndex.value - 1, 0); }
          else if (e.key === 'Enter') { e.preventDefault(); const pick = res[Math.min(S.chartIndex.value, res.length - 1)]?.code ?? (S.chartQuery.value.trim() || null); if (pick) S.pickFromChart(pick); }
          else if (e.key === 'Backspace') { e.preventDefault(); S.chartQuery.value = S.chartQuery.value.slice(0, -1); S.chartIndex.value = 0; }
          else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); S.chartQuery.value += e.key; S.chartIndex.value = 0; }
        }
        return;
      }
      if (S.printOpen.value) {
        // Enter yalnızca odak bir seçimde/kutuda değilken yazdırır (açılır listede ya da onay kutusunda Enter seçim demektir)
        const onControl = !!t && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON');
        if (e.key === 'Escape') S.closePrint();
        else if (e.key === 'Enter' && !onControl) { e.preventDefault(); document.querySelector<HTMLButtonElement>('.print-modal .modal-head button.primary')?.click(); }
        return;
      }
      if (dialog.value) return; // küçük pencere kendi tuşlarını işler
      if (S.importReport.value) {
        if (e.key === 'Escape' || e.key === 'Enter') S.importReport.value = null;
        return;
      }
      if (S.quickRule.value) { if (e.key === 'Escape') S.quickRule.value = null; return; }
      if (S.moveOpen.value || S.templateOpen.value || S.accountsOpen.value) {
        if (e.key === 'Escape') { S.moveOpen.value = false; S.templateOpen.value = false; S.accountsOpen.value = false; }
        return;
      }
      if (S.previewOpen.value || S.settingsOpen.value || S.guideOpen.value || S.rulesOpen.value) {
        if (e.key === 'Escape') {
          S.previewOpen.value = false;
          S.settingsOpen.value = false;
          S.guideOpen.value = false;
          S.closeRules();
        }
        return;
      }
      if (S.editingSlot.value !== null) {
        // Yuva düzenleme kutusu odak almadan gelen tuşları kaybetme
        if (!inInput) {
          if (e.key === 'Enter') { e.preventDefault(); S.commitSlotEdit(); }
          else if (e.key === 'Escape') { e.preventDefault(); S.cancelSlotEdit(); }
          else if (e.key === 'Backspace') { e.preventDefault(); S.editingText.value = S.editingText.value.slice(0, -1); }
          else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); S.editingText.value += e.key; }
        }
        return;
      }
      if (S.mode.value === 'manual') {
        // Giriş kutusu henüz odak almadıysa tuşu kaybetme
        if (!inInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          S.manualText.value += e.key;
        } else if (!inInput && e.key === 'Escape') {
          S.exitManual();
        }
        return;
      }
      if (inInput) return;
      // Tab / Shift+Tab ve Shift+ok: sonraki / önceki atanmamış fatura
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        S.jumpUnassigned(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        S.jumpUnassigned(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      const all = e.ctrlKey || e.metaKey; // Ctrl+ok: toplu atananlar dahil gez
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          S.next(all);
          return;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          S.prev(all);
          return;
        case 'Home':
          e.preventDefault();
          S.first(all);
          return;
        case 'End':
          e.preventDefault();
          S.last(all);
          return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      switch (e.key) {
        case 'Escape':
          if (S.selected.value.size) S.clearSelection();
          return;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          S.clearAssignment();
          return;
        case '/':
        case 'Enter':
          e.preventDefault();
          S.enterManual();
          return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        S.enterManual(e.key);
        return;
      }
      if (e.key === ' ') {
        // Boşluk: kural varsa kuralın kodu, yoksa satıcıya daha önce verilen kod
        const r = S.current.value ? S.ruleFor.value.get(S.current.value.no) : undefined;
        const c = r?.code ?? S.hint.value?.code;
        if (c) {
          e.preventDefault();
          S.assign(c);
        }
        return;
      }
      const k = e.key.toLocaleLowerCase('tr');
      const i = S.firm.value.shortcuts.findIndex((s) => s.key === k);
      if (i >= 0) {
        e.preventDefault();
        const c = S.slots.value[i];
        if (c) S.giveCode(c);
        else S.showToast(`${k.toUpperCase()} yuvası boş. Alttaki yuvaya tıklayıp bir kod yazın.`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const dt = e.dataTransfer;
    filesFromDataTransfer(dt).then(({ files, failed }) => { if (files.length || failed.length) S.importXml(files, failed); });
  };

  return (
    <div
      class={appCls}
      style={`--panel-w:${S.panelW.value}px`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <Toolbar />
      {S.backupDue.value && S.batchRec.value && (
        <div class="backup-hint">
          <span>
            {S.lastExportAt.value === null ? 'Henüz hiç yedek alınmadı.' : `Son yedek ${Math.floor((Date.now() - S.lastExportAt.value) / 86_400_000)} gün önce.`}{' '}
            Veriler yalnızca bu tarayıcıda; tek dosyayla yedekleyin.
          </span>
          <button class="tiny primary" onClick={() => S.exportWorkspace()}>Şimdi dışa aktar</button>
          <button class="tiny ghost" onClick={() => S.dismissBackup()}>Bugün değil</button>
        </div>
      )}
      {!S.ready.value ? (
        <main class="welcome loading"><p class="muted">Açılıyor…</p></main>
      ) : !S.batchRec.value ? (
        <main class="welcome">
          <h1>e-Fatura XML dosyalarını yükleyin</h1>
          <p>EDM'den indirdiğiniz fatura XML'lerini, ZIP'ini ya da klasörünü buraya sürükleyin ya da üstteki <b>Yükle</b> düğmesini kullanın. Faturalar kendi resmî görünümüyle çizilir; tek tuşla hesap kodu verirsiniz.</p>
          <p class="muted">Veriler yalnızca bu tarayıcıda saklanır. Çıktı, EDM fatura listesi düzeninde (Hesap Kodu sütunu eklenmiş) bir Excel dosyasıdır.</p>
          <p><button class="primary" onClick={() => (S.guideOpen.value = true)}>Kullanım rehberini aç</button></p>
        </main>
      ) : S.settings.value.layout === 'list' ? (
        <ListView />
      ) : (
        <main class="work">
          <section class={`viewer slot-bg-${slotIdx}`}>
            {inv && inv.hasView ? (
              <InvoiceView invoiceNo={inv.no} viewMode={S.settings.value.viewMode} marginPx={S.settings.value.marginPx} />
            ) : inv ? (
              <InvoiceCard inv={inv} />
            ) : (
              <div class="pdf-status">{S.invoices.value.length === 0 ? 'Bu dönemde fatura yok. XML yükleyin.' : 'Fatura yok.'}</div>
            )}
            {inv && (
              <div class="viewer-badge">
                <span class="muted">{S.currentIndex.value + 1}/{S.invoices.value.length}</span>
                {code && <b class={`badge slot-${slotIdx}`}>{code}</b>}
                {inv.hasView && <button class="ghost tiny" title="Yazdır / PDF olarak kaydet (Ctrl+P)" onClick={printCurrentInvoice}>🖨</button>}
              </div>
            )}
          </section>
          <SidePanel />
        </main>
      )}
      <ShortcutBar />
      {S.previewOpen.value && <PreviewModal />}
      {S.settingsOpen.value && <SettingsModal />}
      {S.guideOpen.value && <GuideModal />}
      {S.chartOpen.value && <ChartModal />}
      {S.rulesOpen.value && <RulesModal />}
      {S.quickRule.value && <QuickRuleModal />}
      {S.printOpen.value && <PrintModal />}
      {S.importReport.value && <ImportReportModal />}
      {S.moveOpen.value && <MoveModal />}
      {S.templateOpen.value && <TemplateModal />}
      {S.accountsOpen.value && <AccountsModal />}
      {dialog.value && <DialogModal />}
      <PrintRoot />
      {S.busy.value && <div class="busy">{S.busy.value}</div>}
      {S.toast.value && <div class="toast">{S.toast.value}{S.toastAction.value && <button class="toast-act" onClick={() => { const act = S.toastAction.value; S.toast.value = null; act?.run(); }}>{S.toastAction.value.label}</button>}</div>}
      {drag && <div class="drop-hint">Bırakın: e-Fatura XML, ZIP ya da klasör</div>}
    </div>
  );
}
