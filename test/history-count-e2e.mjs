// Eleştiri turu B16: satıcı geçmişi sayacı (= atama sayısı) fatura çıkarma ve dönem silmede düşer,
// başka dönemden taşınan atamada artar; "Bu satıcıya önce: <kod> ×n" ipucu buna göre.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/db47f010-e6ef-41e1-8024-b002bf7dd1fd/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const all = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const yld = all.filter((f) => /YLD/.test(f));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const up = 'input[accept*=".zip"]';
const settle = async () => { await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400); };
const row = (no) => a.locator(`.list .row:has-text("${no}")`);
const give = async (no, code) => { await row(no).click(); await a.keyboard.press('/'); await a.keyboard.type(code); await a.keyboard.press('Enter'); await a.waitForTimeout(300); };
const hintAt = async (no) => { await row(no).click(); await a.waitForTimeout(200); return a.locator('.detail .hint').innerText().catch(() => '(ipucu yok)'); };

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator(up).setInputFiles(yld); await a.waitForSelector('.inv-frame'); await settle();
await give('YLD2026000000001', '760.01');
await give('YLD2026000000002', '760.01');
let h = await hintAt('YLD2026000000003');
check('iki atama → ×2', /760\.01\s*×2/.test(h), h);

// Fatura çıkarma → sayaç düşer
await row('YLD2026000000002').click(); await a.locator('button[title^="Bu faturayı dönemden sil"]').click();
await a.waitForSelector('.modal.dialog'); await a.locator('.modal.dialog button.danger').click(); await settle();
h = await hintAt('YLD2026000000003');
check('atanmış fatura çıkarıldı → ×1', /760\.01\s*×1/.test(h), h);

// Yeni dönemde aynı faturalar: YLD001'in ataması taşınır → sayaç artar
await a.locator('.batch-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.keyboard.press('Enter'); await a.waitForTimeout(500);
await a.locator(up).setInputFiles(yld); await settle();
check('taşınan atama görünür', (await row('YLD2026000000001').locator('.row-code').innerText()).includes('760.01'), await row('YLD2026000000001').locator('.row-code').innerText());
h = await hintAt('YLD2026000000003');
check('başka dönemden taşınan atama → ×2', /760\.01\s*×2/.test(h), h);

// Dönemi sil → sayaç düşer; onay metni ipuçlarını ve arşivi söyler
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Dönem")').click();
await a.locator('button:has-text("Dönemi sil")').click(); await a.waitForSelector('.modal.dialog');
const msg = await a.locator('.modal.dialog .dialog-msg').innerText();
check('silme onayı ipuçlarını ve arşivi söyler', msg.includes('ipuçları') && msg.includes('arşiv'), msg);
await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(800);
await a.keyboard.press('Escape').catch(() => {}); await a.waitForTimeout(200);
h = await hintAt('YLD2026000000003');
check('dönem silindi → ×1', /760\.01\s*×1/.test(h), h);

// Geri alma da sayacı izler (applyChanges) — değişmemeli
await give('YLD2026000000003', '760.01'); await a.keyboard.press('Control+z'); await a.waitForTimeout(400);
h = await hintAt('YLD2026000000003');
check('ata + geri al → ×1', /760\.01\s*×1/.test(h), h);

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
