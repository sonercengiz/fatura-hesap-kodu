// Ekrana uyum: kendiliğinden ölçek + sıkışık yerleşim, ⋯ taşma menüsü, Ayarlar › Ekran, panel sürükleme, tercihlerin bu bilgisayarda kalması
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { SCRATCH, XML_DIR } from './paths.mjs';
const S = SCRATCH;
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
const log = (...a) => console.log(...a);
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy'));
const state = () => page.evaluate(() => ({
  zoom: document.documentElement.style.zoom || '1', cls: document.querySelector('.app').className,
  toolbarH: Math.round(document.querySelector('.toolbar').getBoundingClientRect().height),
  hidden: [...document.querySelectorAll('[data-act].tb-hidden')].map((x) => x.dataset.act),
  more: !document.querySelector('.tb-more').classList.contains('tb-hidden'),
  listRows: Math.floor(document.querySelector('.list').getBoundingClientRect().height / document.querySelector('.row').getBoundingClientRect().height),
  panelW: getComputedStyle(document.querySelector('.app')).getPropertyValue('--panel-w').trim(), sideW: Math.round(document.querySelector('.side').getBoundingClientRect().width),
  slotsOneRow: new Set([...document.querySelectorAll('.slot')].map((s) => Math.round(s.getBoundingClientRect().top))).size === 1,
}));
log('1024×768:', JSON.stringify(await state()));
// Dar pencere: ⋯ menüsü ve içindekiler
await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(400);
const s800 = await state(); log('800×600:', JSON.stringify(s800));
await page.locator('.tb-more').click(); await page.waitForSelector('.tb-menu');
log('⋯ menüsü:', (await page.locator('.tb-menu-item').allInnerTexts()).map((t) => t.replace(/\n/g, ' ')).join(' | '));
// Menü gerçekten görünür mü (üst çubuk taşmayı kırpar; menü sabit konumda çubuğun dışında olmalı)
log('menü görünür (elementFromPoint):', await page.evaluate(() => { const m = document.querySelector('.tb-menu-item'); const r = m.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el && (el === m || m.contains(el)); }), '| menü ⋯ düğmesinin altında:', await page.evaluate(() => { const b = document.querySelector('.tb-more').getBoundingClientRect(); const m = document.querySelector('.tb-menu').getBoundingClientRect(); return m.top > b.bottom && Math.abs(m.right - b.right) < 8; }));
await page.locator('.tb-menu-item:has-text("Rehber")').click(); await page.waitForSelector('.modal.guide'); log('menüden Rehber açıldı:', await page.locator('.modal.guide').count()); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.locator('.tb-more').click(); await page.waitForSelector('.tb-menu'); await page.keyboard.press('Escape'); await page.waitForTimeout(100); log('Esc menüyü kapattı:', (await page.locator('.tb-menu').count()) === 0);
// Çok dar: yığılı
await page.setViewportSize({ width: 700, height: 600 }); await page.waitForTimeout(400);
log('700×600 yığılı:', (await state()).cls.includes('stacked'), '| panel görüntünün altında:', await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().top > document.querySelector('.viewer').getBoundingClientRect().top + 100));
// Geniş pencereye dönünce menü kaybolur, ferah yerleşim
await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(400);
const sw = await state(); log('1600×1000:', JSON.stringify({ zoom: sw.zoom, cls: sw.cls, hidden: sw.hidden, more: sw.more, slotsOneRow: sw.slotsOneRow }));
// Ayarlar › Ekran
await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(400);
await page.locator('.toolbar button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Ekran")').click(); await page.waitForTimeout(150);
log('ekran bilgisi:', await page.locator('fieldset:has-text("Bu bilgisayarın ekranı") b').first().innerText());
log('durum satırı:', (await page.locator('fieldset:has-text("Bu bilgisayarın ekranı") .muted').innerText()).slice(0, 90));
await page.locator('.scale-row label:has-text("%100") input').check(); await page.waitForTimeout(300);
const s100 = await state(); log('%100 seçildi → zoom:', s100.zoom, '| hidden:', s100.hidden, '| listRows:', s100.listRows);
await page.locator('label:has-text("Ferah") input').check(); await page.waitForTimeout(300);
log('Ferah seçildi → cls:', (await state()).cls, '| yuvalar tek sıra mı:', (await state()).slotsOneRow);
await page.locator('label:has-text("Kendiliğinden (şu an") input').first().check(); await page.locator('.scale-row label:has-text("Kendiliğinden") input').check(); await page.waitForTimeout(300);
log('kendiliğindene dönüş → zoom:', (await state()).zoom, '| cls:', (await state()).cls);
// Yenileme: tercih localStorage'da kalır; ayar yedeğe girmez
await page.locator('.scale-row label:has-text("%90") input').check(); await page.waitForTimeout(200);
log('localStorage:', await page.evaluate(() => localStorage.getItem('screenPrefs')));
await page.keyboard.press('Escape'); await page.reload(); await page.waitForSelector('.inv-frame'); await page.waitForTimeout(600);
log('yenileme sonrası zoom:', (await state()).zoom, '(0.9 bekleniyor)');
await page.evaluate(() => localStorage.setItem('screenPrefs', JSON.stringify({ uiScale: null, density: 'auto', panelW: null })));
// Panel sürükleme (çizgi): 320 → ~420, sonra çift tık varsayılan
await page.reload(); await page.waitForSelector('.inv-frame'); await page.waitForTimeout(600);
const d = await page.locator('.panel-divider').boundingBox(); const before = (await state()).panelW;
await page.mouse.move(d.x + 4, d.y + 200); await page.mouse.down(); await page.mouse.move(d.x - 100, d.y + 200, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
const after = await state(); log('panel sürükleme:', before, '→', after.panelW, '| side px:', after.sideW);
await page.locator('.toolbar button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Ekran")').click(); await page.waitForTimeout(150);
log('ayar metni:', await page.locator('fieldset:has-text("Liste paneli genişliği") span').first().innerText());
await page.locator('button:has-text("Varsayılana dön")').click(); await page.waitForTimeout(200); log('varsayılana dön:', (await state()).panelW); await page.keyboard.press('Escape');
await page.locator('.panel-divider').dblclick(); await page.waitForTimeout(100);
// Yazdırma medyasında zoom 1 (CSS kuralı var mı)
log('print zoom kuralı:', await page.evaluate(() => [...document.styleSheets].some((ss) => { try { return [...ss.cssRules].some((r) => r.media && /print/.test(r.media.mediaText) && /zoom/.test(r.cssText)); } catch { return false; } })));
await page.screenshot({ path: `${S}/shots/screen-e2e.png` });
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
