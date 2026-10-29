// G2 (tur 3): tek Excel şablonu, her yerden düzenlenir. Liste ve önizlemede yapılan sütun değişikliği Excel'e yansır (kullanıcının
// "listede sütun seçtim, Excel öyle çıkmadı" sorunu); şablon penceresi anında kaydeder, Geri al; kapsam Genel › Bu firma › Bu dönem;
// özel şablonu sil genele döndürür; boş sütunlar listede yalnızca ekranda gizlenir; yedekte genel ve firma şablonları gelir.
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { SCRATCH } from './paths.mjs';
const S = SCRATCH;
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
const settle = async () => { await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300); };
let nDl = 0;
const excelHead = async (p = a) => {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('F1')]);
  const path = `${S}/tpl-scope-${nDl++}.xlsx`; await dl.saveAs(path);
  const wb = XLSX.read(readFileSync(path));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })[0];
};
const openTpl = async () => { await a.locator('.toolbar .excel-tpl').click(); await a.waitForSelector('.tpl-modal'); };
const closeTpl = async () => { await a.keyboard.press('Escape'); await a.waitForSelector('.tpl-modal', { state: 'detached' }); await a.waitForTimeout(200); };
const listHeads = async () => (await a.locator('.lv-table thead th.hdr-edit .hdr-text').allInnerTexts()).map((t) => t.trim());

await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await settle();
const firm1 = await a.locator('.firm-select option:checked').getAttribute('value');

