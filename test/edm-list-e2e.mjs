import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { SCRATCH, XML_DIR } from './paths.mjs';
const S=SCRATCH;
const files=readdirSync(XML_DIR).filter(f=>f.endsWith('.xml')).sort().map(f=>XML_DIR+'/'+f);
const meta=(f)=>{const x=readFileSync(f,'utf8');return {no:x.match(/<cbc:ID>([^<]+)/)[1], date:x.match(/<cbc:IssueDate>(\d{4})-(\d{2})-(\d{2})/).slice(1).reverse().join('/'), vkn:(x.match(/schemeID="VKN">(\d+)/)||[])[1]||'', name:(x.match(/<cac:PartyName><cbc:Name>([^<]+)/)||[])[1]||'', amt:Number(x.match(/<cbc:PayableAmount[^>]*>([^<]*)/)[1])};};
// EDM listesi: ilk 5 XML + listede olup XML'i olmayan 2 fatura (7. ve 8. XML'in no'ları ama XML yüklenmeyecek; 8. sonra yüklenecek)
const H=['Fatura No','Fatura Tarihi','Geliş Zamanı','Fatura Tipi','Fatura Türü','Gönderen VKN/TCKN','Gönderen Unvan/Ad Soyad','Tutar','Döviz Cinsi','Durum','Yanıt Durumu','Yerele Aktarım Durumu','Zarf No','KEP İtiraz Durumu','Gib Portal Fatura Iptal Durumu','Resmi Yazı İtiraz Durumu','Gib Portal Fatura İtiraz Durumu','Şube','Hash','Etiket'];
const rows=[H];
for (const f of [...files.slice(0,5), files[6], files[7]]) { const m=meta(f); rows.push([m.no,m.date,m.date+' 12:00:00','Satış','Temel',m.vkn,m.name,m.amt,'TRY','Fatura hazır','Bu fatura için gönderene cevap verilmedi','Yerele Aktarılacak','zarf-'+m.no.slice(-4),'','','','','','hash-'+m.no.slice(-4),'']); }
const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet0'); XLSX.writeFile(wb, `${S}/edm-liste.xlsx`);
const browser=await chromium.launch({channel: process.env.PW_CHANNEL ?? 'chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1500,height:900},acceptDownloads:true}); const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{try{localStorage.setItem('guideSeen','1')}catch{}});
await page.goto('http://localhost:5179/'); await page.waitForSelector('.welcome');
const inp='input[accept*=".zip"]';
await page.locator(inp).setInputFiles(files.slice(0,5)); await page.waitForSelector('.inv-frame'); await page.waitForFunction(()=>!document.querySelector('.busy'));
await page.locator(inp).setInputFiles(`${S}/edm-liste.xlsx`); await page.waitForFunction(()=>!document.querySelector('.busy')); await page.waitForTimeout(300);
console.log('EDM listesi toast:', await page.locator('.toast').innerText(), '|', await page.locator('.files span').innerText());
// XML'siz fatura kart olarak
await page.keyboard.press('End'); await page.waitForTimeout(150);
console.log('son fatura görünümü:', await page.locator('.card').count() ? 'kart (XML yok)' : 'görsel', '|', await page.locator('.detail-row b').first().innerText());
// 8. XML'i yükle → tamamlanır
await page.locator(inp).setInputFiles([files[7]]); await page.waitForFunction(()=>!document.querySelector('.busy')); await page.waitForTimeout(300);
console.log('XML tamamlama toast:', await page.locator('.toast').innerText(), '|', await page.locator('.files span').innerText());
// çıktı
await page.keyboard.press('/'); await page.keyboard.type('770.01'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
const [dl]=await Promise.all([page.waitForEvent('download'), page.keyboard.press('F1')]); const out=`${S}/${dl.suggestedFilename()}`; await dl.saveAs(out);
const buf=readFileSync(out); const wb2=XLSX.read(buf,{type:'buffer'}); const ws=wb2.Sheets[wb2.SheetNames[0]]; const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
const h=aoa[0]; const i=(n)=>h.indexOf(n);
const filled=aoa.slice(1).filter(r=>r[i('Geliş Zamanı')]).length;
console.log('çıktı:', aoa.length-1, 'satır | Geliş Zamanı dolu:', filled, '| örnek:', aoa[1][i('Geliş Zamanı')], aoa[1][i('Durum')], aoa[1][i('Zarf No')], aoa[1][i('Hash')]);
const z=unzipSync(new Uint8Array(buf)); const st=strFromU8(z['xl/styles.xml']); const sh=strFromU8(z['xl/worksheets/sheet1.xml']);
console.log('kalın başlık:', st.includes('<b/>'), '| tutar biçimi:', st.includes('#,##0.00'), '| sütun genişliği:', (sh.match(/<col [^>]*width="([\d.]+)"/)||[])[1]);
console.log('HATALAR:', errors.length?errors:'yok');
await browser.close();
