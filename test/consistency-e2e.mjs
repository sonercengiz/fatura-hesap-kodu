// Eleştiri turu 2, C (tutarsızlıklar): "dönemden sil" adı, taşı penceresinde Vazgeç/Taşı yeri ve Enter, elle (manuel değil),
// kural sayısı her yerde aynı (bu dönemde geçerli), sıra ipucu şablonu söyler, arama yer tutucuları aynı ve ETTN'yi bulur,
// kural ipucu panelde ve listede aynı söz, XML'siz fatura açıklaması, para 2 ondalık, klavye listesi rehberle aynı.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const rulesFile = `${DEMO}/${readdirSync(DEMO).find((f) => /^kurallar.*\.json$/.test(f))}`;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const up = 'input[accept*=".zip"]';
const toast = () => a.locator('.toast').innerText().catch(() => '(yok)');
const row = (no) => a.locator(`.list .row:has-text("${no}")`);
const count = () => a.locator('.list .row').count();
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator(up).setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(400);
const firm1 = await a.locator('.firm-select option:checked').getAttribute('value');

// 1) Panel: "dönemden sil" (Excel'den çıkar ile karışmasın), onay ve toast aynı sözle
await row('YLD2026000000002').click();
check('panel düğmesi "dönemden sil"', (await a.locator('.files button:has-text("dönemden sil")').count()) === 1 && (await a.locator('.files button', { hasText: /^çıkar$/ }).count()) === 0, await a.locator('.files').innerText());
const n0 = await count();
await a.locator('.files button:has-text("dönemden sil")').click(); await a.waitForSelector('.modal.dialog');
const dlg = await a.locator('.modal.dialog').innerText();
check('onay: başlık "dönemden sil", düğme "Sil"', /dönemden sil/i.test(dlg) && (await a.locator('.modal.dialog button.danger').innerText()).trim() === 'Sil', dlg);
await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(500);
check('silindi + toast "dönemden silindi"', (await count()) === n0 - 1 && (await toast()).includes('dönemden silindi'), `${await count()} · ${await toast()}`);
for (let i = 0; i < 2; i++) await a.locator('.list .row').nth(i).locator('.row-check').click();
check('çoklu: yalnızca "2 seçiliyi dönemden sil" (tekli gizli)', (await a.locator('.files button:has-text("2 seçiliyi dönemden sil")').count()) === 1 && (await a.locator('.files button:has-text("dönemden sil")').count()) === 1, await a.locator('.files').innerText());
await a.keyboard.press('Escape'); await a.waitForTimeout(100);

// 2) Alt çubukta "Elle kod gir"; durum kartında "parti" yok
const bar = await a.locator('footer.bar').innerText();
check('alt çubuk "Elle kod gir", "Manuel" yok', bar.includes('Elle kod gir') && !/manuel/i.test(bar), bar.replace(/\s+/g, ' '));
check('hiçbir başlıkta "parti" yok', (await a.locator('[title*="parti"]').count()) === 0, 'var');

// 3) Arama yer tutucuları aynı ve ETTN'yi söyler; ETTN ile bulur
const phPanel = await a.locator('aside input.search').getAttribute('placeholder');
check('panel arama: VKN ve ETTN yazıyor', /VKN/.test(phPanel) && /ETTN/.test(phPanel), phPanel);
const uuid = await a.evaluate(() => new Promise((res) => { const r = indexedDB.open('fatura-hesap-kodu'); r.onsuccess = () => { const q = r.result.transaction('invoices').objectStore('invoices').getAll(); q.onsuccess = () => res(q.result.find((x) => x.no === 'GNS2026000000002')?.uuid ?? ''); }; }));
await a.locator('aside input.search').fill(uuid); await a.waitForTimeout(200);
check('ETTN ile arama bulur', (await count()) < n0 - 1 && (await a.locator('.list .row:has-text("GNS2026000000002")').count()) === 1, `${uuid} → ${await count()}`);
await a.locator('aside input.search').fill(''); await a.waitForTimeout(150);

// 4) Sıra ipucu: Excel'in sırasını şablondan söyler (her zaman tarih değil)
const sortTitle = await a.locator('aside .sort-select').getAttribute('title');
check('sıra ipucu şablondaki satır sırasını söyler', /şablon/i.test(sortTitle) && !/her zaman/.test(sortTitle), sortTitle);

