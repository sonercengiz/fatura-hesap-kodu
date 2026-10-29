// Eleştiri turu B17: kuralla verilen kodlar kuralı izler — kural kapatılınca/silinince açık dönemde verdiği kodlar
// kalkar (elle verilenler kalır), açılınca geri gelir; silme etkilenen fatura varsa onay ister; Ctrl+Z kuralı ve kodları
// birlikte geri getirir (Kurallar penceresinde de); kural düzenlemesini geri almak kuralı da eski haline döndürür.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const row = (no) => a.locator(`.list .row:has-text("${no}")`);
const codeOf = (no) => row(no).locator('.row-code').innerText();
const codes = async () => (await Promise.all(['AYT2026000000001', 'AYT2026000000002', 'AYT2026000000003', 'AYT2026000000004'].map(codeOf))).map((t) => t.replace(/\s+/g, ' ').trim() || '—').join(' | ');
const toast = () => a.locator('.toast').innerText().catch(() => '');
const give = async (no, code) => { await row(no).click(); await a.keyboard.press('/'); await a.keyboard.type(code); await a.keyboard.press('Enter'); await a.waitForTimeout(300); };
const ruleRow = () => a.locator('.modal.rules .rule-row').first();

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);
await give('AYT2026000000001', '770.99');
await give('AYT2026000000002', '760.10');
await a.locator('.toolbar button:has-text("Kurallar")').click(); await a.waitForSelector('.modal.rules');
await a.locator('.modal.rules .rule-code').fill('760.10'); await a.locator('.modal.rules .rule-submit').click(); await a.waitForTimeout(500);
let c = await codes();
check('kural: 003 ve 004 kuralla 760.10, elle verilenler aynen', c === '770.99 | 760.10 | Kural760.10 | Kural760.10', c);

// Kapat → kuralın kodları kalkar; aç → geri gelir
await ruleRow().locator('input[type=checkbox]').uncheck(); await a.waitForTimeout(400);
c = await codes(); const tOff = await toast();
check('kapatınca kuralın kodları kalkar, elle kalır', c === '770.99 | 760.10 | — | —', c);
check('kapatma bildirimi sayıyı söyler', tOff.includes('Kural kapatıldı') && tOff.includes('2 faturanın kuralla verilmiş kodu kaldırıldı'), tOff);
await ruleRow().locator('input[type=checkbox]').check(); await a.waitForTimeout(400);
c = await codes();
check('açınca geri gelir', c === '770.99 | 760.10 | Kural760.10 | Kural760.10', c);

// Sil → onay (etkilenen sayısı) → kodlar kalkar
await ruleRow().locator('button[title^="Kuralı sil"]').click(); await a.waitForSelector('.modal.dialog');
const msg = await a.locator('.modal.dialog .dialog-msg').innerText();
check('silme onayı etkilenen faturaları sayar', msg.includes('2 faturanın kodu kaldırılır') && msg.includes('Ctrl+Z'), msg);
await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(500);
c = await codes();
check('silince kuralın kodları kalkar', c === '770.99 | 760.10 | — | —', c);
check('kural listesi boş', (await a.locator('.modal.rules .rule-row').count()) === 0, await a.locator('.modal.rules .rule-row').count());

// Kurallar penceresi açıkken Ctrl+Z → kural ve kodlar geri; Ctrl+Y → yeniden silinir
await a.locator('.modal.rules').click({ position: { x: 5, y: 5 } }); await a.keyboard.press('Control+z'); await a.waitForTimeout(500);
c = await codes();
check('Ctrl+Z (pencerede): kural geri', (await a.locator('.modal.rules .rule-row').count()) === 1, await a.locator('.modal.rules .rule-row').count());
check('Ctrl+Z (pencerede): kodlar geri, kural etiketiyle', c === '770.99 | 760.10 | Kural760.10 | Kural760.10', c);
await a.keyboard.press('Control+y'); await a.waitForTimeout(500);
check('Ctrl+Y: yeniden silindi', (await a.locator('.modal.rules .rule-row').count()) === 0 && (await codes()) === '770.99 | 760.10 | — | —', await codes());
await a.keyboard.press('Control+z'); await a.waitForTimeout(500);

// Kod düzenleme + geri al → kural da eski koduna döner
await ruleRow().locator('.rule-code-edit').fill('760.20'); await ruleRow().locator('.rule-code-edit').press('Tab'); await a.waitForTimeout(500);
c = await codes();
check('kod düzenleme: kodlar izler', c === '770.99 | 760.10 | Kural760.20 | Kural760.20', c);
await a.locator('.modal.rules').click({ position: { x: 5, y: 5 } }); await a.keyboard.press('Control+z'); await a.waitForTimeout(500);
const rc = await ruleRow().locator('.rule-code-edit').inputValue();
check('geri al: kural kodu 760.10', rc === '760.10', rc);
check('geri al: fatura kodları 760.10', (await codes()) === '770.99 | 760.10 | Kural760.10 | Kural760.10', await codes());

// Pencere kapalıyken de: silinen kuralı Ctrl+Z getirir
await ruleRow().locator('button[title^="Kuralı sil"]').click(); await a.waitForSelector('.modal.dialog'); await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(400);
await a.keyboard.press('Escape'); await a.waitForSelector('.modal.rules', { state: 'detached' });
await a.keyboard.press('Control+z'); await a.waitForTimeout(500);
check('pencere kapalı Ctrl+Z: kodlar geri', (await codes()) === '770.99 | 760.10 | Kural760.10 | Kural760.10', await codes());
check('Kurallar düğmesi kural sayısını gösterir', /Kurallar\s*1/.test(await a.locator('.toolbar button:has-text("Kurallar")').innerText()), await a.locator('.toolbar button:has-text("Kurallar")').innerText());

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
