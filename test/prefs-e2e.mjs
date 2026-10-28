// Eleştiri turu 2, E (tercih itirazları): şablon penceresi kaydedilmemiş değişikliği gösterir ve kapatırken sorar;
// yedek şeridi yalnızca son yedekten sonra değişiklik varsa çıkar, sıklığı Ayarlar › Yedek'ten seçilir;
// "Görsel" yalnızca ana ekranın adı: XML'e bağlı yerler "XML" der.
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
const S = process.env.SCRATCH || '/private/tmp/claude-501/-Users-sonercengiz-Documents-scc/93c845f0-946b-47e1-a170-db4727073082/scratchpad';
const DEMO = process.env.DEMO_DIR || `${S}/demo`;
const files = readdirSync(`${DEMO}/xml`).filter((f) => f.endsWith('.xml') && !/irsaliye|bozuk/.test(f)).sort().map((f) => `${DEMO}/xml/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
const errors = [];
let fails = 0;
const check = (name, ok, got) => { if (!ok) fails++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${got}`); };
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('guideSeen', '1'); localStorage.setItem('tplMode', 'advanced');  } catch {} });
const a = await ctx.newPage();
a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const up = 'input[accept*=".zip"]';
const tplOpen = () => a.locator('.tpl-modal').count().then((n) => n > 0);
const tplCols = () => a.locator('.tpl-modal .tpl-row').count();
const banner = () => a.locator('.backup-hint').count().then((n) => n > 0);
await a.goto('http://localhost:5179/'); await a.waitForSelector('.welcome');
await a.locator(up).setInputFiles(files); await a.waitForSelector('.inv-frame'); await a.waitForFunction(() => !document.querySelector('.busy')); await a.waitForTimeout(300);

// 1) Şablon: anında kaydeder (Kaydet yok); Geri al pencere içinde; Esc sormadan kapatır
await a.locator('.toolbar button:has-text("Şablon")').click(); await a.waitForSelector('.tpl-modal');
const n0 = await tplCols();
check('şablonda Kaydet yok, "anında kaydedilir" yazar', (await a.locator('.tpl-modal button:has-text("Kaydet")').count()) === 0 && (await a.locator('.tpl-modal .modal-head').innerText()).includes('anında kaydedilir'), await a.locator('.tpl-modal .modal-head').innerText());
await a.locator('.tpl-modal .tpl-row').nth(5).locator('button[title="Sütunu kaldır"]').click(); await a.waitForTimeout(150);
await a.locator('.tpl-modal .tpl-row').nth(5).locator('button[title="Sütunu kaldır"]').click(); await a.waitForTimeout(150);
check('Geri al sayısı söyler', (await a.locator('.tpl-modal button:has-text("Geri al")').innerText()).includes('(2)'), await a.locator('.tpl-modal button:has-text("Geri al")').innerText());
await a.keyboard.press('Control+z'); await a.waitForTimeout(150);
check('Ctrl+Z bir adım geri alır', (await tplCols()) === n0 - 1, await tplCols());
await a.keyboard.press('Escape'); await a.waitForTimeout(200);
check('Esc sormadan kapatır', !(await tplOpen()) && (await a.locator('.modal.dialog').count()) === 0, 'açık');
await a.locator('.toolbar button:has-text("Şablon")').click(); await a.waitForSelector('.tpl-modal');
check('değişiklik kaydedilmiş (bir sütun eksik)', (await tplCols()) === n0 - 1, await tplCols());
await a.locator('.tpl-modal button:has-text("EDM varsayılanına dön")').click(); await a.waitForTimeout(150);
await a.keyboard.press('Escape'); await a.waitForTimeout(200);

