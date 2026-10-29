// Rehber görsellerini HAYALİ demo veriyle üretir. Önce: node test/demo/make-demo.mjs <demo klasörü>; uygulama 5179'da açık olmalı.
import { chromium } from 'playwright';
import { readdirSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';

const URL = 'http://localhost:5179/';
const DEMO = process.env.DEMO_DIR || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/d64e6ff3-d5c6-481a-957e-cc3c595811d5/scratchpad/demo';
const OUT = process.env.OUT_DIR || '/Users/sonercengiz/Documents/scc/fatura-hesap-kodu/public/guide';
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const XMLS = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !f.startsWith('IRS')).sort().map((f) => `${DEMO}/xml/${f}`);
const W = 1440, H = 840;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });

async function annotate(items, pg = page) {
  const boxes = [];
  for (const it of items) {
    const loc = pg.locator(it.sel).first();
    const box = await loc.boundingBox().catch(() => null);
    if (box) boxes.push({ ...it, box });
  }
  await pg.evaluate((boxes) => {
    // Arayüz ölçeği (kök zoom) varsa görsel koordinatlar CSS pikseline çevrilir
    const z = parseFloat(document.documentElement.style.zoom || '1') || 1;
    for (const { box: r0, n, pad = 4, pos = 'tl' } of boxes) {
      const r = { x: r0.x / z, y: r0.y / z, width: r0.width / z, height: r0.height / z };
      const o = document.createElement('div'); o.className = '__c';
      Object.assign(o.style, { position: 'fixed', left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', border: '2.5px solid #2f6fed', borderRadius: '10px', zIndex: 99998, pointerEvents: 'none', boxSizing: 'border-box', boxShadow: '0 0 0 3px rgba(47,111,237,.18)' });
      document.body.appendChild(o);
      if (n != null) {
        const d = document.createElement('div'); d.className = '__c'; d.textContent = String(n);
        const size = 26;
        let left = r.x - pad - size / 2, top = r.y - pad - size / 2;
        if (pos === 'tr') left = r.x + r.width + pad - size / 2;
        if (pos === 'bl') top = r.y + r.height + pad - size / 2;
        if (pos === 'br') { left = r.x + r.width + pad - size / 2; top = r.y + r.height + pad - size / 2; }
        if (pos === 'in') { left = r.x + 6; top = r.y + 6; }
        left = Math.max(2, Math.min(left, window.innerWidth - size - 2)); top = Math.max(2, Math.min(top, window.innerHeight - size - 2));
        Object.assign(d.style, { position: 'fixed', left: left + 'px', top: top + 'px', width: size + 'px', height: size + 'px', borderRadius: '50%', background: '#2f6fed', color: '#fff', font: '700 14px system-ui', display: 'grid', placeItems: 'center', zIndex: 99999, boxShadow: '0 2px 6px rgba(0,0,0,.3)', border: '2px solid #fff' });
        document.body.appendChild(d);
      }
    }
  }, boxes);
}
const clear = () => page.evaluate(() => document.querySelectorAll('.__c').forEach((e) => e.remove()));
const shot = (name, opts = {}) => page.screenshot({ path: `${OUT}/${name}`, ...opts });
const clipOf = async (sel, pad = 8, extra = {}) => { const b = await page.locator(sel).first().boundingBox(); return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(W - Math.max(0, b.x - pad), b.width + pad * 2), height: Math.min(H - Math.max(0, b.y - pad), b.height + pad * 2), ...extra }; };
const noToast = () => page.locator('.toast').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
const wait = (ms) => page.waitForTimeout(ms);
const busyDone = () => page.waitForFunction(() => !document.querySelector('.busy'));
const esc = async () => { await page.keyboard.press('Escape'); await wait(150); };
async function compose(outName, left, right, labels = ['Önce', 'Sonra']) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font:600 16px system-ui"><div style="display:flex;flex-direction:column;gap:10px;padding:12px;width:1416px">
  <figure style="margin:0"><div style="margin:0 0 6px;color:#6b7280">${labels[0]}</div><img src="${left}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure>
  <div style="text-align:center;font-size:34px;line-height:1;color:#2f6fed">↓</div>
  <figure style="margin:0"><div style="margin:0 0 6px;color:#6b7280">${labels[1]}</div><img src="${right}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure></div></body>`;
  const f = `${OUT}/__c.html`; writeFileSync(f, html);
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: W, height: 1400 }); await p2.goto('file://' + f); await p2.waitForTimeout(300);
  const b = await p2.locator('body > div').boundingBox(); await p2.screenshot({ path: `${OUT}/${outName}`, clip: { x: 0, y: 0, width: W, height: Math.ceil(b.height + 24) } });
  await p2.close(); unlinkSync(f);
}
async function composeSide(outName, left, right, labels = ['Önce', 'Sonra'], leftW = 380) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font:600 16px system-ui"><div style="display:flex;gap:14px;padding:12px;width:1416px;align-items:flex-start">
  <figure style="margin:0;flex:0 0 ${leftW}px"><div style="margin:0 0 6px;color:#6b7280">${labels[0]}</div><img src="${left}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure>
  <div style="font-size:34px;line-height:1;color:#2f6fed;align-self:center">→</div>
  <figure style="margin:0;flex:1;min-width:0"><div style="margin:0 0 6px;color:#6b7280">${labels[1]}</div><img src="${right}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure></div></body>`;
  const f = `${OUT}/__c.html`; writeFileSync(f, html);
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: W, height: 1400 }); await p2.goto('file://' + f); await p2.waitForTimeout(300);
  const b = await p2.locator('body > div').boundingBox(); await p2.screenshot({ path: `${OUT}/${outName}`, clip: { x: 0, y: 0, width: W, height: Math.ceil(b.height + 24) } });
  await p2.close(); unlinkSync(f);
}
const up = 'input[accept*=".zip"]';
const manual = async (code) => { await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type(code); await page.keyboard.press('Enter'); await wait(150); };
const nameDialog = async (text) => { await page.waitForSelector('.modal.dialog input'); await page.locator('.modal.dialog input').fill(text); await page.keyboard.press('Enter'); await wait(300); };

