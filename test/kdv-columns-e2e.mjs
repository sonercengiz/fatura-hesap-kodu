// KDV dökümü: şablon penceresinde tek düğmeyle tek öğe eklenir (Güncel oranlar + Diğer), F1 Excel'inde oran başına matrah ve KDV yazılır.
// Denetim: her faturada matrahlar + KDV'ler = Tutar (demo faturalarında yalnızca KDV var); oran yoksa hücre boş.
// Gerçek XML'lerle de koşulabilir (DEMO_DIR altında xml/): o zaman mutabakat bilgi amaçlı yazdırılır (ÖİV, tevkifat vb.).
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'advanced');  } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);

await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Çıktı")').click();
await a.locator('button:has-text("Şablonu düzenle")').click(); await a.waitForSelector('.tpl-modal');
const n0 = await a.locator('.tpl-header').count();
const btn = a.locator('.tpl-add-kdv');
check('düğme "+ KDV dökümü"', (await btn.innerText()).includes('+ KDV dökümü'), await btn.innerText());
await btn.click();
check('tek öğe eklendi (Güncel oranlar + Diğer)', (await a.locator('.tpl-row').count()) === n0 + 1 && (await a.locator('.tpl-vat-mode').inputValue()) === 'current', await a.locator('.tpl-row').count());
check('düğme artık "ekli"', (await btn.innerText()).includes('ekli') && (await btn.isDisabled()), await btn.innerText());
// Oran yoksa hücre boş kalır, sütun yine yazılır: "Boş sütunları atla" kapalı (atlama ayrı testte)
await a.locator('.tpl-modal .skip-empty input').uncheck(); await a.waitForTimeout(100);
await a.locator('.tpl-modal button:has-text("Kapat")').click(); await a.waitForTimeout(300);
await a.keyboard.press('Escape').catch(() => {}); await a.waitForTimeout(200);

const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
const path = `${S}/kdv-cikti.xlsx`; await dl.saveAs(path);
const wb = XLSX.read(readFileSync(path), { cellNF: true, cellStyles: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
const head = rows[0];
const KDV_ALL = ['Matrah %0', 'Matrah %1', 'KDV %1', 'Matrah %10', 'KDV %10', 'Matrah %20', 'KDV %20', 'Diğer Oran', 'Diğer Matrah', 'Diğer KDV', 'Oranı Uyuşmayan KDV'];
check('başlıklar sonda, sırayla (11 sütun)', JSON.stringify(head.slice(-11)) === JSON.stringify(KDV_ALL), head.slice(-11).join(' | '));
const KDV_HEADERS = KDV_ALL.filter((h) => h !== 'Diğer Oran');
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
  const numCell = Object.entries(wb.Sheets[wb.SheetNames[0]]).find(([k, c]) => /^[A-Z]+2$/.test(k) && XLSX.utils.decode_cell(k).c >= head.length - 11 && c.t === 'n');
  check('KDV hücreleri sayı tipinde, para biçimli', !!numCell && /0\.00/.test(numCell[1].z ?? ''), numCell ? `${numCell[0]} ${numCell[1].z}` : 'sayı hücresi yok');
}

// Sütunu olmayan KDV: demo faturasının oranlarını bozup "oranı uyuşmayan KDV" satırlı bir fatura üret
if (STRICT) {
  const src = files.find((f) => /YLD2026000000001/.test(f));
  const odd = readFileSync(src, 'utf8').replace('<cbc:ID>YLD2026000000001</cbc:ID>', '<cbc:ID>TST2026000000001</cbc:ID>').replaceAll('<cbc:Percent>20</cbc:Percent>', '<cbc:Percent>3</cbc:Percent>');
  const oddPath = `${S}/TST2026000000001-oran.xml`; writeFileSync(oddPath, odd);
  await a.locator('input[accept*=".zip"]').setInputFiles([oddPath]); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);
  await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
  check('KDV dökümü öğesiyle uyarı yok (her oran bir sütuna yazılır)', (await a.locator('.tpl-gap').count()) === 0, await a.locator('.tpl-gap').innerText().catch(() => ''));
  // Özel: tek tek sütunlar; sütunu olmayan oran uyarılır
  await a.locator('.tpl-mode button:has-text("Basit")').click(); await a.locator('.tpl-vat label', { hasText: 'Özel' }).locator('input').check();
  await a.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await a.waitForTimeout(150);
  check('Özel\'de KDV sütunları tamken uyarı yok', (await a.locator('.tpl-gap').count()) === 0, await a.locator('.tpl-gap').innerText().catch(() => ''));
  const oddRow = a.locator('.tpl-row').filter({ has: a.locator('.tpl-field', { hasText: 'Oranı uyuşmayan' }) });
  await oddRow.locator('button[title="Sütunu kaldır"]').click();
  const gap = await a.locator('.tpl-gap').innerText().catch(() => '');
  check('sütun kaldırılınca uyarı: oranı uyuşmayan KDV (1 fatura)', gap.includes('oranı uyuşmayan KDV (1 fatura)'), gap);
  await a.locator('.tpl-gap button').click();
  check('+ Ekle sütunu geri getirir, uyarı kalkar', (await a.locator('.tpl-gap').count()) === 0 && (await oddRow.count()) === 1, await a.locator('.tpl-gap').count());
  await oddRow.locator('button[title="Sütunu kaldır"]').click();
  await a.locator('.tpl-modal button:has-text("Kapat")').click(); await a.waitForSelector('.tpl-modal', { state: 'detached' });
  await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
  const legend = await a.locator('.modal.wide .legend').innerText();
  check('önizleme: sütunu olmayan KDV uyarısı', legend.includes('Tutar bilgisi Excel\'e girmiyor: 1'), legend);
  await a.keyboard.press('Escape');
}

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
