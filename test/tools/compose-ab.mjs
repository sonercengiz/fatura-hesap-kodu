// Önce/sonra kareleri alt alta: node test/tools/compose-ab.mjs <önce klasörü|-> <sonra klasörü> <çıktı klasörü> <önek> ad[=başlık] ...
// Önce dosyası yoksa yalnızca "Sonra" çizilir.
import { chromium } from 'playwright';
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
const [, , BEFORE, AFTER, OUT, PREFIX, ...items] = process.argv;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1480, height: 2400 } });
for (const it of items) {
  const [name, title = ''] = it.split('=');
  const b = BEFORE !== '-' && existsSync(`${BEFORE}/${name}.png`) ? `${BEFORE}/${name}.png` : null;
  const a = `${AFTER}/${name}.png`;
  const fig = (src, label) => `<figure style="margin:0"><div style="margin:0 0 6px;color:#6b7280">${label}</div><img src="file://${src}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure>`;
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font:600 18px system-ui"><div style="display:flex;flex-direction:column;gap:10px;padding:16px;width:1448px">
    ${title ? `<div style="font-size:20px;color:#1d2330">${title}</div>` : ''}
    ${b ? fig(b, 'Önce') + '<div style="text-align:center;font-size:34px;line-height:1;color:#2f6fed">↓</div>' : ''}${fig(a, b ? 'Sonra' : 'Yeni')}</div></body>`;
  const f = `${OUT}/__c.html`; writeFileSync(f, html);
  await page.goto('file://' + f); await page.waitForLoadState('load'); await page.waitForTimeout(200);
  const box = await page.locator('body > div').boundingBox();
  await page.screenshot({ path: `${OUT}/${PREFIX}${name}.png`, clip: { x: 0, y: 0, width: 1480, height: Math.ceil(box.y + box.height + 8) } });
  unlinkSync(f);
}
await browser.close();
console.log('tamam');
