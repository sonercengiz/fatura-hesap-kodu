// Tam kullanım testi: gerçek XML'ler → yükle → gez → ata → F5 → F1 (Excel XML ile karşılaştırılır) → tekrar yükleme → yeniden açma → çıkarma → yeni parti → yedek
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const S = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const XML_DIR = process.env.XML_DIR || `${S}/xmlin`; // gerçek e-Fatura XML'leri (depoya girmez)
const files = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const log = (...a) => console.log(...a);
const t = () => performance.now();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Deneme Ltd' : undefined));
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/');
await page.waitForSelector('.welcome');
log('karşılama ekranı OK');

// 1) 57 XML yükle (yeni parti kendiliğinden)
let t0 = t();
await page.locator('input[accept*=".zip"]').setInputFiles(files);
await page.waitForSelector('.inv-frame', { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('.busy'));
log(`57 XML yüklendi: ${Math.round(t() - t0)} ms`);
const rows = await page.locator('.list .row').count();
const batchName = await page.locator('.batch-select option:checked').innerText();
log('liste satırı:', rows, '| parti adı:', batchName);
log('alt bilgi:', await page.locator('.files span').innerText());

// 2) Görsel: çerçeve içeriği satıcı adını içeriyor mu; 57 faturada gez ve ölç
const frameText = async () => page.frameLocator('.inv-frame').locator('body').innerText();
await page.waitForFunction(() => document.querySelector('.inv-frame')?.contentDocument?.body?.innerText?.length > 50);
const firstName = await page.locator('.detail-name').innerText();
const ft = await frameText();
log('ilk fatura:', firstName, '| çerçeve metni içeriyor:', ft.toLocaleLowerCase('tr').includes(firstName.split(' ')[0].toLocaleLowerCase('tr')) ? 'EVET' : 'HAYIR', '| metin uzunluğu', ft.length);
await page.keyboard.press('Home');
t0 = t();
let okFrames = 0; let fallback = 0;
for (let i = 0; i < 57; i++) {
  const no = await page.locator('.detail-row b').first().innerText();
  await page.waitForFunction((n) => { const d = document.querySelector('.inv-frame')?.contentDocument; return d && d.body && d.body.innerText.replace(/\s+/g, '').includes(n.replace(/\s+/g, '')) && !document.querySelector('.pdf-status'); }, no, { timeout: 10000 }).catch(() => { fallback++; });
  okFrames++;
  if (await page.locator('.inv-note').count()) fallback++;
  await page.keyboard.press('ArrowRight');
}
log(`57 fatura gezildi: ${Math.round((t() - t0) / 57)} ms/fatura · fatura no'su görselde bulunamayan/sade görünüm: ${fallback}`);
await page.screenshot({ path: `${S}/shots/e2e-01-ekran.png` });

// 3) Atama: elle 3 kod, kısayola kaydet, Q ile 5 atama, toplu atama, F5
await page.keyboard.press('Home');
for (const c of ['770.01', '770.01', '770.01']) { await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type(c); await page.keyboard.press('Enter'); await page.waitForTimeout(80); }
await page.locator('.slot').nth(0).locator('.slot-icon.save').click();
for (let i = 0; i < 5; i++) { await page.keyboard.press('q'); await page.waitForTimeout(60); }
await page.keyboard.press(' '); // satıcı ipucu varsa
await page.waitForTimeout(100);
log('atanan:', await page.locator('.progress').innerText());
await page.keyboard.press('F5');
await page.waitForSelector('.modal.wide');
const head = await page.locator('.modal-head .muted').innerText();
const ths = await page.locator('.modal.wide thead th').allInnerTexts();
log('önizleme:', head, '| sütunlar:', ths.slice(0, 5).join(' | '), '… toplam', ths.length - 1);
await page.screenshot({ path: `${S}/shots/e2e-02-onizleme.png` });
await page.keyboard.press('Escape');

// 4) F1 → Excel indir ve doğrula
const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('F1')]);
const out = `${S}/${dl.suggestedFilename()}`;
await dl.saveAs(out);
log('indirilen:', dl.suggestedFilename());
const wb = XLSX.read(readFileSync(out), { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
log('Excel:', wb.SheetNames, 'satır', aoa.length - 1, 'sütun', aoa[0].length, '| başlık:', aoa[0].slice(0, 4).join(' | '));
// XML alanlarıyla karşılaştır
let mismatch = 0;
const byNo = new Map(aoa.slice(1).map((r) => [r[0], r]));
for (const f of files) {
  const x = readFileSync(f, 'utf8');
  const no = (x.match(/<cbc:ID>([^<]+)<\/cbc:ID>/) || [])[1];
  const pay = Number((x.match(/<cbc:PayableAmount[^>]*>([^<]*)/) || [])[1]);
  const date = (x.match(/<cbc:IssueDate>(\d{4})-(\d{2})-(\d{2})/) || []);
  const r = byNo.get(no);
  if (!r) { mismatch++; log('  Excelde yok:', no); continue; }
  if (Math.abs(r[8] - pay) > 0.001 || r[1] !== `${date[3]}/${date[2]}/${date[1]}`) { mismatch++; log('  uyuşmazlık:', no, r[1], r[8], 'xml:', date, pay); }
  if (r[4] !== 'Satış' || !['Temel', 'Ticari'].includes(r[5])) { mismatch++; log('  tip/tür:', no, r[4], r[5]); }
  if (typeof r[6] !== 'string' || !/^\d{10,11}$/.test(r[6])) { mismatch++; log('  VKN:', no, r[6]); }
}
const codes = aoa.slice(1).filter((r) => r[2]).length;
log(`XML↔Excel karşılaştırma: ${files.length} fatura, uyuşmazlık ${mismatch}, kodlu satır ${codes}`);
const dates = aoa.slice(1).map((r) => r[1].split('/').reverse().join(''));
log('çıktı tarih sırası artan mı:', dates.every((d, i) => i === 0 || d >= dates[i - 1]));

// 5) Aynı dosyaları tekrar yükle → atlanır
await page.locator('input[accept*=".zip"]').setInputFiles(files.slice(0, 5));
await page.waitForSelector('.toast');
log('tekrar yükleme:', await page.locator('.toast').innerText());

// 6) Bozuk dosya + fatura olmayan dosya
writeFileSync(`${S}/bozuk.xml`, '<Invoice><cbc:ID>X');
writeFileSync(`${S}/not.txt`, 'merhaba');
await page.locator('input[accept*=".zip"]').setInputFiles([`${S}/bozuk.xml`, `${S}/not.txt`]);
await page.waitForTimeout(300);
log('bozuk yükleme:', await page.locator('.toast').innerText());

// 7) Yeniden yükle → kalıcılık ve görsel
await page.reload();
await page.waitForSelector('.inv-frame', { timeout: 20000 });
log('yeniden yükleme sonrası:', await page.locator('.progress').innerText(), '|', await page.locator('.files span').innerText());

// 8) Faturayı partiden çıkar
const before = await page.locator('.list .row').count();
await page.locator('.files button', { hasText: 'çıkar' }).first().click();
await page.waitForTimeout(300);
log('çıkarma:', before, '→', await page.locator('.list .row').count());

// 9) Yeni parti + 3 XML; parti listesi
await page.locator('.batch-select').selectOption('__new');
await page.waitForTimeout(300);
await page.locator('input[accept*=".zip"]').setInputFiles(files.slice(10, 13));
await page.waitForFunction(() => !document.querySelector('.busy'));
log('yeni parti:', await page.locator('.batch-select option:checked').innerText(), '| satır', await page.locator('.list .row').count(), '| toplam parti', (await page.locator('.batch-select option').count()) - 1);

// 10) Çalışma alanı dışa aktar ve boyut
await page.locator('button[title="Ayarlar"]').click();
const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Dışa aktar (.json)' }).click()]);
const out2 = `${S}/${dl2.suggestedFilename()}`; await dl2.saveAs(out2);
const ws2 = JSON.parse(readFileSync(out2, 'utf8'));
log('yedek:', dl2.suggestedFilename(), Math.round(readFileSync(out2).length / 1024), 'KB · sürüm', ws2.version, '· parti', ws2.batches.length, '· fatura', ws2.batches.reduce((s, b) => s + b.invoices.length, 0));
await page.keyboard.press('Escape');

// 11) Koyu tema görüntü
await page.locator('.theme-btn').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${S}/shots/e2e-03-koyu.png` });
await page.locator('.theme-btn').click();

// bellek
const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1);
log('JS bellek (MB):', mem);
log('hatalar:', errors.length ? errors : 'yok');
await browser.close();
