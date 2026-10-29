// Eleştiri turu 2, D (eksikler): liste görünümünde "dönemden sil" ve ⚡ kural yap; seçim varken Q/elle giriş seçilenlere verir;
// tek firmada "taşı" (aynı firmanın başka dönemine); yükleme sonucu her zaman açılabilir; hızlı kuralda tarih ay/yıl;
// "Liste adı" açıklamalı. (Sürüklenen klasörde okunamayanlar: birim testi dnd.test.ts.)
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
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const up = 'input[accept*=".zip"]';
const lvRow = (no) => a.locator(`.lv-table tr.row:has-text("${no}")`);
const lvCode = (no) => lvRow(no).locator('td.lv-code').innerText().then((t) => t.replace(/hariç/, '').trim());
const db = (store) => a.evaluate((store) => new Promise((res) => { const r = indexedDB.open('fatura-hesap-kodu'); r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).getAll(); q.onsuccess = () => { res(q.result); r.result.close(); }; }; }), store);
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');

// 1) Yükleme sonucu: sorunsuz yüklemede de bildirimde "Ayrıntı" → rapor
await a.locator(up).setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
check('bildirimde "Ayrıntı" düğmesi', (await a.locator('.toast .toast-act:has-text("Ayrıntı")').count()) === 1, await a.locator('.toast').innerText().catch(() => '(yok)'));
await a.locator('.toast .toast-act').click(); await a.waitForSelector('.modal:has-text("Yükleme sonucu")');
check('rapor açılır: hepsi okundu', (await a.locator('.modal:has-text("Yükleme sonucu")').innerText()).includes('Bütün dosyalar okundu'), await a.locator('.modal').innerText());
await a.keyboard.press('Escape'); await a.waitForTimeout(150);
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Dönem")').click();
const li = await a.locator('.last-import').innerText().catch(() => '(yok)');
check('Ayarlar › Dönem: son yükleme + Ayrıntı', li.includes(`${files.length} eklendi`) && li.includes('Ayrıntı'), li);
await a.locator('.last-import button').click(); await a.waitForSelector('.modal:has-text("Yükleme sonucu")'); await a.keyboard.press('Escape'); await a.waitForTimeout(150);

// 2) "Liste adı" açıklamalı
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Firma")').click();
await a.locator('button:has-text("Hesap kodu listesi")').click(); await a.waitForTimeout(200);
check('"Liste adı" ne işe yaradığını söyler', /Liste adı.*Ctrl\+\..*başlığında/s.test(await a.locator('label:has-text("Liste adı")').innerText()), await a.locator('label:has-text("Liste adı")').innerText());
await a.keyboard.press('Escape'); await a.waitForTimeout(150);

// 3) Seçim varken Q seçilenlere verir; açık fatura seçili değilse dokunulmaz; Ctrl+Z hepsini geri alır
await a.locator('.slot.slot-0').click(); await a.keyboard.type('153.01'); await a.keyboard.press('Enter'); await a.waitForTimeout(200);
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(200);
await lvRow('AYT2026000000001').click();
for (const no of ['YLD2026000000001', 'GNS2026000000001', 'HZK2026000000001']) await lvRow(no).locator('.row-check').click();
check('yuva ipucu seçilenleri söyler', (await a.locator('.slot.slot-0').getAttribute('title')).includes('3 seçili'), await a.locator('.slot.slot-0').getAttribute('title'));
await a.keyboard.press('q'); await a.waitForTimeout(400);
const qCodes = await Promise.all(['YLD2026000000001', 'GNS2026000000001', 'HZK2026000000001'].map(lvCode));
check('Q: seçili 3 faturaya 153.01', qCodes.every((c) => c === '153.01'), qCodes.join(','));
check('Q: açık (seçili olmayan) faturaya dokunulmaz', (await lvCode('AYT2026000000001')) === '—', await lvCode('AYT2026000000001'));
check('Q sonrası seçim temizlenir', (await a.locator('.lv-table tr.row.selected').count()) === 0, await a.locator('.lv-table tr.row.selected').count());
await a.keyboard.press('Control+z'); await a.waitForTimeout(400);
check('Ctrl+Z üçünü birden geri alır', (await Promise.all(['YLD2026000000001', 'GNS2026000000001', 'HZK2026000000001'].map(lvCode))).every((c) => c === '—'), 'kaldı');
// elle giriş de seçilenlere
for (const no of ['YLD2026000000001', 'GNS2026000000001']) await lvRow(no).locator('.row-check').click();
await a.keyboard.press('/'); await a.waitForTimeout(100);
check('elle giriş yer tutucusu seçilenleri söyler', (await a.locator('.manual-input').getAttribute('placeholder')).includes('2 seçili'), await a.locator('.manual-input').getAttribute('placeholder'));
await a.keyboard.type('760.02'); await a.keyboard.press('Enter'); await a.waitForTimeout(400);
check('elle giriş: seçili 2 faturaya', (await lvCode('YLD2026000000001')) === '760.02' && (await lvCode('GNS2026000000001')) === '760.02' && (await lvCode('AYT2026000000001')) === '—', `${await lvCode('YLD2026000000001')} ${await lvCode('GNS2026000000001')} ${await lvCode('AYT2026000000001')}`);
// seçim yokken Q yalnızca açık faturaya
await lvRow('AYT2026000000001').click(); await a.keyboard.press('q'); await a.waitForTimeout(300);
check('seçim yokken Q açık faturaya', (await lvCode('AYT2026000000001')) === '153.01', await lvCode('AYT2026000000001'));

