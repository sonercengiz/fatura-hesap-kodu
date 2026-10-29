// KDV dökümü tek öğe (tur 3 G3): Basit görünümde Yok / Toplam / Güncel oranlar + Diğer / Her oran ayrı / Özel. Excel'e yazılırken
// dönemdeki oranlara açılır: güncel oranlar ayrı, %8/%18 tek "Diğer" (oran + matrah + KDV), oranı uyuşmayan KDV ayrı. Alt başlık
// önizlemeden değiştirilir; ✕ bütün KDV dökümünü kaldırır; seçim yenileyince kalır.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const S = process.env.SCRATCH || '/tmp';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
// %18'li (eski oran) ve oranı uyuşmayan (oran alanı vergiyle uymuyor) birer fatura
const yld = (no) => readFileSync(files.find((f) => f.includes(no)), 'utf8');
const old18 = yld('YLD2026000000003').replace('<cbc:ID>YLD2026000000003</cbc:ID>', '<cbc:ID>ESK2026000000001</cbc:ID>').replaceAll('<cbc:Percent>20</cbc:Percent>', '<cbc:Percent>18</cbc:Percent>').replaceAll('588.00', '529.20');
const odd = yld('YLD2026000000001').replace('<cbc:ID>YLD2026000000001</cbc:ID>', '<cbc:ID>TST2026000000001</cbc:ID>').replaceAll('<cbc:Percent>20</cbc:Percent>', '<cbc:Percent>3</cbc:Percent>');
writeFileSync(`${S}/ESK2026000000001.xml`, old18); writeFileSync(`${S}/TST2026000000001.xml`, odd);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let nDl = 0;
const excel = async () => {
  const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
  const path = `${S}/kdv-modes-${nDl++}.xlsx`; await dl.saveAs(path);
  const wb = XLSX.read(readFileSync(path));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const head = rows[0];
  const row = (no) => { const r = rows.find((x) => x[head.indexOf('Fatura No')] === no); return Object.fromEntries(head.map((h, k) => [h, r?.[k] ?? null])); };
  return { head, row };
};
const openTpl = async () => { await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal'); };
const pick = async (label) => { await a.locator('.tpl-vat label', { hasText: label }).first().locator('input').check(); await a.waitForTimeout(200); };
const closeTpl = async () => { await a.keyboard.press('Escape'); await a.waitForSelector('.tpl-modal', { state: 'detached' }); };

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles([...files, `${S}/ESK2026000000001.xml`, `${S}/TST2026000000001.xml`]); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);

await openTpl();
check('başta KDV dökümü "Yok"', await a.locator('.tpl-vat label', { hasText: 'Yok' }).locator('input').isChecked(), '');
await pick('Güncel oranlar');
const seen = await a.locator('.tpl-vat-seen').innerText();
check('dönemdeki oranlar söylenir', /%1, %10, %18, %20/.test(seen) && /oranı uyuşmayan 1 fatura/.test(seen), seen);
check('seçilen açılımın Excel harfleri (aralık)', /^[A-Z]+–[A-Z]+$/.test(await a.locator('.tpl-vat .tpl-radio.on .tpl-check-letter').innerText()), await a.locator('.tpl-vat .tpl-radio.on .tpl-check-letter').innerText());
await closeTpl();
let x = await excel();
check('Güncel: Matrah %20, Diğer üçlüsü ve Oranı Uyuşmayan KDV yazılır', ['Matrah %20', 'KDV %20', 'Diğer Oran', 'Diğer Matrah', 'Diğer KDV', 'Oranı Uyuşmayan KDV'].every((h) => x.head.includes(h)), x.head.join(' | '));
check('Güncel: dönemde olmayan %0 yazılmaz (Boş sütunları atla)', !x.head.includes('Matrah %0') && !x.head.includes('Matrah %18'), x.head.join(' | '));
const e18 = x.row('ESK2026000000001');
check('Güncel: %18 Diğer\'de (oran, matrah, KDV)', e18['Diğer Oran'] === '%18' && e18['Diğer Matrah'] === 2940 && e18['Diğer KDV'] === 529.2 && e18['Matrah %20'] === null, JSON.stringify(e18));
const t3 = x.row('TST2026000000001');
check('Güncel: oranı uyuşmayan KDV ayrı sütunda, Diğer boş', t3['Oranı Uyuşmayan KDV'] > 0 && t3['Diğer KDV'] === null, JSON.stringify(t3));

