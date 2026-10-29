// Boş sütun modeli (tur 4 H2): şablon penceresinde görünen tik = bu dönemde Excel'e yazılıyor. "Boş sütunları atla" açıkken bu dönemde
// boş alan işaretsiz-gri (şablon üyeliği korunur); gri alanı işaretlemek boş da olsa yazar (keep) ve kutu "partial" görünür; işareti
// kaldırmak şablondan çıkarır; kutu kaldırılınca bütün üyeler işaretli-beyaz, yeniden işaretlenince keep'ler silinir. Dolu ama
// işaretsiz alanda kaç faturada bilgi olduğu yazar; KDV "Yok" seçiliyken KDV'li fatura sayısı. EDM listesi gelince boş üyeler kendiliğinden yazılır.
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().slice(0, 6).map((f) => `${DEMO}/xml/${f}`);
const edm = readdirSync(DEMO).find((f) => /^EDM .*\.xlsx$/.test(f));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'simple'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let nDl = 0;
const excelHead = async () => {
  const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
  const path = `${S}/empty-columns-${nDl++}.xlsx`; await dl.saveAs(path);
  const wb = XLSX.read(readFileSync(path));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })[0];
};
const openTpl = async () => { await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal'); await a.waitForTimeout(150); };
const close = async () => { await a.keyboard.press('Escape'); await a.waitForTimeout(200); };
const field = (name) => a.locator('.tpl-simple .tpl-check', { hasText: name }).first();
/** Basit görünümdeki bir alanın durumu: işaretli mi, gri mi, harf, sayı */
const state = async (name) => {
  const f = field(name);
  const cls = (await f.getAttribute('class')) ?? '';
  const txt = async (sel) => ((await f.locator(sel).count()) ? (await f.locator(sel).innerText()).trim() : '');
  return { checked: await f.locator('input').isChecked(), off: /\boff\b/.test(cls), letter: await txt('.tpl-check-letter'), n: await txt('.tpl-check-n'), title: (await f.getAttribute('title')) ?? '' };
};
const fmt = (s) => JSON.stringify(s);
const advRows = async () => { await a.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await a.waitForTimeout(150); const r = await a.locator('.tpl-row').evaluateAll((rs) => rs.map((x) => ({ h: x.querySelector('input.tpl-header')?.value ?? 'KDV', off: x.classList.contains('off') }))); await a.locator('.tpl-mode button:has-text("Basit")').click(); await a.waitForTimeout(150); return r; };
const skip = a.locator('.tpl-modal .skip-empty');

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);

await openTpl();
let s = await state('Geliş Zamanı');
check('bu dönemde boş üye (Geliş Zamanı) işaretsiz ve gri, harfsiz, sayısız', !s.checked && s.off && !s.letter && !s.n && /hiçbir faturada bu bilgi yok/.test(s.title), fmt(s));
s = await state('Fatura No');
check('dolu üye (Fatura No) işaretli, beyaz, harfi A', s.checked && !s.off && s.letter === 'A', fmt(s));
s = await state('ETTN');
check('dolu ama işaretsiz alanda (ETTN) fatura sayısı: 6', !s.checked && !s.off && s.n === '6' && /6 faturada bu bilgi var/.test(s.title), fmt(s));
check('KDV "Yok" seçiliyken KDV\'li fatura sayısı yazar', /^\d+$/.test((await a.locator('.tpl-vat .tpl-radio.on .tpl-check-n').innerText().catch(() => '')).trim()), await a.locator('.tpl-vat .tpl-radio.on').innerText());
check('kutu işaretli, partial değil', (await skip.locator('input').isChecked()) && !/partial/.test(await skip.getAttribute('class')), await skip.getAttribute('class'));
let rows = await advRows();
check('Gelişmiş: boş üye satır olarak duruyor (gri)', rows.some((r) => r.h === 'Geliş Zamanı' && r.off), fmt(rows.slice(0, 4)));

