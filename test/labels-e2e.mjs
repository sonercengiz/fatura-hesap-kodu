// Metin standardı: görünür etiketlerin (düğme, çip, seçenek, lejant, durum satırı) ve ipuçlarının ilk harfi büyük.
// Baştaki simge/boşluk (✓, ⚡, ☑, +, !) atlanır; sayı ile başlayan metin sayılmaz. Ana ekran, liste, önizleme, şablon (Basit +
// Gelişmiş), kurallar, ayarlar (bütün sekmeler), yazdırma, çıktılar pencereleri gezilir.
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
// bir kod ver, birini Excel'den çıkar, birini toplu seç: "Hariç", "Toplu", "Kural" çipleri görünsün
await a.keyboard.press('/'); await a.keyboard.type('770.01'); await a.keyboard.press('Enter'); await a.waitForTimeout(200);

const SEL = 'button, .lg, .tag, .excl-tag, .bulk-tag, option, legend, .tpl-scope-name, .tpl-saved, .tpl-scope-state, .chip, .tour-bar';
/** Ekrandaki (görünür) etiketlerde ve bütün ipuçlarında küçük harfle başlayanlar */
const scan = (where) => a.evaluate(([where, SEL]) => {
  const bad = [];
  const lower = (t) => {
    const s = (t ?? '').replace(/^[^\p{L}\p{N}"'(]+/u, '').replace(/^["'(]+/, '');
    return /^\p{Ll}/u.test(s) ? s.slice(0, 60) : null;
  };
  const visible = (e) => e.tagName === 'OPTION' || !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  for (const e of document.querySelectorAll(SEL)) {
    if (!visible(e)) continue;
    // kbd içeriği (tuş adı) sayılmaz
    const c = e.cloneNode(true); c.querySelectorAll('kbd').forEach((k) => k.remove());
    const l = lower(c.textContent.trim());
    if (l) bad.push(`${where} ${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}: "${l}"`);
  }
  for (const e of document.querySelectorAll('[title]')) {
    const l = lower(e.getAttribute('title').trim());
    if (l) bad.push(`${where} [title] ${e.tagName.toLowerCase()}: "${l}"`);
  }
  return bad;
}, [where, SEL]);

const all = new Set();
const add = async (where) => { for (const b of await scan(where)) all.add(b); };
const esc = async () => { await a.keyboard.press('Escape'); await a.waitForTimeout(200); };

await add('ana');
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(200);
await a.locator('.bulk-toggle').click(); await a.waitForTimeout(100);
await a.locator('.lv-table .row-check').nth(1).click(); await a.locator('.lv-table .row-check').nth(2).click(); await a.waitForTimeout(150);
await add('liste');
await a.locator('.lv-table .row-check').nth(1).click(); await a.locator('.lv-table .row-check').nth(2).click();
await a.locator('.bulk-toggle').click();
if (await a.locator('.lv-empty').count()) { await a.locator('.lv-empty').click(); await add('liste-bos'); await a.locator('.lv-empty').click(); }
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend'); await add('önizleme'); await esc();
await a.locator('.toolbar button:has-text("Görsel")').click(); await a.waitForTimeout(200);
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
await a.locator('.tpl-mode button:has-text("Basit")').click(); await add('şablon-basit');
await a.locator('.tpl-vat label', { hasText: 'Özel' }).locator('input').check(); await a.waitForTimeout(150); await add('şablon-özel');
await a.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await add('şablon-gelişmiş');
await a.locator('.tpl-scope', { hasText: 'Bu firma' }).click(); await add('şablon-firma');
await esc();
await a.locator('.toolbar button:has-text("Kurallar")').click(); await a.waitForTimeout(300); await add('kurallar'); await esc();
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.waitForSelector('.settings-tabs');
for (const tab of await a.locator('.settings-tabs button').allInnerTexts()) {
  await a.locator('.settings-tabs button', { hasText: tab }).first().click(); await a.waitForTimeout(150); await add(`ayarlar/${tab.trim()}`);
}
await esc();
await a.keyboard.press('Control+Shift+P'); await a.waitForTimeout(400); await add('yazdırma'); await esc();
await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]); await a.waitForTimeout(300);
await a.locator('.toolbar [data-act="exports"]').click(); await a.waitForSelector('.exports-modal'); await add('çıktılar');
await a.locator('.exports-modal button.primary', { hasText: 'Gez' }).click(); await a.waitForTimeout(200); await add('tur'); await esc();

const list = [...all];
check('küçük harfle başlayan etiket/ipucu yok', list.length === 0, `${list.length} adet:\n  ${list.join('\n  ')}`);
check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
