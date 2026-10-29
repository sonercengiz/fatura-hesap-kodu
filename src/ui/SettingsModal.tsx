import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './state';
import { askName, askConfirm } from './dialog';
import type { ViewMode, Layout } from '../core/types';
import { isEdmDefault } from '../core/excel/template';
import { keys } from './guide/sections';

import { SCALE_STEPS, describeScreen, type Density } from '../core/layout';

type Tab = 'firm' | 'batch' | 'output' | 'view' | 'screen' | 'backup' | 'keys';
const TABS: [Tab, string][] = [['firm', 'Firma'], ['batch', 'Dönem'], ['output', 'Çıktı'], ['view', 'Görünüm'], ['screen', 'Ekran'], ['backup', 'Yedek'], ['keys', 'Klavye']];
const DENSITY_LABEL: Record<Density, string> = { comfortable: 'ferah', compact: 'sıkışık' };
const pct = (x: number) => `%${Math.round(x * 100)}`;

/** Ayarlar › Ekran: bu bilgisayarın ekranı, arayüz ölçeği, yerleşim yoğunluğu, panel genişliği. Tercihler yalnızca bu bilgisayarda. */
function ScreenTab() {
  const p = S.screenPrefs.value;
  const info = S.screenInfo.value; const win = S.winSize.value; const eff = S.effSize.value;
  const auto = S.autoScale.value; const cur = S.uiScale.value; const dens = S.density.value; const autoD = S.autoDens.value;
  const steps = SCALE_STEPS.includes(cur as (typeof SCALE_STEPS)[number]) || p.uiScale == null ? [...SCALE_STEPS] : [...SCALE_STEPS, cur].sort((a, b) => a - b);
  return (
    <>
      <fieldset>
        <legend>Bu bilgisayarın ekranı</legend>
        <div><b>{describeScreen({ ...info, winW: win.w, winH: win.h })}</b></div>
        <div class="muted small">Uygulama şu an <b>{pct(cur)}</b> ölçekle <b>{DENSITY_LABEL[dens]}</b> yerleşimde çalışıyor; kullanılabilir alan {eff.w} × {eff.h}. Pencere büyüyüp küçüldükçe kendiliğinden uyar. Buradaki seçimler yalnızca bu bilgisayarda geçerlidir; yedek dosyasına girmez.</div>
      </fieldset>
      <fieldset>
        <legend>Arayüz ölçeği (yazı ve düğme boyu)</legend>
        <div class="scale-row">
          <label class="radio"><input type="radio" name="uiScale" checked={p.uiScale == null} onChange={() => S.setScreenPrefs({ uiScale: null })} /><span>Kendiliğinden <span class="muted">(şu an {pct(auto)})</span></span></label>
          {steps.map((v) => (
            <label class="radio"><input type="radio" name="uiScale" checked={p.uiScale === v} onChange={() => S.setScreenPrefs({ uiScale: v })} /><span>{pct(v)}</span></label>
          ))}
        </div>
        <div class="muted small">Küçük ya da düşük çözünürlüklü ekranda (1024×768, 1280×1024, %125 ölçekli dizüstü) kendiliğinden %85–%95'e iner ki üst çubuk tek satırda kalsın ve liste daha çok fatura göstersin. Yazı küçük geliyorsa %100 seçin; sıkışık yerleşim yine yer kazandırır. Büyük ekranda yazıyı büyütmek için %110–%150.</div>
      </fieldset>
      <fieldset>
        <legend>Yerleşim</legend>
        {([['auto', `Kendiliğinden (şu an ${DENSITY_LABEL[autoD]})`], ['comfortable', 'Ferah: kısayollar iki sıra, panel bilgileri alt alta, durum kartları'], ['compact', 'Sıkışık: kısayollar tek sıra, panel bilgileri iki sütun, dar panel, liste daha çok satır']] as [ScreenPrefsDensity, string][]).map(([v, label]) => (
          <label class="radio"><input type="radio" name="density" checked={p.density === v} onChange={() => S.setScreenPrefs({ density: v })} /><span>{label}</span></label>
        ))}
        <div class="muted small">Üst çubuğa sığmayan düğmeler kendiliğinden <b>⋯</b> menüsüne taşınır; pencere genişleyince geri gelir. Çok dar pencerede liste paneli görüntünün altına iner.</div>
      </fieldset>
      <fieldset>
        <legend>Liste paneli genişliği</legend>
        <div class="row-inline" style="justify-content:flex-start; gap:10px; flex-wrap:wrap">
          <span>{p.panelW == null ? `Varsayılan: ${S.panelW.value} px` : `Sürüklenmiş: ${S.panelW.value} px`}</span>
          {p.panelW != null && <button class="tiny" onClick={() => S.setScreenPrefs({ panelW: null })}>Varsayılana dön</button>}
        </div>
        <div class="muted small">Görsel görünümde fatura görüntüsü ile liste arasındaki çizgiyi sürükleyin; çift tık varsayılana döndürür.</div>
      </fieldset>
      <div class="muted small">Tarayıcının kendi yakınlaştırması (<kbd>Ctrl</kbd> + / −) da kullanılabilir; uygulama ona göre yeniden yerleşir.</div>
    </>
  );
}
type ScreenPrefsDensity = 'auto' | Density;

