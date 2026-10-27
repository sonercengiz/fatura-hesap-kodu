import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S='/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const files=readdirSync(S+'/xmlin').filter(f=>f.endsWith('.xml')).sort().map(f=>S+'/xmlin/'+f).slice(0,8);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1400,height:900},acceptDownloads:true})).newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
await page.locator('input[accept*=".zip"]').setInputFiles(files); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
await page.keyboard.press('/'); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
await page.locator('button[title="Ayarlar"]').click(); await page.locator('.settings-tabs button:has-text("Yedek")').click(); await page.waitForSelector('.store-row');
console.log('depolama:', (await page.locator('fieldset:has-text("Depolama") .muted.small').first().innerText()).slice(0,140));
console.log('dönem satırı:', (await page.locator('.store-row').first().innerText()).replace(/\s+/g,' '));
await page.locator('.store-row button:has-text("Görselleri arşivle")').first().click(); await page.locator('.modal.dialog button.primary').click(); await page.waitForTimeout(400);
console.log('arşiv sonrası:', (await page.locator('.store-row').first().innerText()).replace(/\s+/g,' '), '| toast:', await page.locator('.toast').innerText());
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
console.log('görünüm:', await page.locator('.card').count() ? 'kart' : 'görsel', '|', await page.locator('.files span').innerText(), '| atama korundu:', await page.locator('.progress').innerText());
// XML'i yeniden yükle → görsel geri gelir
await page.locator('input[accept*=".zip"]').setInputFiles(files.slice(0,3)); await page.waitForFunction(()=>!document.querySelector('.busy')); await page.waitForTimeout(300);
console.log('yeniden yükleme:', await page.locator('.toast').innerText(), '|', await page.locator('.files span').innerText());
// kota hatası simülasyonu: bulkPut'u QuotaExceededError fırlatacak şekilde sar
await page.evaluate(()=>{ const req=indexedDB.open('fatura-hesap-kodu'); });
await page.addInitScript(()=>{});
const quotaMsg = await page.evaluate(async ()=>{ 
  // Dexie tablosuna erişim yok; uygulamanın isQuotaError yolunu test etmek için IndexedDB put'u sahte hata ile boz
  const orig=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(){ const e=new DOMException('The quota has been exceeded.','QuotaExceededError'); throw e; };
  return 'patched';
});
await page.locator('input[accept*=".zip"]').setInputFiles(files.slice(3,6)); await page.waitForTimeout(1500);
console.log('kota:', (await page.locator('.toast').innerText().catch(()=>'(toast yok)')).slice(0,90), '| ayarlar açıldı:', await page.locator('.modal.settings').count(), '| sekme:', await page.locator('.settings-tabs button.on').innerText());
console.log('HATALAR:', errors.length?errors:'yok');
await browser.close();
