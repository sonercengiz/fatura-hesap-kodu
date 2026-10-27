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
import { ListView } from './ListView';
import { PrintModal } from './PrintModal';
import { PrintRoot } from './PrintRoot';
import { ImportReportModal } from './ImportReportModal';
import { MoveModal } from './MoveModal';
import { TemplateModal } from './TemplateModal';
import { filesFromDataTransfer } from './dnd';

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

  useEffect(() => {
    document.documentElement.dataset.theme = S.settings.value.theme;
  }, [S.settings.value.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Yalnızca yazı girişleri tuşları yutar; onay kutusu / radyo odaklıyken kısayollar ve Esc çalışmaya devam eder
      const inInput = !!t && ((t.tagName === 'INPUT' && !/^(checkbox|radio|button)$/.test((t as HTMLInputElement).type)) || t.tagName === 'TEXTAREA' || t.isContentEditable);

      if (e.key === 'F1' || e.key === 'F5') {
        e.preventDefault();
        if (!S.batchRec.value) return;
        if (e.key === 'F1') S.exportExcel();
        else S.previewOpen.value = !S.previewOpen.value;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        // Ctrl+P: seçili faturayı yazdır; Ctrl+Shift+P: yazdırma planı
        e.preventDefault();
        if (e.shiftKey) S.openPrint();
        else if (S.current.value?.hasView) printCurrentInvoice();
        else S.openPrint();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('search')?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '.' || e.code === 'Period')) {
        e.preventDefault();
        if (!S.batchRec.value) return;
        if (S.chartOpen.value) S.closeChart(); else { S.exitManual(); S.openChart(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !inInput && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        if (!S.batchRec.value) return;
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
        if (e.key === 'Escape') S.closePrint();
        else if (e.key === 'Enter' && !inInput) { e.preventDefault(); document.querySelector<HTMLButtonElement>('.print-modal .modal-head button.primary')?.click(); }
        return;
      }
      if (S.importReport.value) {
        if (e.key === 'Escape' || e.key === 'Enter') S.importReport.value = null;
        return;
      }
      if (S.moveOpen.value || S.templateOpen.value) {
        if (e.key === 'Escape') { S.moveOpen.value = false; S.templateOpen.value = false; }
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
        if (c) S.assign(c);
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
    filesFromDataTransfer(dt).then((list) => { if (list.length) S.importXml(list); });
  };

  return (
    <div
      class={`app ${drag ? 'drag' : ''}`}
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
      {!S.batchRec.value ? (
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
              <div class="pdf-status">{S.invoices.value.length === 0 ? 'Bu partide fatura yok. XML yükleyin.' : 'Fatura yok.'}</div>
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
      {S.printOpen.value && <PrintModal />}
      {S.importReport.value && <ImportReportModal />}
      {S.moveOpen.value && <MoveModal />}
      {S.templateOpen.value && <TemplateModal />}
      <PrintRoot />
      {S.busy.value && <div class="busy">{S.busy.value}</div>}
      {S.toast.value && <div class="toast">{S.toast.value}</div>}
      {drag && <div class="drop-hint">Bırakın: e-Fatura XML, ZIP ya da klasör</div>}
    </div>
  );
}