// 2) Yedek şeridi: hiç yedek yoksa çıkar; "1 hafta sonra hatırlat" gizler
check('hiç yedek yokken şerit', await banner(), 'yok');
check('erteleme düğmesi "1 hafta sonra hatırlat"', (await a.locator('.backup-hint button:has-text("1 hafta sonra hatırlat")').count()) === 1, await a.locator('.backup-hint').innerText().catch(() => ''));
await a.locator('.backup-hint button:has-text("sonra hatırlat")').click(); await a.waitForTimeout(150);
check('ertelenince gizlenir', !(await banner()), 'görünür');
// 10 gün önce yedek, ondan önce değişiklik → yeniden yüklenince şerit yok
const setOld = () => a.evaluate(() => new Promise((res) => {
  const DAY = 86_400_000, now = Date.now();
  localStorage.removeItem('backupDismissedAt'); localStorage.setItem('lastChangeAt', String(now - 11 * DAY));
  const r = indexedDB.open('fatura-hesap-kodu');
  r.onsuccess = () => {
    const tx = r.result.transaction(['settings', 'batches'], 'readwrite');
    tx.objectStore('settings').put({ key: 'lastExportAt', value: now - 10 * DAY });
    const bs = tx.objectStore('batches'); const q = bs.getAll();
    q.onsuccess = () => { for (const b of q.result) bs.put({ ...b, updatedAt: now - 11 * DAY }); };
    tx.oncomplete = () => { r.result.close(); res(); };
  };
}));
await setOld(); await a.reload(); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(400);
check('yedekten sonra değişiklik yoksa şerit yok (10 gün geçse de)', !(await banner()), 'görünür');
await a.keyboard.press('/'); await a.keyboard.type('770.05'); await a.keyboard.press('Enter'); await a.waitForTimeout(400);
check('değişiklik olunca şerit çıkar ("o günden beri değişiklik var")', (await banner()) && (await a.locator('.backup-hint').innerText()).includes('değişiklik var'), await a.locator('.backup-hint').innerText().catch(() => '(yok)'));
// Ayarlar › Yedek: ayda bir → 10 gün yetmez, gizlenir; kapalı → gizli
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click(); await a.waitForTimeout(200);
check('Ayarlar › Yedek: "o günden beri değişiklik var"', (await a.locator('.modal').last().innerText()).includes('o günden beri değişiklik var'), '');
await a.locator('.backup-remind label:has-text("Ayda bir") input').check(); await a.waitForTimeout(150);
await a.keyboard.press('Escape'); await a.waitForTimeout(150);
check('ayda bir: 10 günlük yedekte şerit yok', !(await banner()), 'görünür');
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click(); await a.waitForTimeout(200);
await a.locator('.backup-remind label:has-text("Haftada bir") input').check(); await a.waitForTimeout(150);
await a.keyboard.press('Escape'); await a.waitForTimeout(150);
check('haftada bir: şerit geri gelir', await banner(), 'yok');
await a.reload(); await a.waitForSelector('.inv-frame'); await a.waitForTimeout(300);
check('sıklık bu bilgisayarda hatırlanır', await a.evaluate(() => localStorage.getItem('backupRemind')) === 'week' && (await banner()), await a.evaluate(() => localStorage.getItem('backupRemind')));
// yedek alınca şerit gider
const [dl] = await Promise.all([a.waitForEvent('download'), a.locator('.backup-hint button:has-text("Şimdi dışa aktar")').click()]); await dl.path(); await a.waitForTimeout(300);
check('yedek alınca şerit gider', !(await banner()), 'görünür');

// 3) "Görsel" yalnızca ana ekran; XML'e bağlı yerler "XML" der
await a.locator('.toolbar button[title="Ayarlar"]').click(); await a.locator('.settings-tabs button:has-text("Yedek")').click(); await a.waitForTimeout(900);
const yedek = await a.locator('.modal').last().innerText();
check('Depolama: "XML\'leri kaldır", "görsel" yok', yedek.includes("XML'leri kaldır") && !/görsel/i.test(yedek), yedek.match(/.{0,30}görsel.{0,30}/i)?.[0] ?? '');
await a.locator('.modal button:has-text("XML\'leri kaldır")').first().click(); await a.waitForSelector('.modal.dialog'); await a.keyboard.press('Enter'); await a.waitForTimeout(800);
await a.keyboard.press('Escape'); await a.waitForTimeout(300);
check('panel sayacı "XML\'siz"', (await a.locator('.files span').first().innerText()).includes("XML'siz"), await a.locator('.files span').first().innerText());
const card = await a.locator('.card-hint').innerText().catch(() => '(kart yok)');
check('kart "fatura görüntüsü" der, "görsel" demez', card.includes('fatura görüntüsü') && !/görsel/i.test(card), card);

check('sayfa hatası yok', errors.length === 0, errors.join('; '));
await browser.close();
process.exit(fails ? 1 : 0);
