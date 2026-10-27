import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';
const S='/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort();
// ZIP: 6 xml + klasör içinde 2 xml + iç içe zip (2 xml) + bir txt + __MACOSX çöpü
const ent={};
for (const f of files.slice(0,6)) ent[f]=readFileSync(`${S}/xmlin/${f}`);
for (const f of files.slice(6,8)) ent['Eylul/'+f]=readFileSync(`${S}/xmlin/${f}`);
const innerEnt={}; for (const f of files.slice(8,10)) innerEnt[f]=readFileSync(`${S}/xmlin/${f}`);
ent['ic.zip']=zipSync(innerEnt); ent['oku.txt']=new TextEncoder().encode('x'); ent['__MACOSX/._a.xml']=new Uint8Array([0]);
writeFileSync(`${S}/edm-3f9a2c.zip`, zipSync(ent));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1500,height:900}})).newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept('Beta Ltd'));
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
const inp='input[accept*=".zip"]';
await page.locator(inp).setInputFiles(`${S}/edm-3f9a2c.zip`);
await page.waitForSelector('.inv-frame',{timeout:30000}); await page.waitForFunction(()=>!document.querySelector('.busy'));
console.log('zip sonucu toast:', await page.locator('.toast').innerText().catch(()=>'(yok)'), '| rapor penceresi:', await page.locator('.modal:has-text("Yükleme sonucu")').count());
console.log('parti:', await page.locator('.batch-select option:checked').innerText(), '|', await page.locator('.progress').innerText());
// birkaç atama, parti kuralı
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
await page.keyboard.press('q'); await page.waitForTimeout(150); await page.keyboard.press('q'); await page.waitForTimeout(150);
// yeni firma Beta (prompt) → geri Firma 1'e dön
await page.locator('.firm-select').selectOption('__new'); await page.waitForTimeout(400);
const alfa=await page.locator('.firm-select option:has-text("Firma 1")').getAttribute('value');
await page.locator('.firm-select').selectOption(alfa); await page.waitForTimeout(400);
console.log('Firma 1 geri:', await page.locator('.progress').innerText());
// partiyi Beta'ya taşı
await page.locator('.files button:has-text("taşı")').click(); await page.waitForSelector('.modal:has-text("Başka firmaya taşı")');
await page.locator('label:has-text("partisinin tamamı") input').check(); await page.locator('.modal button.primary:has-text("Taşı")').click(); await page.waitForTimeout(600);
console.log('taşıma sonrası firma:', await page.locator('.firm-select option:checked').innerText(), '| parti:', await page.locator('.batch-select option:checked').innerText(), '|', await page.locator('.progress').innerText(), '| toast:', await page.locator('.toast').innerText());
await page.locator('.firm-select').selectOption(alfa); await page.waitForTimeout(400);
console.log('Firma 1 şimdi:', await page.locator('.welcome').count() ? 'parti yok (karşılama)' : await page.locator('.batch-select option:checked').innerText());
// Beta'da 3 fatura seç → Firma 1'e yeni partiye taşı
const beta=await page.locator('.firm-select option:has-text("Beta")').getAttribute('value');
await page.locator('.firm-select').selectOption(beta); await page.waitForTimeout(400);
await page.locator('.side .row').nth(0).locator('.row-check').click(); await page.locator('.side .row').nth(2).locator('.row-check').click({modifiers:['Shift']});
await page.locator('.files button:has-text("taşı")').click(); await page.waitForSelector('.modal:has-text("Başka firmaya taşı")');
console.log('kapsam seçili varsayılan:', await page.locator('label:has-text("Seçili faturalar") input').isChecked());
await page.locator('.modal button.primary:has-text("Taşı")').click(); await page.waitForTimeout(600);
console.log('Beta kalan:', await page.locator('.progress').innerText(), '| toast:', await page.locator('.toast').innerText());
await page.locator('.firm-select').selectOption(alfa); await page.waitForTimeout(400);
console.log('Firma 1 yeni parti:', await page.locator('.batch-select option:checked').innerText(), '|', await page.locator('.progress').innerText());
console.log('HATALAR:', errors.length?errors:'yok');
await browser.close();
