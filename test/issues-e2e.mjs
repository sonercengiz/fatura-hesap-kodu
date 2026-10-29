// Uyarı sistemi (tur 4 H3): önizlemede satır zemini beyaz; uyarı yalnızca ilgili hücrenin tonu (seviye rengi) + satırın en yüksek
// seviyesinde sol şerit. Kodsuz satırda kod hücresi high; operatör faturasında Tutar hücresi medium (ödenecek ≠ toplam, ÖİV Excel'e
// girmiyor), türetilmiş matrah low. Lejant çipine tıklayınca o tür susturulur (ton kalkar, sayı kalır; yenileyince kalıcı).
// Listede Dikkat metni seviye renginde; yuva rengi hiçbir zaman ezilmez.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { operatorXml } from './e2e-helpers.mjs';
const S = process.env.SCRATCH || '/tmp';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const op = `${S}/OPR2026000000001.xml`;
writeFileSync(op, operatorXml(readFileSync(new URL('./fixtures/ubl-sirket.xml', import.meta.url), 'utf8')));
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().slice(0, 6).map((f) => `${DEMO}/xml/${f}`).concat([op]);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
await a.locator('.slot').nth(0).hover(); await a.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await a.keyboard.type('770.03'); await a.keyboard.press('Enter'); await a.waitForTimeout(200);
await a.keyboard.press('Home'); await a.keyboard.press('q'); await a.waitForTimeout(200);
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
await a.locator('.tpl-vat label', { hasText: 'Güncel oranlar' }).locator('input').check(); await a.waitForTimeout(200);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

