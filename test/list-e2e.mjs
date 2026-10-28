import { chromium } from 'playwright';
import { enableAutoAdvance } from './e2e-helpers.mjs';
import { readdirSync } from 'node:fs';
const S=process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/d64e6ff3-d5c6-481a-957e-cc3c595811d5/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort().map(f=>S+'/xmlin/'+f);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1600,height:900}})).newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error'&&!/srcdoc|sandboxed|ERR_/.test(m.text()))errors.push(m.text())});
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files);
await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
const log=(...a)=>console.log(...a);
// liste görünümüne geç
await page.locator('.layout-btn').click(); await page.waitForSelector('.listview');
log('liste satır:', await page.locator('.lv-table tbody tr').count(), '| başlıklar:', (await page.locator('.lv-table thead th').allInnerTexts()).join(' | '));
// Q kaydet ve ata, manuel ata, boşluk
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
await enableAutoAdvance(page); // testler hızlı çalışma (kendiliğinden geçiş) varsayar
await page.keyboard.press('q'); await page.waitForTimeout(100); await page.keyboard.press('q'); await page.waitForTimeout(100);
await page.keyboard.press('/'); await page.keyboard.type('153'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
log('atama sonrası:', await page.locator('.progress').innerText(), '| geçerli satır #:', await page.locator('tr.current td.num').innerText(), '| ilk 3 kod:', (await page.locator('.lv-table td.lv-code').allInnerTexts()).slice(0,3).join(','));
// kod hücresine tıkla → manuel giriş açılır
await page.locator('.lv-table tbody tr').nth(5).locator('td.lv-code').click(); await page.waitForSelector('.manual-input'); await page.keyboard.type('760.02'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
log('hücre tıkla → kod:', (await page.locator('.lv-table td.lv-code').allInnerTexts())[5]);
// sütun seçici: Matrah ekle, Tip kaldır
await page.locator('.lv-cols .add-col').selectOption('taxExclusive'); await page.waitForTimeout(150);
await page.locator('.lv-table thead th.hdr-edit', { hasText: 'Fatura Tipi' }).hover(); await page.locator('.lv-table thead th.hdr-edit', { hasText: 'Fatura Tipi' }).locator('.hdr-x').click(); await page.waitForTimeout(150);
log('sütunlar:', (await page.locator('.lv-table thead th').allInnerTexts()).join(' | '));
await page.mouse.click(900, 600); await page.waitForTimeout(100);
await page.screenshot({path:`${S}/shots/list-1.png`});
// toplu seçim: Seç → bu satıcıyı seç → toplu ata
await page.locator('.bulk-toggle').click(); await page.locator('button:has-text("Bu satıcıyı seç")').click();
await page.locator('.bulk-input').fill('770.05'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
log('toplu:', await page.locator('.toast').innerText(), '| toplu satır:', await page.locator('tr.row.bulk').count());
// filtre + arama
await page.locator('.filter-select').selectOption('unassigned'); await page.waitForTimeout(100);
log('atanmamış filtre:', await page.locator('.lv-table tbody tr').count());
await page.locator('.filter-select').selectOption('all');
await page.locator('#search').fill('ceptaş'); await page.waitForTimeout(100); log('arama ceptaş:', await page.locator('.lv-table tbody tr').count());
await page.locator('#search').fill('');
// koyu tema
await page.locator('.theme-btn').click(); await page.waitForTimeout(200); await page.screenshot({path:`${S}/shots/list-2-koyu.png`}); await page.locator('.theme-btn').click();
// yenile → liste görünümü ve sütunlar hatırlanıyor
await page.reload(); await page.waitForSelector('.listview');
log('reload: görünüm liste, sütun sayısı:', await page.locator('.lv-table thead th').count());
// çift tık → hibrit ve o fatura
const no = await page.locator('.lv-table tbody tr').nth(7).locator('td.mono').first().innerText();
await page.locator('.lv-table tbody tr').nth(7).dblclick(); await page.waitForSelector('.inv-frame');
log('çift tık → hibrit, fatura:', await page.locator('.detail-row b').first().innerText(), '=', no);
// dar ekranda hibrit geri düğmesi
log('düğme:', await page.locator('.layout-btn').innerText());
// F5 önizleme ve F1 liste görünümünden
await page.locator('.layout-btn').click(); await page.waitForSelector('.listview');
await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide'); log('önizleme satır:', await page.locator('.modal.wide tbody tr').count()); await page.keyboard.press('Escape');
log('HATALAR:', errors.length?errors:'yok');
await browser.close();
