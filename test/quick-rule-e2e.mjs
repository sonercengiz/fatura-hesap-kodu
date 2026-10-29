// Rozetli hızlı kural ("Bu faturadan kural"): panelden açılış, rozet işaretleme, eşik/yön düzenleme, kaydet, kalemden ⚡, Gelişmiş…, yalnızca bu dönem
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { SCRATCH, XML_DIR } from './paths.mjs';
const S = SCRATCH;
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
const log = (...a) => console.log(...a);
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy'));
const summary = async () => (await page.locator('.qsummary').innerText()).replace(/\s+/g, ' ');
// ENERJİSA faturası: kod ver, Kural yap → hızlı pencere
await page.locator('#search').fill('ES12026000088979'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); await page.locator('#search').fill(''); await page.locator('#search').blur();
await page.keyboard.press('/'); await page.keyboard.type('770.02'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
log('kalem satırı:', (await page.locator('.line-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' || '));
await page.locator('.rule-make').click(); await page.waitForSelector('.modal.quick-rule');
log('açılış:', await summary(), '| kod:', await page.locator('.rule-code').inputValue(), '| rozet sayısı:', await page.locator('.qchip').count(), '| gruplar:', (await page.locator('.qgroup-label').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' / '));
// unvan + KDV %20 rozetlerini ekle, VKN'yi kaldır
await page.locator('.qchip.k-name input').check(); await page.locator('.qchip.k-vat input').first().check(); await page.locator('.qchip.k-vkn input').uncheck(); await page.waitForTimeout(100);
log('unvan+KDV:', await summary());
// kalem miktarı rozeti: işaretle, yönü ≤ yap, eşik 1000
await page.locator('.qchip.k-qty input[type=checkbox]').first().check(); await page.locator('.qchip.k-qty .qchip-dir').first().click(); await page.locator('.qchip.k-qty .qchip-num').first().fill('1000'); await page.waitForTimeout(100);
log('miktar ≤ 1000:', await summary());
// birim fiyat rozeti ≥ (faturadaki fiyat)
await page.locator('.qchip.k-price input[type=checkbox]').first().check(); await page.waitForTimeout(100);
log('+ birim fiyat:', await summary());
await page.locator('.qchip.k-price input[type=checkbox]').first().uncheck();
// kaydet
await page.locator('.rule-code').fill('770.02'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(400);
log('kaydet:', await page.locator('.toast').innerText(), '| pencere kapandı:', (await page.locator('.modal.quick-rule').count()) === 0);
// kalemden ⚡ → kalem + miktar işaretli; Gelişmiş… → büyük pencere aynı taslakla
await page.locator('.line-rule').first().click(); await page.waitForSelector('.modal.quick-rule');
log('kalemden:', await summary(), '| işaretli:', await page.locator('.qchip.on').count());
await page.locator('.qchip.k-item .qchip-text').fill('enerji'); await page.waitForTimeout(100);
log('kelime düzeltildi:', await summary());
await page.locator('.quick-advanced').click(); await page.waitForSelector('.modal.rules');
log('gelişmiş:', (await page.locator('.cond-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 60)).join(' || '), '| ilk metin:', await page.locator('.cond-text').first().inputValue(), '| en az:', await page.locator('.cond-min').first().inputValue());
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
// tarih rozeti, yalnızca bu dönem
await page.locator('.rule-make').count() ? null : null;
await page.keyboard.press('Home'); await page.waitForTimeout(100);
await page.keyboard.press('/'); await page.keyboard.type('153'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.locator('.rule-make').click(); await page.waitForSelector('.modal.quick-rule');
await page.locator('.qchip.k-vkn input').uncheck(); await page.locator('.qchip.k-date input').check(); await page.locator('.modal.quick-rule .scope-seg button').nth(1).click(); await page.waitForTimeout(100);
log('tarih + bu dönem:', await summary(), '| düğme:', await page.locator('.quick-save').innerText());
await page.locator('.quick-save').click(); await page.waitForTimeout(400);
log('kaydet:', await page.locator('.toast').innerText());
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules');
log('kurallar:', (await page.locator('.rule-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' || '));
await page.screenshot({ path: `${S}/quick-rule.png` });
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
