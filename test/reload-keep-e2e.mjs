// Eleştiri turu B15: aynı dönemi yeniden okuyan işlemler (XML ekleme, fatura çıkarma, arşivleme, sekme eşitleme)
// geri alma yığınını, aramayı, seçimi ve açık faturayı korur; başka sekmede değişen atama geri alınırken ezilmez.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/db47f010-e6ef-41e1-8024-b002bf7dd1fd/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const all = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const first = all.filter((f) => !/HZK|LZT/.test(f));
const later = all.filter((f) => /HZK/.test(f));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const up = 'input[accept*=".zip"]';
const settle = async (p = a) => { await p.waitForFunction(() => !document.querySelector('.busy')); await p.waitForTimeout(400); };
const undoTitle = () => a.locator('.toolbar button:has-text("↶")').getAttribute('title');
const curNo = (p = a) => p.locator('.list .row.current .row-sub').innerText().then((t) => t.split(' · ')[0]);
const row = (no, p = a) => p.locator(`.list .row:has-text("${no}")`);
const codeOf = (no, p = a) => row(no, p).locator('.row-code').innerText();
const give = async (no, code, p = a) => { await row(no, p).click(); await p.keyboard.press('/'); await p.keyboard.type(code); await p.keyboard.press('Enter'); await p.waitForTimeout(300); };

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator(up).setInputFiles(first); await a.waitForSelector('.inv-frame'); await settle();
await give('AYT2026000000002', '600.01');
await give('AYT2026000000003', '600.02');
await a.locator('#search').fill('telekom'); await a.waitForTimeout(200);
await row('AYT2026000000004').locator('.row-check').click();
await row('AYT2026000000001').locator('.row-check').click();
await row('AYT2026000000003').click();
check('başlangıç: geri al 600.02', (await undoTitle()).includes('600.02'), await undoTitle());

// 1) XML ekleme
await a.locator(up).setInputFiles(later); await settle();
check('XML ekleme: arama korunur', (await a.locator('#search').inputValue()) === 'telekom', await a.locator('#search').inputValue());
check('XML ekleme: geri alma yığını korunur', (await undoTitle()).includes('600.02'), await undoTitle());
check('XML ekleme: seçim korunur (2)', (await a.locator('.list .row.selected').count()) === 2, await a.locator('.list .row.selected').count());
check('XML ekleme: açık fatura yerinde', (await curNo()) === 'AYT2026000000003', await curNo());

// 2) Faturayı dönemden silme (seçili olan) → seçimden düşer; geri alma doğru faturaya döner
// (seçim 1'den büyükken tekli "dönemden sil" gizli: önce AYT4'ün işareti kaldırılır, seçimde yalnızca AYT1 kalır)
await row('AYT2026000000004').locator('.row-check').click();
await row('AYT2026000000001').click(); await a.locator('button[title^="Bu faturayı dönemden sil"]').click();
await a.waitForSelector('.modal.dialog'); await a.locator('.modal.dialog button.danger').click(); await settle();
check('çıkarma: arama korunur', (await a.locator('#search').inputValue()) === 'telekom', await a.locator('#search').inputValue());
check('çıkarma: geri alma yığını korunur', (await undoTitle()).includes('600.02'), await undoTitle());
check('çıkarma: silinen seçimden düşer (0)', (await a.locator('.list .row.selected').count()) === 0, await a.locator('.list .row.selected').count());
await row('AYT2026000000004').click();
await a.keyboard.press('Control+z'); await a.waitForTimeout(400);
check('Ctrl+Z: işlemin yapıldığı faturaya döner', (await curNo()) === 'AYT2026000000003', await curNo());
check('Ctrl+Z: 600.02 kaldırıldı', !(await codeOf('AYT2026000000003')).includes('600'), await codeOf('AYT2026000000003'));

// 3) Görselleri arşivle
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click();
await a.locator('button:has-text("XML\'leri kaldır")').first().click(); await a.waitForSelector('.modal.dialog');
await a.locator('.modal.dialog button.primary').click(); await a.waitForTimeout(600); await a.keyboard.press('Escape'); await a.waitForTimeout(200);
check('arşivleme: arama korunur', (await a.locator('#search').inputValue()) === 'telekom', await a.locator('#search').inputValue());
check('arşivleme: geri alma yığını korunur (600.01)', (await undoTitle()).includes('600.01'), await undoTitle());

// 4) Sekme eşitleme: B sekmesi AYT002'yi 700'e çevirir → A'da yığın kalır ama 600.01'i geri almak B'nin değişikliğini ezmez
const b = await ctx.newPage(); await b.goto('http://localhost:5179/'); await b.waitForSelector('.list .row');
await give('AYT2026000000002', '700', b);
await a.bringToFront(); await a.waitForTimeout(800);
check('sekme eşitleme: arama korunur', (await a.locator('#search').inputValue()) === 'telekom', await a.locator('#search').inputValue());
check('sekme eşitleme: B\'nin kodu A\'da görünür (700)', (await codeOf('AYT2026000000002')).includes('700'), await codeOf('AYT2026000000002'));
await a.keyboard.press('Control+z'); await a.waitForTimeout(400);
const t = await a.locator('.toast').innerText().catch(() => '');
check('Ctrl+Z reddedilir ve söylenir', t.includes('Geri alınamadı'), t);
check('B\'nin kodu ezilmedi (700)', (await codeOf('AYT2026000000002')).includes('700'), await codeOf('AYT2026000000002'));
await b.close();

// 5) Dönem değiştirmek hâlâ sıfırlar
await a.locator('.batch-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.keyboard.press('Enter'); await a.waitForTimeout(500);
check('yeni dönem: arama temizlenir', (await a.locator('#search').inputValue()) === '', await a.locator('#search').inputValue());
check('yeni dönem: geri alma yığını boş', (await undoTitle()) === 'Geri alınacak işlem yok', await undoTitle());

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
