// KDV dökümü sütunları: şablon penceresinde tek düğmeyle eklenir, F1 Excel'inde oran başına matrah ve KDV yazılır.
// Denetim: her faturada matrahlar + KDV'ler = Tutar (demo faturalarında yalnızca KDV var); oran yoksa hücre boş.
// Gerçek XML'lerle de koşulabilir (DEMO_DIR altında xml/): o zaman mutabakat bilgi amaçlı yazdırılır (ÖİV, tevkifat vb.).
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/db47f010-e6ef-41e1-8024-b002bf7dd1fd/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const STRICT = !process.env.DEMO_DIR || process.env.DEMO_DIR.endsWith('/demo');
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);

await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Çıktı")').click();
await a.locator('button:has-text("Şablonu düzenle")').click(); await a.waitForSelector('.tpl-modal');
const n0 = await a.locator('.tpl-header').count();
const btn = a.locator('.tpl-add-kdv');
check('düğme sütun sayısını söyler', (await btn.innerText()).includes('9 sütun'), await btn.innerText());
await btn.click();
check('9 sütun eklendi', (await a.locator('.tpl-header').count()) === n0 + 9, await a.locator('.tpl-header').count());
check('düğme artık "ekli"', (await btn.innerText()).includes('ekli') && (await btn.isDisabled()), await btn.innerText());
await a.locator('.tpl-modal button.primary:has-text("Kaydet")').click(); await a.waitForTimeout(300);
await a.keyboard.press('Escape').catch(() => {}); await a.waitForTimeout(200);

const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
const path = `${S}/kdv-cikti.xlsx`; await dl.saveAs(path);
const wb = XLSX.read(readFileSync(path), { cellNF: true, cellStyles: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
const head = rows[0];
const KDV_HEADERS = ['Matrah %0', 'Matrah %1', 'KDV %1', 'Matrah %10', 'KDV %10', 'Matrah %20', 'KDV %20', 'Matrah Diğer', 'KDV Diğer'];
check('başlıklar sonda, sırayla', JSON.stringify(head.slice(-9)) === JSON.stringify(KDV_HEADERS), head.slice(-9).join(' | '));
const col = (h) => head.indexOf(h);
const body = rows.slice(1).filter((r) => r.some((v) => v !== null && v !== ''));
check('her fatura bir satır', body.length === files.length, `${body.length}/${files.length}`);
let ok = 0;
const off = [];
const used = new Set();
for (const r of body) {
  let sum = 0;
  for (const h of KDV_HEADERS) { const v = r[col(h)]; if (v !== null && v !== '') { sum += Number(v); used.add(h); } }
  const amount = Number(r[col('Tutar')]);
  if (Math.abs(sum - amount) < 0.011) ok++; else off.push(`${r[col('Fatura No')]}: ${sum.toFixed(2)} ≠ ${amount}`);
}
console.log(`  mutabakat: ${ok}/${body.length} faturada matrah + KDV = Tutar · dolu sütunlar: ${[...used].join(', ')}`);
if (off.length) console.log('  uymayanlar:', off.slice(0, 8).join(' · '));
if (STRICT) {
  check('demo: her faturada matrah + KDV = Tutar', off.length === 0, off.join(' · '));
  check('demo: en az iki farklı oran dolu', [...used].filter((h) => h.startsWith('Matrah')).length >= 2, [...used].join(', '));
  const numCell = Object.entries(wb.Sheets[wb.SheetNames[0]]).find(([k, c]) => /^[A-Z]+2$/.test(k) && XLSX.utils.decode_cell(k).c >= head.length - 9 && c.t === 'n');
  check('KDV hücreleri sayı tipinde, para biçimli', !!numCell && /0\.00/.test(numCell[1].z ?? ''), numCell ? `${numCell[0]} ${numCell[1].z}` : 'sayı hücresi yok');
}

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
