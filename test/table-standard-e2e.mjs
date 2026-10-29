// Excel tipi tablo standardı (tur 4 H1): liste, çıktı önizlemesi ve şablon önizlemesinde başlık ortalı, sayı sağda, metin solda,
// ince sütun çizgisi; üçünde de satır çizgisi var. Sürükleyip araya bırakma (önüne / arkasına) üç tabloda ve Gelişmiş
// satırlarda aynı sonucu verir; KDV parçasını sürüklemek bütün öğeyi taşır. Yazılmayan sütun gri başlık (th.off), "boş, yazılmaz"
// metni hiçbir yerde yok. Önizlemede kod hücresi kısayol yuvasının rengini alır.
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
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'simple'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
// Q yuvası = 770.03, ilk faturaya ver
await a.locator('.slot').nth(0).hover(); await a.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await a.keyboard.type('770.03'); await a.keyboard.press('Enter'); await a.waitForTimeout(200);
await a.keyboard.press('Home'); await a.keyboard.press('q'); await a.waitForTimeout(200);
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
await a.locator('.tpl-vat label', { hasText: 'Güncel oranlar' }).locator('input').check(); await a.waitForTimeout(200);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

const LIST = '.lv-table table', PREV = '.modal.wide:has(.legend) .table-box table', TPL = '.tpl-modal .tpl-preview table';
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\%]/g, '\\$&');
const th = (scope, text) => a.locator(`${scope} thead th.hdr-edit`).filter({ has: a.locator('.hdr-text', { hasText: new RegExp(`^${reEsc(text)}$`) }) }).first();
const order = (scope) => a.locator(`${scope} thead th.hdr-edit .hdr-text`).allInnerTexts().then((x) => x.map((s) => s.trim()));
/** fromText başlığını toText başlığının önüne/arkasına sürükleyip bırakır; bırakmadan önce ekleme çizgisinin sınıfını döndürür */
async function drag(from, to, side) {
  const dt = await a.evaluateHandle(() => new DataTransfer());
  await from.dispatchEvent('dragstart', { dataTransfer: dt });
  const b = await to.boundingBox();
  const vertical = (await to.evaluate((e) => e.tagName)) !== 'TH';
  const pt = vertical ? { clientX: b.x + 10, clientY: side === 'before' ? b.y + 3 : b.y + b.height - 3 } : { clientX: side === 'before' ? b.x + 3 : b.x + b.width - 3, clientY: b.y + 5 };
  await to.dispatchEvent('dragover', { dataTransfer: dt, ...pt }); await a.waitForTimeout(80);
  const cls = await to.getAttribute('class');
  const shadow = await to.evaluate((e) => getComputedStyle(e).boxShadow);
  const hint = await a.locator('.drop-hint').count();
  await to.dispatchEvent('drop', { dataTransfer: dt, ...pt });
  await from.dispatchEvent('dragend', { dataTransfer: dt }).catch(() => {});
  await a.waitForTimeout(250);
  return { cls, shadow, hint };
}
/** Tablodaki başlık + ilk dolu hücrenin hizası ve çizgileri */
const look = (scope, header) => a.evaluate(([scope, header]) => {
  const table = document.querySelector(scope);
  const ths = [...table.querySelectorAll('thead th')];
  const k = ths.findIndex((th) => th.querySelector('.hdr-text')?.textContent.trim() === header);
  if (k < 0) return null;
  const td = [...table.querySelectorAll('tbody tr')].map((tr) => tr.children[k]).find((c) => c && c.textContent.trim()) ?? table.querySelector('tbody tr').children[k];
  const cs = (e) => getComputedStyle(e);
  return { thAlign: cs(ths[k]).textAlign, letterAlign: cs(ths[k].querySelector('.col-letter')).textAlign, tdAlign: cs(td).textAlign, tdLeft: cs(td).borderLeftWidth, tdBottom: cs(td).borderBottomWidth };
}, [scope, header]);

