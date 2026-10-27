import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S='/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort().map(f=>S+'/xmlin/'+f).slice(0,6);
const browser=await chromium.launch({channel:'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1300,height:800}});
await ctx.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
const a=await ctx.newPage(); await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(()=>!document.querySelector('.busy'));
const b=await ctx.newPage(); await b.goto('http://localhost:5179/'); await b.waitForSelector('.inv-frame');
console.log('B açıldı:', await b.locator('.progress').innerText());
// A'da atama → B (görünür, aynı bağlam) yenilenmeli
await a.bringToFront(); await a.keyboard.press('/'); await a.keyboard.type('770.01'); await a.keyboard.press('Enter'); await a.waitForTimeout(600);
console.log('A:', await a.locator('.progress').innerText(), '| B:', await b.locator('.progress').innerText());
// B'de atama → A
await b.bringToFront(); await b.keyboard.press('End'); await b.keyboard.press('/'); await b.keyboard.type('153'); await b.keyboard.press('Enter'); await b.waitForTimeout(600);
console.log('B:', await b.locator('.progress').innerText(), '| A:', await a.locator('.progress').innerText(), '| A toast:', await a.locator('.toast').innerText().catch(()=>'-'));
await browser.close();
