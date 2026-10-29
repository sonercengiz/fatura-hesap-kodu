import { chromium } from 'playwright';
import { enableAutoAdvance } from './e2e-helpers.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { SCRATCH, XML_DIR } from './paths.mjs';
const S=SCRATCH;
const files=readdirSync(XML_DIR).filter(f=>f.endsWith('.xml')).sort().map(f=>XML_DIR+'/'+f);
const browser=await chromium.launch({channel: process.env.PW_CHANNEL ?? 'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1500,height:900}})).newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error'&&!/srcdoc|sandboxed|ERR_/.test(m.text()))errors.push(m.text())});
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}; window.__printCalled=0; window.print=()=>{window.__printCalled++;};});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files.slice(0,20)); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
const log=(...a)=>console.log(...a);
// birkaç atama
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
await enableAutoAdvance(page); // testler hızlı çalışma (kendiliğinden geçiş) varsayar
for (let i=0;i<4;i++){ await page.keyboard.press('q'); await page.waitForTimeout(60); }
await page.keyboard.press('/'); await page.keyboard.type('153'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
// planı aç
await page.locator('.toolbar button:has-text("Yazdır")').click(); await page.waitForSelector('.print-modal');
log('başlık:', await page.locator('.print-modal .modal-head .muted').innerText(), '| satır:', await page.locator('.print-row').count());
const first=async()=>(await page.locator('.print-row').first().innerText()).replace(/\s+/g,' ');
log('tarih sırası ilk:', await first());
await page.locator('.sort-pair select').nth(0).selectOption('code'); await page.waitForTimeout(80); log('hesap kodu sırası ilk:', await first(), '| son:', (await page.locator('.print-row').last().innerText()).replace(/\s+/g,' '));
await page.locator('.sort-pair select').nth(0).selectOption('supplier'); await page.waitForTimeout(80); log('satıcı sırası ilk:', await first());
await page.locator('.sort-pair select').nth(1).selectOption('desc'); await page.waitForTimeout(80); log('tersten ilk:', await first());
// sürükle: 3. satırı 1. satırın üstüne
const rows=page.locator('.print-row'); const third=(await rows.nth(2).innerText()).replace(/\s+/g,' ').replace(/^\d+ /,'');
await rows.nth(2).dragTo(rows.nth(0)); await page.waitForTimeout(100);
log('sürükle sonrası ilk:', await first(), '| eşleşti:', (await first()).replace(/^\d+ /,'')===third, '| elle notu:', await page.locator('.print-opts .muted.small:has-text("elle")').count());
await page.screenshot({path:`${S}/shots/print-1-plan.png`});
// görünenler kaynağı + özet aç, yazdır
await page.locator('#search').fill('').catch(()=>{});
await page.locator('label:has-text("Başta özet listesi") input').check();
await page.locator('.print-modal .modal-head button.primary').click();
await page.waitForFunction(()=>window.__printCalled>0,{timeout:60000});
const info=await page.evaluate(()=>{const fr=[...document.querySelectorAll('.print-frame')]; return {frames:fr.length, heights:fr.map(f=>Math.round(parseFloat(f.style.height))), scaled:fr.filter(f=>f.style.transform).length, strips:document.querySelectorAll('.print-strip').length, summaryRows:document.querySelectorAll('.print-summary tbody tr').length, busy:!!document.querySelector('.busy')};});
log('yazdırma kökü:', JSON.stringify({...info, heights: info.heights.slice(0,5)}));
await page.emulateMedia({media:'print'});
await page.pdf({path:`${S}/print-test.pdf`, format:'A4', printBackground:true});
await page.setViewportSize({width:800,height:2400}); await page.screenshot({path:`${S}/shots/print-2-cikti.png`, clip:{x:0,y:0,width:800,height:2400}});
const pdf=readFileSync(`${S}/print-test.pdf`,'latin1'); const pages=(pdf.match(/\/Type\s*\/Page[^s]/g)||[]).length;
log('PDF:', Math.round(pdf.length/1024),'KB, sayfa ~', pages, '(beklenen 20 fatura + 1 özet)');
await page.evaluate(()=>window.dispatchEvent(new Event('afterprint'))); await page.waitForTimeout(100);
log('afterprint sonrası kök temiz:', (await page.locator('.print-frame').count())===0, '| meşgul:', await page.locator('.busy').count());
await page.emulateMedia({media:'screen'});
// Ctrl+Shift+P planı açar, Esc kapatır
await page.keyboard.press('Control+Shift+P'); await page.waitForSelector('.print-modal'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
log('kısayol aç/kapa:', await page.locator('.print-modal').count()===0);
log('HATALAR:', errors.length?errors:'yok');
await browser.close();
