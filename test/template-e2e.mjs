import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
const S='/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort().map(f=>S+'/xmlin/'+f).slice(0,10);
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1500,height:900},acceptDownloads:true}); const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
// Eski ayar: codeColumnIndex=1, codeHeader=HK → şablona taşınmalı
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.evaluate(async()=>{ const req=indexedDB.open('fatura-hesap-kodu'); await new Promise(r=>req.onsuccess=r); const db=req.result; const tx=db.transaction('settings','readwrite'); tx.objectStore('settings').put({key:'settings', value:{codeColumnIndex:1, codeHeader:'HK', theme:'light'}}); await new Promise(r=>tx.oncomplete=r); db.close(); });
await page.reload(); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
await page.keyboard.press('/'); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
await page.keyboard.press('F5'); await page.waitForSelector('.modal.wide');
console.log('eski ayar taşındı:', await page.locator('.modal-head .muted').innerText(), '| ilk başlıklar:', (await page.locator('.modal.wide thead th').allInnerTexts()).slice(1,4).join(' | '));
await page.locator('button:has-text("Şablonu düzenle")').click(); await page.waitForSelector('.tpl-modal');
console.log('şablon:', await page.locator('.tpl-modal .modal-head .muted').innerText());
// EDM varsayılanına dön, Geliş Zamanı'nı kaldır, ETTN ve Hesap adı ekle, başlık değiştir, satır sırası yükleme, sayfa adı GMS
await page.locator('button:has-text("EDM varsayılanına dön")').click();
await page.locator('.tpl-row:has-text("Geliş Zamanı") button[title="Sütunu kaldır"]').click();
await page.locator('.tpl-add select').selectOption('uuid'); await page.locator('button:has-text("+ Sütun ekle")').click();
await page.locator('.tpl-add select').selectOption('accountName'); await page.locator('button:has-text("+ Sütun ekle")').click();
await page.locator('.tpl-row.is-code .tpl-header').fill('Muhasebe Kodu');
await page.locator('.tpl-side select').selectOption('added'); await page.locator('.tpl-side input[placeholder="Sheet0"]').fill('GMS');
// kod sütununu en başa taşı (↑ ×2)
await page.locator('.tpl-row.is-code button[title="Yukarı"]').click(); await page.locator('.tpl-row.is-code button[title="Yukarı"]').click();
console.log('önizleme başlıkları:', (await page.locator('.tpl-preview th').allInnerTexts()).slice(0,5).join(' | '), '… toplam', await page.locator('.tpl-preview th').count());
await page.screenshot({path:`${S}/shots/template.png`});
await page.locator('.tpl-modal button.primary:has-text("Kaydet")').click(); await page.waitForTimeout(200);
const [dl]=await Promise.all([page.waitForEvent('download'), page.keyboard.press('F1')]);
const out=`${S}/${dl.suggestedFilename()}`; await dl.saveAs(out);
const wb=XLSX.read(readFileSync(out),{type:'buffer'}); const ws=wb.Sheets[wb.SheetNames[0]]; const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
console.log('dosya:', dl.suggestedFilename(), '| sayfa:', wb.SheetNames, '| sütun:', aoa[0].length, '| başlık:', aoa[0].slice(0,4).join(' | '), '… son:', aoa[0].slice(-2).join(' | '));
console.log('A2 metin mi:', ws['A2']?.t, ws['A2']?.v, '| Geliş Zamanı yok:', !aoa[0].includes('Geliş Zamanı'), '| ETTN dolu:', typeof aoa[1][aoa[0].indexOf('ETTN')]==='string' && aoa[1][aoa[0].indexOf('ETTN')].length>10);
// yükleme sırası: ilk satır ilk yüklenen dosya mı
const firstNo=readFileSync(files[0],'utf8').match(/<cbc:ID>([^<]+)/)[1];
console.log('yükleme sırası: ilk satır', aoa[1][aoa[0].indexOf('Fatura No')], '==', firstNo, aoa[1][aoa[0].indexOf('Fatura No')]===firstNo);
await page.reload(); await page.waitForSelector('.inv-frame');
await page.locator('button[title="Ayarlar"]').click(); console.log('ayarlar özeti:', (await page.locator('fieldset:has-text("Çıktı Excel şablonu") .muted').innerText()).slice(0,80));
console.log('HATALAR:', errors.length?errors:'yok');
await browser.close();
