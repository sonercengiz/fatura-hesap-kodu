import { chromium } from 'playwright';
const SCR = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/04627602-e09f-44db-bd85-15ef9828baa0/scratchpad';
const OUT = '/Users/sonercengiz/Documents/scc/fatura-hesap-kodu/public/guide';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 820 }, deviceScaleFactor: 1.5 })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/');
await page.locator('input[accept=".xlsx,.xls"]').setInputFiles(`${SCR}/demo/EDM Gelen Faturalar Ekim 2026.xlsx`);
await page.waitForSelector('.card-no');
const no = () => page.locator('.card-no').innerText();
const code = () => page.locator('.detail-code b').innerText();
// Liste yükle (metinle)
await page.locator('button[title="Ayarlar"]').click();
await page.locator('.acc-text').fill('770.01 Kırtasiye giderleri\n770.02 Temizlik giderleri\n760.02 Kargo ve nakliye\n153 Ticari mallar\n191 İndirilecek KDV');
await page.locator('button:has-text("Listeye ekle")').click();
await page.waitForTimeout(200);
console.log('liste:', await page.locator('.acc-row').count(), 'kod | toast:', await page.locator('.toast').innerText());
await page.keyboard.press('Escape');
// Ctrl+. → isimle ara → Enter
const first = await no();
await page.keyboard.press('Control+Period');
await page.waitForSelector('.chart-pop');
await page.keyboard.type('kargo');
await page.waitForTimeout(100);
console.log('kargo sonucu:', (await page.locator('.chart-row').allInnerTexts()).join(' / '));
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.keyboard.press('ArrowLeft');
console.log('ilk faturaya atanan:', await code(), '| hesap adı satırı:', await page.locator('.detail-row:has-text("Hesap adı") b').innerText(), '| ilerledi:', first !== await (async () => { await page.keyboard.press('ArrowRight'); return no(); })());
// Ctrl+. ile kod ile ara, ok ile ikinciyi seç
await page.keyboard.press('Control+Period'); await page.keyboard.type('77'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.keyboard.press('ArrowLeft'); console.log('2. fatura (77 → ↓):', await code());
// Listede olmayan kod ata → uyarı
await page.keyboard.press('ArrowRight'); await page.keyboard.press('/'); await page.keyboard.type('770.1'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.keyboard.press('ArrowLeft');
console.log('listede olmayan kod uyarısı:', await page.locator('.issue').allInnerTexts());
await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide');
console.log('önizleme rozet:', (await page.locator('.legend').innerText()).replace(/\n/g,' | '), '| dalgalı satır:', await page.locator('tr.iss-chart').count());
await page.keyboard.press('Escape');
// Ctrl+. ile listede olmayanı ekle
await page.keyboard.press('Control+Period'); await page.keyboard.type('770.05'); await page.waitForTimeout(100);
await page.locator('button:has-text("+ Listeye ekle")').click(); await page.keyboard.type('Elektrik giderleri'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
console.log('eklendi:', await page.locator('.chart-row').allInnerTexts(), '| toplam:', await page.locator('.chart-head .muted').first().innerText());
await page.keyboard.press('Escape');
// Undo / redo: tekil
const before = await code(); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
console.log('Ctrl+Z sonrası:', await code(), '(önce', before + ') | toast:', await page.locator('.toast').innerText());
await page.keyboard.press('Control+y'); await page.waitForTimeout(200);
console.log('Ctrl+Y sonrası:', await code());
// Undo: toplu
await page.locator('button:has-text("Görünenleri seç")').click();
await page.keyboard.press('Control+Period'); await page.keyboard.type('153'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('toplu (Ctrl+. ile):', await page.locator('.toast').innerText(), '| toplu satır:', await page.locator('.row.bulk').count());
await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
console.log('toplu geri alındı → toplu satır:', await page.locator('.row.bulk').count(), '| progress:', await page.locator('.progress').innerText());
// geçmiş tutarlı mı: history sayıları (satıcı ipucu)
await page.keyboard.press('Control+Home');
console.log('ipucu satırı:', await page.locator('button.hint').innerText().catch(() => '(yok)'));
// export json'da accounts var mı
await page.locator('button[title="Ayarlar"]').click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button:has-text("Dışa aktar (.json)")').click()]);
const p = `${SCR}/ws.json`; await dl.saveAs(p);
const j = JSON.parse((await import('node:fs')).readFileSync(p, 'utf8'));
console.log('export accounts:', j.accounts.length);
await page.keyboard.press('Escape');
// rehber görseli
await page.keyboard.press('Control+Period'); await page.keyboard.type('gider'); await page.waitForTimeout(200);
const box = await page.locator('.chart-pop').boundingBox();
await page.screenshot({ path: `${OUT}/05c-liste.png`, clip: { x: box.x - 16, y: box.y - 16, width: box.width + 32, height: box.height + 32 } });
console.log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