// Gri alanı işaretle → keep: boş da olsa yazılır
await field('Geliş Zamanı').locator('input').check(); await a.waitForTimeout(250);
s = await state('Geliş Zamanı');
check('gri alanı işaretleyince işaretli, beyaz, harfi var', s.checked && !s.off && /^[A-Z]+$/.test(s.letter), fmt(s));
check('kutu işaretli ama partial (gri) ve ipucu sayıyı söyler', (await skip.locator('input').isChecked()) && /partial/.test(await skip.getAttribute('class')) && /1 sütunu bilerek eklediniz/.test(await skip.getAttribute('title')), `${await skip.getAttribute('class')} | ${await skip.getAttribute('title')}`);
await close();
let head = await excelHead();
check('Excel\'de keep\'li boş sütun (Geliş Zamanı) var, öbür boşlar yok', head.includes('Geliş Zamanı') && !head.includes('Durum'), head.join(' | '));

// İşareti kaldırınca şablondan çıkar
await openTpl();
await field('Geliş Zamanı').locator('input').uncheck(); await a.waitForTimeout(250);
rows = await advRows();
check('keep\'li alanın işaretini kaldırınca şablondan çıktı', !rows.some((r) => r.h === 'Geliş Zamanı'), rows.map((r) => r.h).join(' | '));
s = await state('Geliş Zamanı');
check('çıkınca yine gri-işaretsiz', !s.checked && s.off, fmt(s));
check('keep kalmayınca partial kalktı', !/partial/.test(await skip.getAttribute('class')), await skip.getAttribute('class'));

// yeniden ekle (keep), sonra kutuyu kaldır: bütün üyeler işaretli-beyaz
await field('Geliş Zamanı').locator('input').check(); await a.waitForTimeout(200);
await skip.locator('input').uncheck(); await a.waitForTimeout(250);
s = await state('Durum');
check('kutu kaldırılınca boş üye (Durum) işaretli, beyaz, harfi var', s.checked && !s.off && /^[A-Z]+$/.test(s.letter), fmt(s));
s = await state('ETTN');
check('kutu kaldırılınca da işaretsiz dolu alanda sayı aynı', !s.checked && s.n === '6', fmt(s));

// yeniden işaretle: keep'ler silinir, boş üyeler gri-işaretsiz, üyelik korunur
await skip.locator('input').check(); await a.waitForTimeout(250);
s = await state('Geliş Zamanı');
check('yeniden işaretleyince keep silindi: Geliş Zamanı gri-işaretsiz', !s.checked && s.off, fmt(s));
check('yeniden işaretleyince partial değil', !/partial/.test(await skip.getAttribute('class')), await skip.getAttribute('class'));
rows = await advRows();
check('şablon üyeliği korundu (Gelişmiş\'te Geliş Zamanı satırı gri)', rows.some((r) => r.h === 'Geliş Zamanı' && r.off) && rows.some((r) => r.h === 'Durum' && r.off), rows.filter((r) => r.off).map((r) => r.h).join(' | '));

// Gelişmiş "+ Sütun ekle" ile boş alan eklemek atla açıkken keep verir
await a.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await a.waitForTimeout(150);
await a.locator('.tpl-add select').selectOption('firm'); await a.locator('.tpl-add button:has-text("+ Sütun ekle")').click(); await a.waitForTimeout(150);
await a.locator('.tpl-add select').selectOption('branch'); await a.locator('.tpl-add button:has-text("+ Sütun ekle")').click(); await a.waitForTimeout(200);
const branchRow = await a.locator('.tpl-row').evaluateAll((rs) => rs.filter((x) => x.querySelector('input.tpl-header')?.value === 'Şube').map((x) => ({ off: x.classList.contains('off'), l: x.querySelector('.tpl-letter').textContent })));
check('Gelişmiş\'te eklenen boş alan (ikinci Şube) yazılır (keep)', branchRow.some((r) => !r.off && /^[A-Z]+$/.test(r.l)), fmt(branchRow));
await a.keyboard.press('Control+z'); await a.waitForTimeout(100); await a.keyboard.press('Control+z'); await a.waitForTimeout(150);
await a.locator('.tpl-mode button:has-text("Basit")').click(); await a.waitForTimeout(150);
await close();

// EDM listesi gelince boş üyeler kendiliğinden yazılır
await a.locator('input[accept*=".zip"]').setInputFiles(`${DEMO}/${edm}`); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(500);
await openTpl();
s = await state('Geliş Zamanı');
check('EDM listesi yüklenince Geliş Zamanı işaretli ve harfli (şablon üyeliği korunduğu için)', s.checked && !s.off && /^[A-Z]+$/.test(s.letter), fmt(s));
await close();

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
