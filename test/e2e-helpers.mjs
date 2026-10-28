/** Tarayıcı testleri için ortak yardımcılar. */

/** Ayarlar › Görünüm › "Sıradaki faturaya kendiliğinden geç" seçimini açar (varsayılan kapalı; akış testleri hızlı çalışmayı varsayar). */
export async function enableAutoAdvance(page) {
  await page.locator('.toolbar button[title="Ayarlar"]').click();
  await page.locator('.settings-tabs button:has-text("Görünüm")').click();
  await page.locator('label:has-text("kendiliğinden geç") input').check();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 3000 }).catch(() => {});
}

/**
 * Hayali operatör faturası (gerçek Vodafone örneğinin biçimi): KDV alt toplamında matrah (TaxableAmount) yok, ÖİV ve telsiz ücreti var,
 * ödenecek tutar (562,25) KDV dahil toplamdan (496,26) büyük (önceki dönem borcu). Şirket faturası örneğinden türetilir.
 */
export function operatorXml(base, no = 'OPR2026000000001') {
  const sub = (tax, pct, code, name) => `<cac:TaxSubtotal><cbc:TaxAmount currencyID="TRY">${tax}</cbc:TaxAmount>${pct ? `<cbc:Percent>${pct}</cbc:Percent>` : ''}<cac:TaxCategory><cac:TaxScheme><cbc:Name>${name}</cbc:Name><cbc:TaxTypeCode>${code}</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`;
  return base
    .replace('<cbc:ID>ABC2026000000001</cbc:ID>', `<cbc:ID>${no}</cbc:ID>`)
    .replace('11111111-2222-3333-4444-555555555555', `99999999-2222-3333-4444-${no.slice(-12).padStart(12, '0')}`)
    .replace('<cbc:ID schemeID="VKN">1234567801</cbc:ID>', '<cbc:ID schemeID="VKN">9999999901</cbc:ID>')
    .replace('ÖRNEK KIRTASİYE LTD. ŞTİ.', 'ÖRNEK TELEKOM A.Ş.')
    .replace('<cbc:LineCountNumeric>2</cbc:LineCountNumeric>', '<cbc:LineCountNumeric>1</cbc:LineCountNumeric>')
    .replace(/<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">250.00<\/cbc:TaxAmount>.*?<\/cac:TaxTotal>\n/, `<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">135.28</cbc:TaxAmount>${sub('72.20', '20', '0015', 'KDV')}${sub('36.10', '10', '4081', 'ÖİV')}${sub('26.98', '', '8006', 'Telsiz Kullanma Ücretleri')}</cac:TaxTotal>\n`)
    .replace(/<cac:LegalMonetaryTotal>.*?<\/cac:LegalMonetaryTotal>/, '<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="TRY">360.98</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="TRY">360.98</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="TRY">496.26</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="TRY">562.25</cbc:PayableAmount></cac:LegalMonetaryTotal>')
    .replace(/<cac:InvoiceLine>.*<\/cac:InvoiceLine>/s, '<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="TRY">360.98</cbc:LineExtensionAmount><cac:Item><cbc:Name>HIZMET BEDELI</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="TRY">360.98</cbc:PriceAmount></cac:Price></cac:InvoiceLine>');
}