// 4) Liste görünümü: ⚡ kural yap ve dönemden sil
check('listede ⚡ Kural yap', (await a.locator('.lv-head .rule-make').count()) === 1, await a.locator('.lv-head').innerText());
check('listede "dönemden sil"', (await a.locator('.lv-head button:has-text("dönemden sil")').count()) === 1, await a.locator('.lv-head').innerText());
for (const no of ['LZT2026000000001', 'MVE2026000000001']) await lvRow(no).locator('.row-check').click();
check('listede seçimle: yalnızca "2 seçiliyi dönemden sil"', (await a.locator('.lv-head button:has-text("2 seçiliyi dönemden sil")').count()) === 1 && (await a.locator('.lv-head button:has-text("dönemden sil")').count()) === 1, await a.locator('.lv-head').innerText());
await a.keyboard.press('Escape'); await a.waitForTimeout(100);

// 5) Hızlı kural: tarih o ay
await lvRow('AYT2026000000001').click();
await a.locator('.lv-head .rule-make').click(); await a.waitForSelector('.modal.quick-rule');
await a.locator('.modal.quick-rule .qchip.k-date input[type=checkbox]').check();
await a.locator('.modal.quick-rule .qchip-span').selectOption('month'); await a.waitForTimeout(150);
check('tarih rozeti ay seçilince işaretli kalır', await a.locator('.modal.quick-rule .qchip.k-date input[type=checkbox]').isChecked(), 'işaret düştü');
await a.locator('.modal.quick-rule button.primary').click(); await a.waitForTimeout(500);
const rules = await db('rules');
const dc = rules.flatMap((r) => r.conds).find((c) => c.kind === 'date');
check('kural: tarih 01.09–30.09.2026', dc && dc.from === '2026-09-01' && dc.to === '2026-09-30', JSON.stringify(dc));

// 6) Tek firma: taşı → aynı firmanın yeni dönemine
await a.locator('.toolbar button:has-text("Görsel")').click(); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(200);
check('tek firmada "taşı" görünür', (await a.locator('.files button:has-text("taşı")').count()) === 1, await a.locator('.files').innerText());
const n0 = await a.locator('.list .row').count();
for (const no of ['AHD2026000000001', 'HZK2026000000003']) await a.locator(`.list .row:has-text("${no}") .row-check`).click();
await a.locator('.files button:has-text("taşı")').click(); await a.waitForSelector('.modal:has-text("ya da döneme taşı")');
const mv = a.locator('.modal:has-text("ya da döneme taşı")');
check('aynı firmada "dönemin tamamı" kapalı, seçililer seçili', (await mv.locator('label:has-text("döneminin tamamı") input').isDisabled()) && (await mv.locator('label:has-text("Seçili faturalar") input').isChecked()), await mv.innerText());
await a.keyboard.press('Enter'); await a.waitForTimeout(800);
const batches = await db('batches');
check('yeni dönem açıldı (ad çakışmaz), 2 fatura taşındı', batches.length === 2 && new Set(batches.map((b) => b.name)).size === 2 && (await a.locator('.list .row').count()) === n0 - 2, `${batches.length} dönem · ${await a.locator('.list .row').count()}/${n0}`);
const curBatch = await a.locator('.batch-select option:checked').getAttribute('value');
const moved = (await db('invoices')).filter((r) => r.batchId !== curBatch).map((r) => r.no).sort();
check('yeni dönemde tam o 2 fatura', moved.join(',') === 'AHD2026000000001,HZK2026000000003', moved.join(','));

check('sayfa hatası yok', errors.length === 0, errors.join('; '));
await browser.close();
process.exit(fails ? 1 : 0);
