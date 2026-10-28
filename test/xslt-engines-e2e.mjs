// Eleştiri turu B19: fatura görseli üç XSLT durumunda da resmî şablonla ve aynı metinle çizilir:
//   yerleşik  — tarayıcının XSLTProcessor'ı
//   yok       — Chrome yerleşik XSLT'yi kaldırınca (polyfill yüklenir)
//   bozuk     — var görünüp hata veriyor (kaldırma süreci / yönetici politikası; polyfill zorla kurulur)
// CI'da da koşar (.github/workflows/pages.yml): BASE=<adres>, PW_CHANNEL='' (Playwright'ın kendi Chromium'u).
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/db47f010-e6ef-41e1-8024-b002bf7dd1fd/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const BASE = process.env.BASE || 'http://localhost:5179/';
const channel = process.env.PW_CHANNEL ?? 'chrome';
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: channel || undefined, headless: true });
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };

const MODES = {
  yerleşik: null,
  yok: () => { delete window.XSLTProcessor; },
  bozuk: () => { XSLTProcessor.prototype.importStylesheet = function () { throw new Error('XSLT devre dışı'); }; },
};

/** Her faturanın görsel metni (boşluklar sadeleştirilmiş) + sade görünüme düşen faturalar */
async function render(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
  if (MODES[mode]) await ctx.addInitScript(MODES[mode]);
  const a = await ctx.newPage();
  const errors = [];
  a.on('pageerror', (e) => errors.push(e.message));
  await a.goto(BASE); await a.waitForSelector('.welcome');
  await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy'));
  const texts = new Map();
  const plain = [];
  const t0 = Date.now();
  const n = await a.locator('.list .row').count();
  for (let k = 0; k < n; k++) {
    const r = a.locator('.list .row').nth(k);
    const no = (await r.locator('.row-sub').innerText()).split(' · ')[0];
    await r.click();
    const body = a.frameLocator('.inv-frame').locator('body');
    await body.filter({ hasText: no }).waitFor({ timeout: 15000 }).catch(() => {});
    texts.set(no, (await body.innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
    if (await a.locator('.inv-note:has-text("Sade görünüm")').isVisible()) plain.push(no);
  }
  const ms = Date.now() - t0;
  const polyfill = (await a.locator('script[src*="xslt-polyfill"]').count()) > 0;
  await ctx.close();
  return { texts, plain, ms, n, polyfill, errors };
}

const res = {};
for (const mode of Object.keys(MODES)) {
  res[mode] = await render(mode);
  const r = res[mode];
  console.log(`— ${mode}: ${r.n} fatura, ${r.polyfill ? 'polyfill' : 'yerleşik'} motor, ${Math.round(r.ms / r.n)} ms/fatura`);
  check(`${mode}: bütün faturalar resmî şablonla`, r.plain.length === 0 && r.n === files.length, `sade: ${r.plain.join(', ') || '-'} | ${r.n}/${files.length}`);
  const blank = [...r.texts].filter(([no, t]) => !t.includes(no)).map(([no]) => no);
  check(`${mode}: her görsel kendi fatura numarasını gösterir`, blank.length === 0, blank.join(', '));
  check(`${mode}: sayfa hatası yok`, r.errors.length === 0, r.errors.join(' | '));
}
check('yok → polyfill yüklendi', res.yok.polyfill, 'yüklenmedi');
check('bozuk → polyfill yüklendi', res.bozuk.polyfill, 'yüklenmedi');
for (const mode of ['yok', 'bozuk']) {
  const diff = [...res.yerleşik.texts].filter(([no, t]) => res[mode].texts.get(no) !== t).map(([no]) => no);
  check(`${mode}: metinler yerleşikle birebir`, diff.length === 0, diff.join(', '));
}

console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
