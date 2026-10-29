// Önce/sonra kareleri (tur 4 kalıbı): DEMO_DIR=<demo> [OP_XML=<operatör faturası>] node test/tools/shots.mjs <çıktı klasörü> [kare adları virgüllü]
// Önce: git stash push -- src ile eski kodda; sonra yeni kodda. Birleştirme: compose-ab.mjs. Uygulama 5179'da açık olmalı.
import { chromium } from 'playwright';
import { readdirSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2];
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
mkdirSync(OUT, { recursive: true });
const DEMO = process.env.DEMO_DIR;
const XMLS = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/^IRS|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`).concat(process.env.OP_XML ? [process.env.OP_XML] : []);
const W = 1440, H = 840;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('backupRemind', 'off'); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const want = (n) => !ONLY || ONLY.has(n);
const shot = async (name, opts = {}) => { if (want(name)) await page.screenshot({ path: `${OUT}/${name}.png`, ...opts }); };
const clipOf = async (sel, pad = 6) => { const b = await page.locator(sel).first().boundingBox(); return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(W - Math.max(0, b.x - pad), b.width + pad * 2), height: Math.min(H - Math.max(0, b.y - pad), b.height + pad * 2) }; };
const esc = async () => { await page.keyboard.press('Escape'); await wait(200); };
const noToast = () => page.locator('.toast').waitFor({ state: 'hidden', timeout: 7000 }).catch(() => {});
const manual = async (code) => { await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type(code); await page.keyboard.press('Enter'); await wait(150); };

await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(XMLS); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy')); await wait(400);
// yuvalar: Q = 770.03, W = 760.01
for (const [i, code] of [[0, '770.03'], [1, '760.01']]) { await page.locator('.slot').nth(i).hover(); await page.locator('.slot').nth(i).locator('.slot-icon.edit').click(); await wait(100); await page.keyboard.type(code); await page.keyboard.press('Enter'); await wait(200); }
await page.keyboard.press('Home'); await wait(100);
await page.keyboard.press('q'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('w'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('q'); await page.keyboard.press('ArrowRight'); await manual('191.01'); await wait(200);
// KDV dökümü: Güncel oranlar + Diğer
await page.locator('.toolbar .excel-tpl').click(); await page.waitForSelector('.tpl-modal');
await page.locator('.tpl-vat label', { hasText: 'Güncel oranlar' }).locator('input').check(); await wait(200);
await esc(); await noToast();

async function round(sfx) {
  // üst çubuk
  await shot(`ust-cubuk${sfx}`, { clip: await clipOf('.toolbar', 0) });
  // liste
  await page.locator('.toolbar button:has-text("Liste")').click(); await page.waitForSelector('.listview'); await wait(300);
  await shot(`liste${sfx}`);
  const empt = page.locator('.lv-empty');
  if (await empt.count()) { await empt.click(); await wait(250); await page.locator('.lv-table').evaluate((e) => (e.scrollLeft = e.scrollWidth)); await wait(150); await shot(`liste-bos${sfx}`); await page.locator('.lv-table').evaluate((e) => (e.scrollLeft = 0)); await empt.click(); await wait(150); }
  // önizleme
  await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide .legend'); await wait(400);
  await shot(`onizleme${sfx}`);
  await esc();
  // şablon (Basit + Gelişmiş)
  await page.locator('.toolbar .excel-tpl').click(); await page.waitForSelector('.tpl-modal'); await wait(300);
  await page.locator('.tpl-mode button:has-text("Basit")').click(); await wait(250);
  await shot(`sablon-basit${sfx}`);
  await page.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await wait(250);
  await shot(`sablon-gelismis${sfx}`);
  await page.locator('.tpl-mode button:has-text("Basit")').click(); await wait(150);
  await esc();
  await page.locator('.toolbar button:has-text("Görsel")').click(); await wait(300);
}
await round('');
// sürükleme anı (liste): Tutar başlığını Fatura Tarihi'nin sol yarısına sürüklerken
if (want('surukle')) {
  await page.locator('.toolbar button:has-text("Liste")').click(); await page.waitForSelector('.listview'); await wait(300);
  const src = page.locator('.lv-table th.hdr-edit', { hasText: 'Tutar' }).first();
  const dst = page.locator('.lv-table th.hdr-edit', { hasText: 'Fatura Tarihi' }).first();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await src.dispatchEvent('dragstart', { dataTransfer: dt });
  const b = await dst.boundingBox();
  await dst.dispatchEvent('dragover', { dataTransfer: dt, clientX: b.x + 4, clientY: b.y + b.height / 2 }); await wait(150);
  await shot('surukle', { clip: { x: 0, y: 40, width: W, height: 260 } });
  await dst.dispatchEvent('dragleave', { dataTransfer: dt }); await src.dispatchEvent('dragend', { dataTransfer: dt }); await wait(100);
  await page.locator('.toolbar button:has-text("Görsel")').click(); await wait(300);
}
// H2: gri alanı işaretleme (keep) + kutu partial; KDV Yok iken sayı
if (want('sablon-keep')) {
  await page.locator('.toolbar .excel-tpl').click(); await page.waitForSelector('.tpl-modal'); await wait(300);
  await page.locator('.tpl-simple .tpl-check', { hasText: 'Geliş Zamanı' }).locator('input').check(); await wait(300);
  await shot('sablon-keep');
  await page.locator('.tpl-simple .tpl-check', { hasText: 'Geliş Zamanı' }).locator('input').uncheck(); await wait(200);
  await page.locator('.tpl-vat label', { hasText: 'Yok' }).locator('input').check(); await wait(300);
  await page.locator('.tpl-groups').evaluate((e) => (e.scrollTop = 0)); await shot('sablon-kdv-yok');
  await page.keyboard.press('Control+z'); await wait(200); await page.keyboard.press('Control+z'); await wait(200);
  await esc();
}
// H3: lejant çipinden susturma; liste Dikkat sütunu (sağa kaydırılmış)
if (want('onizleme-sustur')) {
  await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide .legend'); await wait(300);
  await page.locator('.modal.wide .legend button.lg', { hasText: 'Hesap kodu atanmamış' }).click(); await wait(300);
  await shot('onizleme-sustur');
  await page.locator('.modal.wide .legend button.lg', { hasText: 'Hesap kodu atanmamış' }).click(); await wait(200);
  await esc();
}
if (want('liste-dikkat')) {
  await page.locator('.toolbar button:has-text("Liste")').click(); await page.waitForSelector('.listview'); await wait(300);
  await page.locator('.lv-table').evaluate((e) => (e.scrollLeft = e.scrollWidth)); await wait(200);
  await shot('liste-dikkat', { clip: { x: 0, y: 120, width: W, height: 420 } });
  await page.locator('.lv-table').evaluate((e) => (e.scrollLeft = 0));
  await page.locator('.toolbar button:has-text("Görsel")').click(); await wait(300);
}
// H4: Excel üret → bildirim, Çıktılar penceresi, tur şeridi (açık ve koyu)
async function ciktiShots(sfx) {
  await Promise.all([page.waitForEvent('download'), page.keyboard.press('F1')]); await wait(400);
  await shot(`cikti-bildirim${sfx}`, { clip: { x: 0, y: H - 200, width: W, height: 200 } });
  await noToast();
  await page.locator('.toolbar [data-act="exports"]').click(); await page.waitForSelector('.exports-modal'); await wait(300);
  await shot(`cikti-pencere${sfx}`);
  await page.locator('.exports-modal button.primary', { hasText: 'Gez' }).click(); await wait(300);
  await page.keyboard.press('Tab'); await wait(200);
  await shot(`cikti-tur${sfx}`, { clip: { x: 0, y: 0, width: W, height: 330 } });
  await page.keyboard.press('Escape'); await wait(200);
}
if (want('cikti-pencere')) await ciktiShots('');
// Durum sütunu (liste başı) ve tur sonu
if (want('liste-durum')) {
  await page.locator('.toolbar button:has-text("Liste")').click(); await page.waitForSelector('.listview'); await wait(300);
  const st = page.locator('.lv-table .st-warn').first();
  if (await st.count()) { await st.hover(); await wait(1200); }
  await shot('liste-durum', { clip: { x: 0, y: 120, width: W, height: 560 } });
  await page.locator('.toolbar button:has-text("Görsel")').click(); await wait(300);
}
if (want('tur-son')) {
  await Promise.all([page.waitForEvent('download'), page.keyboard.press('F1')]); await wait(300); await noToast();
  await page.locator('.toolbar [data-act="exports"]').click(); await page.waitForSelector('.exports-modal'); await wait(200);
  await page.locator('.exports-modal button.primary', { hasText: 'Gez' }).click(); await wait(300);
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); await wait(120); }
  await wait(200); await shot('tur-son', { clip: { x: 0, y: 0, width: W, height: 330 } });
  await page.keyboard.press('Escape'); await wait(200); await noToast();
}
// ayarlar › dönem
if (want('ayarlar-donem')) {
  await page.locator('.toolbar button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Dönem")').click(); await wait(250);
  await shot('ayarlar-donem'); await esc();
}
// koyu tema
await page.locator('.theme-btn').click(); await wait(400);
await round('-koyu');
if (want('cikti-pencere-koyu')) await ciktiShots('-koyu');
console.log(errors.length ? 'HATA: ' + errors.join(' | ') : 'tamam');
await browser.close();
