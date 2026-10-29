// Çıktı geçmişi (tur 4 H4): Excel üretince kayıt; bildirimde "Çıktılar"; pencerede kayıt + uyarılı faturalar ("Sürüyor" / "Giderildi");
// Gez → şerit, Tab/Shift+Tab yalnızca turun faturalarında, Bitir; Ayarlar › Dönem "Son çıktı"; dar ekranda "Çıktılar" ⋯ menüsünde;
// dönem silinince kayıt gider.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { operatorXml, enableAutoAdvance } from './e2e-helpers.mjs';
const S = process.env.SCRATCH || '/tmp';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const op = `${S}/OPR2026000000001.xml`;
writeFileSync(op, operatorXml(readFileSync(new URL('./fixtures/ubl-sirket.xml', import.meta.url), 'utf8')));
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().slice(0, 6).map((f) => `${DEMO}/xml/${f}`).concat([op]);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('backupRemind', 'off'); } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator('input[accept*=".zip"]').setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);
await a.locator('.slot').nth(0).hover(); await a.locator('.slot').nth(0).locator('.slot-icon.edit').click(); await a.keyboard.type('770.03'); await a.keyboard.press('Enter'); await a.waitForTimeout(200);
await enableAutoAdvance(a);
await a.keyboard.press('Home'); for (let i = 0; i < 4; i++) { await a.keyboard.press('q'); await a.waitForTimeout(120); }
const curNo = () => a.evaluate(() => document.querySelector('.side .row.current')?.textContent ?? '');
const exportsInDb = () => a.evaluate(() => new Promise((res) => { const r = indexedDB.open('fatura-hesap-kodu'); r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('exports')) { res(-1); d.close(); return; } const q = d.transaction('exports').objectStore('exports').count(); q.onsuccess = () => { res(q.result); d.close(); }; }; }));

// 1) Excel üret → kayıt + bildirim
await Promise.all([a.waitForEvent('download'), a.keyboard.press('F1')]); await a.waitForTimeout(400);
const toast = (await a.locator('.toast').innerText()).trim();
const flagged = Number(toast.match(/(\d+) uyarılı fatura/)?.[1] ?? -1);
check('bildirim uyarılı fatura sayısını söyler', flagged >= 3, toast);
check('bildirimde "Çıktılar" eylemi', (await a.locator('.toast button', { hasText: 'Çıktılar' }).count()) === 1, toast);
check('kayıt veritabanında', (await exportsInDb()) === 1, await exportsInDb());
check('üst çubukta "Çıktılar 1"', (await a.locator('.toolbar [data-act="exports"]').innerText()).trim() === 'Çıktılar 1', await a.locator('.toolbar [data-act="exports"]').innerText().catch(() => 'yok'));

// 2) Pencere: kayıt + uyarılı faturalar
await a.locator('.toast button', { hasText: 'Çıktılar' }).click(); await a.waitForSelector('.exports-modal');
const rec = (await a.locator('.exports-modal .exp-rec').first().innerText()).replace(/\s+/g, ' ');
check('kayıtta dosya adı, satır/sütun, "Uyarılara rağmen"', /FATURA\.xlsx/.test(rec) && /7 satır/.test(rec) && /sütun/.test(rec) && /Uyarılara rağmen/.test(rec), rec);
check('kayıtta seviye renkli uyarı çipleri', (await a.locator('.exports-modal .exp-rec').first().locator('.lg.lvl-high').count()) === 1 && (await a.locator('.exports-modal .exp-rec').first().locator('.lg.lvl-medium').count()) >= 1, rec);
const rows = a.locator('.exports-modal .exp-flagged tbody tr');
check('uyarılı faturalar tablosu (sayı bildirimdeki kadar)', (await rows.count()) === flagged, await rows.count());
check('hepsi "Sürüyor"', (await a.locator('.exports-modal .exp-now', { hasText: 'Sürüyor' }).count()) === flagged, await a.locator('.exports-modal .exp-flagged').innerText());
check('düğmeler: Gez (birincil) ve Kapat başlıkta', (await a.locator('.exports-modal .modal-head button.primary', { hasText: 'Gez' }).count()) === 1 && (await a.locator('.exports-modal .modal-head button', { hasText: 'Kapat' }).count()) === 1, '');
const firstNo = (await rows.first().locator('td').first().innerText()).trim();
// yalnızca kodsuzluk uyarısı olan son fatura: kod verilince giderilir
const lastNo = (await rows.last().locator('td').first().innerText()).trim();
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// 3) Kod atanınca "Giderildi"
const codeless = [];
await a.locator('.side .row', { hasText: lastNo }).first().click(); await a.waitForTimeout(150);
await a.keyboard.press('q'); await a.waitForTimeout(250);
await a.locator('.toolbar [data-act="exports"]').click(); await a.waitForSelector('.exports-modal');
const fixed = a.locator('.exports-modal .exp-flagged tbody tr', { hasText: lastNo }).locator('.exp-now');
check(`kod verilen fatura (${lastNo}) "Giderildi"`, /Giderildi/.test(await fixed.innerText()), `${await fixed.innerText()} | kodsuzlar: ${codeless.length}`);

