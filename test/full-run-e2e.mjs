import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const S = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/04627602-e09f-44db-bd85-15ef9828baa0/scratchpad';
const REAL = 'test/fixtures/edm-ornek.xlsx';
const PDF_DIR = `${S}/scale/pdfs`;
const rows = JSON.parse(readFileSync(`${S}/scale/rows.json`, 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = []; const log = (...a) => console.log(...a);
const t = () => performance.now();
const mk = async (seen = true) => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 }, acceptDownloads: true }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Deneme Yayıncılık' : undefined));
  if (seen) await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
  await page.goto('http://localhost:5179/'); return page; };
const heap = (p) => p.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576));

// ---------- 1. İlk açılış
const p = await mk(false);
await p.waitForSelector('.modal.guide'); log('1. İlk açılışta rehber açıldı:', true);
await p.keyboard.press('Escape');
await p.locator('button[title="Ayarlar"]').click(); await p.locator('input[placeholder="ABC LTD"]').fill('Deneme Yayıncılık'); await p.keyboard.press('Escape');

// ---------- 2. Gerçek Excel
let t0 = t(); await p.locator('input[accept=".xlsx,.xls"]').setInputFiles(REAL); await p.waitForSelector('.card-no'); log(`2. Excel (249 satır) yüklendi: ${Math.round(t() - t0)} ms |`, await p.locator('.progress').innerText());

// ---------- 3. 204 PDF (249 fatura)
const pdfs = readdirSync(PDF_DIR).map((f) => `${PDF_DIR}/${f}`);
t0 = t(); await p.locator('input[accept=".pdf,application/pdf"]').setInputFiles(pdfs); await p.waitForSelector('.files'); await p.locator('.busy').waitFor({ state: 'hidden', timeout: 120000 });
log(`3. ${pdfs.length} PDF eklendi: ${Math.round(t() - t0)} ms |`, (await p.locator('.files').innerText()).split('\n')[0], '| eşleşmeyen:', await p.locator('.unmatched').count(), '| heap MB:', await heap(p));
await p.locator('.toast').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
// birleştirilmiş dosyadaki son fatura doğru sayfada mı
await p.locator('.search').fill(rows[248].no); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
log('   birleşik PDF son fatura →', await p.locator('.detail-row:has-text("PDF") b').innerText());
await p.locator('.search').fill(rows[205].no); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
log('   3 sayfalı fatura →', await p.locator('.detail-row:has-text("PDF") b').innerText(), '| canvas:', await p.locator('canvas.pdf-page').count());
await p.locator('.search').fill(''); await p.keyboard.press('Escape');

// ---------- 4. 60 fatura boyunca gezinti hızı + bellek
await p.keyboard.press('Control+Home'); t0 = t();
for (let i = 0; i < 60; i++) { await p.keyboard.press('ArrowRight'); await p.waitForSelector('canvas.pdf-page', { timeout: 5000 }).catch(() => {}); }
log(`4. 60 fatura gezildi: ${Math.round((t() - t0) / 60)} ms/fatura | heap MB:`, await heap(p));

// ---------- 5. Hesap listesi + Ctrl+.
await p.locator('button[title="Ayarlar"]').click();
await p.locator('.acc-text').fill('770.01 Kırtasiye giderleri\n770.02 Temizlik\n760.02 Kargo\n153 Ticari mallar\n740.01 Elektrik\n320.001 Satıcılar'); await p.locator('button:has-text("Listeye ekle")').click(); await p.waitForTimeout(150); await p.keyboard.press('Escape');
await p.keyboard.press('Control+Home');
await p.keyboard.press('Control+Period'); await p.waitForSelector('.chart-pop'); await p.keyboard.type('kargo'); await p.waitForTimeout(100); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
await p.keyboard.press('ArrowLeft'); log('5. Ctrl+. ile atanan:', await p.locator('.detail-code b').innerText(), '| hesap adı:', await p.locator('.detail-row:has-text("Hesap adı") b').innerText());

