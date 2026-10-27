import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const XML_DIR = process.env.XML_DIR || `/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad/xmlin`; // gerçek e-Fatura XML'leri (depoya girmez)
const XMLS = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const OUT = '/Users/sonercengiz/Documents/scc/fatura-hesap-kodu/public/guide';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 820 }, deviceScaleFactor: 1.5 })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} });
await page.goto('http://localhost:5179/');
await page.locator('input[accept*=".zip"]').setInputFiles(XMLS);
await page.waitForSelector('.inv-frame');
const no = () => page.locator('.detail-row b').first().innerText();
// elle 2 atama (770.01 x2) → Q'ya kaydet
for (const c of ['770.01', '770.01', '770.01']) { await page.keyboard.press('/'); await page.waitForSelector('.manual-input'); await page.keyboard.type(c); await page.keyboard.press('Enter'); await page.waitForTimeout(100); }
await page.locator('.slot').nth(0).hover(); await page.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await page.keyboard.type('770.01'); await page.keyboard.press('Enter');
await page.keyboard.press('Home');
console.log('başlangıç:', await no());
await page.locator('.bulk-toggle').click(); // seçim yardımcılarını aç
// "Bu satıcıyı seç" (YILDIZ: 3 fatura: idx 0, 6, 12)
await page.locator('button:has-text("Bu satıcıyı seç")').click();
console.log('seçili:', await page.locator('.row.selected').count(), '| bar:', (await page.locator('.bulk-bar').innerText()).replace(/\n/g, ' | '));
await page.locator('.bulk-input').fill('760.02');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('toplu sonrası toast:', await page.locator('.toast').innerText(), '| toplu etiketli satır:', await page.locator('.row.bulk').count(), '| şu anki:', await no());
// doğal gezinti toplu olanları atlar: Home sonra sağ sağ...
await page.keyboard.press('Home'); 
const seq = []; for (let i = 0; i < 6; i++) { seq.push(await no()); await page.keyboard.press('ArrowRight'); }
console.log('doğal gezinti dizisi:', seq.join(' '));
await page.keyboard.press('Home');
const seqC = []; for (let i = 0; i < 4; i++) { seqC.push(await no()); await page.keyboard.press('Control+ArrowRight'); }
console.log('Ctrl gezinti dizisi:', seqC.join(' '));
// aşağı/yukarı = sağ/sol
await page.keyboard.press('Home'); const a = await no(); await page.keyboard.press('ArrowDown'); const b = await no(); await page.keyboard.press('ArrowUp');
console.log('↓ ilerledi:', a !== b, '| ↑ geri geldi:', (await no()) === a);
// filtre: atanmamış
await page.locator('.filter-select').selectOption('unassigned');
await page.waitForTimeout(200);
console.log('atanmamış filtre satır:', await page.locator('.row').count(), '| görünenleri seç → ', (await page.locator('button:has-text("Görünenleri seç")').innerText()));
// shift aralık seç: ilk ve 4. görünen satır
await page.locator('.row').nth(0).click(); await page.locator('.row').nth(3).click({ modifiers: ['Shift'] });
console.log('shift seçim:', await page.locator('.row.selected').count());
// kısayol düğmesiyle toplu ata
await page.locator('.bulk-slots button').first().click(); await page.waitForTimeout(300);
console.log('kısayolla toplu:', await page.locator('.toast').innerText(), '| atanmamış kalan:', await page.locator('.row').count());
await page.locator('.filter-select').selectOption('all');
// elle atama toplu etiketini kaldırır
await page.keyboard.press('Control+Home'); // Ctrl+Home ile 1. satır (toplu)
console.log('Ctrl+Home:', await no(), 'toplu mu:', await page.locator('.row.current.bulk').count());
await page.keyboard.press('/'); await page.keyboard.type('153'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.keyboard.press('Control+Home');
console.log('elle sonrası toplu mu:', await page.locator('.row.current.bulk').count(), '| kodu:', await page.locator('.row.current .row-code').innerText());
// renkli satır sınıfları
console.log('renk sınıfları:', await page.locator('.row.done').evaluateAll((els) => Array.from(new Set(els.map((e) => Array.from(e.classList).filter((c) => c.startsWith('slot-row')).join('')))).join(' ')));
// yenileme sonrası toplu etiketi kalıcı
await page.reload(); await page.waitForSelector('.row');
console.log('reload sonrası toplu satır:', await page.locator('.row.bulk').count());
// rehber görseli: seçim yapılmış hal
await page.keyboard.press('Home');
await page.locator('.bulk-toggle').click(); // yenileme sonrası yardımcılar kapalı
await page.locator('button:has-text("Bu satıcıyı seç")').click();
await page.locator('.bulk-input').fill('770.0');
await page.waitForTimeout(200);
const side = await page.locator('.side').boundingBox();
await page.screenshot({ path: `${OUT}/05b-toplu.png`, clip: { x: side.x - 2, y: side.y, width: side.width + 2, height: Math.min(side.height, 600) } });
console.log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