async function standard(where, scope) {
  const tutar = await look(scope, 'Tutar'), no = await look(scope, 'Fatura No');
  check(`${where}: başlıklar ortalı (Tutar, Fatura No, harf)`, tutar?.thAlign === 'center' && no?.thAlign === 'center' && tutar?.letterAlign === 'center', JSON.stringify({ tutar, no }));
  check(`${where}: hücrede sayı sağda, metin solda`, tutar?.tdAlign === 'right' && no?.tdAlign === 'left', `${tutar?.tdAlign} / ${no?.tdAlign}`);
  check(`${where}: ince sütun çizgisi`, tutar?.tdLeft === '1px', tutar?.tdLeft);
  return tutar;
}
async function dragging(where, scope) {
  const o0 = await order(scope);
  const r1 = await drag(th(scope, 'Tutar'), th(scope, 'Fatura Tarihi'), 'before');
  const o1 = await order(scope);
  check(`${where}: sütun sürüklerken "dosya bırakın" katmanı açılmaz`, r1.hint === 0, r1.hint);
  check(`${where}: sürüklerken hedefin önünde ekleme çizgisi`, /drop-before/.test(r1.cls) && /2px 0px 0px 0px inset/.test(r1.shadow), `${r1.cls} | ${r1.shadow}`);
  check(`${where}: önüne bırakınca Tutar, Fatura Tarihi'nin hemen önünde`, o1.indexOf('Tutar') === o1.indexOf('Fatura Tarihi') - 1 && o1.indexOf('Tutar') === 1, o1.slice(0, 5).join(' | '));
  const r2 = await drag(th(scope, 'Tutar'), th(scope, 'Gönderen Unvan/Ad Soyad'), 'after');
  const o2 = await order(scope);
  check(`${where}: arkasına bırakınca Tutar eski yerine döner`, JSON.stringify(o2) === JSON.stringify(o0) && /drop-after/.test(r2.cls), `${o2.join(' | ')} (${r2.cls})`);
}

