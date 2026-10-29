// Yeni/az bakılmış pencerelerin koyu tema denetimi
import { chromium } from 'playwright';
import { readdirSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const DEMO = process.env.DEMO_DIR;
const XMLS = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/^IRS|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 840 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('theme', 'dark'); } catch {} });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const esc = async () => { await page.keyboard.press('Escape'); await wait(200); };
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(XMLS); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy')); await wait(300);
await page.locator('.theme-btn').click(); await wait(300);
// Taşı
await page.locator('.files button:has-text("Taşı")').click(); await page.waitForSelector('.modal'); await wait(200); await shot('tasi'); await esc();
// Özel şablon sil onayı
await page.locator('.toolbar .excel-tpl').click(); await page.waitForSelector('.tpl-modal'); await page.locator('.tpl-scope', { hasText: 'Bu firma' }).click(); await wait(150);
await page.locator('.tpl-make').click(); await wait(200); await page.locator('button:has-text("Özel şablonu sil")').click(); await page.waitForSelector('.modal.dialog'); await wait(150); await shot('sablon-sil-onay'); await esc(); await esc();
// Ayarlar › Yedek, Dönem
await page.locator('.toolbar button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Yedek")').click(); await wait(200); await shot('ayar-yedek');
await page.locator('.settings-tabs button:has-text("Dönem")').click(); await wait(200); await shot('ayar-donem'); await esc();
// Hızlı kural, hesap listesi
await page.locator('.rule-make').click().catch(() => {}); await wait(300); if (await page.locator('.modal').count()) { await shot('hizli-kural'); await esc(); }
await page.keyboard.press('Control+.'); await wait(300); await shot('hesap-listesi'); await esc();
// Liste + Çıktılar
await page.locator('.toolbar button:has-text("Liste")').click(); await page.waitForSelector('.listview'); await wait(300); await shot('liste');
await browser.close(); console.log('tamam');
