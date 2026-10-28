// Kişiselleştirilebilir sütunlar: firmaya özel Excel şablonu (üst çubukta "Şablon"), liste görünümü Excel alanlarından
// seçilir/sıralanır ya da "Excel şablonuyla aynı" gösterilir; geniş tablo sayfayı genişletmez; eski kayıtlar taşınır.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/db47f010-e6ef-41e1-8024-b002bf7dd1fd/scratchpad';
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
const settle = async () => { await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300); };
const openTpl = async () => { await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal'); };
const firstHeader = () => a.locator('.tpl-header').first().inputValue();
const saveTpl = async () => { await a.locator('.tpl-modal button.primary:has-text("Kaydet")').click(); await a.waitForSelector('.tpl-modal', { state: 'detached' }); };
const closeTpl = async () => { await a.keyboard.press('Escape'); await a.waitForSelector('.tpl-modal', { state: 'detached' }); };
const heads = async () => (await a.locator('.lv-table thead th').allInnerTexts()).slice(2).map((t) => t.trim());
const colRow = (name) => a.locator('.cols-row').filter({ has: a.locator('.cols-name', { hasText: new RegExp(`^${name}$`) }) });

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await settle();
const firm1 = await a.locator('.firm-select option:checked').getAttribute('value');

// 1) Üst çubuktaki Şablon → firmanın şablonu
await openTpl();
check('Şablon düğmesi pencereyi firma adıyla açar', (await a.locator('.tpl-firm').innerText()) === 'Firma 1', await a.locator('.tpl-firm').innerText());
check('tek firmada "Başka firmadan al" yok', (await a.locator('.tpl-copy').count()) === 0, await a.locator('.tpl-copy').count());
await a.locator('.tpl-header').first().fill('Belge No'); await saveTpl();

// 2) Yeni firma açık firmanın şablonuyla başlar; değişiklik yalnızca o firmada
await a.locator('.firm-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.locator('.modal.dialog input').fill('Beta Ltd'); await a.keyboard.press('Enter'); await a.waitForTimeout(500);
await openTpl();
check('yeni firma şablonu kopyaladı (Belge No)', (await firstHeader()) === 'Belge No', await firstHeader());
await a.locator('.tpl-header').first().fill('Evrak No'); await saveTpl();
await a.locator('.firm-select').selectOption(firm1); await a.waitForTimeout(500);
await openTpl();
check('Firma 1 şablonu etkilenmedi (Belge No)', (await firstHeader()) === 'Belge No', await firstHeader());
await a.locator('.tpl-copy').selectOption({ label: 'Beta Ltd' });
check('Başka firmadan al → Beta şablonu pencereye gelir', (await firstHeader()) === 'Evrak No', await firstHeader());
await closeTpl(); await openTpl();
check('Kaydet basılmadan çıkınca değişmez', (await firstHeader()) === 'Belge No', await firstHeader());
await a.locator('.tpl-add-kdv').click(); await saveTpl();

// 3) Liste: kendi seçimim — çıkar, ekle, sırala, kalıcı
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview');
check('varsayılan liste sütunları', (await heads()).join('|') === 'Fatura No|Tarih|Satıcı|VKN / TCKN|Tip|Tutar|Hesap Kodu|Hesap adı|Dikkat', (await heads()).join('|'));
await a.locator('.cols-btn').click(); await a.waitForSelector('.cols-pop');
await colRow('Tip').locator('button[title="Sütunu kaldır"]').click();
check('Hesap Kodu da kaldırılabilir (zorunlu değil)', await colRow('Hesap Kodu').locator('button[title="Sütunu kaldır"]').isEnabled(), 'kilitli');
await a.locator('.cols-add').selectOption('uuid');
await colRow('ETTN').locator('button[title^="Sola"]').click();
await a.locator('.cols-add').selectOption('vat20Base');
let h = (await heads()).join('|');
check('Tip çıktı, ETTN eklendi ve bir sola, Matrah %20 sonda', h === 'Fatura No|Tarih|Satıcı|VKN / TCKN|Tutar|Hesap Kodu|Hesap adı|ETTN|Dikkat|Matrah %20', h);
const v20 = await a.locator('.lv-table tbody tr').first().locator('td').nth(2 + 9).innerText();
check('Matrah %20 hücresi Türkçe para biçimli', /^\d{1,3}(\.\d{3})*,\d{2}$/.test(v20.trim()), v20);
await a.waitForTimeout(300); // IndexedDB yazısı bitsin (yenileme bekleyen işlemi keser)
await a.reload(); await a.waitForSelector('.listview'); await a.waitForTimeout(400);
check('yenilemeden sonra seçim kalıcı', (await heads()).join('|') === h, (await heads()).join('|'));

// 4) Excel şablonuyla aynı: başlıklar şablondan, sona Dikkat; geniş tablo sayfayı genişletmez
await a.locator('.cols-btn').click(); await a.locator('.cols-mode label:has-text("Excel şablonuyla aynı") input').check(); await a.waitForTimeout(200);
await a.mouse.click(700, 880); await a.waitForTimeout(200);
h = await heads();
check('şablonla aynı: 29 şablon sütunu + Dikkat, ilk başlık Belge No, sonda KDV dökümü', h[0] === 'Belge No' && h[h.length - 2] === 'Oranı Uyuşmayan KDV' && h[h.length - 1] === 'Dikkat' && h.length === 30, `${h.length} sütun: ${h.slice(0, 2).join('|')} … ${h.slice(-3).join('|')}`);
const widths = await a.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, box: document.querySelector('.lv-table').scrollWidth }));
check('geniş tablo sayfayı genişletmez, kendi kutusunda kayar', widths.doc === widths.vw && widths.box > widths.vw, JSON.stringify(widths));
check('üst çubukta Excel üret ve Şablon görünür', await a.locator('.toolbar .excel-btn').isVisible() && await a.locator('.toolbar .excel-tpl').isVisible(), 'görünmüyor');

