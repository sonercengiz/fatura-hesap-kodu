import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const SCR = '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad';
const XML_DIR = process.env.XML_DIR || `/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/aa071f3a-6270-4292-9e7a-d102afeef53e/scratchpad/xmlin`; // gerçek e-Fatura XML'leri (depoya girmez)
const XMLS = readdirSync(XML_DIR).filter((f) => f.endsWith('.xml')).sort().map((f) => `${XML_DIR}/${f}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 }, acceptDownloads: true }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/srcdoc|sandboxed/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); } catch {} }); await page.goto('http://localhost:5179/'); return page; };
const a = await mk();
await a.waitForSelector('.firm-select');
console.log('varsayılan firma:', await a.locator('.firm-select option:checked').innerText());
await a.locator('input[accept*=".zip"]').setInputFiles(XMLS); await a.waitForSelector('.inv-frame');
for (const c of ['770.01', '770.01', '770.01']) { await a.keyboard.press('/'); await a.waitForSelector('.manual-input'); await a.keyboard.type(c); await a.keyboard.press('Enter'); await a.waitForTimeout(80); }
await a.locator('.slot').nth(0).hover(); await a.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await a.keyboard.type('770.01'); await a.keyboard.press('Enter'); await a.waitForTimeout(150);
await a.locator('button[title="Ayarlar"]').click();
await a.locator('input[placeholder="ABC LTD"]').fill('Alfa AŞ');
await a.locator('.acc-text').fill('770.01 Kırtasiye'); await a.locator('button:has-text("Listeye ekle")').click(); await a.waitForTimeout(150);
await a.keyboard.press('Escape');
console.log('A firması: slot Q =', (await a.locator('.slot').nth(0).innerText()).replace(/\n/g,' '), '| parti:', await a.locator('.batch-select option:checked').innerText(), '| liste kodu:', await a.locator('.firm-select option:checked').innerText());
// Yeni firma (prompt → "Beta Ltd")
await a.locator('.firm-select').selectOption('__new'); await a.waitForSelector('.modal.dialog input'); await a.locator('.modal.dialog input').fill('Beta Ltd'); await a.keyboard.press('Enter'); await a.waitForTimeout(400);
console.log('yeni firma seçili:', await a.locator('.firm-select option:checked').innerText(), '| karşılama görünüyor:', await a.locator('.welcome').count(), '| slot Q:', (await a.locator('.slot').nth(0).innerText()).replace(/\n/g,' '), '| firma sayısı:', (await a.locator('.firm-select option').count()) - 1);
await a.locator('input[accept*=".zip"]').setInputFiles(XMLS); await a.waitForSelector('.inv-frame');
console.log('Beta: ilk fatura kodu (Alfa atamaları sızmamalı):', await a.locator('.detail-code b').innerText(), '| ipucu:', await a.locator('button.hint').count(), '| hesap listesi:', await a.evaluate(() => document.querySelectorAll('.acc-row').length));
await a.keyboard.press('/'); await a.keyboard.type('600.002'); await a.keyboard.press('Enter'); await a.waitForTimeout(100);
await a.locator('.slot').nth(1).hover(); await a.locator('.slot').nth(1).locator('.slot-icon.edit').click(); await a.keyboard.type('600.002'); await a.keyboard.press('Enter'); await a.waitForTimeout(150);
// Alfa'ya geri dön
const alfaId = await a.locator('.firm-select option:has-text("Alfa")').getAttribute('value');
await a.locator('.firm-select').selectOption(alfaId); await a.waitForTimeout(400);
console.log('Alfa geri: slot Q =', (await a.locator('.slot').nth(0).innerText()).replace(/\n/g,' '), '| slot W =', (await a.locator('.slot').nth(1).innerText()).replace(/\n/g,' '), '| atandı:', await a.locator('.progress').innerText());
// F1 dosya adı firma adını taşır
const [dl0] = await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]);
console.log('çıktı adı:', dl0.suggestedFilename());
// Dışa aktar
await a.locator('button[title="Ayarlar"]').click();
const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('button:has-text("Dışa aktar (.json)")').click()]);
const out = `${SCR}/ws2.json`; await dl.saveAs(out);
const j = JSON.parse(readFileSync(out, 'utf8'));
console.log('export: version', j.version, '| firmalar:', j.firms.map((f) => f.name).join(','), '| partiler:', j.batches.length, '| geçmiş firmaId’li:', j.history.every((h) => h.firmId));
await a.keyboard.press('Escape');
// Yenileme sonrası firma seçimi hatırlanıyor mu
await a.reload(); await a.waitForSelector('.firm-select');
console.log('reload sonrası firma:', await a.locator('.firm-select option:checked').innerText());

// --- Temiz profil B: v2 yedeği içe aktar, sonra eski v1 yedeği içe aktar
const b = await mk();
await b.waitForSelector('.firm-select');
await b.locator('button[title="Ayarlar"]').click();
await b.locator('input[accept=".json,application/json"]').setInputFiles(out); await b.waitForTimeout(800);
console.log('B içe aktarma toast:', await b.locator('.toast').innerText().catch(() => '-'));
await b.keyboard.press('Escape');
console.log('B firmalar:', (await b.locator('.firm-select option').allInnerTexts()).join(' | '));
const betaId = await b.locator('.firm-select option:has-text("Beta")').getAttribute('value');
await b.locator('.firm-select').selectOption(betaId); await b.waitForTimeout(400);
console.log('B Beta: slot W =', (await b.locator('.slot').nth(1).innerText()).replace(/\n/g,' '), '| atandı:', await b.locator('.progress').innerText());
const legacy = `${SCR}/ws.json`;
if (existsSync(legacy)) {
  await b.locator('button[title="Ayarlar"]').click();
  await b.locator('input[accept=".json,application/json"]').setInputFiles(legacy); await b.waitForTimeout(800);
  console.log('B eski (v1) yedek:', await b.locator('.toast').innerText().catch(() => '-'), '| firma sayısı:', (await b.locator('.firm-select option').count()) - 1);
  await b.keyboard.press('Escape');
}
// Firma silme (Beta) → Alfa'ya döner
await b.locator('button[title="Ayarlar"]').click();
await b.locator('button:has-text("Firmayı sil")').click(); await b.locator('.modal.dialog button.danger').click(); await b.waitForTimeout(500);
console.log('silme sonrası firmalar:', (await b.locator('.firm-select option').allInnerTexts()).join(' | '));
console.log('HATALAR:', errors.length ? errors : 'yok');
await browser.close();
