import { chromium } from 'playwright';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';

const URL = 'http://localhost:5179/';
const SCR = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/04627602-e09f-44db-bd85-15ef9828baa0/scratchpad';
const OUT = '/Users/sonercengiz/Documents/scc/fatura-hesap-kodu/public/guide';
const XLSX_PATH = `${SCR}/demo/EDM Gelen Faturalar Ekim 2026.xlsx`;
const PDF_DIR = `${SCR}/demo/pdfs`;
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 840 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
page.on('dialog', (d) => d.accept('Örnek Ltd'));

async function annotate(items) {
  const boxes = [];
  for (const it of items) {
    const loc = page.locator(it.sel).first();
    const box = await loc.boundingBox().catch(() => null);
    if (box) boxes.push({ ...it, box });
  }
  await page.evaluate((boxes) => {
    for (const { box: r, n, pad = 4, pos = 'tl' } of boxes) {
      const o = document.createElement('div'); o.className = '__c';
      Object.assign(o.style, { position: 'fixed', left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', border: '2.5px solid #2f6fed', borderRadius: '10px', zIndex: 99998, pointerEvents: 'none', boxSizing: 'border-box', boxShadow: '0 0 0 3px rgba(47,111,237,.18)' });
      document.body.appendChild(o);
      if (n != null) {
        const d = document.createElement('div'); d.className = '__c'; d.textContent = String(n);
        const size = 26;
        let left = r.x - pad - size / 2, top = r.y - pad - size / 2;
        if (pos === 'tr') left = r.x + r.width + pad - size / 2;
        if (pos === 'bl') top = r.y + r.height + pad - size / 2;
        if (pos === 'br') { left = r.x + r.width + pad - size / 2; top = r.y + r.height + pad - size / 2; }
        if (pos === 'in') { left = r.x + 6; top = r.y + 6; }
        left = Math.max(2, Math.min(left, window.innerWidth - size - 2)); top = Math.max(2, Math.min(top, window.innerHeight - size - 2));
        Object.assign(d.style, { position: 'fixed', left: left + 'px', top: top + 'px', width: size + 'px', height: size + 'px', borderRadius: '50%', background: '#2f6fed', color: '#fff', font: '700 14px system-ui', display: 'grid', placeItems: 'center', zIndex: 99999, boxShadow: '0 2px 6px rgba(0,0,0,.3)', border: '2px solid #fff' });
        document.body.appendChild(d);
      }
    }
  }, boxes);
}
const clear = () => page.evaluate(() => document.querySelectorAll('.__c').forEach((e) => e.remove()));
const shot = (name, opts = {}) => page.screenshot({ path: `${OUT}/${name}`, ...opts });
const clipOf = async (sel, pad = 8, extra = {}) => { const b = await page.locator(sel).first().boundingBox(); return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(1440 - Math.max(0, b.x - pad), b.width + pad * 2), height: Math.min(840 - Math.max(0, b.y - pad), b.height + pad * 2), ...extra }; };
const noToast = () => page.locator('.toast').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
const wait = (ms) => page.waitForTimeout(ms);
import { writeFileSync, unlinkSync } from 'node:fs';
/** İki görseli yan yana "Önce → Sonra" olarak birleştirir */
async function compose(outName, left, right, labels = ['Önce', 'Sonra']) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font:600 16px system-ui"><div style="display:flex;flex-direction:column;gap:10px;padding:12px;width:1416px">
  <figure style="margin:0"><div style="margin:0 0 6px;color:#6b7280">${labels[0]}</div><img src="${left}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure>
  <div style="text-align:center;font-size:34px;line-height:1;color:#2f6fed">↓</div>
  <figure style="margin:0"><div style="margin:0 0 6px;color:#6b7280">${labels[1]}</div><img src="${right}" style="width:100%;display:block;border:1px solid #e3e6ea;border-radius:8px"></figure></div></body>`;
  const f = `${OUT}/__c.html`; writeFileSync(f, html);
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 1440, height: 1400 }); await p2.goto('file://' + f); await p2.waitForTimeout(300);
  const b = await p2.locator('body > div').boundingBox(); await p2.screenshot({ path: `${OUT}/${outName}`, clip: { x: 0, y: 0, width: 1440, height: Math.ceil(b.height + 24) } });
  await p2.close(); unlinkSync(f);
}

await page.goto(URL);
await page.waitForSelector('text=EDM fatura listesini yükleyin');
await annotate([{ sel: 'button:has-text("Excel yükle")', n: 1, pos: 'bl' }, { sel: '.welcome', n: 2, pad: -8, pos: 'in' }]);
await shot('01-karsilama.png');
await clear();

// --- veri hazırlığı
await page.locator('input[accept=".xlsx,.xls"]').setInputFiles(XLSX_PATH);
await page.waitForSelector('.card-no');
await page.locator('button[title="Ayarlar"]').click();
await page.locator('input[placeholder="ABC LTD"]').fill('Örnek Ltd');
await page.locator('.acc-text').fill('770.01 Kırtasiye giderleri\n770.02 Temizlik giderleri\n770.03 Elektrik giderleri\n770.04 Haberleşme giderleri\n760.02 Kargo ve nakliye\n153 Ticari mallar\n191 İndirilecek KDV\n320.01 Satıcılar');
await page.locator('button:has-text("Listeye ekle")').click();
await wait(200);
await page.keyboard.press('Escape'); await noToast();
// geçmiş: 760.02 x3, 770.01 x3, 153, 770.03
for (const c of ['760.02', '760.02', '760.02', '770.01', '770.01', '770.01', '153', '770.03']) { await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type(c); await page.keyboard.press('Enter'); await wait(100); }
// 15 yedek şeridi (yedek hiç alınmadı, atama var)
await page.waitForSelector('.backup-hint'); await noToast();
await annotate([{ sel: '.backup-hint', n: 1, pad: -2, pos: 'tr' }]);
await shot('15-yedek-serit.png', { clip: { x: 0, y: 0, width: 1440, height: 100 } }); await clear();
await page.locator('.backup-hint button:has-text("Bugün değil")').click(); await wait(100);
// Q ← 760.02 (hayaletten), E ← 153 (✎), A ← 770.03 (✎); W,S,D boş (hayalet 770.01)
await page.locator('.slot').nth(0).locator('.slot-icon.save').click(); await wait(150);
for (const [i, c] of [[2, '153'], [3, '770.03']]) { await page.locator('.slot').nth(i).hover(); await page.locator('.slot').nth(i).locator('.slot-icon.edit').click(); await page.keyboard.type(c); await page.keyboard.press('Enter'); await wait(150); }
await page.mouse.move(700, 300); await noToast();
await page.keyboard.press('Control+Home'); await wait(200);

// 00 firma menüsü (açık menü çizilemez; menü + yeni firma vurgusu)
await annotate([{ sel: '.firm-select', n: 1, pos: 'bl' }]);
await shot('00-firma.png', { clip: { x: 0, y: 0, width: 760, height: 70 } }); await clear();
await page.locator('button[title="Ayarlar"]').click(); await page.waitForSelector('.form'); await wait(150);
await shot('00-firma-ayar.png', { clip: await clipOf('fieldset:has(legend:has-text("Firma:"))', 10) });
await page.keyboard.press('Escape'); await wait(100);

// 02 ekran (kart görünümü, PDF yokken)
await annotate([{ sel: '.toolbar', n: 1, pad: -2, pos: 'in' }, { sel: '.viewer', n: 2, pad: -2, pos: 'in' }, { sel: '.side', n: 3, pad: -2, pos: 'in' }, { sel: '.bar', n: 4, pad: -2, pos: 'in' }]);
await shot('02-ekran.png'); await clear();

// 03 üst çubuk
await annotate([
  { sel: '.firm-select', n: 1, pos: 'bl' }, { sel: '.batch-select', n: 2, pos: 'bl' }, { sel: 'button:has-text("Excel yükle")', n: 3, pos: 'bl' }, { sel: 'button:has-text("PDF ekle")', n: 4, pos: 'bl' }, { sel: 'button:has-text("Klasör ekle")', n: 5, pos: 'bl' },
  { sel: '.progress', n: 6, pos: 'bl' }, { sel: 'button:has-text("↶")', n: 7, pos: 'bl' }, { sel: 'button[title="F2"]', n: 8, pos: 'bl' }, { sel: 'button[title="F5"]', n: 9, pos: 'bl' },
  { sel: 'button[title="F1"]', n: 10, pos: 'bl' }, { sel: 'button[title="Kullanım rehberi"]', n: 11, pos: 'bl' }, { sel: '.theme-btn', n: 12, pos: 'bl' }, { sel: 'button[title="Ayarlar"]', n: 13, pos: 'bl' },
]);
await shot('03-ustcubuk.png', { clip: { x: 0, y: 0, width: 1440, height: 70 } }); await clear();

// 04 pdf
const pdfs = readdirSync(PDF_DIR).map((f) => `${PDF_DIR}/${f}`);
await page.locator('input[accept=".pdf,application/pdf"]').setInputFiles(pdfs);
await page.waitForSelector('.files'); await noToast();
await page.keyboard.press('Control+Home'); await page.waitForSelector('canvas.pdf-page'); await wait(400);
await annotate([{ sel: '.pdf-scroller', n: 1, pad: -6, pos: 'in' }, { sel: '.detail-row:has(b[title])', n: 2, pos: 'tl' }, { sel: '.files', n: 3, pos: 'tl' }]);
await shot('04-pdf.png'); await clear();

// 05 bağlama penceresi
await page.locator('.unmatched button:has-text("bağla")').click();
await page.waitForSelector('.modal:has-text("faturaya bağla")'); await wait(150);
await shot('05-baglama.png', { clip: await clipOf('.modal:has-text("faturaya bağla")', 12) });
await page.keyboard.press('Escape'); await wait(150);

// 06 panel (sıra/filtre/arama/liste)
await page.keyboard.press('Control+Home');
await annotate([{ sel: '.sort-select', n: 1, pos: 'tl' }, { sel: '.filter-select', n: 2, pos: 'tr' }, { sel: '.list', n: 3, pad: -4, pos: 'in' }]);
await shot('06-panel.png', { clip: await clipOf('.side', 4) }); await clear();

// 07 kısayol çubuğu: S yuvası düzenleme modunda
await page.locator('.slot').nth(4).hover(); await page.locator('.slot').nth(4).locator('.slot-icon.edit').click(); await page.keyboard.type('770.0'); await wait(100);
await annotate([{ sel: '.slot.slot-0', n: 1, pos: 'tl' }, { sel: '.slot.slot-1', n: 2, pos: 'tl' }, { sel: '.slot.slot-4', n: 3, pos: 'bl' }]);
await shot('07-kisayol.png', { clip: { x: 0, y: 840 - 128, width: 1440, height: 128 } }); await clear();
await page.keyboard.press('Escape'); await wait(100);

// 07b önce/sonra: kodsuz faturaya git, önce çek, Q bas, sonra çek
await page.locator('.search').fill('MVK2026000001050'); await page.keyboard.press('Enter'); await wait(200); await page.locator('.search').fill(''); await page.keyboard.press('Escape'); await wait(200); await page.keyboard.press('Backspace'); await wait(300);
await page.waitForSelector('canvas.pdf-page'); await wait(300);
await shot('__a.png', { clip: { x: 0, y: 56, width: 1440, height: 600 } });
await page.keyboard.press('q'); await wait(400); await page.waitForSelector('canvas.pdf-page'); await wait(300); await noToast();
await page.locator('.row:has-text("MVK2026000001050")').scrollIntoViewIfNeeded(); await wait(150);
await annotate([{ sel: '.row:has-text("MVK2026000001050")', n: 1, pos: 'tl', pad: 0 }, { sel: '.row.current', n: 2, pos: 'tl', pad: 0 }]);
await shot('__b.png', { clip: { x: 0, y: 56, width: 1440, height: 600 } }); await clear();
await compose('07b-atama.png', `${OUT}/__a.png`, `${OUT}/__b.png`, ['Önce: seçili fatura kodsuz', 'Q tuşuna basıldı → (1) fatura 770.01 aldı ve listede Q rengine büründü, (2) sonraki fatura açıldı']);
unlinkSync(`${OUT}/__a.png`); unlinkSync(`${OUT}/__b.png`);

// 08 manuel giriş
await page.keyboard.press('Control+End'); await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type('77'); await wait(150);
await annotate([{ sel: '.manual-input', n: 1, pos: 'tl' }, { sel: '.sugg', n: 2, pos: 'bl' }]);
await shot('08-manuel.png', { clip: { x: 0, y: 840 - 128, width: 1440, height: 128 } }); await clear();
await page.keyboard.press('Escape');
// 08b ipucu: 2. satıcının 2. faturasına git (MVK ...1050 idx 7), kod yok → ipucu 760.02
await page.locator('.search').fill('MVK2026000001050'); await page.keyboard.press('Enter'); await wait(200); await page.locator('.search').fill(''); await wait(150);
await annotate([{ sel: 'button.hint', n: 1, pos: 'tl' }]);
await shot('08b-ipucu.png', { clip: await clipOf('.detail', 4) }); await clear();

// 09 liste ayarı + Ctrl+. penceresi
await page.locator('button[title="Ayarlar"]').click(); await page.waitForSelector('.form'); await wait(150);
await page.locator('fieldset:has(legend:has-text("Hesap kodu listesi"))').scrollIntoViewIfNeeded(); await wait(150);
await shot('09-liste-ayar.png', { clip: await clipOf('fieldset:has(legend:has-text("Hesap kodu listesi"))', 10) });
await page.keyboard.press('Escape'); await wait(100);
await page.keyboard.press('Control+Period'); await page.waitForSelector('.chart-pop'); await page.keyboard.type('gider'); await wait(150);
await annotate([{ sel: '.chart-input', n: 1, pos: 'tl' }, { sel: '.chart-list', n: 2, pad: -2, pos: 'bl' }]);
await shot('09-liste.png', { clip: await clipOf('.chart-pop', 14) }); await clear();
await page.keyboard.press('Escape'); await wait(100);

// 10 toplu
await page.locator('.bulk-toggle').click(); await wait(100);
await page.locator('button:has-text("Bu satıcıyı seç")').click(); await wait(100);
await page.locator('.bulk-input').fill('760.0'); await wait(100);
await annotate([{ sel: '.bulk-bar .bulk-row', n: 1, pos: 'tl' }, { sel: '.bulk-input', n: 2, pos: 'tl' }, { sel: '.row.selected', n: 3, pos: 'tl' }]);
await shot('10-toplu.png', { clip: await clipOf('.side', 4) }); await clear();
await page.locator('.bulk-input').fill('760.02'); await page.keyboard.press('Enter'); await wait(300); await noToast();
await page.locator('.bulk-toggle').click(); await wait(150);
await annotate([{ sel: '.row.bulk', n: 1, pos: 'tl' }]);
await shot('10b-toplu-sonuc.png', { clip: await clipOf('.list', 4) }); await clear();

// 11 geri al
await page.keyboard.press('Control+z'); await wait(200);
await annotate([{ sel: 'button:has-text("↶")', n: 1, pos: 'bl' }, { sel: '.toast', n: 2, pos: 'tl' }]);
await shot('11-geri-al.png', { clip: { x: 0, y: 0, width: 1440, height: 840 } }); await clear(); await noToast();
await page.keyboard.press('Control+y'); await wait(200); await noToast();

// 12 önizleme
await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide'); await wait(300);
await annotate([{ sel: 'th.code-col', n: 1, pos: 'bl' }, { sel: '.legend', n: 2, pos: 'bl' }, { sel: 'tr.iss-code', n: 3, pos: 'tl' }]);
await shot('12-onizleme.png'); await clear();
await page.keyboard.press('Escape');

// 13 ayarlar (üst kısım) + 14 yedek
await page.locator('button[title="Ayarlar"]').click(); await page.waitForSelector('.form'); await wait(150);
await shot('13-ayarlar.png', { clip: await clipOf('.modal', 10) });
await page.locator('fieldset:has(legend:has-text("Yedekleme"))').scrollIntoViewIfNeeded(); await wait(150);
await shot('14-yedek.png', { clip: await clipOf('fieldset:has(legend:has-text("Yedekleme"))', 10) });
await page.keyboard.press('Escape');

// 16 koyu tema
await page.locator('.theme-btn').click(); await wait(300); await page.keyboard.press('Control+Home'); await wait(300);
await shot('16-koyu.png');
await page.locator('.theme-btn').click(); await wait(200);

// Rehber önizleme
await page.locator('button[title="Kullanım rehberi"]').click(); await page.waitForSelector('.modal.guide'); await wait(600);
await page.screenshot({ path: `${SCR}/guide-preview.png` });
await page.locator('.guide-toc a:has-text("Kısayollar")').click(); await wait(700);
await page.screenshot({ path: `${SCR}/guide-preview-2.png` });
await page.locator('.guide-toc a:has-text("Excel üret")').click(); await wait(700);
await page.screenshot({ path: `${SCR}/guide-preview-3.png` });
console.log('bitti:', readdirSync(OUT).join(' '));
await browser.close();