// ---------- 6. Kısayol öğrenme: aynı kodu 3 kez → hayalet → kaydet → tuşla ata
for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await p.keyboard.press('/'); await p.waitForSelector('.manual-input'); await p.keyboard.type('770.01'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('ArrowLeft'); }
await p.keyboard.press('ArrowRight');
log('6. hayalet W:', (await p.locator('.slot').nth(1).innerText()).replace(/\n/g, ' '));
await p.locator('.slot').nth(1).locator('.slot-icon.save').click(); await p.waitForTimeout(100);
const before = await p.locator('.card-no, .detail-row:has-text("Fatura No") b').first().innerText();
await p.keyboard.press('w'); await p.waitForTimeout(100);
const after = await p.locator('.detail-row:has-text("Fatura No") b').innerText();
await p.keyboard.press('ArrowLeft'); log('   W ile atandı ve ilerledi:', before !== after, '| kod:', await p.locator('.detail-code b').innerText());

// ---------- 7. Satıcı ipucu (Boşluk), Backspace, Ctrl+Z/Y
await p.locator('.search').fill('1234567801'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.locator('.search').fill(''); await p.keyboard.press('Escape');
await p.keyboard.press('/'); await p.keyboard.type('153'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
// aynı satıcının bir sonraki faturasına git (filtre: arama ile)
await p.locator('.search').fill('YILDIZ'); await p.waitForTimeout(100);
const kurmay = await p.locator('.row').count();
await p.locator('.row').nth(1).click(); await p.locator('.search').fill(''); await p.keyboard.press('Escape');
log('7. ipucu satırı:', (await p.locator('button.hint').innerText().catch(() => '(yok)')).replace(/\n/g, ' '), `| aynı satıcı ${kurmay} fatura`);
await p.keyboard.press(' '); await p.waitForTimeout(100); await p.keyboard.press('ArrowLeft');
log('   Boşluk ile atanan:', await p.locator('.detail-code b').innerText());
await p.keyboard.press('Backspace'); await p.waitForTimeout(100); log('   Backspace sonrası:', await p.locator('.detail-code b').innerText());
await p.keyboard.press('Control+z'); await p.waitForTimeout(150); log('   Ctrl+Z sonrası:', await p.locator('.detail-code b').innerText());
await p.keyboard.press('Control+y'); await p.waitForTimeout(150); log('   Ctrl+Y sonrası:', await p.locator('.detail-code b').innerText());

// ---------- 8. Sıralama, filtre, toplu atama
await p.locator('.sort-select').selectOption('date-supplier'); await p.waitForTimeout(200);
log('8. tarih sırası ilk:', (await p.locator('.row .row-sub').first().innerText()));
await p.locator('.filter-select').selectOption('unassigned'); await p.waitForTimeout(200);
await p.keyboard.press('Home');
await p.locator('.bulk-toggle').click(); await p.locator('button:has-text("Bu satıcıyı seç")').click(); await p.waitForTimeout(100);
const selN = await p.locator('.row.selected').count();
await p.locator('.bulk-input').fill('740.01'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
log(`   toplu: ${selN} seçildi →`, await p.locator('.toast').innerText());
await p.locator('.filter-select').selectOption('all'); await p.waitForTimeout(150);
await p.keyboard.press('Home'); const a1 = await p.locator('.detail-row:has-text("Fatura No") b').innerText();
let skipped = 0; for (let i = 0; i < 30; i++) { await p.keyboard.press('ArrowRight'); if (await p.locator('.row.current.bulk').count()) skipped++; }
log('   30 adımda toplu satıra düşme:', skipped, '(0 olmalı) | Ctrl+→ toplu satırı gösterir:', await (async () => { await p.keyboard.press('Control+Home'); let hit = 0; for (let i = 0; i < 40; i++) { await p.keyboard.press('Control+ArrowRight'); if (await p.locator('.row.current.bulk').count()) { hit = 1; break; } } return !!hit; })());

// ---------- 9. F5 + F1 + dosya doğrulama
await p.keyboard.press('F5'); await p.waitForSelector('.modal.wide'); await p.waitForTimeout(300);
log('9. önizleme:', (await p.locator('.modal-head .muted').first().innerText()), '|', (await p.locator('.legend').innerText()).replace(/\n/g, ' · '));
await p.keyboard.press('Escape');
const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('F1')]);
const out = `${S}/${dl.suggestedFilename()}`; await dl.saveAs(out);
const wb = XLSX.read(readFileSync(out)); const ws = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
const codes = aoa.slice(1).filter((r) => r[2] != null && r[2] !== '');
const orderOk = aoa.slice(1).every((r, i) => String(r[0]) === rows[i].no);
log('   dosya:', dl.suggestedFilename(), '| satır:', aoa.length - 1, '| sütun:', aoa[0].length, '| C1:', aoa[0][2], '| kodlu satır:', codes.length, '| C tipi metin:', ws[XLSX.utils.encode_cell({ r: 1, c: 2 })]?.t === 's', '| sıra girdiyle aynı:', orderOk, '| I2 sayı:', typeof aoa[1][8] === 'number');
log('   toolbar:', await p.locator('.progress').innerText());

// ---------- 10. Yenileme ve ikinci firma yalıtımı
await p.reload(); await p.waitForSelector('.progress');
log('10. yenileme sonrası:', await p.locator('.progress').innerText(), '| firma:', await p.locator('.firm-select option:checked').innerText(), '| PDF:', (await p.locator('.files').innerText()).split('\n')[0]);
await p.locator('.firm-select').selectOption('__new'); await p.waitForTimeout(400);
log('   yeni firma:', await p.locator('.firm-select option:checked').innerText(), '| boş başladı:', await p.locator('.welcome').count() === 1, '| slot W:', (await p.locator('.slot').nth(1).innerText()).replace(/\n/g, ' '));

// ---------- 11. Yedek al → temiz profilde içe aktar
await p.locator('button[title="Ayarlar"]').click();
const [dl2] = await Promise.all([p.waitForEvent('download'), p.locator('button:has-text("Dışa aktar (.json)")').click()]);
const ws2 = `${S}/full-ws.json`; await dl2.saveAs(ws2);
log('11. yedek boyutu KB:', Math.round(readFileSync(ws2).length / 1024));
const q = await mk();
await q.locator('button[title="Ayarlar"]').click(); await q.locator('input[accept=".json,application/json"]').setInputFiles(ws2); await q.waitForTimeout(1500);
log('   içe aktarma:', await q.locator('.toast').innerText().catch(() => '-'));
await q.keyboard.press('Escape');
const den = await q.locator('.firm-select option:has-text("Deneme")').first().getAttribute('value'); await q.locator('.firm-select').selectOption(den); await q.waitForTimeout(500);
log('   ikinci bilgisayar:', await q.locator('.progress').innerText(), '| slot W:', (await q.locator('.slot').nth(1).innerText()).replace(/\n/g, ' '), '| liste:', await q.evaluate(() => document.querySelectorAll('.acc-row').length));
// ---------- 12. Yedek hatırlatması ve aynı adla firma
log('12. yedek uyarısı (p, yedek az önce alındı):', await p.locator('.backup-hint').count(), '(0 olmalı) | q (hiç yedek yok):', await q.locator('.backup-hint').count(), '(1 olmalı)');
await q.locator('.backup-hint button:has-text("Bugün değil")').click(); await q.waitForTimeout(100);
log('   "Bugün değil" sonrası:', await q.locator('.backup-hint').count());
await q.locator('.firm-select').selectOption('__new'); await q.waitForTimeout(400);
log('   aynı adla yeni firma:', await q.locator('.toast').innerText().catch(() => '-'), '| firma sayısı:', (await q.locator('.firm-select option').count()) - 1);
log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
