// Çok koşullu kurallar (gerçek XML'ler): unvan + KDV, kalem + miktar aralığı, tutar aralığı, belirginlik önceliği, düzenleme, dosya v2 ve eski v1 dosya
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/d64e6ff3-d5c6-481a-957e-cc3c595811d5/scratchpad';
const XML_DIR = process.env.XML_DIR || `${S}/xmlin`;
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true })).newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
const log = (...a) => console.log(...a);
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(() => !document.querySelector('.busy'));
log('yüklendi:', await page.locator('.progress').innerText());
const open = async () => { await page.locator('.toolbar button:has-text("Kurallar")').click(); await page.waitForSelector('.modal.rules'); };
const preview = async () => (await page.locator('.rule-preview').innerText().catch(() => '(önizleme yok)')).split('\n')[0];
const setKind = async (i, k) => page.locator('.cond-kind').nth(i).locator(`[data-k="${k}"]`).click();
const rows = async () => (await page.locator('.rule-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
await open();
// 1) unvan "turkcell" + KDV %20 → 770.03
await setKind(0, 'name'); await page.locator('.cond-text').nth(0).fill('turkcell');
await page.locator('.add-cond').click(); await setKind(1, 'vat'); await page.locator('.cond-vat').selectOption('20');
log('önizleme (turkcell + KDV %20):', await preview());
await page.locator('.rule-code').fill('770.03'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(400);
log('kaydet:', await page.locator('.toast').innerText(), '| satır:', (await rows())[0]);
// 2) kalem "enerji" + miktar 500–1000 (kWh) → 770.02 ; sonra aralık 1–100 → uymamalı
await setKind(0, 'item'); await page.locator('.cond-text').nth(0).fill('enerji');
await page.locator('.add-cond').click(); await setKind(1, 'qty'); await page.locator('.cond-min').fill('500'); await page.locator('.cond-max').fill('1000');
log('önizleme (enerji + miktar 500–1000):', await preview());
await page.locator('.cond-min').fill('1'); await page.locator('.cond-max').fill('100');
log('önizleme (enerji + miktar 1–100):', await preview());
await page.locator('.cond-min').fill('500'); await page.locator('.cond-max').fill('');
await page.locator('.rule-code').fill('770.02'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(400);
log('kaydet:', await page.locator('.toast').innerText());
// 3) tutar ≥ 10000 → 999 (tek koşul) ; belirginlik: VKN kuralı tutar kuralını geçer
await setKind(0, 'amount'); await page.locator('.cond-min').fill('10000');
log('önizleme (tutar ≥ 10000):', await preview());
await page.locator('.rule-code').fill('999'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(400);
log('kaydet:', await page.locator('.toast').innerText());
// 4) doğrulama hataları
await setKind(0, 'qty'); await page.locator('.cond-min').fill('10'); await page.locator('.cond-max').fill('5'); await page.locator('.rule-code').fill('1'); await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(150);
log('hata (10 > 5):', await page.locator('.issue').innerText().catch(() => '(yok)'));
await page.locator('.cond-max').fill(''); await page.locator('.cond-min').fill('');
await page.locator('.rule-code').press('Enter'); await page.waitForTimeout(150);
log('hata (boş aralık):', await page.locator('.issue').innerText().catch(() => '(yok)'));
// 5) koşul sayısı sınırsız: 6 koşul
await setKind(0, 'vkn'); await page.locator('.cond-text').nth(0).fill('8770013406');
for (let i = 0; i < 5; i++) await page.locator('.add-cond').click();
log('koşul satırı:', await page.locator('.cond-row').count(), '(6 bekleniyor) | ekle düğmesi:', await page.locator('.add-cond').innerText());
// 6) düzenle: ilk kuralın (turkcell+KDV) kodunu ve koşulunu değiştir
await page.locator('.rule-row').filter({ hasText: 'turkcell' }).locator('.rule-edit').click(); await page.waitForTimeout(100);
log('düzenleme modu:', await page.locator('.rule-form.editing .muted.small').first().innerText());
await page.locator('.cond-remove').nth(1).click(); await page.locator('.rule-code').fill('770.04'); await page.locator('.rule-submit').click(); await page.waitForTimeout(400);
log('düzenleme sonrası satırlar:', (await rows()).join(' || '));
// 7) kuralla atananlar: sayım ve öncelik (VKN kuralı eklenince tutar kuralını geçmeli)
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
await page.locator('.filter-select').selectOption('rule'); await page.waitForTimeout(150);
const tally = (await page.locator('.row .row-code').allInnerTexts()).map((c) => c.replace('kural', '').trim()).reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {});
log('kuralla atanan kodlar:', JSON.stringify(tally));
await page.locator('.filter-select').selectOption('all');
// 8) dosya v2 dışa aktar; v1 dosya al
await open();
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button:has-text("Kuralları dışa aktar")').click()]);
const f2 = `${S}/kurallar-v2.json`; await dl.saveAs(f2); const j = JSON.parse(readFileSync(f2, 'utf8'));
log('dosya v', j.version, '| kurallar:', j.rules.map((r) => r.conds.map((c) => c.kind).join('+') + '→' + r.code).join(', '));
const v1 = `${S}/kurallar-v1.json`; writeFileSync(v1, JSON.stringify({ app: 'fatura-hesap-kodu', kind: 'rules', version: 1, firmName: 'Eski', rules: [{ kind: 'name', pattern: 'ttnet', code: '770.06' }] }));
await page.locator('input[accept=".json,application/json"]').setInputFiles(v1); await page.waitForTimeout(400);
log('v1 dosya:', await page.locator('.toast').innerText(), '| satır:', (await rows()).find((r) => r.includes('ttnet')));
// 9) panelden Kural yap → taslak VKN koşulu
await page.keyboard.press('Escape'); await page.locator('.filter-select').selectOption('manual').catch(() => {});
await page.locator('.filter-select').selectOption('all'); await page.keyboard.press('Home');
await page.keyboard.press('/'); await page.keyboard.type('153'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
if (await page.locator('.rule-make').count()) { await page.locator('.rule-make').click(); await page.waitForSelector('.modal.quick-rule'); log('kural yap (hızlı):', (await page.locator('.qsummary').innerText()).replace(/\s+/g, ' '), '→', await page.locator('.rule-code').inputValue()); await page.locator('.quick-advanced').click(); await page.waitForSelector('.modal.rules'); log('gelişmiş taslak:', await page.locator('.cond-kind').nth(0).locator('button.on').getAttribute('data-k'), await page.locator('.cond-text').nth(0).inputValue(), '→', await page.locator('.rule-code').inputValue()); await page.keyboard.press('Escape'); } else log('kural yap düğmesi yok (fatura zaten kurala uyuyor)');
// 9b) panelde kalemler ve kalemden kural: ENERJİSA faturası (841,6 kWh)
await page.locator('#search').fill('enerj'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); await page.locator('#search').fill('');
log('kalemler:', (await page.locator('.line-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).slice(0, 3).join(' || '));
await page.locator('.line-rule').first().click(); await page.waitForSelector('.modal.quick-rule');
log('kalemden hızlı kural:', (await page.locator('.qsummary').innerText()).replace(/\s+/g, ' '), '| işaretli rozet:', await page.locator('.qchip.on').count());
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
// 10) yenile → kurallar kalıcı, koşul çipleri
await page.reload(); await page.waitForSelector('.inv-frame'); await open();
log('yenileme sonrası:', (await rows()).length, 'kural |', (await page.locator('.cond-chip').allInnerTexts()).join(' / '));
await page.screenshot({ path: `${S}/rules-multi.png` });
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
