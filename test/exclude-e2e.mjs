// İstisnai faturaları Excel'den çıkarma: listede seçip toplu, önizlemede satır kutusuyla, panelde geri al.
// Çıkarılan fatura Excel'e yazılmaz, kod beklemez (sayaç, Tab, uyarı), süzgeçte görünür, kalıcıdır, Ctrl+Z geri alır.
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const progress = () => a.locator('.toolbar .progress').innerText().then((t) => t.replace(/\s+/g, ' '));
const lvRow = (no) => a.locator(`.lv-table tr.row:has-text("${no}")`);
const pvHead = () => a.locator('.modal.wide .modal-head .muted').first().innerText();
const pvRow = (no) => a.locator(`.modal.wide tbody tr:has-text("${no}")`);
const curNo = () => a.locator('.lv-table tr.row.current td.mono').first().innerText();

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);
const N = files.length;
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview');
await lvRow('GNS2026000000001').click(); await a.keyboard.press('/'); await a.keyboard.type('770.05'); await a.keyboard.press('Enter'); await a.waitForTimeout(200);

// 1) Listede seç → Excel'den çıkar
await lvRow('HZK2026000000001').locator('.row-check').click(); await lvRow('AHD2026000000001').locator('.row-check').click();
await a.locator('.lv-bulk button:has-text("Excel\'den çıkar (2)")').click(); await a.waitForTimeout(300);
check('sayaç: payda düşer, "2 hariç"', (await progress()).includes(`1/${N - 2} atandı · 2 hariç`), await progress());
check('satırlarda "hariç" etiketi', (await a.locator('.lv-table tr.row.excluded .excl-tag').count()) === 2, await a.locator('.lv-table tr.row.excluded').count());
check('seçim çubuğu artık "Excel\'e geri al (2)"', (await a.locator('.lv-bulk button:has-text("Excel\'e geri al (2)")').count()) === 1, 'yok');
await a.locator('.lv-bulk button:has-text("seçili")').click(); await a.waitForTimeout(100);
await a.locator('.filter-select').selectOption('excluded'); await a.waitForTimeout(150);
check('süzgeç "Excel\'den çıkarılanlar": 2 satır', (await a.locator('.lv-table tbody tr.row').count()) === 2, await a.locator('.lv-table tbody tr.row').count());
await a.locator('.filter-select').selectOption('unassigned'); await a.waitForTimeout(150);
check('süzgeç "Atanmamış" çıkarılanları göstermez', (await a.locator('.lv-table tbody tr.row.excluded').count()) === 0 && (await a.locator('.lv-table tbody tr.row').count()) === N - 3, await a.locator('.lv-table tbody tr.row').count());
await a.locator('.filter-select').selectOption('all'); await a.waitForTimeout(150);

// 2) Tab (sıradaki atanmamış) çıkarılanı atlar: GNS001 (#3) → HZK001 (#4, çıkarıldı) değil AYT002 (#5)
await lvRow('GNS2026000000001').click(); await a.keyboard.press('Tab'); await a.waitForTimeout(150);
check('Tab çıkarılan faturayı atlar', (await curNo()) === 'AYT2026000000002', await curNo());

// 3) F1: Excel'de çıkarılanlar yok
const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
const path = `${S}/haric-cikti.xlsx`; await dl.saveAs(path);
const rows = XLSX.utils.sheet_to_json(XLSX.read(readFileSync(path)).Sheets['Sheet0'], { header: 1, defval: null }).slice(1).filter((r) => r[0]);
check(`Excel ${N - 2} satır, çıkarılanlar yok`, rows.length === N - 2 && !rows.some((r) => /HZK2026000000001|AHD2026000000001/.test(r[0])), `${rows.length} satır`);

// 4) Önizleme: çıkarılanlar üstü çizili görünür; satır kutusuyla çıkar / geri al
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide');
check('önizleme başlığı çıkarılanları söyler', (await pvHead()).includes(`${N - 2} satır (+2 çıkarıldı)`), await pvHead());
check('çıkarılan satır üstü çizili, kutusu boş', (await pvRow('HZK2026000000001').getAttribute('class')).includes('excluded') && !(await pvRow('HZK2026000000001').locator('.pv-incl input').isChecked()), await pvRow('HZK2026000000001').getAttribute('class'));
check('kodsuzluk uyarısı çıkarılanları saymaz', (await a.locator('.modal.wide .legend').innerText()).includes(`Hesap kodu atanmamış: ${N - 3}`), await a.locator('.modal.wide .legend').innerText());
await pvRow('AYT2026000000002').locator('.pv-incl input').uncheck(); await a.waitForTimeout(250);
check('önizlemede çıkar: 3 çıkarıldı', (await pvHead()).includes(`${N - 3} satır (+3 çıkarıldı)`), await pvHead());
await pvRow('HZK2026000000001').locator('.pv-incl input').check(); await a.waitForTimeout(250);
check('önizlemede geri al: 2 çıkarıldı', (await pvHead()).includes(`${N - 2} satır (+2 çıkarıldı)`), await pvHead());
await a.keyboard.press('Escape'); await a.waitForSelector('.modal.wide', { state: 'detached' });

// 5) Ctrl+Z son işlemi (HZK001'i geri almayı) geri alır
await a.keyboard.press('Control+z'); await a.waitForTimeout(300);
check('Ctrl+Z: HZK001 yeniden çıkarıldı', (await lvRow('HZK2026000000001').getAttribute('class')).includes('excluded') && (await progress()).includes('3 hariç'), await progress());

// 6) Kalıcı + görsel görünümde panel notu ve Geri al
await a.waitForTimeout(300); await a.reload(); await a.waitForSelector('.listview'); await a.waitForTimeout(300);
check('yenilemeden sonra kalıcı', (await progress()).includes('3 hariç'), await progress());
await lvRow('AHD2026000000001').dblclick(); await a.waitForSelector('.detail'); await a.waitForTimeout(200);
check('panelde "Excel\'e girmez" notu', await a.locator('.detail .excl-note').isVisible(), 'yok');
await a.locator('.detail .excl-note button:has-text("Geri al")').click(); await a.waitForTimeout(250);
check('panelden geri al', (await a.locator('.detail .excl-note').count()) === 0 && (await progress()).includes('2 hariç'), await progress());

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
