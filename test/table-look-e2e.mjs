// Tablo görünümü (liste, önizleme, şablon önizlemesi): başlık ortalı (tur 4 H1; sayı hücrede sağda), ince dikey sütun çizgileri,
// KDV başlıkları oran grubuna göre renkli (matrah + KDV aynı renk). Yalnızca başlık boyanır; hücre renkleri değişmez.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
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
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
await a.locator('.tpl-vat label', { hasText: 'Güncel oranlar' }).locator('input').check(); await a.waitForTimeout(200);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

/** Tablodaki başlık + ilk dolu satır hücresinin biçimi */
const look = (scope, header) => a.evaluate(([scope, header]) => {
  const table = document.querySelector(scope);
  const ths = [...table.querySelectorAll('thead th')];
  const k = ths.findIndex((th) => th.querySelector('.hdr-text')?.textContent.trim() === header);
  if (k < 0) return null;
  const th = ths[k];
  const td = [...table.querySelectorAll('tbody tr')].map((tr) => tr.children[k]).find((c) => c && c.textContent.trim()) ?? table.querySelector('tbody tr').children[k];
  const cs = (e) => getComputedStyle(e);
  return { cls: th.className, thAlign: cs(th).textAlign, tdAlign: cs(td).textAlign, thBg: cs(th).backgroundColor, tdBg: cs(td).backgroundColor, tdLine: cs(td).borderLeftWidth + ' ' + cs(td).borderLeftStyle };
}, [scope, header]);

for (const [where, scope, open] of [['liste', '.lv-table table', async () => { await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); }], ['önizleme', '.modal.wide table', async () => { await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend'); }]]) {
  await open(); await a.waitForTimeout(300);
  const tutar = await look(scope, 'Tutar');
  check(`${where}: Tutar başlığı ortalı, hücre sağda`, tutar?.thAlign === 'center' && tutar?.tdAlign === 'right', JSON.stringify(tutar));
  const m20 = await look(scope, 'Matrah %20'), k20 = await look(scope, 'KDV %20'), m10 = await look(scope, 'Matrah %10');
  check(`${where}: Matrah %20 ve KDV %20 aynı grup rengi`, /vg-20/.test(m20?.cls) && /vg-20/.test(k20?.cls) && m20.thBg === k20.thBg, `${m20?.cls} ${m20?.thBg} / ${k20?.thBg}`);
  check(`${where}: %10 grubu %20'den farklı renk`, /vg-10/.test(m10?.cls) && m10.thBg !== m20.thBg, `${m10?.thBg} / ${m20?.thBg}`);
  check(`${where}: KDV hücresi boyanmaz (Tutar hücresiyle aynı zemin)`, m20?.tdBg === tutar?.tdBg, `${m20?.tdBg} / ${tutar?.tdBg}`);
  check(`${where}: ince dikey sütun çizgisi`, m20?.tdLine === '1px solid', m20?.tdLine);
  if (where === 'önizleme') { await a.keyboard.press('Escape'); await a.waitForTimeout(200); }
}
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
check('şablon önizlemesinde atlanan sütun gri başlık (th.off), harfsiz', (await a.locator('.tpl-modal thead th.off .col-letter').first().innerText()).trim() === '', await a.locator('.tpl-modal thead th.off').count());
const m1 = await look('.tpl-modal table', 'Matrah %1');
check('şablon önizlemesinde KDV başlığı renkli', /vg-1\b/.test(m1?.cls ?? ''), m1?.cls);

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
