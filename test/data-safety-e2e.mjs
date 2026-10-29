// Veri güvenliği (eleştiri turu A2–A4): firma silinince kuralları da silinir; taşımada hedefte olan fatura kaynakta kalır; yedekten çıktı şablonu gelir
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
const log = (...a) => console.log(...a);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); a.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await a.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'advanced'); } catch {} });
const up = 'input[accept*=".zip"]';
const toast = () => a.locator('.toast').innerText().catch(() => '(yok)');
const newFirm = async (name) => { await a.locator('.firm-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.locator('.modal.dialog input').fill(name); await a.keyboard.press('Enter'); await a.waitForTimeout(500); return a.locator('.firm-select option:checked').getAttribute('value'); };
const rulesOfFirm = (fid) => a.evaluate((fid) => new Promise((res) => { const r = indexedDB.open('fatura-hesap-kodu'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('rules'); const q = tx.objectStore('rules').getAll(); q.onsuccess = () => { res(q.result.filter((x) => x.firmId === fid).length); db.close(); }; }; }), fid);
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator(up).setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);
const firm1 = await a.locator('.firm-select option:checked').getAttribute('value');

// ---- A2: Beta firması + kalıcı kural → firmayı sil → kural kalmamalı
const beta = await newFirm('Beta Ltd');
await a.locator(up).setInputFiles(files.slice(0, 3)); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
await a.keyboard.press('/'); await a.keyboard.type('600.01'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
await a.locator('.detail .rule-make').click(); await a.waitForSelector('.modal.quick-rule'); await a.locator('.modal.quick-rule button.primary').click(); await a.waitForTimeout(600);
log('Beta kural sayısı (silmeden önce):', await rulesOfFirm(beta), '| toast:', await toast());
await a.locator('button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Firma")').click();
await a.locator('button:has-text("Firmayı sil")').click(); await a.waitForSelector('.modal.dialog');
log('silme onayı metni kuralları sayıyor:', (await a.locator('.modal.dialog .dialog-msg').innerText()).includes('kuralları'));
await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(800);
log('Beta silindi → Beta kural sayısı:', await rulesOfFirm(beta), '(0 bekleniyor) | açık firma:', await a.locator('.firm-select option:checked').innerText());

// ---- A4: Gamma'da ilk 3 fatura var; Firma 1'den 5 fatura (3'ü çakışan) taşı → 2 taşınır, 3'ü Firma 1'de kalır
const gamma = await newFirm('Gamma AŞ');
await a.locator(up).setInputFiles(files.slice(0, 3)); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
const gammaBatch = await a.locator('.batch-select option:checked').getAttribute('value');
await a.locator('.firm-select').selectOption(firm1); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(400);
await a.locator('.sort-select').selectOption('added'); await a.waitForTimeout(200);
const before = await a.locator('.progress').innerText();
for (let i = 0; i < 5; i++) await a.locator('.list .row').nth(i).locator('.row-check').click();
await a.locator('.files button:has-text("taşı")').click(); await a.waitForSelector('.modal:has-text("ya da döneme taşı")');
await a.locator('label:has-text("Seçili faturalar") input').check();
await a.locator('label:has-text("Hedef firma") select').selectOption(gamma); await a.waitForTimeout(150);
await a.locator('label:has-text("Hedef dönem") select').selectOption(gammaBatch).catch(() => {});
await a.locator('.modal button.primary:has-text("Taşı")').click(); await a.waitForTimeout(800);
log('taşıma toast:', await toast());
log('Firma 1 önce:', before, '→ sonra:', await a.locator('.progress').innerText(), '(16 → 14 bekleniyor; eski davranış 11 bırakıyordu)');
await a.locator('.firm-select').selectOption(gamma); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(400);
log('Gamma:', await a.locator('.progress').innerText(), '(5 bekleniyor)');
await a.locator('.firm-select').selectOption(firm1); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(300);

// ---- A3: şablonu özelleştir → dışa aktar → temiz tarayıcıda içe aktar → şablon gelmeli
await a.locator('button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Çıktı")').click(); await a.locator('button:has-text("Şablonu düzenle")').click(); await a.waitForSelector('.tpl-header');
await a.locator('.tpl-header').first().fill('Belge No'); await a.locator('.tpl-modal button:has-text("Kapat")').click(); await a.waitForTimeout(300);
await a.locator('button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click();
const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('button:has-text("Dışa aktar (.json)")').click()]);
const json = `${S}/yedek-sablon.json`; await dl.saveAs(json); await a.keyboard.press('Escape');
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const b = await ctxB.newPage();
b.on('pageerror', (e) => errors.push('B pageerror: ' + e.message));
await b.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'advanced'); } catch {} });
await b.goto('http://localhost:5179/'); await b.waitForSelector('.welcome');
await b.locator('button[title="Ayarlar"]').click(); await b.locator('.settings-tabs button:has-text("Çıktı")').click(); log('B şablon (önce):', (await b.locator('.settings-pane .muted').first().innerText()).replace(/\n/g, ' ').slice(0, 90));
await b.locator('.settings-tabs button:has-text("Yedek")').click(); await b.locator('input[accept*=".json"]').setInputFiles(json); await b.waitForTimeout(1200);
log('B içe aktarma toast:', await b.locator('.toast').innerText().catch(() => '(yok)'));
await b.keyboard.press('Escape'); await b.waitForTimeout(200); await b.locator('button[title="Ayarlar"]').click(); await b.locator('.settings-tabs button:has-text("Çıktı")').click();
log('B şablon (sonra):', (await b.locator('.settings-pane .muted').first().innerText()).replace(/\n/g, ' ').slice(0, 90));
await b.locator('button:has-text("Şablonu düzenle")').click(); await b.waitForSelector('.tpl-header'); log('B ilk sütun başlığı:', await b.locator('.tpl-header').first().inputValue(), '(Belge No bekleniyor)');
await b.keyboard.press('Escape');
// Yerel şablon özelleştirilmişse ezilmez: B'de başlığı değiştir, yedeği yeniden al
await b.locator('button[title="Ayarlar"]').click(); await b.locator('.settings-tabs button:has-text("Çıktı")').click(); await b.locator('button:has-text("Şablonu düzenle")').click(); await b.waitForSelector('.tpl-header');
await b.locator('.tpl-header').first().fill('Evrak No'); await b.locator('.tpl-modal button:has-text("Kapat")').click(); await b.waitForTimeout(200);
await b.locator('button[title="Ayarlar"]').click(); await b.locator('.settings-tabs button:has-text("Yedek")').click(); await b.locator('input[accept*=".json"]').setInputFiles(json); await b.waitForTimeout(1200);
log('B ikinci içe aktarma toast:', await b.locator('.toast').innerText().catch(() => '(yok)'));
await b.keyboard.press('Escape'); await b.locator('button[title="Ayarlar"]').click(); await b.locator('.settings-tabs button:has-text("Çıktı")').click(); await b.locator('button:has-text("Şablonu düzenle")').click(); await b.waitForSelector('.tpl-header');
log('B ilk sütun başlığı (korunmalı):', await b.locator('.tpl-header').first().inputValue(), '(Evrak No bekleniyor)');
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