// ---------- 0. Karşılama ----------
await page.goto(URL); await page.waitForSelector('.welcome');
// firma adı
await page.locator('button[title="Ayarlar"]').click(); await page.locator('input[placeholder="ABC LTD"]').fill('Deneme Yayıncılık'); await esc();
await annotate([{ sel: '.toolbar button:has-text("Yükle")', n: 1, pad: 6 }, { sel: 'main.welcome', n: 2, pad: -20, pos: 'in' }]);
await shot('01-karsilama.png'); await clear();
await annotate([{ sel: '.firm-select', n: 1 }, { sel: '.batch-select', n: 2 }]);
await shot('05-firma-donem.png', { clip: await clipOf('.toolbar', 6, { width: 760 }) }); await clear();
await page.locator('.firm-select').selectOption('__new'); await page.waitForSelector('.modal.dialog'); await page.locator('.modal.dialog input').fill('Deneme Yayıncılık');
await shot('05b-yeni-firma.png', { clip: await clipOf('.modal.dialog', 24) }); await esc();

// ---------- 1. Yükleme + ekran ----------
await page.locator(up).setInputFiles([...XMLS, `${DEMO}/xml/IRS2026000000001 - irsaliye.xml`, `${DEMO}/bozuk-fatura.xml`]);
await page.waitForSelector('.modal:has-text("Yükleme sonucu")'); await wait(200);
await shot('04-yukleme-sonucu.png', { clip: await clipOf('.modal:has-text("Yükleme sonucu")', 24) }); await esc();
await page.waitForSelector('.inv-frame'); await busyDone(); await noToast();
await page.waitForFunction(() => document.querySelector('.inv-frame')?.contentDocument?.body?.innerText?.length > 50);
await annotate([{ sel: '.toolbar', n: 1, pad: 2 }, { sel: '.viewer', n: 2, pad: -6, pos: 'in' }, { sel: '.side', n: 3, pad: -6, pos: 'in' }, { sel: '.bar', n: 4, pad: 2 }, { sel: '.view-zoom', n: 5 }]);
await shot('02-ekran.png'); await clear();
await annotate([{ sel: '.firm-select', n: 1 }, { sel: '.batch-select', n: 2 }, { sel: '.toolbar button:has-text("Yükle")', n: 3 }, { sel: '.progress', n: 4 }, { sel: '.layout-btn', n: 5 }, { sel: '.toolbar button:has-text("Önizle")', n: 6 }, { sel: '.toolbar button:has-text("Excel üret")', n: 7 }, { sel: '.toolbar button:has-text("Yazdır")', n: 8 }, { sel: '.toolbar button:has-text("Kurallar")', n: 9 }, { sel: '.toolbar button:has-text("Rehber")', n: 10 }, { sel: '.theme-btn', n: 11 }, { sel: 'button[title="Ayarlar"]', n: 12 }]);
await shot('03-ustcubuk.png', { clip: await clipOf('.toolbar', 6, { height: 72 }) }); await clear();

