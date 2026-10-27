import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S='/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort().map(f=>S+'/xmlin/'+f).slice(0,12);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1500,height:900}})).newPage();
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
const no=()=>page.locator('.detail-row b').first().innerText();
const idx=async()=>parseInt((await page.locator('.viewer-badge .muted').innerText()).split('/')[0]);
// 1,2 ata (q) → şu an 3'te; 4'e geç ve ata → 5'te; Home
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
await page.keyboard.press('q'); await page.waitForTimeout(200); await page.keyboard.press('q'); await page.waitForTimeout(200); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100); await page.keyboard.press('q'); await page.waitForTimeout(200);
console.log('atananlar (liste sırası):', (await page.locator('.side .row').evaluateAll(els=>els.map((e,i)=>e.classList.contains('done')?i+1:null).filter(Boolean))).join(','));
await page.keyboard.press('Home'); await page.waitForTimeout(80);
console.log('Home:', await idx());
await page.keyboard.press('Tab'); await page.waitForTimeout(80); console.log('Tab →', await idx(), '(3 bekleniyor)');
await page.keyboard.press('Tab'); await page.waitForTimeout(80); console.log('Tab →', await idx(), '(5 bekleniyor)');
await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(80); console.log('Shift+Tab →', await idx(), '(3 bekleniyor)');
await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(80); console.log('Shift+→ →', await idx(), '(5 bekleniyor)');
await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft'); await page.waitForTimeout(150);
console.log('Shift+← ×2 →', await idx(), '| toast:', await page.locator('.toast').innerText().catch(()=>'(yok)'));
// liste görünümünde de
await page.locator('.layout-btn').click(); await page.waitForSelector('.listview');
await page.keyboard.press('End'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
console.log('liste: End + Tab →', await page.locator('tr.current td.num').innerText(), '| toast:', await page.locator('.toast').innerText().catch(()=>'(yok)'));
await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(100); console.log('liste: Shift+Tab →', await page.locator('tr.current td.num').innerText());
await browser.close();