// --- Liste
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(300);
const lst = await standard('liste', LIST);
check('liste: satır çizgisi var', lst?.tdBottom === '1px', lst?.tdBottom);
await dragging('liste', LIST);
const toastText = async () => (await a.locator('.toast').innerText().catch(() => '')).trim();
await drag(th(LIST, 'Tutar'), th(LIST, 'Fatura Tarihi'), 'before');
check('liste: taşıma bildirimi harfi söyler ("Tutar" B sütununa taşındı)', (await toastText()).includes('"Tutar" B sütununa taşındı'), await toastText());
await drag(th(LIST, 'Tutar'), th(LIST, 'Gönderen Unvan/Ad Soyad'), 'after');
// boş sütunlar gösterilince gri başlık, harfsiz
await a.locator('.lv-empty').click(); await a.waitForTimeout(200);
check('liste: "Boş sütunlar (n) · Gizle" düğmesi', /^Boş sütunlar \(\d+\) · Gizle$/.test((await a.locator('.lv-empty').innerText()).trim()), await a.locator('.lv-empty').innerText());
const off = await a.evaluate(() => { const t = document.querySelector('.lv-table th.off'); return t ? { letter: t.querySelector('.col-letter').textContent.trim(), color: getComputedStyle(t.querySelector('.hdr-text')).color, title: t.title } : null; });
check('liste: yazılmayan sütun th.off, harf yok, ipucunda açıklama', off && off.letter === '' && /Excel'e yazılmıyor/.test(off.title), JSON.stringify(off));
await a.locator('.lv-empty').click(); await a.waitForTimeout(150);

// --- Çıktı önizlemesi
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend'); await a.waitForTimeout(300);
const pv = await standard('önizleme', PREV);
check('önizleme: satır çizgisi var', pv?.tdBottom === '1px', pv?.tdBottom);
await dragging('önizleme', PREV);
const codeCell = await a.evaluate((scope) => {
  const tr = [...document.querySelectorAll(`${scope} tbody tr`)].find((r) => r.textContent.includes('770.03'));
  const td = tr?.querySelector('td.code-col');
  const probe = document.createElement('div'); probe.style.background = 'var(--s0)'; document.body.appendChild(probe);
  const s0 = getComputedStyle(probe).backgroundColor; probe.remove();
  return td ? { cls: td.className, bg: getComputedStyle(td).backgroundColor, s0 } : null;
}, PREV);
check('önizleme: Q yuvasındaki kodun hücresi yuva rengi', codeCell && /slot-0/.test(codeCell.cls) && codeCell.bg === codeCell.s0, JSON.stringify(codeCell));
check('önizleme: yazılmayan sütun gösterilmez', (await a.locator(`${PREV} th.off`).count()) === 0, await a.locator(`${PREV} th.off`).count());
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
await a.locator('.toolbar button:has-text("Görsel")').click(); await a.waitForTimeout(200);

// --- Şablon önizlemesi (Basit)
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal'); await a.waitForTimeout(300);
const tp = await standard('şablon önizlemesi', TPL);
check('şablon önizlemesi: satır çizgisi var (kullanıcı 29.10: çizgisiz beğenilmedi)', tp?.tdBottom === '1px', tp?.tdBottom);
await dragging('şablon önizlemesi', TPL);
const tplOff = await a.evaluate((scope) => { const t = [...document.querySelectorAll(`${scope} th.off`)].find((e) => e.textContent.includes('Geliş Zamanı')); return t ? { letter: t.querySelector('.col-letter').textContent.trim(), bg: getComputedStyle(t).backgroundColor } : null; }, TPL);
check('şablon önizlemesi: boş EDM sütunu (Geliş Zamanı) gri, harfsiz', tplOff && tplOff.letter === '', JSON.stringify(tplOff));
check('"boş, yazılmaz" metni yok (şablon penceresi)', !(await a.locator('.tpl-modal').innerText()).includes('boş, yazılmaz'), 'var');
// KDV parçasını sürüklemek bütün KDV dökümünü taşır
const vatBefore = await order(TPL);
await drag(th(TPL, 'KDV %20'), th(TPL, 'Fatura Tarihi'), 'before');
const vatAfter = await order(TPL);
const i1 = vatAfter.indexOf('Matrah %0'), iDate = vatAfter.indexOf('Fatura Tarihi');
const vatCols = vatBefore.filter((h) => /^(Matrah|KDV) %|^Diğer|^Oranı Uyuşmayan/.test(h));
check('KDV parçasını sürüklemek bütün öğeyi taşır (Fatura No ile Fatura Tarihi arasına)', i1 === 1 && iDate === 1 + vatCols.length && vatAfter.slice(1, 1 + vatCols.length).join() === vatCols.join(), vatAfter.slice(0, vatCols.length + 3).join(' | '));
// --- Gelişmiş satırlar
await a.locator('.tpl-mode button:has-text("Gelişmiş")').click(); await a.waitForTimeout(250);
const rowsOrder = () => a.locator('.tpl-row').evaluateAll((rs) => rs.map((r) => r.querySelector('input.tpl-header')?.value ?? 'KDV'));
const rowIdx = {};
const row = (header) => a.locator('.tpl-row').nth(rowIdx[header]);
const findRows = async () => { const o = await rowsOrder(); for (const h of ['Tutar', 'Fatura Tarihi', 'Gönderen Unvan/Ad Soyad']) rowIdx[h] = o.indexOf(h); };
const r0 = await rowsOrder(); await findRows();
const rr = await drag(row('Tutar'), row('Fatura Tarihi'), 'before');
const r1 = await rowsOrder(); await findRows();
check('Gelişmiş: üst yarıya bırakınca önüne (çizgi üstte)', r1.indexOf('Tutar') === r1.indexOf('Fatura Tarihi') - 1 && /drop-before/.test(rr.cls), `${r1.slice(0, 5).join(' | ')} (${rr.cls})`);
await drag(row('Tutar'), row('Gönderen Unvan/Ad Soyad'), 'after');
const r2 = await rowsOrder();
check('Gelişmiş: alt yarıya bırakınca arkasına (eski yerine)', JSON.stringify(r2) === JSON.stringify(r0), r2.join(' | '));
check('Gelişmiş: boş satır gri, harf "—"', (await a.locator('.tpl-row.off .tpl-letter').first().innerText()).trim() === '—', await a.locator('.tpl-row.off').count());
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
check('"boş, yazılmaz" metni yok (ana ekran)', !(await a.locator('body').innerText()).includes('boş, yazılmaz'), 'var');

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