// ---------- 2. Panel ve alt çubuk ----------
await annotate([{ sel: '.detail', n: 1, pad: -4, pos: 'in' }, { sel: '.detail-code', n: 2, pos: 'tr' }, { sel: '.list-controls', n: 3 }, { sel: '#search', n: 4 }, { sel: '.list', n: 5, pad: -6, pos: 'in' }, { sel: '.files', n: 6 }, { sel: '.lines', n: 7 }]);
await shot('06-panel.png', { clip: await clipOf('.side', 6) }); await clear();
await annotate([{ sel: '.slots', n: 1, pad: 2 }, { sel: '.status.empty', n: 2 }, { sel: '.progress-card', n: 3 }, { sel: '.manual-box', n: 4 }]);
await shot('07-kisayol.png', { clip: await clipOf('.bar', 4) }); await clear();
// yuvaya kod yaz: Q = 770.03
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await wait(100);
await page.keyboard.type('770.03');
await annotate([{ sel: '.slot.editing', n: 1 }]);
await shot('07a-yuva-yaz.png', { clip: await clipOf('.bar', 4) }); await clear();
await page.keyboard.press('Enter'); await wait(200); await noToast();
// önce/sonra: Q ile atama
await page.keyboard.press('Home'); await wait(150);
await shot('__before.png', { clip: await clipOf('.bar', 4) });
await page.keyboard.press('q'); await wait(250); await noToast(); // varsayılan: faturada kalır
await annotate([{ sel: '.status.done', n: 1 }, { sel: '.side .row.done', n: 2 }]);
await shot('__after.png', { clip: await clipOf('.bar', 4) }); await clear();
await compose('07b-atama.png', '__before.png', '__after.png', ['Q tuşuna basmadan önce', 'Q tuşuna bastıktan sonra: kart renklendi, kod yazıldı; fatura ekranda kaldı']);
unlinkSync(`${OUT}/__before.png`); unlinkSync(`${OUT}/__after.png`);
// manuel giriş
await page.keyboard.press('ArrowRight'); await wait(100);
await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type('77'); await wait(150);
await annotate([{ sel: '.manual-input', n: 1 }, { sel: '.sugg', n: 2 }]);
await shot('08-manuel.png', { clip: await clipOf('.bar', 4) }); await clear(); await esc();
// satıcı ipucu: Telekom 2 kez ata, sonra diğer Telekom'a git
await page.locator('#search').fill('ay telekom'); await page.keyboard.press('Enter'); await wait(150);
await manual('770.03'); await manual('770.03'); await wait(100);
await page.locator('#search').fill(''); await wait(100);
await page.locator('#search').fill('ay telekom'); await page.keyboard.press('Enter'); await wait(150);
await page.keyboard.press('Tab'); await wait(200);
if (await page.locator('button.hint').count()) { await annotate([{ sel: 'button.hint', n: 1 }]); await shot('08b-ipucu.png', { clip: await clipOf('.detail', 6) }); await clear(); }
await page.locator('#search').fill(''); await wait(100);
// Tab ile atanmamışa atlama görseli: ilerleme kartı
await annotate([{ sel: '.progress-card', n: 1 }]);
await shot('09-ilerleme.png', { clip: await clipOf('.bar', 4) }); await clear();

// ---------- 3. Liste görünümü ----------
await page.locator('.layout-btn').click(); await page.waitForSelector('.listview'); await wait(200);
await annotate([{ sel: '.lv-head', n: 1, pad: 2 }, { sel: '.lv-table thead tr', n: 2, pad: 0 }, { sel: 'tr.current', n: 3, pad: 0 }, { sel: 'tr.current td.lv-code', n: 4, pos: 'tr' }]);
await shot('10-liste.png'); await clear();
// toplu seçim
await page.locator('.bulk-toggle').click(); await page.locator('button:has-text("Bu satıcıyı seç")').click(); await wait(150);
await page.locator('.bulk-input').fill('770.03');
await annotate([{ sel: '.bulk-toggle', n: 1 }, { sel: '.bulk-bar', n: 2 }, { sel: 'tr.row.selected', n: 3, pad: 0 }]);
await shot('11-toplu.png', { clip: { x: 0, y: 48, width: W, height: 520 } }); await clear();
await page.locator('.bulk-bar button:has-text("seçili")').click(); await wait(100); await page.locator('.bulk-toggle').click(); await wait(100);
await page.locator('.layout-btn').click(); await page.waitForSelector('.inv-frame'); await wait(200);

