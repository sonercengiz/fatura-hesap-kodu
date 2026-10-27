/** Tarayıcı testleri için ortak yardımcılar. */

/** Ayarlar › Görünüm › "Sıradaki faturaya kendiliğinden geç" seçimini açar (varsayılan kapalı; akış testleri hızlı çalışmayı varsayar). */
export async function enableAutoAdvance(page) {
  await page.locator('.toolbar button[title="Ayarlar"]').click();
  await page.locator('.settings-tabs button:has-text("Görünüm")').click();
  await page.locator('label:has-text("kendiliğinden geç") input').check();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 3000 }).catch(() => {});
}