/** Ayarlar: sekmeli; büyük listeler (hesap kodları, kurallar, şablon) kendi pencerelerine gider. */
export function SettingsModal() {
  const s = S.settings.value;
  const [tab, setTab] = useState<Tab>(S.settingsTab.value);
  const go = (t: Tab) => { setTab(t); S.settingsTab.value = t; };
  const imp = useRef<HTMLInputElement>(null);
  const close = () => (S.settingsOpen.value = false);
  const openOther = (fn: () => void) => { close(); fn(); };
  const b = S.batchRec.value;
  const [store, setStore] = useState<S.StorageInfo | null>(null);
  useEffect(() => { if (tab === 'backup') S.storageInfo().then(setStore); }, [tab]);
  const mb = (n: number | null) => (n == null ? '?' : `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`);
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal settings" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }}>
        <div class="modal-head">
          <b>Ayarlar</b>
          <span class="muted">{S.firm.value.name}</span>
          <div class="spacer" />
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="settings-body">
          <nav class="settings-tabs" aria-label="Ayar bölümleri">
            {TABS.map(([t, label]) => <button class={tab === t ? 'on' : ''} onClick={() => go(t)}>{label}</button>)}
          </nav>
          <div class="form settings-pane">
            {tab === 'firm' && (
              <>
                <label>
                  <span>Firma adı (çıktı dosya adında kullanılır)</span>
                  <input value={S.firm.value.name} onInput={(e) => S.updateFirm({ name: (e.currentTarget as HTMLInputElement).value })} placeholder="ABC LTD" onKeyDown={(e) => e.stopPropagation()} />
                </label>
                <div class="muted small">Kısayollar, hesap kodu listesi, kurallar, öneri geçmişi ve dönemler firmaya bağlıdır. Üst çubuktaki firma menüsünden geçiş yapılır.</div>
                <fieldset>
                  <legend>Kısayollar (Q W E A S D)</legend>
                  <div class="shortcut-grid">
                    {S.firm.value.shortcuts.map((sc, i) => (
                      <label class={`slot-${i}`}>
                        <kbd>{sc.key.toUpperCase()}</kbd>
                        <input value={sc.code ?? ''} placeholder="boş" onKeyDown={(e) => e.stopPropagation()} onInput={(e) => {
                          const v = (e.currentTarget as HTMLInputElement).value.trim();
                          const shortcuts = S.firm.value.shortcuts.map((x, k) => (k === i ? { ...x, code: v || null } : x));
                          S.updateFirm({ shortcuts });
                        }} />
                      </label>
                    ))}
                  </div>
                  <div class="muted small">Yalnızca sizin yazdığınız kodlar; kendiliğinden değişmez. Alt çubuktaki yuvalara tıklayarak da yazılır.</div>
                </fieldset>
                <div class="settings-links">
                  <button onClick={() => openOther(() => (S.accountsOpen.value = true))}>Hesap kodu listesi <span class="muted">({S.accounts.value.length} kod)</span></button>
                  <button onClick={() => openOther(() => S.openRules())}>Otomatik atama kuralları <span class="muted">(bu dönemde {S.batchRules.value.length})</span></button>
                </div>
                <div class="row-inline" style="margin-top:8px">
                  <span class="muted small">{S.firms.value.length} firma kayıtlı.</span>
                  <span>
                    <button onClick={() => askName({ title: 'Yeni firma', label: 'Firma adı', placeholder: 'Örnek Kırtasiye Ltd. Şti.' }).then((n) => { if (n) S.createFirm(n); })}>+ Yeni firma</button>{' '}
                    {S.firms.value.length > 1 && <button class="danger" onClick={async () => { const f = S.firm.value; if (await askConfirm({ title: 'Firmayı sil', message: `"${f.name}" firması, tüm dönemleri, faturaları, atamaları, kuralları, hesap listesi ve geçmişiyle silinecek. Bu işlem geri alınamaz.`, okLabel: 'Sil', danger: true })) { S.deleteFirm(f.id); close(); } }}>Firmayı sil</button>}
                  </span>
                </div>
              </>
            )}
            {tab === 'batch' && (b ? (
              <>
                <label>
                  <span>Dönem adı{b.autoName ? ' (yüklenen faturaların ayına göre kendiliğinden verildi)' : ''}</span>
                  <input value={b.name} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => S.renameBatch((e.currentTarget as HTMLInputElement).value)} />
                </label>
                <div class="muted small">{S.invoices.value.length} fatura · {S.assignedCount.value} atanmış · {S.viewCount.value} XML'li · oluşturulma {new Date(b.createdAt).toLocaleDateString('tr-TR')}</div>
                {S.lastImport.value?.batchId === b.id && (() => {
                  const li = S.lastImport.value!;
                  return <div class="muted small last-import">Son yükleme {new Date(li.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}: {li.report.added} eklendi{li.report.skipped ? ` · ${li.report.skipped} zaten vardı` : ''}{li.report.failed.length ? ` · ${li.report.failed.length} okunamadı` : ''} <button class="ghost tiny" onClick={() => openOther(() => (S.importReport.value = li.report))}>Ayrıntı</button></div>;
                })()}
                {S.exportsList.value[0] && (() => {
                  const r = S.exportsList.value[0];
                  return <div class="muted small last-export">Son çıktı {S.exportStamp(r.at)} · {r.rows} satır · {r.flagged.length ? `${r.flagged.length} uyarılı` : 'uyarısız'} <button class="ghost tiny" onClick={() => openOther(() => (S.exportsOpen.value = true))}>Aç</button></div>;
                })()}
                <div class="settings-links">
                  <button onClick={() => openOther(() => (S.moveOpen.value = true))}>Başka firmaya ya da döneme taşı…</button>
                  <button class="danger" onClick={async () => {
                    if (await askConfirm({ title: 'Dönemi sil', message: `"${b.name}" dönemi, ${S.invoices.value.length} faturası ve atamalarıyla silinecek; "Bu satıcıya önce" ipuçları da bu atamaları unutur. Yalnızca yer açmak istiyorsanız Yedek › Depolama'dan XML'leri kaldırmak yeter. Bu işlem geri alınamaz.`, okLabel: 'Sil', danger: true })) { S.deleteBatch(b.id); close(); }
                  }}>Dönemi sil</button>
                </div>
              </>
            ) : <div class="muted">Açık dönem yok.</div>)}
            {tab === 'output' && (
              <>
                <div class="muted">
                  Açık dönemin Excel'i <b>{S.templateScope.value === 'batch' ? 'döneme özel' : S.templateScope.value === 'firm' ? `${S.firm.value.name} firmasına özel` : 'genel'}</b> şablonla: <b>{S.outputTemplate.value.columns.length} sütun</b> · {S.outputCodeAt.value >= 0 ? <>Hesap Kodu <b>{String.fromCharCode(65 + Math.min(S.outputCodeAt.value, 25))}</b> sütununda</> : 'Hesap Kodu sütunu yok'} · {isEdmDefault(S.outputTemplate.value) ? 'EDM düzeni (varsayılan)' : 'özelleştirilmiş'} · sayfa "{S.outputTemplate.value.sheetName}".
                </div>
                <div class="muted small">Sütunlar, başlıklar, satır sırası ve sayfa adı muhasebe programınızın içe aktarma şablonuna göre ayarlanır. Genel şablon bütün firmalara geçer; bir firmaya ya da döneme özel şablon da yapılabilir. Liste görünümü ve önizleme başlıklarından da düzenlenir. Kısa yol: üst çubukta Excel üret'in yanındaki <b>Şablon</b>. Dosya adı: <code>AY YIL FİRMA_ADI FATURA.xlsx</code> (ay = faturaların baskın ayı).</div>
                <div class="settings-links">
                  <button onClick={() => openOther(() => (S.templateOpen.value = true))}>Şablonu düzenle…</button>
                  <button onClick={() => openOther(() => (S.previewOpen.value = true))}>Önizle (F5)</button>
                </div>
              </>
            )}
            {tab === 'view' && (
              <>
                <fieldset>
                  <legend>Ana ekran</legend>
                  {([['hybrid', 'Görsel: fatura görüntüsü + sağda liste'], ['list', 'Liste: yalnızca tablo (sütunlar tablo üstünden seçilir)']] as [Layout, string][]).map(([v, label]) => (
                    <label class="radio"><input type="radio" name="layout" checked={s.layout === v} onChange={() => S.setLayout(v)} /><span>{label}</span></label>
                  ))}
                  <div class="muted small">Üst çubuktaki ☰ Liste / ▣ Görsel düğmesiyle de değişir. Liste görünümünde satıra çift tıklamak o faturayı Görsel görünümde açar.</div>
                </fieldset>
                <fieldset>
                  <legend>Fatura görüntüsü: yakınlaştırma</legend>
                  <div class="row-inline" style="justify-content:flex-start; gap:10px; flex-wrap:wrap">
                    <span>{s.viewZoom == null ? 'Kendiliğinden: kenar boşlukları kırpılır, sayfanın üst yarısı ekranı doldurur.' : `Sabit: %${Math.round(s.viewZoom * 100)}`}</span>
                    {s.viewZoom != null && <button class="tiny" onClick={() => S.updateSettings({ viewZoom: null })}>Kendiliğinden'e dön</button>}
                  </div>
                  <div class="muted small">Görüntü üstünde <kbd>Ctrl</kbd> + fare tekerleği ya da sağ alttaki − / + ile değiştirilir; seçiminiz bütün faturalarda ve sonraki açılışta korunur.</div>
                </fieldset>
                <fieldset>
                  <legend>Fatura görüntüsü: yeni faturaya geçince</legend>
                  {([['top', 'En üstten başlasın'], ['last', 'Son kaldığım yerden başlasın'], ['margin', 'Belirli bir yükseklikten başlasın']] as [ViewMode, string][]).map(([v, label]) => (
                    <label class="radio">
                      <input type="radio" name="viewMode" checked={s.viewMode === v} onChange={() => S.updateSettings({ viewMode: v })} />
                      <span>{label}</span>
                      {v === 'margin' && <input type="number" class="inline" min={0} step={10} value={s.marginPx} disabled={s.viewMode !== 'margin'} onInput={(e) => S.updateSettings({ marginPx: Number((e.currentTarget as HTMLInputElement).value) || 0 })} />}
                      {v === 'margin' && <span class="muted">px</span>}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Kod verdikten sonra</legend>
                  {([[false, 'Faturada kal: kodun verildiğini görün, → ya da Tab ile siz geçin'], [true, 'Sıradaki faturaya kendiliğinden geç (hızlı çalışma)']] as [boolean, string][]).map(([v, label]) => (
                    <label class="radio"><input type="radio" name="autoAdvance" checked={s.autoAdvance === v} onChange={() => S.updateSettings({ autoAdvance: v })} /><span>{label}</span></label>
                  ))}
                  <div class="muted small">Kısayol tuşları (Q W E A S D), Boşluk ve elle giriş için geçerlidir. Yanlış kodu <kbd>Ctrl+Z</kbd> geri alır.</div>
                </fieldset>
                <label class="radio">
                  <input type="checkbox" checked={s.theme === 'dark'} onChange={(e) => S.updateSettings({ theme: (e.currentTarget as HTMLInputElement).checked ? 'dark' : 'light' })} />
                  <span>Koyu tema (üst çubuktaki ☾/☀ ile de değişir)</span>
                </label>
              </>
            )}
            {tab === 'screen' && <ScreenTab />}
            {tab === 'backup' && (
              <>
                <div class="muted">Tüm firmalar, dönemler, fatura listeleri, atamalar, hesap kodu listeleri, kurallar, çıktı şablonu ve öneri geçmişi tek bir .json dosyasına yazılır; başka bilgisayarda içe aktarılınca mevcut veriyle <b>birleştirilir</b>, hiçbir şey silinmez. Çıktı şablonu da gelir; oradaki şablon özelleştirilmişse o korunur.</div>
                <div class="muted small">Fatura XML'leri dosyaya dahil edilmez (boyut); fatura görüntüsü için XML'ler yeniden yüklenir, atamalar korunur. Veriler yalnızca bu tarayıcıda durur; düzenli yedek alın.</div>
                <div class="settings-links">
                  <button class="primary" onClick={() => S.exportWorkspace()}>Dışa aktar (.json)</button>
                  <button onClick={() => imp.current?.click()}>İçe aktar…</button>
                  <input ref={imp} type="file" accept=".json,application/json" hidden onChange={(e) => {
                    const f = (e.currentTarget as HTMLInputElement).files?.[0];
                    if (f) S.importWorkspace(f);
                    (e.currentTarget as HTMLInputElement).value = '';
                  }} />
                </div>
                <div class="muted small">{S.lastExportAt.value ? `Son yedek: ${new Date(S.lastExportAt.value).toLocaleString('tr-TR')}${S.lastChangeAt.value > S.lastExportAt.value ? ' · o günden beri değişiklik var' : ' · o günden beri değişiklik yok'}` : 'Henüz yedek alınmadı.'}</div>
                <fieldset class="backup-remind">
                  <legend>Yedek hatırlatması (bu bilgisayar)</legend>
                  {(['week', 'month', 'off'] as S.BackupRemind[]).map((v) => (
                    <label class="radio"><input type="radio" name="backupRemind" checked={S.backupRemind.value === v} onChange={() => S.setBackupRemind(v)} /><span>{v === 'off' ? S.BACKUP_REMIND_LABELS[v] : `${S.BACKUP_REMIND_LABELS[v]}: son yedekten sonra değişiklik varsa üstte şerit çıkar`}</span></label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Depolama</legend>
                  {store ? (
                    <>
                      <div class="muted small">Tarayıcı deposu: <b>{mb(store.usage)}</b> kullanılıyor{store.quota ? ` / ${mb(store.quota)} sınır` : ''} · fatura XML'leri {mb(store.batches.reduce((n, x) => n + x.bytes, 0))} + şablonlar {mb(store.xsltBytes)}.</div>
                      <div class="muted small">Dolmaya yaklaşırsa eski dönemlerin XML'lerini kaldırın: XML ve şablon silinir; liste, atamalar, EDM sütunları ve Excel çıktısı aynen kalır, yalnızca fatura görüntüsü çizilemez. XML'i yeniden yüklerseniz görüntü geri gelir.</div>
                      <div class="acc-list store-list">
                        {store.batches.map((x) => (
                          <div class="acc-row store-row">
                            <span class="store-name" title={`${x.firmName} › ${x.name}`}>{x.firmName} › <b>{x.name}</b></span>
                            <span class="muted small">{x.withXml}/{x.total} XML'li · {mb(x.bytes)}</span>
                            <button class="tiny" disabled={x.withXml === 0} onClick={async () => { if (await askConfirm({ title: 'XML\'leri kaldır', message: `"${x.name}" dönemindeki ${x.withXml} faturanın XML'i silinip yer açılacak; liste, atamalar ve Excel çıktısı kalır, yalnızca fatura görüntüsü çizilemez. XML'ler yeniden yüklenirse görüntüler geri gelir.`, okLabel: 'Kaldır' })) { const n = await S.archiveBatchVisuals(x.id); S.showToast(`${n} faturanın XML'i kaldırıldı`); setStore(await S.storageInfo()); } }}>XML'leri kaldır</button>
                          </div>
                        ))}
                        {store.batches.length === 0 && <div class="chart-empty">Dönem yok.</div>}
                      </div>
                    </>
                  ) : <div class="muted small">Hesaplanıyor…</div>}
                </fieldset>
              </>
            )}
            {tab === 'keys' && (
              <table class="keys-table"><tbody>{keys.map(([k, d]) => <tr><td>{k.split(/\s{2,}/).map((x) => <kbd>{x}</kbd>)}</td><td>{d}</td></tr>)}</tbody></table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