// ---------- 4. Hesap kodu listesi ----------
await page.locator('button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Firma")').click();
await page.locator('button:has-text("Hesap kodu listesi")').click(); await page.waitForSelector('.acc-text');
await page.locator('.acc-text').fill('153 Ticari mallar\n740.01 Hizmet üretim: temizlik\n760.02 Pazarlama: kargo ve nakliye\n770.01 Genel yönetim: kırtasiye\n770.02 Genel yönetim: elektrik\n770.03 Genel yönetim: haberleşme\n770.05 Genel yönetim: danışmanlık\n770.09 Genel yönetim: mutfak ve ikram');
await page.locator('button:has-text("Listeye ekle")').click(); await wait(250); await noToast();
await annotate([{ sel: 'button:has-text("Excel / CSV\'den yükle")', n: 1 }, { sel: '.acc-text', n: 2 }, { sel: '.acc-list', n: 3 }]);
await shot('12-hesap-listesi.png', { clip: await clipOf('.modal', 16) }); await clear(); await esc();
await page.keyboard.press('Control+Period'); await page.waitForSelector('.chart-pop'); await page.keyboard.type('kargo'); await wait(150);
await annotate([{ sel: '.chart-input', n: 1 }, { sel: '.chart-row.active', n: 2 }]);
await shot('12b-ctrl-nokta.png', { clip: await clipOf('.chart-pop', 16) }); await clear(); await esc();

// ---------- 5. Kurallar ----------
// panelde kural yap düğmesi (telekom atanmış bir faturada)
await page.locator('#search').fill('ay telekom'); await page.keyboard.press('Enter'); await wait(150); await page.locator('#search').fill('');
await page.keyboard.press('Control+Home'); await wait(150);
if (await page.locator('.rule-make').count()) { await annotate([{ sel: '.rule-make', n: 1 }]); await shot('13-kural-yap.png', { clip: await clipOf('.detail', 6) }); await clear(); }
await page.locator('#search').fill('LZT2026000000002'); await page.keyboard.press('Enter'); await wait(200); await page.locator('#search').fill('');
await annotate([{ sel: '.line-rule >> nth=1', n: 1 }]); await shot('__a.png', { clip: await clipOf('.detail', 6) }); await clear();
await page.locator('.line-rule').nth(1).click(); await page.waitForSelector('.modal.quick-rule'); await wait(200);
await annotate([{ sel: '.qgroup', n: 2, pad: 2 }, { sel: '.qgroup.qline >> nth=1', n: 3, pad: 2 }, { sel: '.qsummary', n: 4, pad: 2 }, { sel: '.modal.quick-rule .rule-then', n: 5, pad: 2 }, { sel: '.quick-advanced', n: 6 }]); await shot('__b.png', { clip: await clipOf('.modal.quick-rule', 12) }); await clear();
await composeSide('13b-kalemden-kural.png', '__a.png', '__b.png', ['Panelde kalemler: yumurtanın yanındaki ⚡', '"Bu faturadan kural": kalem "Yumurta" + miktar ≥ 3.000 işaretli geldi; eşiği, rozetleri ve kodu siz tamamlarsınız']); unlinkSync(`${OUT}/__a.png`); unlinkSync(`${OUT}/__b.png`);
await esc(); await wait(150); await page.keyboard.press('Control+Home'); await wait(150);
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules');
const kind = async (i, k) => page.locator('.cond-kind').nth(i).locator(`[data-k="${k}"]`).click();
// kalıcı: unvan "hızlı kargo" → 760.02
await kind(0, 'name'); await page.locator('.cond-text').first().fill('hızlı kargo'); await page.locator('.rule-code').fill('760.02'); await page.locator('.rule-code').press('Enter'); await wait(300); await noToast();
// döneme özel: VKN 5670000005 → 770.09 (kalıcının yerine geçer; not görünür)
await page.locator('.scope-seg button').nth(1).click();
await kind(0, 'vkn'); await page.locator('.cond-text').first().fill('5670000005'); await page.locator('.rule-code').fill('770.09'); await page.locator('.rule-code').press('Enter'); await wait(300); await noToast();
await page.locator('.scope-seg button').nth(0).click();
// kalıcı, iki koşullu: kalem "yumurta" + miktar ≥ 1000 → 153 (satış için alınan)
await kind(0, 'item'); await page.locator('.cond-text').first().fill('yumurta'); await page.locator('.add-cond').click(); await kind(1, 'qty'); await page.locator('.cond-min').fill('1000');
await page.locator('.rule-code').fill('153'); await page.locator('.rule-code').press('Enter'); await wait(300); await noToast();
// kurucuda (kaydedilmemiş): kalem "yumurta" + miktar ≤ 999 → 770.09 (ikram)
await kind(0, 'item'); await page.locator('.cond-text').first().fill('yumurta'); await page.locator('.add-cond').click(); await kind(1, 'qty'); await page.locator('.cond-max').fill('999'); await page.locator('.rule-code').fill('770.09'); await wait(150);
await annotate([{ sel: '.scope-seg', n: 1 }, { sel: '.cond-row', n: 2, pad: 2 }, { sel: '.add-cond', n: 3 }, { sel: '.rule-then', n: 4, pad: 2 }, { sel: '.rule-preview', n: 5, pad: 2 }, { sel: '.rule-list', n: 6 }, { sel: '.override-note', n: 7, pos: 'tr' }, { sel: 'button:has-text("Kuralları dışa aktar")', n: 8 }]);
await shot('13-kurallar.png', { clip: await clipOf('.modal.rules', 12) }); await clear();
await page.locator('.rule-code').press('Enter'); await wait(300); await esc(); await noToast();

