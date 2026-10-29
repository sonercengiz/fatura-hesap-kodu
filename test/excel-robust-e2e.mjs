// G1 (tur 3): Excel çıktısının sağlamlığı. Şablon kaydı yenilemeden ve sekmeler arasında aynı kalır; başlıklar metin ("%20" sayıya
// dönmez); aynı alan iki sütunda; boş başlık önizlemede "(boş)"; sütun harfleri; gerçek tarih hücresi; matrahı yazılmamış operatör
// faturasında KDV %20 sütununa türetilmiş matrah, ödenecek ≠ fatura toplamı uyarısı.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { operatorXml } from './e2e-helpers.mjs';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
mkdirSync(`${S}/op`, { recursive: true });
const op = `${S}/op/OPR2026000000001.xml`;
writeFileSync(op, operatorXml(readFileSync(new URL('./fixtures/ubl-sirket.xml', import.meta.url), 'utf8')));
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().slice(0, 5).map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'advanced');  } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles([...files, op]); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);

// İkinci sekme: şablon değişikliği buraya da gelmeli
const b = await ctx.newPage();
await b.goto('http://localhost:5179/'); await b.waitForSelector('.inv-frame'); await b.waitForTimeout(300);

const headers = async (p) => p.locator('.tpl-header').evaluateAll((els) => els.map((e) => e.value));
await a.locator('.toolbar button:has-text("Şablon")').click(); await a.waitForSelector('.tpl-modal');
// Yalnızca no, tarih, unvan, tutar kalsın; sonra KDV dökümü, ikinci tarih, fatura toplamı, boş sütun
const keep = new Set(['Fatura No', 'Fatura Tarihi', 'Gönderen Unvan/Ad Soyad', 'Tutar']);
for (let k = (await a.locator('.tpl-header').count()) - 1; k >= 0; k--) if (!keep.has(await a.locator('.tpl-header').nth(k).inputValue())) await a.locator('.tpl-row').nth(k).locator('button[title="Sütunu kaldır"]').click();
await a.locator('.tpl-add-kdv').click();
// KDV dökümü öğesini Özel'e çevir: tek tek sütunlar (başlığı burada değiştirilebilir); öğenin kendisi kdv-modes testinde
await a.locator('.tpl-mode button:has-text("Basit")').click(); await a.locator('.tpl-vat label', { hasText: 'Özel' }).locator('input').check();
await a.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await a.waitForTimeout(150);
const addField = async (id, header) => {
  await a.locator('.tpl-add select').selectOption(id); await a.locator('.tpl-add button:has-text("Sütun ekle")').click();
  if (header !== undefined) await a.locator('.tpl-header').last().fill(header);
};
const dateOpt = await a.locator(`.tpl-add select option[value="date"]`).innerText();
check('eklenmiş alan seçenekte harfiyle söylenir, yine seçilebilir', /ekli: B/.test(dateOpt), dateOpt);
await addField('date', 'Belge Tarihi');
await addField('taxInclusive');
await addField('blank');
// "%20" başlığı (kullanıcının Excel'de yazdığı gibi)
const k20 = (await headers(a)).indexOf('Matrah %20');
await a.locator('.tpl-header').nth(k20).fill('%20');
await a.locator('.tpl-date-cells').selectOption('date');
// Bütün şablon sütunları Excel'de beklenir (KDV %0/%1/%10 boş): "Boş sütunları atla" kapalı (atlama ayrı testte)
await a.locator('.tpl-modal .skip-empty input').uncheck();
const before = await headers(a);
check('aynı alan ikinci kez eklendi', before.filter((h) => h === 'Fatura Tarihi' || h === 'Belge Tarihi').length === 2, before.join(' | '));
check('önizlemede boş başlık "(boş)", sütun harfleri', (await a.locator('.tpl-preview th').last().innerText()).includes('(boş)') && (await a.locator('.tpl-preview th .col-letter').first().innerText()) === 'A', await a.locator('.tpl-preview th').last().innerText());
await a.locator('.tpl-modal button:has-text("Kapat")').click(); await a.waitForTimeout(400);

