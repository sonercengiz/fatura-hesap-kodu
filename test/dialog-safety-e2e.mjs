// Eleştiri turu B18: yıkıcı onayda (Çıkar/Sil) odak Vazgeç'te, Enter silmez; Tab ile Sil'e geçip Enter siler.
// Yıkıcı olmayan onayda (Görselleri arşivle) Enter = Evet aynen.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/db47f010-e6ef-41e1-8024-b002bf7dd1fd/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const count = () => a.locator('.list .row').count();
const focused = () => a.evaluate(() => document.activeElement?.textContent?.trim() ?? '');

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);
const n0 = await count();

await a.locator('.files button:has-text("çıkar")').first().click(); await a.waitForSelector('.modal.dialog');
check('yıkıcı onayda odak Vazgeç\'te', (await focused()).startsWith('Vazgeç'), await focused());
check('Sil düğmesinde Enter ipucu yok', (await a.locator('.modal.dialog button.danger kbd').count()) === 0, await a.locator('.modal.dialog button.danger').innerText());
await a.keyboard.press('Enter'); await a.waitForTimeout(400);
check('Enter: pencere kapandı, fatura silinmedi', (await a.locator('.modal.dialog').count()) === 0 && (await count()) === n0, `${await a.locator('.modal.dialog').count()} pencere, ${await count()}/${n0}`);

await a.locator('.files button:has-text("çıkar")').first().click(); await a.waitForSelector('.modal.dialog');
await a.keyboard.press('Tab'); check('Tab → Çıkar', (await focused()).startsWith('Çıkar'), await focused());
await a.keyboard.press('Enter'); await a.waitForTimeout(500);
check('Tab + Enter: çıkarıldı', (await count()) === n0 - 1, `${await count()}/${n0}`);

await a.locator('.files button:has-text("çıkar")').first().click(); await a.waitForSelector('.modal.dialog');
await a.keyboard.press('Escape'); await a.waitForTimeout(300);
check('Esc: vazgeçildi', (await count()) === n0 - 1 && (await a.locator('.modal.dialog').count()) === 0, await count());

// Yıkıcı olmayan onay: Enter = Evet
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click();
await a.locator('button:has-text("Görselleri arşivle")').first().click(); await a.waitForSelector('.modal.dialog');
check('arşiv onayında Enter ipucu var', (await a.locator('.modal.dialog button.primary kbd').count()) === 1, await a.locator('.modal.dialog button.primary').innerText());
await a.keyboard.press('Enter'); await a.waitForTimeout(600);
const t = await a.locator('.toast').innerText().catch(() => '');
check('arşiv: Enter onaylar', t.includes('arşivlendi'), t);

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