// ---------- 6. Önizleme, şablon ----------
await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide'); await wait(200);
await annotate([{ sel: '.legend', n: 1 }, { sel: 'th.code-col', n: 2 }, { sel: 'tr.lvl-high', n: 3, pad: 0, pos: 'bl' }, { sel: '.modal.wide thead tr', n: 4, pad: 0, pos: 'tr' }]);
await shot('14-onizleme.png'); await clear();
// verilen çıktılar: Excel üret → kayıt, pencere
await esc(); await Promise.all([page.waitForEvent('download').catch(() => {}), page.keyboard.press('F1')]); await wait(400); await noToast();
await page.locator('.toolbar [data-act="exports"]').click(); await page.waitForSelector('.exports-modal'); await wait(200);
await annotate([{ sel: '.exp-rec.on', n: 1 }, { sel: '.exp-flagged th:has-text("Şimdi")', n: 2, pos: 'tr' }, { sel: '.exports-modal button:has-text("Gez")', n: 3 }]);
await shot('14b-ciktilar.png', { clip: await clipOf('.exports-modal', 8) }); await clear(); await esc();
await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide'); await wait(200);
await page.locator('button:has-text("Şablon penceresi")').click(); await page.waitForSelector('.tpl-modal'); await wait(200);
await annotate([{ sel: '.tpl-scopes', n: 1 }, { sel: '.tpl-mode', n: 2 }, { sel: '.tpl-preview thead tr', n: 3, pad: 0 }, { sel: '.tpl-modal button:has-text("Geri al")', n: 4 }, { sel: '.tpl-preview th.code-col', n: 5, pos: 'tr' }]);
await shot('15-sablon.png'); await clear(); await esc();

// ---------- 7. Yazdırma ----------
await page.locator('.toolbar button:has-text("Yazdır")').click(); await page.waitForSelector('.print-modal'); await page.waitForSelector('.print-preview-frame'); await wait(300);
await page.locator('label:has-text("Tümü (") input').check(); await wait(200);
await page.locator('.print-row').nth(2).hover(); await wait(300);
await annotate([{ sel: '.print-opts fieldset:has-text("Hangi faturalar")', n: 1 }, { sel: '.print-opts fieldset:has-text("Süz")', n: 2 }, { sel: '.print-opts fieldset:has-text("Sıra")', n: 3 }, { sel: '.print-opts fieldset:has-text("Sayfa")', n: 4 }, { sel: '.print-list', n: 5, pad: -4, pos: 'in' }, { sel: '.print-preview', n: 6, pad: -4, pos: 'in' }, { sel: '.print-modal .modal-head button.primary', n: 7 }]);
await shot('16-yazdir.png'); await clear(); await esc();

