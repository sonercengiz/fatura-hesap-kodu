// Kapsam: kalıcı VKN kuralı + partiye özel unvan kuralı → parti kuralı önde; not görünür; başka partide kalıcı geçerli; parti silinince parti kuralı gider; kural dosyasında yalnızca kalıcı
import { chromium } from 'playwright';
import { enableAutoAdvance } from './e2e-helpers.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { SCRATCH, XML_DIR } from './paths.mjs';
const S = SCRATCH;
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const turkcell = files.filter((f) => /8770013406/.test(f));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 820 }, acceptDownloads: true })).newPage();
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
const inp = 'input[accept*=".zip"]';
const log = (...a) => console.log(...a);
await page.locator(inp).setInputFiles(turkcell.slice(0, 6)); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy'));
// kalıcı VKN kuralı
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules');
await page.locator('.cond-text').fill('8770013406'); await page.locator('.rule-code').fill('770.03'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(300);
log('kalıcı:', await page.locator('.toast').innerText());
// partiye özel unvan kuralı → önde olmalı, ama faturalar zaten atandı → uygulanmaz; kaldırıp dene
await page.locator('.scope-seg button').nth(1).click();
await page.locator('.cond-kind [data-k=\"name\"]').first().click(); await page.locator('.cond-text').fill('turkcell'); await page.locator('.rule-code').fill('740.09'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(300);
log('parti kuralı:', await page.locator('.toast').innerText(), '| satırlar:', (await page.locator('.rule-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' || '));
log('üst düğme:', await page.locator('.toolbar button:has-text("Kurallar")').innerText());
await page.keyboard.press('Escape');
// bir faturanın atamasını kaldır → ipucu "Parti kuralı diyor ki 740.09"
await page.keyboard.press('Control+Home'); await page.keyboard.press('Backspace'); await page.waitForTimeout(200);
log('ipucu:', await page.locator('button.hint').innerText());
await enableAutoAdvance(page); // testler hızlı çalışma (kendiliğinden geçiş) varsayar
await page.keyboard.press(' '); await page.waitForTimeout(200); await page.keyboard.press('Control+ArrowLeft'); await page.waitForTimeout(150);
log('boşlukla atanan:', await page.locator('.detail-code b').innerText(), '| not:', await page.locator('.rule-note').innerText().catch(() => '(yok)'));
// yeni XML yükle → parti kuralı (740.09) uygulanmalı, kalıcı değil
await page.locator(inp).setInputFiles(turkcell.slice(6, 9)); await page.waitForFunction(() => !document.querySelector('.busy')); await page.waitForTimeout(200);
await page.locator('.filter-select').selectOption('rule'); await page.waitForTimeout(150);
const codes = await page.locator('.row .row-code').allInnerTexts();
log('yeni XML sonrası kuralla atanan kodlar:', JSON.stringify(codes.map((c) => c.replace('kural', '').trim()).reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})));
await page.locator('.filter-select').selectOption('all');
// pencerede geçersiz kılma notu
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules');
log('not:', await page.locator('.override-note').innerText().catch(() => '(yok)'));
// kural dosyası: yalnızca kalıcı
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button:has-text("Kuralları dışa aktar")').click()]);
const rf = `${S}/kural-kapsam.json`; await dl.saveAs(rf);
log('kural dosyası:', JSON.parse(readFileSync(rf, 'utf8')).rules.map((r) => `${r.kind}:${r.pattern}→${r.code}`).join(', '));
await page.keyboard.press('Escape');
// yeni parti (Ekim) + 3 Turkcell → kalıcı 770.03 uygulanmalı, parti kuralı değil
await page.locator('.batch-select').selectOption('__new'); await page.waitForSelector('.modal.dialog input'); await page.locator('.modal.dialog input').fill('Ekim 2026'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
await page.locator(inp).setInputFiles(turkcell.slice(9, 12)); await page.waitForFunction(() => !document.querySelector('.busy')); await page.waitForTimeout(200);
log('yeni parti:', await page.locator('.batch-select option:checked').innerText(), '|', await page.locator('.toast').innerText(), '| ilk kod:', await page.locator('.detail-code b').innerText(), '| üst düğme:', await page.locator('.toolbar button:has-text("Kurallar")').innerText());
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules');
log('Ekim penceresi satır:', await page.locator('.rule-row').count(), '| diğer parti notu:', await page.locator('.form > .muted.small').last().innerText());
await page.screenshot({ path: `${S}/shots/scope-ekim.png` });
await page.keyboard.press('Escape');
// Eylül'e dön, pencere ekran görüntüsü, sonra Eylül partisini sil → parti kuralı gitmeli
const eylul = await page.locator('.batch-select option:has-text("Eylül")').getAttribute('value');
await page.locator('.batch-select').selectOption(eylul); await page.waitForTimeout(400);
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules'); await page.screenshot({ path: `${S}/shots/scope-eylul.png` }); await page.keyboard.press('Escape');
await page.locator('button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Dönem")').click(); await page.locator('button:has-text("Dönemi sil")').click(); await page.locator('.modal.dialog button.danger').click(); await page.waitForTimeout(500);
await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules');
log('Eylül silindi → kalan kural:', (await page.locator('.rule-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' || '), '| toplam (diğer parti notu var mı):', await page.locator('.form > .muted.small').last().innerText());
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