// 4b) Hesap Kodu'suz şablon (yalnızca veri toplama): kaydedilir, önizleme kod sütunu olmadığını söyler, kodsuzluk uyarısı yok
await openTpl();
await a.locator('.tpl-row.is-code button[title="Sütunu kaldır"]').click();
check('kod sütunu kaldırılınca Kaydet etkin', await a.locator('.tpl-modal button.primary:has-text("Kaydet")').isEnabled(), 'pasif');
await saveTpl();
h = await heads();
check('şablonla aynı liste kod sütunsuz', !h.includes('Hesap Kodu') && h.length === 29, `${h.length}: ${h.join('|').slice(0, 80)}`);
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
const pv = await a.locator('.modal.wide .modal-head').innerText();
check('önizleme: "Hesap Kodu sütunu yok", kodsuzluk uyarısı yok', pv.includes('Hesap Kodu sütunu yok') && !pv.includes('Hesap kodu atanmamış'), pv.replace(/\s+/g, ' ').slice(0, 160));
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// 5) Eski kayıtlar: firma şablonsuz + genel şablon özelleştirilmiş + eski liste kimlikleri → açılışta taşınır
await a.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('fatura-hesap-kodu');
  r.onsuccess = () => {
    const db = r.result; const tx = db.transaction(['firms', 'settings'], 'readwrite');
    const fs = tx.objectStore('firms'); const ss = tx.objectStore('settings');
    fs.getAll().onsuccess = (e) => { for (const f of e.target.result) { delete f.outputTemplate; fs.put(f); } };
    ss.get('settings').onsuccess = (e) => {
      const rec = e.target.result; const v = rec.value;
      v.outputTemplate = { columns: [{ id: 'no', header: 'Eski No' }, { id: 'code', header: 'HK' }], rowOrder: 'date-no', sheetName: 'S' };
      v.listColumns = ['no', 'supplier', 'account', 'code']; v.listFollowsTemplate = false;
      ss.put(rec);
    };
    tx.oncomplete = () => { db.close(); res(); };
  };
}));
await a.reload(); await a.waitForSelector('.listview'); await a.waitForTimeout(400);
check('eski liste seçimi çevrildi', (await heads()).join('|') === 'Fatura No|Satıcı|Hesap adı|Hesap Kodu', (await heads()).join('|'));
await openTpl();
check('şablonsuz firma genel şablonu aldı', (await firstHeader()) === 'Eski No' && (await a.locator('.tpl-header').count()) === 2, `${await firstHeader()} / ${await a.locator('.tpl-header').count()}`);
await closeTpl();

console.log('HATALAR:', errors.length ? errors : 'yok');
console.log(fails ? `${fails} DENETİM BAŞARISIZ` : 'HEPSİ GEÇTİ');
await browser.close();
process.exit(fails ? 1 : 0);