// ---------- 8. Ayarlar, yedek, taşıma ----------
await page.locator('button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Firma")').click(); await wait(150);
await annotate([{ sel: '.settings-tabs', n: 1, pad: 2 }, { sel: '.shortcut-grid', n: 2 }, { sel: '.settings-links', n: 3 }]);
await shot('17-ayarlar.png', { clip: await clipOf('.modal.settings', 12) }); await clear();
await page.locator('.settings-tabs button:has-text("Yedek")').click(); await page.waitForSelector('.store-row'); await wait(150);
await annotate([{ sel: 'button:has-text("Dışa aktar (.json)")', n: 1 }, { sel: 'button:has-text("İçe aktar")', n: 2 }, { sel: 'fieldset:has-text("Depolama")', n: 3, pad: 2 }]);
await shot('18-yedek.png', { clip: await clipOf('.modal.settings', 12) }); await clear();
await page.locator('.settings-tabs button:has-text("Dönem")').click(); await wait(150);
await shot('18b-donem.png', { clip: await clipOf('.modal.settings', 12) }); await esc();
// Küçük ekran: 1024×768 (sıkışık yerleşim, %85 ölçek), dar pencerede ⋯ menüsü
await page.setViewportSize({ width: 1024, height: 768 }); await wait(500); await page.keyboard.press('Home'); await wait(300);
await page.locator('.panel-divider').hover(); await wait(100);
await annotate([{ sel: '.toolbar', n: 1, pad: 2 }, { sel: '.detail-rows', n: 2, pad: 2 }, { sel: '.slots', n: 3, pad: 2 }, { sel: '.panel-divider', n: 4, pad: 2 }]);
await shot('22-kucuk-ekran.png'); await clear();
await page.setViewportSize({ width: 820, height: 600 }); await wait(500); await page.locator('.tb-more').click(); await page.waitForSelector('.tb-menu'); await wait(150);
await annotate([{ sel: '.tb-more', n: 1 }, { sel: '.tb-menu', n: 2, pad: 2 }]);
await shot('22b-menu.png', { clip: { x: 300, y: 0, width: 520, height: 260 } }); await clear(); await esc();
await page.setViewportSize({ width: W, height: H }); await wait(500);
// Ayarlar › Ekran: gerçekçi bir dizüstü (1366×768, Windows ölçeği %125) ayrı bağlamda; fatura gerekmez
{
  const c2 = await browser.newContext({ viewport: { width: 1093, height: 614 }, deviceScaleFactor: 1.25 });
  const p2 = await c2.newPage(); await p2.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
  await p2.goto(URL); await p2.waitForSelector('.welcome');
  await p2.locator('button[title="Ayarlar"]').click(); await p2.locator('.settings-tabs button:has-text("Ekran")').click(); await p2.waitForTimeout(200);
  await annotate([{ sel: 'fieldset:has-text("Bu bilgisayarın ekranı")', n: 1, pad: 2 }, { sel: 'fieldset:has-text("Arayüz ölçeği")', n: 2, pad: 2 }, { sel: 'fieldset:has-text("Yerleşim")', n: 3, pad: 2 }], p2);
  const b = await p2.locator('.modal.settings').boundingBox();
  await p2.screenshot({ path: `${OUT}/17b-ekran.png`, clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: Math.min(1093, b.width + 24), height: Math.min(614 - Math.max(0, b.y - 12), b.height + 24) } });
  await c2.close();
}
// taşıma penceresi için ikinci firma
await page.locator('.firm-select').selectOption('__new'); await nameDialog('Örnek Kırtasiye Ltd.');
const first = await page.locator('.firm-select option:has-text("Deneme")').getAttribute('value'); await page.locator('.firm-select').selectOption(first); await wait(400); await page.waitForSelector('.inv-frame');
await page.locator('.files button:has-text("taşı")').click(); await page.waitForSelector('.modal:has-text("ya da döneme taşı")');
await shot('19-tasi.png', { clip: await clipOf('.modal:has-text("ya da döneme taşı")', 16) }); await esc();

// ---------- 9. Tamamlandı ve koyu tema ----------
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules'); await esc();
// kalanları toplu ata
await page.locator('.bulk-toggle').click(); await page.locator('.filter-select').selectOption('unassigned'); await wait(100); await page.locator('button:has-text("Görünenleri seç")').click();
await page.locator('.bulk-input').fill('770.01'); await page.keyboard.press('Enter'); await wait(300); await page.locator('.filter-select').selectOption('all'); await page.locator('.bulk-toggle').click(); await noToast();
await annotate([{ sel: '.progress-card.complete', n: 1 }]);
await shot('20-tamamlandi.png', { clip: await clipOf('.bar', 4) }); await clear();
await page.locator('.theme-btn').click(); await wait(300); await page.keyboard.press('Home'); await wait(200);
await shot('21-koyu.png'); await page.locator('.theme-btn').click(); await wait(200);
console.log('görseller:', readdirSync(OUT).length, 'dosya →', OUT);
await browser.close();