// 1) Liste = Excel şablonu: listede eklenen/adı değişen/kaldırılan sütun Excel'e yansır
await a.locator('.toolbar button:has-text("Liste")').click(); await a.waitForSelector('.listview'); await a.waitForTimeout(200);
const emptyBtn = a.locator('.lv-empty');
check('boş sütunlar listede gizli, sayısı söylenir', /^Boş sütunlar \(\d+\) · Göster$/.test((await emptyBtn.innerText()).trim()), await emptyBtn.innerText().catch(() => 'yok'));
check('gizli boş sütun (Geliş Zamanı) listede yok', !(await listHeads()).includes('Geliş Zamanı'), (await listHeads()).join(' | '));
await emptyBtn.click(); await a.waitForTimeout(150);
check('"göster" ile boş sütunlar görünür', (await listHeads()).includes('Geliş Zamanı'), (await listHeads()).join(' | '));
await emptyBtn.click(); await a.waitForTimeout(150);
await a.locator('.lv-cols .add-col').selectOption('uuid'); await a.waitForTimeout(300);
check('listede eklenen ETTN listede görünür', (await listHeads()).includes('ETTN'), (await listHeads()).join(' | '));
check('ve Excel\'de de var', (await excelHead()).includes('ETTN'), '');
const tipTh = a.locator('.lv-table thead th.hdr-edit', { hasText: 'Fatura Tipi' });
await tipTh.locator('.hdr-text').click(); await a.locator('.lv-table .hdr-input').fill('Tip'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
let head = await excelHead();
check('listede değiştirilen başlık Excel\'de', head.includes('Tip') && !head.includes('Fatura Tipi'), head.join(' | '));
check('başlık düzenlerken kısayol çalışmadı (kod atanmadı)', (await a.locator('.progress').innerText()).startsWith('0/'), await a.locator('.progress').innerText());
const turTh = a.locator('.lv-table thead th.hdr-edit', { hasText: 'Fatura Türü' });
await turTh.hover(); await turTh.locator('.hdr-x').click(); await a.waitForTimeout(300);
check('listede kaldırılan sütun listeden gitti', !(await listHeads()).includes('Fatura Türü'), (await listHeads()).join(' | '));
check('bildirimde Geri al', (await a.locator('.toast').innerText()).includes('Geri al'), await a.locator('.toast').innerText().catch(() => ''));
await a.locator('.toast-act').click(); await a.waitForTimeout(300);
check('Geri al sütunu geri getirir', (await listHeads()).includes('Fatura Türü'), (await listHeads()).join(' | '));
await turTh.hover(); await turTh.locator('.hdr-x').click(); await a.waitForTimeout(300);
check('listede kaldırılan sütun Excel\'den de çıktı', !(await excelHead()).includes('Fatura Türü'), '');

// 2) Önizleme: başlıktan sürükleyerek sırala, adını değiştir
await a.keyboard.press('F5'); await a.waitForSelector('.modal.wide .legend');
const pvTh = (t) => a.locator('.modal.wide thead th.hdr-edit', { hasText: t });
await pvTh('Tutar').dragTo(pvTh('Fatura No')); await a.waitForTimeout(300);
let pv = (await a.locator('.modal.wide thead th.hdr-edit .hdr-text').allInnerTexts()).map((x) => x.trim());
check('önizlemede sürüklenen Tutar A sütununda', pv[0] === 'Tutar', pv.slice(0, 3).join(' | '));
await pvTh('Fatura No').locator('.hdr-text').click(); await a.locator('.modal.wide .hdr-input').fill('Belge No'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
head = await excelHead();
check('önizlemedeki sıra ve başlık Excel\'de', head[0] === 'Tutar' && head[1] === 'Belge No', head.slice(0, 3).join(' | '));

// 3) Şablon penceresi: Basit varsayılan; işaret kaldır → anında kayıt; Geri al
await openTpl();
check('pencere Basit görünümde açılır', (await a.locator('.tpl-mode button.on').innerText()) === 'Basit', await a.locator('.tpl-mode button.on').innerText());
check('Genel "Excel bunu kullanıyor"', (await a.locator('.tpl-scope.used').innerText()).includes('Genel'), await a.locator('.tpl-scope.used').innerText());
check('Kaydet düğmesi yok', (await a.locator('.tpl-modal button:has-text("Kaydet")').count()) === 0, 'var');
const curr = a.locator('.tpl-check', { hasText: 'Döviz Cinsi' }).locator('input');
await curr.uncheck(); await a.waitForTimeout(200);
await closeTpl();
check('işareti kaldırılan Döviz Cinsi Excel\'de yok (Kaydet\'siz)', !(await excelHead()).includes('Döviz Cinsi'), '');
await openTpl();
await a.locator('.tpl-check', { hasText: 'Döviz Cinsi' }).locator('input').check(); await a.waitForTimeout(150);
await a.keyboard.press('Control+z'); await a.waitForTimeout(200);
check('Ctrl+Z pencerede geri alır', !(await a.locator('.tpl-check', { hasText: 'Döviz Cinsi' }).locator('input').isChecked()), 'işaretli');
await closeTpl();

// 4) Kapsam: firmaya özel şablon yalnızca o firmayı etkiler; yeni firma genel şablonu kullanır; özel şablonu sil genele döndürür
await openTpl();
await a.locator('.tpl-scope', { hasText: 'Bu firma' }).click();
check('firmanın özel şablonu yok yazar', (await a.locator('.tpl-empty').innerText()).includes('genel şablonla'), await a.locator('.tpl-empty').innerText().catch(() => ''));
await a.locator('.tpl-make').click(); await a.waitForTimeout(200);
check('"Bu firma" artık Excel bunu kullanıyor', (await a.locator('.tpl-scope.used').innerText()).includes('Bu firma'), await a.locator('.tpl-scope.used').innerText());
await a.locator('.tpl-check', { hasText: 'ETTN' }).locator('input').uncheck(); await a.waitForTimeout(200);
await a.locator('.tpl-scope', { hasText: 'Genel' }).click();
check('genele bakarken uyarı: bu dönemi etkilemez', (await a.locator('.tpl-note').innerText()).includes('etkilemez'), await a.locator('.tpl-note').innerText().catch(() => 'yok'));
await closeTpl();
check('Firma 1 Excel\'i özel şablonla (ETTN yok)', !(await excelHead()).includes('ETTN'), '');
await a.locator('.firm-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.locator('.modal.dialog input').fill('Beta Ltd'); await a.keyboard.press('Enter'); await a.waitForTimeout(500);
await a.locator('input[accept*=".zip"]').first().setInputFiles(files.slice(0, 2)).catch(() => {});
await a.waitForSelector('.inv-frame, .lv-table tbody tr'); await settle();
head = await excelHead();
check('yeni firma genel şablonu kullanır (ETTN var, A Tutar)', head.includes('ETTN') && head[0] === 'Tutar', head.slice(0, 4).join(' | '));
await openTpl();
check('yeni firmada Genel kullanılıyor', (await a.locator('.tpl-scope.used').innerText()).includes('Genel'), await a.locator('.tpl-scope.used').innerText());
await closeTpl();
await a.locator('.firm-select').selectOption(firm1); await a.waitForTimeout(600);
await openTpl();
await a.locator('.tpl-foot button:has-text("Özel şablonu sil")').click(); await a.waitForSelector('.modal.dialog');
check('silme onayı genel şablonu söyler', (await a.locator('.modal.dialog').innerText()).includes('genel şablonla'), await a.locator('.modal.dialog').innerText());
await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(300);
await closeTpl();
check('özel şablon silinince Firma 1 genele döner (ETTN var)', (await excelHead()).includes('ETTN'), '');

// 5) Döneme özel şablon
await openTpl();
await a.locator('.tpl-scope', { hasText: 'Bu dönem' }).click(); await a.locator('.tpl-make').click(); await a.waitForTimeout(200);
await a.locator('.tpl-check', { hasText: 'Gönderen VKN/TCKN' }).locator('input').uncheck(); await a.waitForTimeout(200);
await closeTpl();
check('döneme özel şablon: VKN yok', !(await excelHead()).includes('Gönderen VKN/TCKN'), '');
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Çıktı")').click();
check('Ayarlar › Çıktı döneme özel olduğunu söyler', (await a.locator('.settings-pane .muted').first().innerText()).includes('döneme özel'), await a.locator('.settings-pane .muted').first().innerText());
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// 6) Yenileyince her şey yerinde
await a.reload(); await a.waitForSelector('.lv-table, .inv-frame'); await settle();
check('yenileyince döneme özel şablon duruyor', !(await excelHead()).includes('Gönderen VKN/TCKN'), '');

// 7) Yedek: dışa aktar → temiz tarayıcıda içe aktar → genel şablon ve dönem şablonu gelir
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click();
const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('button:has-text("Dışa aktar (.json)")').click()]);
const json = `${S}/tpl-scope-yedek.json`; await dl.saveAs(json); await a.keyboard.press('Escape');
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctxB.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
const b = await ctxB.newPage(); b.on('pageerror', (e) => errors.push('B pageerror: ' + e.message));
await b.goto('http://localhost:5179/'); await b.waitForSelector('.welcome');
await b.locator('button[title="Ayarlar"]').click(); await b.locator('.settings-tabs button:has-text("Yedek")').click(); await b.locator('input[accept*=".json"]').setInputFiles(json); await b.waitForTimeout(1500);
await b.keyboard.press('Escape'); await b.waitForTimeout(300);
await b.locator('.firm-select').selectOption({ label: 'Firma 1' }).catch(() => {}); await b.waitForTimeout(400);
await b.locator('.toolbar .excel-tpl').click(); await b.waitForSelector('.tpl-modal');
await b.locator('.tpl-scope', { hasText: 'Genel' }).click();
const gTh = (await b.locator('.tpl-preview thead th .hdr-text').allInnerTexts()).map((x) => x.trim());
check('yedekten genel şablon geldi (A Tutar, B Belge No)', gTh[0] === 'Tutar' && gTh[1] === 'Belge No', gTh.slice(0, 3).join(' | '));
check('yedekten döneme özel şablon geldi', (await b.locator('.tpl-scope.used').innerText()).includes('Bu dönem'), await b.locator('.tpl-scope.used').innerText());

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
