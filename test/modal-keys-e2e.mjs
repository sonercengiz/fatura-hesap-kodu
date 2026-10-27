// Eleştiri turu A5–A7: pencere açıkken genel kısayollar susar; hızlı kural kodsuz faturadan kaydedilince çökmez; sayı kutuları Türkçe biçim
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/867f9974-1a43-4076-a88f-b37ee3fd36c1/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const log = (...a) => console.log(...a);
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await p.goto('http://localhost:5179/'); await p.waitForSelector('.welcome');
await p.locator('input[accept*=".zip"]').setInputFiles(files); await p.waitForSelector('.inv-frame'); await p.waitForFunction(() => !document.querySelector('.busy')); await p.waitForTimeout(400);
const code = () => p.evaluate(() => document.querySelector('.detail-code b')?.textContent);
const modals = () => p.evaluate(() => [...document.querySelectorAll('.modal, .chart-pop')].map((m) => m.className).join(' | ') || '(yok)');
// bir atama (Ctrl+Z için)
await p.keyboard.press('/'); await p.keyboard.type('770.01'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); log('atama:', await code());
// ---- A7: Ayarlar açıkken F5, Ctrl+., Ctrl+Z, Ctrl+F, Ctrl+Shift+P
await p.locator('button[title="Ayarlar"]').click(); await p.waitForSelector('.modal.settings');
await p.keyboard.press('F5'); await p.waitForTimeout(200); log('Ayarlar açıkken F5 → pencereler:', await modals());
await p.keyboard.press('Control+.'); await p.waitForTimeout(200); log('Ayarlar açıkken Ctrl+. → pencereler:', await modals(), '| odak:', await p.evaluate(() => document.activeElement?.className || document.activeElement?.tagName));
await p.keyboard.press('Control+z'); await p.waitForTimeout(300); log('Ayarlar açıkken Ctrl+Z → kod:', await code(), '(770.01 kalmalı)');
await p.keyboard.press('Control+Shift+p'); await p.waitForTimeout(200); log('Ayarlar açıkken Ctrl+Shift+P → pencereler:', await modals());
await p.keyboard.press('Escape'); await p.waitForTimeout(200); log('Esc → pencereler:', await modals());
// önizlemede F1 çalışır (başlıkta yazıyor), F5 kapatır
await p.keyboard.press('F5'); await p.waitForSelector('.modal'); log('F5 → önizleme açık:', await modals());
const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('F1')]); log('önizlemede F1 → indirildi:', dl.suggestedFilename());
await p.keyboard.press('F5'); await p.waitForTimeout(200); log('F5 → kapandı:', await modals());
// hesap listesi açıkken Ctrl+. kapatır, Ctrl+Z susar
await p.keyboard.press('Control+.'); await p.waitForSelector('.chart-pop'); await p.keyboard.press('Control+z'); await p.waitForTimeout(200); log('hesap listesi açıkken Ctrl+Z → kod:', await code()); await p.keyboard.press('Control+.'); await p.waitForTimeout(200); log('Ctrl+. kapattı:', await modals());
// ---- A5: kodsuz faturadan kalem ⚡ ile hızlı kural; kaydedince geçiş olsa da çökmemeli
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); log('2. fatura kodu:', await code());
await p.locator('.detail .line-rule').first().click(); await p.waitForSelector('.modal.quick-rule');
log('hızlı kural başlık:', (await p.locator('.modal.quick-rule .modal-head .muted').innerText()).slice(0, 40));
// eşik kutusuna Türkçe ondalık yaz: virgül kaybolmamalı
const numBox = p.locator('.modal.quick-rule .qchip.on .qchip-num').first();
await numBox.fill(''); await numBox.type('1,5'); await p.waitForTimeout(150); log('eşik kutusu "1,5" →', await numBox.inputValue(), '| özet:', (await p.locator('.qsummary').innerText()).replace(/\s+/g, ' ').slice(0, 80));
await numBox.fill(''); await numBox.type('3.000'); await p.waitForTimeout(150); log('eşik kutusu "3.000" → özet:', (await p.locator('.qsummary').innerText()).replace(/\s+/g, ' ').slice(0, 80));
await numBox.fill(''); await numBox.type('1'); await p.waitForTimeout(100);
await p.locator('.modal.quick-rule .rule-code').fill('153.01'); await p.locator('.modal.quick-rule button.primary').click(); await p.waitForTimeout(700);
log('kaydet → pencere kapandı:', (await p.locator('.modal.quick-rule').count()) === 0, '| toast:', await p.locator('.toast').innerText().catch(() => '(yok)'));
// ---- A6: Kurallar penceresinde aynı sayı aynı anlam
await p.locator('.toolbar button:has-text("Kurallar")').click(); await p.waitForSelector('.modal.rules');
await p.locator('.modal.rules .cond-kind [data-k="amount"]').first().click(); await p.waitForTimeout(100);
const minBox = p.locator('.modal.rules .cond-min').first(); await minBox.type('3.000'); await p.waitForTimeout(150);
log('Kurallar "3.000" → kutu:', await minBox.inputValue(), '| önizleme:', (await p.locator('.rule-preview').innerText().catch(() => '(yok)')).replace(/\s+/g, ' ').slice(0, 60));
await minBox.fill(''); await minBox.type('0,5'); await p.waitForTimeout(150); log('Kurallar "0,5" → kutu:', await minBox.inputValue());
// KDV "başka oran": %8 kural düzenlemeye alınınca doğru görünmeli
await p.locator('.modal.rules .cond-kind [data-k="vat"]').first().click(); await p.locator('.modal.rules .cond-vat').selectOption('__other'); await p.locator('.modal.rules .cond-vat-other').fill('8');
await p.locator('.modal.rules .rule-code').fill('740.08'); await p.locator('.modal.rules .rule-submit').click(); await p.waitForTimeout(400);
await p.locator('.modal.rules .rule-row:has-text("KDV %8") .rule-edit').click(); await p.waitForTimeout(200);
log('%8 kural düzenlemede select:', await p.locator('.modal.rules .cond-vat').inputValue(), '| kutu:', await p.locator('.modal.rules .cond-vat-other').inputValue().catch(() => '(yok)'));
await p.keyboard.press('Escape'); await p.waitForTimeout(100); await p.keyboard.press('Escape');
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