const PREV = '.modal.wide:has(.legend)';
const openPrev = async () => { await a.keyboard.press('F5'); await a.waitForSelector(`${PREV} .legend`); await a.waitForTimeout(300); };
/** Önizlemede bir satırın hücreleri (başlık → {cls, bg, color}) ve satır sınıfı + ilk hücrenin şeridi */
const rowLook = (no) => a.evaluate(([PREV, no]) => {
  const vars = getComputedStyle(document.documentElement);
  const ths = [...document.querySelectorAll(`${PREV} thead th`)].map((th) => th.querySelector('.hdr-text')?.textContent.trim() ?? th.textContent.trim());
  const tr = [...document.querySelectorAll(`${PREV} tbody tr`)].find((r) => r.textContent.includes(no));
  if (!tr) return null;
  const cells = {};
  [...tr.children].forEach((td, k) => { const cs = getComputedStyle(td); cells[ths[k]] = { cls: td.className, bg: cs.backgroundColor, color: cs.color }; });
  const probe = (v) => { const d = document.createElement('div'); d.style.background = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
  return { cls: tr.className, stripe: getComputedStyle(tr.children[0]).boxShadow, cells, hBg: probe('--iss-h-bg'), mBg: probe('--iss-m-bg'), lBg: probe('--iss-l-bg'), panel: probe('--panel'), s0: probe('--s0') };
}, [PREV, no]);

await openPrev();
let r = await rowLook('GNS2026000000001');
check('kodsuz satır: zemin beyaz (Fatura No hücresi panel rengi)', r && [r.panel, 'rgba(0, 0, 0, 0)'].includes(r.cells['Fatura No'].bg) && (await a.locator(`${PREV} .table-box`).evaluate((e) => getComputedStyle(e.closest('.modal')).backgroundColor)) === r.panel, JSON.stringify(r?.cells['Fatura No']));
check('kodsuz satır: yalnız kod hücresi high tonu', r && /iss-high/.test(r.cells['Hesap Kodu'].cls) && r.cells['Hesap Kodu'].bg === r.hBg, JSON.stringify(r?.cells['Hesap Kodu']));
check('kodsuz satır: sol şerit high (lvl-high)', r && /lvl-high/.test(r.cls) && /3px 0px 0px 0px inset/.test(r.stripe), `${r?.cls} | ${r?.stripe}`);
r = await rowLook('AYT2026000000001');
check('Q yuvasındaki kod hücresi yuva rengi, uyarısız satırda şerit yok', r && r.cells['Hesap Kodu'].bg === r.s0 && !/lvl-/.test(r.cls), `${r?.cls} ${JSON.stringify(r?.cells['Hesap Kodu'])}`);
r = await rowLook('OPR2026000000001');
check('operatör: Tutar hücresi medium (ödenecek ≠ toplam, ÖİV girmiyor)', r && /iss-medium/.test(r.cells['Tutar'].cls) && r.cells['Tutar'].bg === r.mBg, JSON.stringify(r?.cells['Tutar']));
check('operatör: türetilen %20 matrahı ve KDV\'si low', r && /iss-low/.test(r.cells['Matrah %20']?.cls) && /iss-low/.test(r.cells['KDV %20']?.cls) && r.cells['Matrah %20'].bg === r.lBg, `${JSON.stringify(r?.cells['Matrah %20'])} ${JSON.stringify(r?.cells['KDV %20'])}`);
check('operatör: öbür hücreler beyaz', r && [r.panel, 'rgba(0, 0, 0, 0)'].includes(r.cells['Gönderen VKN/TCKN'].bg), JSON.stringify(r?.cells['Gönderen VKN/TCKN']));
const legend = await a.locator(`${PREV} .legend`).innerText();
check('lejantta "Tutar bilgisi Excel\'e girmiyor: 1"', /Tutar bilgisi Excel'e girmiyor: 1/.test(legend), legend);
check('lejant çipleri düğme ve seviye sınıflı', (await a.locator(`${PREV} .legend button.lg.lvl-high`).count()) >= 1 && (await a.locator(`${PREV} .legend button.lg.lvl-medium`).count()) >= 1 && (await a.locator(`${PREV} .legend button.lg.lvl-low`).count()) >= 1, legend);
const title = await a.locator(`${PREV} tbody tr`, { hasText: 'OPR2026000000001' }).getAttribute('title');
check('satır ipucu bütün uyarıları sayar (ÖİV tutarıyla)', /ÖİV 36,10/.test(title) && /Ödenecek/.test(title) && /Hesap kodu/.test(title), title);

// Susturma: kodsuzluk çipine tıkla
const chip = a.locator(`${PREV} .legend button.lg`, { hasText: 'Hesap kodu atanmamış' });
const n0 = (await chip.innerText()).match(/\d+/)?.[0];
await chip.click(); await a.waitForTimeout(200);
r = await rowLook('GNS2026000000001');
check('çipe tıklayınca kodsuzluk tonu ve şeridi kalkar', r && !/iss-high/.test(r.cells['Hesap Kodu'].cls) && !/lvl-high/.test(r.cls), `${r?.cls} ${r?.cells['Hesap Kodu'].cls}`);
check('susturulan çip gri, üstü çizili, sayı duruyor, "kapalı"', /muted/.test(await chip.getAttribute('class')) && (await chip.innerText()).includes(n0) && /kapalı/.test(await chip.innerText()) && /line-through/.test(await chip.evaluate((e) => getComputedStyle(e).textDecorationLine)), `${await chip.getAttribute('class')} ${await chip.innerText()}`);
r = await rowLook('OPR2026000000001');
check('susturma yalnızca o tür: operatörde Tutar hâlâ medium, şerit medium', r && /iss-medium/.test(r.cells['Tutar'].cls) && /lvl-medium/.test(r.cls), r?.cls);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
await a.reload(); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(400);
await openPrev();
check('yenileyince susturma kalıcı', /muted/.test(await a.locator(`${PREV} .legend button.lg`, { hasText: 'Hesap kodu atanmamış' }).getAttribute('class')), await a.locator(`${PREV} .legend`).innerText());
await a.locator(`${PREV} .legend button.lg`, { hasText: 'Hesap kodu atanmamış' }).click(); await a.waitForTimeout(200);
r = await rowLook('GNS2026000000001');
check('yeniden tıklayınca ton geri gelir', r && /iss-high/.test(r.cells['Hesap Kodu'].cls), r?.cells['Hesap Kodu'].cls);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// Liste: Dikkat metni seviye renginde
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(300);
const lv = await a.evaluate(() => {
  const tr = [...document.querySelectorAll('.lv-table tbody tr')].find((x) => x.textContent.includes('OPR2026000000001'));
  const spans = [...tr.querySelectorAll('td.lv-issues .iss-txt')].map((s) => ({ cls: s.className, color: getComputedStyle(s).color, t: s.textContent }));
  const probe = (v) => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  return { spans, m: probe('--iss-m'), l: probe('--iss-l') };
});
check('liste Dikkat: medium uyarı mor, low uyarı mavi-gri', lv.spans.some((s) => /lvl-medium/.test(s.cls) && s.color === lv.m) && lv.spans.some((s) => /lvl-low/.test(s.cls) && s.color === lv.l), JSON.stringify(lv));

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
