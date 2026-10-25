import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
const SCR = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/04627602-e09f-44db-bd85-15ef9828baa0/scratchpad';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 }, acceptDownloads: true }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} }); await page.goto('http://localhost:5179/'); return page; };

// --- Bilgisayar A
const a = await mk();
await a.locator('input[accept=".xlsx,.xls"]').setInputFiles(`${SCR}/demo/EDM Gelen Faturalar Ekim 2026.xlsx`);
await a.waitForSelector('.card-no');
for (const c of ['770.01', '760.02']) { await a.keyboard.press('/'); await a.waitForSelector('.manual-input'); await a.keyboard.type(c); await a.keyboard.press('Enter'); await a.waitForTimeout(100); }
const pdfs = readdirSync(`${SCR}/demo/pdfs`).map((f) => `${SCR}/demo/pdfs/${f}`);
await a.locator('input[accept=".pdf,application/pdf"]').setInputFiles(pdfs);
await a.waitForSelector('.files');
await a.waitForTimeout(300);
console.log('eşleşmeyen:', (await a.locator('.unmatched').allInnerTexts()).join(' | '));
// 10. faturaya git (PDF'siz), eşleşmeyen tarama.pdf'i "şu anki faturaya bağla"
await a.keyboard.press('Home'); for (let i = 0; i < 9; i++) await a.keyboard.press('ArrowRight');
const no10 = await a.locator('.detail-row:has-text("Fatura No") b').innerText();
await a.locator('.unmatched button:has-text("bağla")').click();
await a.waitForSelector('.modal:has-text("faturaya bağla")');
await a.locator('button.primary:has-text("Şu anki faturaya bağla")').click();
await a.waitForTimeout(400);
console.log('bağlandı →', no10, '| detay PDF:', await a.locator('.detail-row:has-text("PDF") b').innerText().catch(() => 'YOK'), '| canvas:', await a.locator('canvas.pdf-page').count(), '| eşleşmeyen kaldı mı:', await a.locator('.unmatched').count());
// Kaldır ve tekrar bağla (arama ile)
await a.locator('button:has-text("elle · kaldır")').click();
await a.waitForTimeout(200);
console.log('kaldırıldı, eşleşmeyen:', await a.locator('.unmatched').count());
await a.locator('.unmatched button:has-text("bağla")').click();
await a.locator('.modal input[placeholder^="Fatura no"]').fill('GNS2026000001078');
await a.keyboard.press('Enter');
await a.waitForTimeout(300);
console.log('arama ile bağlandı →', await a.locator('.detail-row:has-text("Fatura No") b').innerText(), '|', await a.locator('.detail-row:has-text("PDF") b').innerText());
// Dışa aktar
await a.locator('button[title="Ayarlar"]').click();
const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('button:has-text("Dışa aktar (.json)")').click()]);
const out = `${SCR}/${dl.suggestedFilename()}`; await dl.saveAs(out);
const j = JSON.parse(readFileSync(out, 'utf8'));
console.log('export:', dl.suggestedFilename(), '| partiler:', j.batches.length, '| atama:', j.batches[0].assignments.length, '| link:', JSON.stringify(j.batches[0].links), '| geçmiş:', j.history.length, '| boyut KB:', Math.round(readFileSync(out).length / 1024));

// --- Bilgisayar B (temiz profil): içe aktar, sonra PDF'leri ekle → elle bağlantı geri gelmeli
const b = await mk();
await b.waitForSelector('text=EDM fatura listesini yükleyin');
await b.locator('button:has-text("Kullanım rehberini aç")').waitFor();
// Ayarlar düğmesi karşılama ekranında da var
await b.locator('button[title="Ayarlar"]').click();
await b.locator('input[accept=".json,application/json"]').setInputFiles(out);
await b.waitForSelector('.card-no, canvas.pdf-page');
await b.keyboard.press('Escape');
await b.waitForTimeout(300);
console.log('B içe aktarma:', await b.locator('.progress').innerText(), '| slot Q:', await b.locator('.slot').nth(0).innerText().then((t) => t.replace('\n', ' ')));
await b.locator('input[accept=".pdf,application/pdf"]').setInputFiles(pdfs);
await b.waitForSelector('.files');
await b.waitForTimeout(500);
console.log('B PDF sonrası files:', (await b.locator('.files').innerText()).replace(/\n/g, ' | '));
await b.locator('.search').fill('GNS2026000001078'); await b.keyboard.press('Enter'); await b.waitForTimeout(400);
console.log('B elle bağlantı korundu mu:', await b.locator('.detail-row:has-text("PDF") b').innerText().catch(() => 'YOK'));
// Tekrar içe aktar (idempotent) 
await b.locator('button[title="Ayarlar"]').click();
await b.locator('input[accept=".json,application/json"]').setInputFiles(out);
await b.waitForTimeout(600);
console.log('B ikinci içe aktarma:', await b.locator('.toast').innerText().catch(() => '-'));
console.log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