// 4) Gez: şerit, Tab yalnızca turda
await a.locator('.exports-modal .modal-head button.primary', { hasText: 'Gez' }).click(); await a.waitForTimeout(250);
check('pencere kapandı, şerit açıldı', (await a.locator('.exports-modal').count()) === 0 && (await a.locator('.tour-bar').count()) === 1, '');
const bar = async () => (await a.locator('.tour-bar').innerText()).replace(/\s+/g, ' ');
check('şerit: "Çıktı … · Uyarılı n fatura · 1/n"', new RegExp(`Uyarılı ${flagged} fatura`).test(await bar()) && new RegExp(`1/${flagged}`).test(await bar()), await bar());
const seen = [await curNo()];
for (let i = 1; i < flagged; i++) { await a.keyboard.press('Tab'); await a.waitForTimeout(150); seen.push(await curNo()); }
check('Tab turun faturalarında gezer (her biri farklı, sayaç ilerler)', new Set(seen).size === flagged && new RegExp(`${flagged}/${flagged}`).test(await bar()), `${seen.map((s) => s.slice(0, 16)).join(' | ')} · ${await bar()}`);
check('ilk tur faturası pencerenin ilk satırı', seen[0].includes(firstNo), `${seen[0]} / ${firstNo}`);
await a.keyboard.press('Shift+Tab'); await a.waitForTimeout(150);
check('Shift+Tab geri gider', (await curNo()) === seen[flagged - 2] && new RegExp(`${flagged - 1}/${flagged}`).test(await bar()), await bar());
await a.locator('.tour-bar button', { hasText: 'Sonraki' }).click(); await a.waitForTimeout(150);
check('"Sonraki ▶" düğmesi', (await curNo()) === seen[flagged - 1], await curNo());
await a.locator('.tour-bar button', { hasText: 'Bitir' }).click(); await a.waitForTimeout(150);
check('Bitir şeridi kapatır', (await a.locator('.tour-bar').count()) === 0, '');
await a.keyboard.press('Tab'); await a.waitForTimeout(150); // tur bitti: Tab yine atanmamışa

// 5) Ayarlar › Dönem "Son çıktı"
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Dönem")').click(); await a.waitForTimeout(150);
const last = (await a.locator('.last-export').innerText().catch(() => '')).replace(/\s+/g, ' ');
check('Ayarlar › Dönem: "Son çıktı … · 7 satır · n uyarılı · Aç"', /Son çıktı/.test(last) && /7 satır/.test(last) && new RegExp(`${flagged} uyarılı`).test(last) && /Aç/.test(last), last);
await a.locator('.last-export button', { hasText: 'Aç' }).click(); await a.waitForTimeout(200);
check('"Aç" çıktılar penceresini açar', (await a.locator('.exports-modal').count()) === 1, '');
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// 6) Dar ekranda "Çıktılar" ⋯ menüsünde
await a.setViewportSize({ width: 1000, height: 800 }); await a.waitForTimeout(400);
check('dar ekranda "Çıktılar" ilk ⋯ menüsüne düşer', /tb-hidden/.test(await a.locator('.toolbar [data-act="exports"]').getAttribute('class')), await a.locator('.toolbar [data-act="exports"]').getAttribute('class'));
await a.setViewportSize({ width: 1440, height: 900 }); await a.waitForTimeout(300);

// 7) Dönem silinince kayıt gider
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Dönem")').click(); await a.waitForTimeout(150);
await a.locator('.settings-links button.danger', { hasText: 'Dönemi sil' }).click(); await a.waitForSelector('.modal.dialog');
await a.locator('.modal.dialog button.danger').click(); await a.waitForTimeout(500);
check('dönem silinince çıktı kaydı da silindi', (await exportsInDb()) === 0, await exportsInDb());

check('sayfa hatası yok', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
