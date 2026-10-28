// Eleştiri turu A8–A12, A14: yazdırma planında Enter/Esc, Kurallar'da Esc, şablon sürükleme, boş dönemde yuva, Türkçe tutar araması, tema flaşı, açılış
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/867f9974-1a43-4076-a88f-b37ee3fd36c1/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = []; const log = (...a) => console.log(...a);
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'advanced'); } catch {} });
await p.goto('http://localhost:5179/'); await p.waitForSelector('.welcome');
// ---- A11: dönem yokken dolu yuva düzenlenebilir
await p.locator('.slot.slot-0').click(); await p.keyboard.type('153.01'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
log('dönem yokken yuva Q:', await p.locator('.slot.slot-0 .slot-code').innerText());
await p.locator('.slot.slot-0').hover(); await p.locator('.slot.slot-0 .slot-icon.edit').click(); await p.waitForTimeout(100); log('dönem yokken ✎ → düzenleme kutusu:', await p.locator('.slot.slot-0 .slot-input').count()); await p.keyboard.type('.9'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); log('yeni kod:', await p.locator('.slot.slot-0 .slot-code').innerText(), '| düğme içinde düğme yok:', (await p.locator('button.slot').count()) === 0);
await p.locator('input[accept*=".zip"]').setInputFiles(files); await p.waitForSelector('.inv-frame'); await p.waitForFunction(() => !document.querySelector('.busy')); await p.waitForTimeout(400);
await p.locator('.slot.slot-0').click(); await p.waitForTimeout(250); log('dolu yuvaya tık → atama:', await p.evaluate(() => document.querySelector('.detail-code b')?.textContent));
// ---- A12: tutar araması
const rows = () => p.locator('.list .row').count();
for (const q of ['5.748', '5748,00', '5748', '5.748,00']) { await p.locator('#search').fill(q); await p.waitForTimeout(150); log(`ara "${q}":`, await rows(), 'satır (2 bekleniyor: seçili + eşleşen)'); }
await p.locator('#search').fill('');
// ---- A8: yazdırma planında Enter select odaktayken yazdırmaz; Esc aramayı temizler
await p.locator('.toolbar button:has-text("Yazdır")').click(); await p.waitForSelector('.print-modal');
await p.locator('.print-opts select').first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300); log('select odaklı Enter → plan hâlâ açık:', await p.locator('.print-modal').count(), '| yazdırma başlamadı:', await p.evaluate(() => !document.querySelector('.print-root .print-item')));
const ps = p.locator('.print-opts input[placeholder^="Ara"]'); await ps.fill('telekom'); await p.waitForTimeout(150); await ps.press('Escape'); await p.waitForTimeout(150);
log('aramada Esc → kutu temiz:', (await ps.inputValue()) === '', '| plan açık:', await p.locator('.print-modal').count());
await p.keyboard.press('Escape'); await p.waitForTimeout(200); log('ikinci Esc → kapandı:', (await p.locator('.print-modal').count()) === 0);
// ---- A9: Kurallar: düzenlerken boş yere tıkla, Esc → düzenlemeden vazgeç, pencere açık kalsın
await p.locator('.toolbar button:has-text("Kurallar")').click(); await p.waitForSelector('.modal.rules');
await p.locator('.modal.rules .rule-code').fill('770.01'); await p.locator('.modal.rules .rule-submit').click(); await p.waitForTimeout(400);
await p.locator('.modal.rules .rule-row .rule-edit').first().click(); await p.waitForTimeout(150);
await p.locator('.modal.rules .modal-head b').click(); await p.waitForTimeout(100); log('boş yere tık sonrası odak:', await p.evaluate(() => document.activeElement?.className || document.activeElement?.tagName));
await p.keyboard.press('Escape'); await p.waitForTimeout(200); log('Esc → pencere açık:', await p.locator('.modal.rules').count(), '| düzenleme bitti:', (await p.locator('.modal.rules .rule-form.editing').count()) === 0);
await p.keyboard.press('Escape'); await p.waitForTimeout(200); log('ikinci Esc → kapandı:', (await p.locator('.modal.rules').count()) === 0);
// ---- A10: şablonda sürükleme (dataTransfer boş olsa da doğru sütun taşınır)
await p.locator('button[title="Ayarlar"]').click(); await p.locator('.settings-tabs button:has-text("Çıktı")').click(); await p.locator('button:has-text("Şablonu düzenle")').click(); await p.waitForSelector('.tpl-row');
const names = async () => (await p.locator('.tpl-row .tpl-header').evaluateAll((els) => els.map((e) => e.value || e.placeholder))).slice(0, 4).join(' | ');
log('şablon önce:', await names());
await p.locator('.tpl-row').nth(2).dragTo(p.locator('.tpl-row').nth(0)); await p.waitForTimeout(200); log('3. sütun 1. sıraya sürüklendi:', await names());
await p.keyboard.press('Escape'); await p.waitForTimeout(150); if (await p.locator('.modal.dialog button.danger').count()) await p.locator('.modal.dialog button.danger').click(); // kaydedilmemiş şablon: Kaydetmeden kapat
await p.waitForTimeout(100); await p.keyboard.press('Escape');
// ---- A14: koyu tema ilk karede; açılışta "Açılıyor…" sonra dönem
await p.locator('.theme-btn').click(); await p.waitForTimeout(200);
const p2 = await p.context().newPage(); let firstTheme = null;
p2.on('domcontentloaded', async () => { firstTheme = await p2.evaluate(() => document.documentElement.dataset.theme ?? '(yok)').catch(() => null); });
await p2.goto('http://localhost:5179/'); await p2.waitForSelector('.inv-frame');
log('yeni sekmede ilk kare tema:', firstTheme, '(dark bekleniyor) | karşılama görünmedi:', await p2.evaluate(() => !document.querySelector('main.welcome:not(.loading)')));
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
