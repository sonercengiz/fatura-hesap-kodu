import { chromium } from 'playwright';
import { enableAutoAdvance } from './e2e-helpers.mjs';
import { readdirSync } from 'node:fs';
import { SCRATCH, XML_DIR } from './paths.mjs';
const S=SCRATCH;
const files=readdirSync(XML_DIR).filter(f=>f.endsWith('.xml')).sort().map(f=>XML_DIR+'/'+f).slice(0,20);
const browser=await chromium.launch({channel: process.env.PW_CHANNEL ?? 'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1500,height:900}})).newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
await enableAutoAdvance(page); // testler hızlı çalışma (kendiliğinden geçiş) varsayar
for (let i=0;i<3;i++){ await page.keyboard.press('q'); await page.waitForTimeout(60); }
await page.locator('.toolbar button:has-text("Yazdır")').click(); await page.waitForSelector('.print-modal');
const explain=async()=>(await page.locator('.sort-explain').innerText()).replace(/\n/g,' | ');
console.log('varsayılan:', await explain());
const sel=page.locator('.sort-pair select');
await sel.nth(1).selectOption('desc'); await page.waitForTimeout(80); console.log('yeniden eskiye:', await explain());
await sel.nth(0).selectOption('code'); await page.waitForTimeout(80); console.log('hesap kodu:', await explain(), '| ilk satır kodu:', await page.locator('.print-row').first().locator('.print-code').innerText());
await sel.nth(0).selectOption('supplier'); await page.waitForTimeout(80); console.log('satıcı:', await explain(), '| gruplama pasif:', await page.locator('label:has-text("bir arada") input').isDisabled());
await sel.nth(0).selectOption('date'); await sel.nth(1).selectOption('asc'); await page.waitForTimeout(80);
await page.screenshot({path:`${S}/shots/print-5-sira.png`});
console.log('HATALAR:', errors.length?errors:'yok');
await browser.close();