// Öteki sekme aynı şablonu görür
await b.waitForTimeout(800);
await b.locator('.toolbar button:has-text("Şablon")').click(); await b.waitForSelector('.tpl-modal');
check('ikinci sekmede aynı şablon', JSON.stringify(await headers(b)) === JSON.stringify(before), (await headers(b)).join(' | '));
check('ikinci sekmede tarih seçimi', (await b.locator('.tpl-date-cells').inputValue()) === 'date', await b.locator('.tpl-date-cells').inputValue());
await b.keyboard.press('Escape'); await b.close();

// Yenile: şablon aynı
await a.reload(); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(400);
await a.locator('.toolbar button:has-text("Şablon")').click(); await a.waitForSelector('.tpl-modal');
check('yenileyince aynı şablon', JSON.stringify(await headers(a)) === JSON.stringify(before), (await headers(a)).join(' | '));
check('yenileyince aynı tarih seçimi', (await a.locator('.tpl-date-cells').inputValue()) === 'date', '');
await a.keyboard.press('Escape'); await a.waitForSelector('.tpl-modal', { state: 'detached' });

// Önizleme: harfler, (boş), operatör faturası
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
const ths = await a.locator('.modal.wide thead th').allInnerTexts();
check('önizleme başlığında sütun harfi', ths[2].startsWith('A') && ths[2].includes('Fatura No'), ths[2]);
check('önizlemede boş başlık "(boş)"', ths[ths.length - 1].includes('(boş)'), ths[ths.length - 1]);
const legend = await a.locator('.modal.wide .legend').innerText();
check('uyarı: matrah türetildi (1)', /Matrah vergiden hesaplandı: 1/.test(legend), legend);
check('uyarı: ödenecek ≠ fatura toplamı (1)', /Ödenecek ≠ fatura toplamı: 1/.test(legend), legend);
const opRow = a.locator('.modal.wide tbody tr', { hasText: 'OPR2026000000001' });
const title = await opRow.getAttribute('title');
check('satır ipucu tutarları söyler', /ödenecek 562,25 · fatura toplamı 496,26/.test(title) && /%20 matrahı 360,98/.test(title), title);
await a.keyboard.press('Escape');

const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
const path = `${S}/excel-robust.xlsx`; await dl.saveAs(path);
const wb = XLSX.read(readFileSync(path), { cellNF: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
const head = rows[0];
check('Excel başlıkları uygulamadakiyle aynı', JSON.stringify(head.map((h) => h ?? '')) === JSON.stringify(before), head.join(' | '));
const hcells = head.map((_, c) => ws[XLSX.utils.encode_cell({ r: 0, c })]);
check('bütün başlıklar metin; "%20" metin kalır', hcells.every((c) => c && c.t === 's') && hcells[k20].v === '%20', hcells.map((c) => c?.t).join(''));
const r = rows.find((x) => x[0] === 'OPR2026000000001');
const col = (h) => head.indexOf(h);
check('operatör: %20 matrahı türetildi, KDV %20 dolu, oranı uyuşmayan boş', r[k20] === 360.98 && r[col('KDV %20')] === 72.2 && (r[col('Oranı Uyuşmayan KDV')] ?? '') === '', `${r[k20]} / ${r[col('KDV %20')]} / ${r[col('Oranı Uyuşmayan KDV')]}`);
check('operatör: Tutar ödenecek, Fatura Toplamı KDV dahil', r[col('Tutar')] === 562.25 && r[col('Fatura Toplamı')] === 496.26, `${r[col('Tutar')]} / ${r[col('Fatura Toplamı')]}`);
const rowIdx = rows.indexOf(r);
const d1 = ws[XLSX.utils.encode_cell({ r: rowIdx, c: col('Fatura Tarihi') })];
const d2 = ws[XLSX.utils.encode_cell({ r: rowIdx, c: col('Belge Tarihi') })];
check('tarih hücreleri gerçek tarih (10.09.2026 = 46275), iki sütunda da', d1.t === 'n' && d1.v === 46275 && d1.z === 'dd.mm.yyyy' && d2.v === 46275, `${d1.t} ${d1.v} ${d1.z} / ${d2?.v}`);

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
