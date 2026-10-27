// Fatura görüntüsü: kenar boşluğu kırpma, kendiliğinden yakınlaştırma (üst yarı), Ctrl+tekerlek, −/+ düğmeleri, kalıcılık, "son kaldığım yer" ayarı
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/d64e6ff3-d5c6-481a-957e-cc3c595811d5/scratchpad';
const XML_DIR = process.env.XML_DIR || `${S}/xmlin`;
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy'));
const log = (...a) => console.log(...a);
const go = async (no) => { await page.locator('#search').fill(no); await page.keyboard.press('Enter'); await page.locator('#search').blur(); await page.waitForTimeout(700); };
const info = async () => page.evaluate(() => {
  const f = document.querySelector('.inv-frame'); const d = f.contentDocument; const st = d.getElementById('__view')?.textContent ?? '';
  const z = /zoom:([\d.]+)/.exec(st)?.[1]; const m = /margin:(-?[\d.]+)px 0 0 (-?[\d.]+)px/.exec(st);
  // görünen ilk metnin çerçeve içindeki konumu (kırpma işe yaradı mı)
  const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT); let n, first = null; while ((n = w.nextNode())) { if (n.textContent.trim()) { const r = d.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (b.width > 0) { first = first ? { x: Math.min(first.x, b.left), y: Math.min(first.y, b.top) } : { x: b.left, y: b.top }; } } }
  return { zoom: z, top: m?.[1], left: m?.[2], firstText: first, frame: { w: f.clientWidth, h: f.clientHeight }, scrollH: d.documentElement.scrollHeight, badge: document.querySelector('.view-zoom .zoom-pct')?.textContent };
});
await go('ES12026000088979'); log('ENERJİSA:', JSON.stringify(await info()));
await go('A012026000365490'); const t = await info(); log('Turkcell:', JSON.stringify(t));
// Ctrl + tekerlek (çerçeve içinde) → yakınlaştırma değişir ve ayara yazılır
const fb = await page.locator('.inv-frame').boundingBox();
await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await page.waitForTimeout(400);
const after = await info(); log('Ctrl+tekerlek sonrası:', after.zoom, after.badge, '| önce:', t.zoom);
// − düğmesi, sonra "oto"ya dönüş
await page.locator('.view-zoom button').first().click(); await page.waitForTimeout(300); log('− sonrası:', (await info()).badge);
await page.locator('.view-zoom .zoom-pct').click(); await page.waitForTimeout(300); log('oto sonrası:', (await info()).badge);
// sabit ver (+ düğmesi), yenile → korunmalı; başka faturada da aynı
await page.locator('.view-zoom button').nth(2).click(); await page.waitForTimeout(300);
const fixed = (await info()).badge; await page.reload(); await page.waitForSelector('.inv-frame'); await page.waitForTimeout(900);
log('yenileme sonrası:', (await info()).badge, '(bekl.', fixed, ')'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(700); log('sonraki faturada:', (await info()).badge);
// Ayarlar › Görünüm: yakınlaştırma satırı ve kendiliğinden'e dön
await page.locator('.toolbar button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Görünüm")').click();
log('ayar metni:', (await page.locator('fieldset:has-text("yakınlaştırma") span').first().innerText()));
// çerçeve dışında (görüntü kenarı) Ctrl+tekerlek de çalışmalı: ayarları kapat, kenara git
await page.keyboard.press('Escape'); await page.waitForTimeout(200); const vb = await page.locator('.inv-view').boundingBox(); await page.mouse.move(vb.x + 4, vb.y + vb.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, 300); await page.keyboard.up('Control'); await page.waitForTimeout(300); log('kenarda Ctrl+tekerlek (uzaklaştır):', (await info()).badge);
await page.locator('.toolbar button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Görünüm")').click();
await page.locator('button:has-text("Kendiliğinden\'e dön")').click(); await page.waitForTimeout(200);
// "Son kaldığım yerden" seç, kaydır, geç, geri gel
await page.locator('label:has-text("Son kaldığım yerden") input').check(); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('.inv-frame').contentWindow.scrollTo(0, 400)); await page.waitForTimeout(150);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(700);
log('son kaldığım yer (scrollY):', await page.evaluate(() => document.querySelector('.inv-frame').contentWindow.scrollY), '(400 bekleniyor)', '| oto rozet:', (await info()).badge);
// yazdırma stili: ekran dışı kırpma yok
log('print medyasında zoom:', await page.evaluate(() => { const d = document.querySelector('.inv-frame').contentDocument; return d.getElementById('__view').textContent.startsWith('@media screen'); }));
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
