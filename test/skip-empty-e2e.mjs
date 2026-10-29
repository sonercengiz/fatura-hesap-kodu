// "Boş sütunları atla" (varsayılan açık, şablonun parçası): dönemde bütün faturalarda boş sütunlar Excel'e yazılmaz, harfler Excel'deki
// gerçek harfi gösterir; Hesap Kodu ve bilerek eklenen Boş sütun hep yazılır. Kutu kaldırılınca ekrandaki gibi hepsi yazılır.
// Listede gizlenen boş sütunlara göz atılabilir (gri başlık, harfsiz). Kutu liste, önizleme ve şablon penceresinde aynı seçimi gösterir.
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const S = process.env.SCRATCH || '/tmp';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().slice(0, 6).map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let nDl = 0;
const excelHead = async () => {
  const [dl] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
  const path = `${S}/skip-empty-${nDl++}.xlsx`; await dl.saveAs(path);
  const wb = XLSX.read(readFileSync(path));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })[0];
};
const letterOf = async (scope, name) => (await a.locator(`${scope} thead th.hdr-edit`, { hasText: name }).first().locator('.col-letter').innerText()).trim();

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(200);

const box = a.locator('.lv-cols .skip-empty input');
check('kutu varsayılan işaretli', await box.isChecked(), 'işaretsiz');
check('kutu adı "Boş sütunları atla" ve sayı', /Boş sütunları atla\s*\(12\)/.test(await a.locator('.lv-cols .skip-empty').innerText()), await a.locator('.lv-cols .skip-empty').innerText());
let head = await excelHead();
check('Excel\'de boş EDM sütunları yok (9 sütun)', head.length === 9 && !head.includes('Geliş Zamanı'), `${head.length}: ${head.join(' | ')}`);
check('Hesap Kodu kod atanmamışken de yazıldı', head.includes('Hesap Kodu'), head.join(' | '));
check('listede gerçek harf: Fatura Tipi D (şablonda E)', (await letterOf('.lv-table', 'Fatura Tipi')) === 'D', await letterOf('.lv-table', 'Fatura Tipi'));
check('Excel\'de Fatura Tipi D sütununda', head[3] === 'Fatura Tipi', head[3]);
await a.locator('.lv-empty').click(); await a.waitForTimeout(150);
check('göz atınca gizli sütun gri başlıkla, harfsiz görünür', (await letterOf('.lv-table', 'Geliş Zamanı')) === '' && /\boff\b/.test(await a.locator('.lv-table thead th.hdr-edit', { hasText: 'Geliş Zamanı' }).getAttribute('class')), await letterOf('.lv-table', 'Geliş Zamanı'));
await a.locator('.lv-empty').click(); await a.waitForTimeout(150);

// Kutu kaldırılınca: ekrandaki gibi hepsi yazılır; harfler şablondaki harfe döner
await box.uncheck(); await a.waitForTimeout(300);
head = await excelHead();
check('kutu kaldırılınca Excel 21 sütun, boş sütunlar dahil', head.length === 21 && head.includes('Geliş Zamanı'), `${head.length}`);
check('harf şablondakine döndü: Fatura Tipi E', (await letterOf('.lv-table', 'Fatura Tipi')) === 'E', await letterOf('.lv-table', 'Fatura Tipi'));
check('liste gizlemesi olduğu gibi duruyor', (await a.locator('.lv-empty').count()) === 1 && !(await a.locator('.lv-table thead').innerText()).includes('Geliş Zamanı'), '');

// Önizleme ve şablon penceresi aynı seçimi gösterir; önizlemeden geri işaretlenir
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
check('önizlemede kutu işaretsiz (aynı seçim)', !(await a.locator('.modal.wide .skip-empty input').isChecked()), 'işaretli');
check('önizleme 21 sütun', (await a.locator('.modal.wide thead th.hdr-edit').count()) === 21, await a.locator('.modal.wide thead th.hdr-edit').count());
await a.locator('.modal.wide .skip-empty input').check(); await a.waitForTimeout(300);
check('önizlemede işaretleyince boş sütunlar düşer ve söylenir', (await a.locator('.modal.wide thead th.hdr-edit').count()) === 9 && (await a.locator('.modal.wide .skip-empty').innerText()).includes('(12)'), await a.locator('.modal.wide .modal-head .muted').first().innerText());
check('önizlemede gerçek harf: Tutar H (şablonda I)', (await letterOf('.modal.wide', 'Tutar')) === 'H', await letterOf('.modal.wide', 'Tutar'));
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
check('şablon penceresinde kutu işaretli', await a.locator('.tpl-modal .skip-empty input').isChecked(), 'işaretsiz');
check('Basit görünümde atlanan alanın harfi yok', !/[A-Z]/.test(await a.locator('.tpl-check', { hasText: 'Geliş Zamanı' }).innerText().then((x) => x.replace('Geliş Zamanı', ''))), await a.locator('.tpl-check', { hasText: 'Geliş Zamanı' }).innerText());
// Bilerek eklenen Boş sütun atlanmaz
await a.locator('.tpl-group button:has-text("+ Boş sütun")').click(); await a.waitForTimeout(200);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
head = await excelHead();
check('bilerek eklenen Boş sütun yazıldı (10 sütun, son başlık boş)', head.length === 10 && head[9] === '', `${head.length}: ${head.join(' | ')}`);

// Yenileyince seçim duruyor (şablonla saklanır)
await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal');
await a.locator('.tpl-modal .skip-empty input').uncheck(); await a.waitForTimeout(200); await a.keyboard.press('Escape');
await a.reload(); await a.waitForSelector('.listview'); await a.waitForTimeout(400);
check('yenileyince kutu işaretsiz kaldı', !(await a.locator('.lv-cols .skip-empty input').isChecked()), 'işaretli');

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
