import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S='/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort().map(f=>S+'/xmlin/'+f).slice(0,20);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1500,height:900}})).newPage();
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}; window.__items=null; window.print=()=>{ window.__items=[...document.querySelectorAll('.print-strip')].map(e=>e.innerText.replace(/\s+/g,' ')); window.dispatchEvent(new Event('afterprint')); };});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept=".xml,text/xml,application/xml"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
for (let i=0;i<3;i++){ await page.keyboard.press('q'); await page.waitForTimeout(60); }
await page.locator('.toolbar button:has-text("Yazdır")').click(); await page.waitForSelector('.print-modal');
const cnt=async()=>page.locator('.print-row').count(); const btn=async()=>page.locator('.print-modal .modal-head button.primary').innerText();
console.log('başlangıç:', await cnt(), '|', await btn());
await page.locator('.print-opts select').selectOption('manual'); await page.waitForTimeout(80); console.log('süz: elle atanmış →', await cnt(), '|', await btn());
await page.locator('.print-opts select').selectOption('unassigned'); await page.waitForTimeout(80); console.log('süz: atanmamış →', await cnt());
await page.locator('.print-opts select').selectOption('all');
await page.locator('.print-opts input[placeholder^="Ara"]').fill('ceptaş'); await page.waitForTimeout(80); console.log('ara ceptaş →', await cnt());
await page.locator('.print-opts input[placeholder^="Ara"]').fill('770.01'); await page.waitForTimeout(80); console.log('ara 770.01 (kod) →', await cnt());
await page.locator('.print-opts input[placeholder^="Ara"]').fill('');
// elle işaret: 2. ve 4. kaldır
await page.locator('.print-row').nth(1).locator('.print-check').click(); await page.locator('.print-row').nth(3).locator('.print-check').click(); await page.waitForTimeout(80);
console.log('2 kaldırıldı →', await btn(), '| başlık:', await page.locator('.print-modal .modal-head .muted').innerText(), '| üstü çizili:', await page.locator('.print-row.off').count());
await page.screenshot({path:`${S}/shots/print-4-filtre.png`});
await page.locator('.print-modal .modal-head button.primary').click();
await page.waitForFunction(()=>window.__items!==null,{timeout:60000});
const items=await page.evaluate(()=>window.__items);
console.log('basılan:', items.length, '| ilk:', items[0], '| numaralar ardışık:', items.every((t,i)=>t.startsWith(`${i+1} / ${items.length}`)));
// baştaki kutu: tümünü kaldır → Yazdır pasif
await page.locator('.toolbar button:has-text("Yazdır")').click(); await page.waitForSelector('.print-modal');
await page.locator('.print-list-head input').uncheck(); await page.waitForTimeout(80);
console.log('tümü kaldırıldı → düğme pasif:', await page.locator('.print-modal .modal-head button.primary').isDisabled());
await browser.close();