// 5) Kural sayısı: üst çubuk = pencere başlığı = Ayarlar (bu dönemde geçerli kurallar)
await a.locator('.toolbar button:has-text("Kurallar")').click(); await a.waitForSelector('.modal.rules');
await a.locator('input[accept=".json,application/json"]').setInputFiles(rulesFile); await a.waitForTimeout(500);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
// elle kod + döneme özel hızlı kural
const free = a.locator('.list .row:not(:has(.bulk-tag))').first();
await free.click(); await a.keyboard.press('/'); await a.keyboard.type('760.01'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
await a.locator('.detail .rule-make').click(); await a.waitForSelector('.modal.quick-rule');
await a.locator('.modal.quick-rule .scope-seg button:has-text("Yalnızca bu dönem")').click();
await a.locator('.modal.quick-rule button.primary').click(); await a.waitForTimeout(600);
const tbNum = Number((await a.locator('.toolbar button:has-text("Kurallar")').innerText()).match(/\d+/)?.[0] ?? -1);
await a.locator('.toolbar button:has-text("Kurallar")').click(); await a.waitForSelector('.modal.rules');
const head = await a.locator('.modal.rules .modal-head .muted').innerText();
const listed = await a.locator('.modal.rules .rule-row').count();
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Firma")').click();
const setTxt = await a.locator('button:has-text("Otomatik atama kuralları")').innerText();
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
check('üst çubuk sayısı = pencerede listelenen', tbNum === listed && listed > 1, `${tbNum} / ${listed}`);
check('pencere başlığı aynı sayıyı ve dağılımını söyler', head.includes(`bu dönemde ${listed} kural`) && head.includes(`${listed - 1} kalıcı, 1 döneme özel`), head);
check('Ayarlar › Firma aynı sayı', setTxt.includes(`bu dönemde ${listed}`), setTxt);

// 6) Kural ipucu: panelde ve listede aynı söz ("Kural: kod")
const ruled = a.locator('.list .row:has(.bulk-tag:has-text("kural"))').first();
await ruled.click(); await a.keyboard.press('/'); await a.keyboard.type('999.99'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
const pHint = await a.locator('.detail button.hint').first().innerText().catch(() => '');
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(200);
const lHint = await a.locator('.lv-hint').first().innerText().catch(() => '');
const lead = (t) => t.split(':')[0].trim();
check('kural ipucu panelde/listede aynı başlıyor', pHint && lHint && lead(pHint) === lead(lHint) && !pHint.includes('diyor ki'), `${pHint} | ${lHint}`);
const phList = await a.locator('.lv-search').getAttribute('placeholder');
check('liste arama yer tutucusu panelle aynı', phList === phPanel, `${phList} | ${phPanel}`);
await a.keyboard.press('Control+z'); await a.waitForTimeout(200);
await a.locator('.toolbar button:has-text("Görsel")').click(); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(200);

// 7) Önizleme: para 2 ondalık, sağa yaslı
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide');
const amounts = await a.locator('.modal.wide tbody tr td.r').allInnerTexts();
check('önizlemede tutarlar 2 ondalıklı', amounts.length > 0 && amounts.every((x) => /^\d{1,3}(\.\d{3})*,\d{2}$/.test(x)), amounts.slice(0, 6).join(' | '));
await a.keyboard.press('F5'); await a.waitForTimeout(200);

// 8) Klavye: Ayarlar › Klavye rehberdeki tabloyla aynı
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Klavye")').click();
const kSet = await a.locator('.modal .keys-table').innerText();
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
await a.locator('.toolbar button:has-text("Rehber")').click(); await a.waitForSelector('.modal .keys-table', { timeout: 3000 }).catch(() => {});
const kGuide = await a.locator('.modal .keys-table').innerText().catch(() => '(rehberde tablo yok)');
check('Ayarlar › Klavye = rehber klavye tablosu', kSet === kGuide && /Çift tık/.test(kSet) && /Shift\+ok/.test(kSet), `${kSet.length} / ${kGuide.length}`);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// 9) XML'siz fatura açıklaması "eski Excel dönemi" demez (arşivlenmiş dönem)
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click(); await a.waitForTimeout(800);
await a.locator('.modal button:has-text("XML\'leri kaldır")').first().click(); await a.waitForSelector('.modal.dialog'); await a.keyboard.press('Enter'); await a.waitForTimeout(800);
await a.keyboard.press('Escape'); await a.waitForTimeout(300);
const card = await a.locator('.card-hint').innerText().catch(() => '(kart yok)');
check('XML\'siz kart: "eski Excel dönemi" yok, kaldırılmayı söyler', !/eski Excel/.test(card) && /kaldırıldı/.test(card), card);

// 10) Taşı: Vazgeç ve Taşı altta yan yana, Enter taşır
await a.locator('.firm-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.locator('.modal.dialog input').fill('Beta Ltd'); await a.keyboard.press('Enter'); await a.waitForTimeout(500);
await a.locator('.firm-select').selectOption(firm1); await a.waitForSelector('.list .row'); await a.waitForTimeout(400);
const before = await count();
await a.locator('.list .row').nth(0).locator('.row-check').click();
await a.locator('.files button:has-text("taşı")').click(); await a.waitForSelector('.modal:has-text("ya da döneme taşı")');
check('taşı penceresi açılınca odak pencerede', await a.evaluate(() => !!document.activeElement?.closest('.modal')), await a.evaluate(() => document.activeElement?.outerHTML.slice(0, 60)));
const mv = a.locator('.modal:has-text("ya da döneme taşı")');
check('taşı: başlıkta düğme yok, altta Vazgeç + Taşı (Enter)', (await mv.locator('.modal-head button').count()) === 0 && (await mv.locator('button.ghost:has-text("Vazgeç")').count()) === 1 && (await mv.locator('button.primary:has-text("Taşı")').innerText()).includes('Enter'), await mv.innerText());
await a.locator('label:has-text("Seçili faturalar") input').check();
await a.keyboard.press('Enter'); await a.waitForTimeout(800);
check('Enter seçili faturayı taşır', (await a.locator('.modal:has-text("ya da döneme taşı")').count()) === 0 && (await count()) === before - 1, `${await count()} / ${before}`);

check('sayfa hatası yok', errors.length === 0, errors.join('; '));
await browser.close();
process.exit(fails ? 1 : 0);