// Önizlemeden alt başlık değiştir: Excel'e yazılır, şablonda tek öğe kalır
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
const th20 = a.locator('.modal.wide thead th.hdr-edit', { hasText: 'Matrah %20' });
check('önizlemede KDV başlığı oran grubunun renginde', /vg-20/.test(await th20.getAttribute('class')), await th20.getAttribute('class'));
await th20.locator('.hdr-text').click(); await a.locator('.modal.wide .hdr-input').fill('%20 Kdv Matrahı'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
x = await excel();
check('alt başlık Excel\'de değişti', x.head.includes('%20 Kdv Matrahı') && !x.head.includes('Matrah %20'), x.head.join(' | '));
await a.evaluate(() => localStorage.setItem('tplMode', 'advanced'));
await openTpl();
check('Gelişmiş\'te KDV dökümü tek satır, açılımı seçilir', (await a.locator('.tpl-vat-mode').count()) === 1 && (await a.locator('.tpl-vat-mode').inputValue()) === 'current', await a.locator('.tpl-vat-mode').count());
await a.locator('.tpl-mode button:has-text("Basit")').click();

// Toplam
await pick('Toplam'); await closeTpl();
x = await excel();
check('Toplam: KDV Matrahı + KDV Toplamı, oran sütunu yok', x.head.includes('KDV Matrahı') && x.head.includes('KDV Toplamı') && !x.head.some((h) => /%\d/.test(h ?? '')), x.head.join(' | '));
const e18t = x.row('ESK2026000000001');
check('Toplam: %18\'li faturada matrah ve KDV', e18t['KDV Matrahı'] === 2940 && e18t['KDV Toplamı'] === 529.2, JSON.stringify(e18t));

// Her oran ayrı
await openTpl(); await pick('Her oran ayrı'); await closeTpl();
x = await excel();
check('Her oran ayrı: %18 kendi sütununda, Diğer yok, oranı uyuşmayan ayrı', x.head.includes('Matrah %18') && x.head.includes('KDV %18') && !x.head.includes('Diğer KDV') && x.head.includes('Oranı Uyuşmayan KDV'), x.head.join(' | '));
check('Her oran ayrı: oranlar küçükten büyüğe', x.head.indexOf('Matrah %10') < x.head.indexOf('Matrah %18') && x.head.indexOf('Matrah %18') < x.head.indexOf('%20 Kdv Matrahı'), x.head.join(' | '));

// Liste aynı açılımı gösterir; yenileyince seçim kalır
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(200);
check('liste açılmış KDV sütunlarını gösterir', (await a.locator('.lv-table thead th.vg-18').count()) === 2, await a.locator('.lv-table thead th.vg-18').count());
await a.reload(); await a.waitForSelector('.listview'); await a.waitForTimeout(400);
await openTpl();
check('yenileyince "Her oran ayrı" seçili', await a.locator('.tpl-vat label', { hasText: 'Her oran ayrı' }).locator('input').isChecked(), '');
await closeTpl();

// ✕ bütün KDV dökümünü kaldırır
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
await a.locator('.modal.wide thead th.vg-18').first().hover(); await a.locator('.modal.wide thead th.vg-18 .hdr-x').first().click(); await a.waitForTimeout(300);
check('✕ ile KDV dökümü kaldırıldı (bütün oran sütunları)', (await a.locator('.modal.wide thead th.vg').count()) === 0, await a.locator('.modal.wide thead th.vg').count());
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
await openTpl();
check('kaldırınca seçim "Yok"', await a.locator('.tpl-vat label', { hasText: 'Yok' }).locator('input').isChecked(), '');
check('Yok iken uyarı yok', (await a.locator('.tpl-gap').count()) === 0, '');
await closeTpl();

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
