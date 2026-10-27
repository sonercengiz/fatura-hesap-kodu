// Kurallar: panelden kural yap → anında uygulanır; yeni XML yüklenince otomatik; unvan ve kalem kuralı; filtre; geri al; yedek ve kural dosyası ile taşıma
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
const S = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const XML_DIR = process.env.XML_DIR || `${S}/xmlin`;
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const turkcell = files.filter((f) => /8770013406/.test(f)); // 12 fatura
const others = files.filter((f) => !/8770013406/.test(f));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 }, acceptDownloads: true }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} }); await page.goto('http://localhost:5179/'); return page; };
const log = (...a) => console.log(...a);
const a = await mk();
await a.waitForSelector('.welcome');
const inp = 'input[accept*=".zip"]';
// 1) Önce Turkcell dışındakiler; Turkcell'den biri de dahil olsun diye 2 Turkcell ekle
await a.locator(inp).setInputFiles([...others, ...turkcell.slice(0, 2)]);
await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy'));
log('yüklendi:', await a.locator('.progress').innerText());
// Turkcell faturasına git (arama) ve elle kod ver
await a.locator('#search').fill('turkcell'); await a.keyboard.press('Enter'); await a.waitForTimeout(150);
log('seçili:', await a.locator('.detail-name').innerText());
await a.keyboard.press('/'); await a.keyboard.type('770.03'); await a.keyboard.press('Enter'); await a.waitForTimeout(150);
await a.keyboard.press('ArrowLeft'); await a.waitForTimeout(100);
log('kural yap düğmesi:', await a.locator('.rule-make').innerText());
// 2) Kural yap → pencere açılır, taslak dolu, Enter ile kaydet ve uygula
await a.locator('.rule-make').click(); await a.waitForSelector('.modal.rules');
log('taslak:', await a.locator('.rule-pattern').inputValue(), '→', await a.locator('.rule-code').inputValue(), '| uyan:', (await a.locator('.modal.rules .muted.small').nth(1).innerText()));
await a.locator('.rule-code').press('Enter'); await a.waitForTimeout(300);
log('toast:', await a.locator('.toast').innerText(), '| kural satırı:', await a.locator('.rule-row').count(), '| liste etiketi kural:', await a.locator('.row .bulk-tag:has-text("kural")').count());
// 3) Unvan kuralı: "ceptaş" → 770.04 ; kalem kuralı: "tarife" → 770.05 (Turkcell kalemleri) — VKN önceliği Turkcell'de geçerli kalmalı
await a.locator('.modal.rules select').selectOption('name'); await a.locator('.rule-pattern').fill('ceptaş'); await a.locator('.rule-code').fill('770.04'); await a.locator('.rule-code').press('Enter'); await a.waitForTimeout(300);
log('unvan kuralı:', await a.locator('.toast').innerText());
await a.locator('.modal.rules select').selectOption('item'); await a.locator('.rule-pattern').fill('tarife'); await a.locator('.rule-code').fill('770.05'); await a.locator('.rule-code').press('Enter'); await a.waitForTimeout(300);
log('kalem kuralı:', await a.locator('.toast').innerText(), '| kurallar:', (await a.locator('.rule-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' || '));
await a.keyboard.press('Escape'); await a.waitForTimeout(100);
log('durum:', await a.locator('.progress').innerText());
// 4) Kalan Turkcell XML'leri yükle → otomatik kuralla atanmalı (VKN kuralı 770.03, kalem kuralı değil)
await a.locator(inp).setInputFiles(turkcell.slice(2)); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(200);
log('yeni XML toast:', await a.locator('.toast').innerText());
await a.locator('.filter-select').selectOption('rule'); await a.waitForTimeout(150);
const ruleRows = await a.locator('.row').count();
const codes = await a.locator('.row .row-code').allInnerTexts();
const tally = codes.map((c) => c.replace('kural', '').trim()).reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {});
log('kuralla atanmış filtre:', ruleRows, 'satır |', JSON.stringify(tally));
await a.locator('.filter-select').selectOption('all');
// 5) Doğal gezinti kural atananları atlar
await a.keyboard.press('Home'); const seq = []; for (let i = 0; i < 57; i++) { seq.push(await a.locator('.detail-row b').first().innerText()); await a.keyboard.press('ArrowRight'); }
const ruled = new Set(await a.locator('.row:has(.bulk-tag:has-text("kural")) .row-sub').allInnerTexts().then((t) => t.map((x) => x.split(' · ')[0])));
log('doğal gezinti', new Set(seq).size, 'fatura; kural etiketli olanlardan birine uğradı mı:', seq.some((n) => ruled.has(n)) ? 'EVET (hata)' : 'hayır (doğru)', '| kural etiketli:', ruled.size);
// 6) Geri al: son kural uygulaması (yeni XML'ler)
await a.keyboard.press('Control+z'); await a.waitForTimeout(300);
log('Ctrl+Z durum:', await a.locator('.progress').innerText(), '(23 → 13 bekleniyor)');
await a.keyboard.press('Control+y'); await a.waitForTimeout(300);
log('Ctrl+Y:', await a.locator('.progress').innerText());
// 7) Kural dosyası dışa aktar + çalışma alanı yedeği
await a.locator('.toolbar button:has-text("Kurallar")').click(); await a.waitForSelector('.modal.rules');
const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('button:has-text("Kuralları dışa aktar")').click()]);
const rulesFile = `${S}/${dl.suggestedFilename()}`; await dl.saveAs(rulesFile);
log('kural dosyası:', dl.suggestedFilename(), JSON.parse(readFileSync(rulesFile, 'utf8')).rules.length, 'kural');
await a.keyboard.press('Escape');
await a.locator('button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click();
const [dl2] = await Promise.all([a.waitForEvent('download'), a.locator('button:has-text("Dışa aktar (.json)")').click()]);
const ws = `${S}/ws-rules.json`; await dl2.saveAs(ws);
log('yedekte kural:', JSON.parse(readFileSync(ws, 'utf8')).rules.length);
await a.keyboard.press('Escape');
// 8) Yenile → kurallar ve etiketler kalıcı
await a.reload(); await a.waitForSelector('.inv-frame');
log('reload: kural düğmesi:', await a.locator('.toolbar button:has-text("Kurallar")').innerText(), '| kural etiketli:', await a.locator('.row .bulk-tag:has-text("kural")').count());
// 9) Temiz profil B: yalnızca kural dosyasını al, XML yükle → otomatik atanmalı
const b = await mk(); await b.waitForSelector('.welcome');
await b.locator('.toolbar button:has-text("Kurallar")').click(); await b.waitForSelector('.modal.rules');
await b.locator('input[accept=".json,application/json"]').setInputFiles(rulesFile); await b.waitForTimeout(300);
log('B kural dosyası:', await b.locator('.toast').innerText());
await b.keyboard.press('Escape');
await b.locator(inp).setInputFiles(turkcell.slice(0, 3)); await b.waitForFunction(() => !document.querySelector('.busy')); await b.waitForTimeout(200);
log('B yükleme:', await b.locator('.toast').innerText(), '|', await b.locator('.progress').innerText());
// 10) Temiz profil C: çalışma alanı yedeği → kurallar gelir
const c = await mk(); await c.waitForSelector('.welcome');
await c.locator('button[title="Ayarlar"]').click(); await c.locator('.settings-tabs button:has-text("Yedek")').click();
await c.locator('input[accept=".json,application/json"]').setInputFiles(ws); await c.waitForTimeout(800);
log('C yedek:', await c.locator('.toast').innerText());
await c.keyboard.press('Escape');
log('C kural düğmesi:', await c.locator('.toolbar button:has-text("Kurallar")').innerText());
await a.screenshot({ path: `${S}/shots/e2e-05-kurallar.png` });
await a.locator('.toolbar button:has-text("Kurallar")').click(); await a.waitForSelector('.modal.rules'); await a.screenshot({ path: `${S}/shots/e2e-06-kural-pencere.png` });
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
