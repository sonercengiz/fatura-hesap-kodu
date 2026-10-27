// Rehber ve tarayıcı testleri için HAYALİ veri: gerçek yapıya benzeyen, tamamen uydurma firmalar ve faturalar.
// Kullanım: node test/demo/make-demo.mjs <çıktı klasörü>
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';

const OUT = process.argv[2] || '/tmp/fhk-demo';
rmSync(OUT, { recursive: true, force: true }); mkdirSync(`${OUT}/xml`, { recursive: true });

const CUSTOMER = { vkn: '9990000009', name: 'DENEME YAYINCILIK LTD. ŞTİ.', addr: 'Kızılay Mah. Atatürk Blv. No:12', city: 'Çankaya / Ankara' };
const SUPPLIERS = {
  telekom: { vkn: '1230000001', name: 'AY TELEKOM A.Ş.', color: '#1d4ed8', tagline: 'Müşteri Hizmetleri 444 0 000 · aytelekom.example', city: 'Maltepe / İstanbul', vd: 'Büyük Mükellefler', sicil: '304900', prefix: 'AYT', profile: 'TEMELFATURA' },
  temizlik: { vkn: '2340000002', name: 'GÜNEŞ TEMİZLİK HİZMETLERİ LTD. ŞTİ.', color: '#b45309', tagline: 'Ofis ve bina temizliği · gunestemizlik.example', city: 'Keçiören / Ankara', vd: 'Keçiören', sicil: '118822', prefix: 'GNS', profile: 'TICARIFATURA' },
  kirtasiye: { vkn: '3450000003', name: 'YILDIZ KIRTASİYE A.Ş.', color: '#047857', tagline: 'Kırtasiye ve ofis malzemeleri · yildizkirtasiye.example', city: 'Ulus / Ankara', vd: 'Ulus', sicil: '220511', prefix: 'YLD', profile: 'TICARIFATURA' },
  elektrik: { vkn: '4560000004', name: 'MAVİ ELEKTRİK PERAKENDE SATIŞ A.Ş.', color: '#0e7490', tagline: 'Elektrik tedarik · mavielektrik.example', city: 'Ataşehir / İstanbul', vd: 'Kozyatağı', sicil: '922100', prefix: 'MVE', profile: 'TEMELFATURA' },
  kargo: { vkn: '5670000005', name: 'HIZLI KARGO LOJİSTİK LTD. ŞTİ.', color: '#7c3aed', tagline: 'Yurt içi kargo · hizlikargo.example', city: 'Sincan / Ankara', vd: 'Sincan', sicil: '330077', prefix: 'HZK', profile: 'TICARIFATURA' },
  sahis: { tckn: '11111111110', first: 'AHMET', family: 'DEMİR', name: 'AHMET DEMİR', color: '#374151', tagline: 'Serbest meslek · danışmanlık', city: 'Çankaya / Ankara', vd: 'Çankaya', sicil: '', prefix: 'AHD', profile: 'TICARIFATURA' },
  gida: { vkn: '6780000006', name: 'LEZZET GIDA TOPTAN LTD. ŞTİ.', color: '#be123c', tagline: 'Toptan gıda · lezzetgida.example', city: 'Mamak / Ankara', vd: 'Mamak', sicil: '410980', prefix: 'LZT', profile: 'TEMELFATURA' },
};
const INVOICES = [
  ['telekom', 1, '2026-09-02', [['Hat ücreti (Eylül)', 1, 'ADET', 289.9, 20], ['İnternet paketi 50 GB', 1, 'ADET', 149.0, 20]]],
  ['kirtasiye', 1, '2026-09-03', [['Fotokopi kağıdı A4 80 gr (5 paket)', 10, 'ADET', 189.0, 20], ['Toner (siyah)', 2, 'ADET', 1450.0, 20]]],
  ['temizlik', 1, '2026-09-05', [['Ofis temizliği (Eylül, haftalık)', 4, 'ADET', 2500.0, 20]]],
  ['kargo', 1, '2026-09-05', [['Kargo hizmeti (12 gönderi)', 12, 'ADET', 95.0, 20]]],
  ['telekom', 2, '2026-09-09', [['Hat ücreti (Eylül)', 1, 'ADET', 289.9, 20], ['Yurt dışı arama', 1, 'ADET', 42.5, 20]]],
  ['gida', 1, '2026-09-10', [['Çay 1 kg', 20, 'KGM', 310.0, 1], ['Yumurta 30 lu koli', 2, 'ADET', 165.0, 10]]],
  ['kirtasiye', 2, '2026-09-12', [['Klasör geniş sırt', 24, 'ADET', 68.0, 20], ['Tükenmez kalem (50 adet)', 2, 'ADET', 240.0, 20]]],
  ['elektrik', 1, '2026-09-15', [['Elektrik tüketim bedeli (Ağustos)', 1842, 'KWH', 3.12, 20], ['Dağıtım bedeli', 1, 'ADET', 1180.4, 20]]],
  ['sahis', 1, '2026-09-16', [['Mali danışmanlık hizmeti (Eylül)', 1, 'ADET', 12000.0, 20]]],
  ['kargo', 2, '2026-09-18', [['Kargo hizmeti (9 gönderi)', 9, 'ADET', 95.0, 20]]],
  ['telekom', 3, '2026-09-19', [['Hat ücreti (Eylül)', 1, 'ADET', 289.9, 20]]],
  ['temizlik', 2, '2026-09-22', [['Cam temizliği', 1, 'ADET', 1800.0, 20]]],
  ['gida', 2, '2026-09-24', [['Kahve 500 gr', 12, 'ADET', 420.0, 1], ['Yumurta (satış için)', 3000, 'ADET', 4.9, 10]]],
  ['kirtasiye', 3, '2026-09-26', [['Yazıcı kartuşu renkli', 3, 'ADET', 980.0, 20]]],
  ['telekom', 4, '2026-09-29', [['Hat ücreti (Eylül)', 1, 'ADET', 289.9, 20], ['Cihaz taksiti 7/12', 1, 'ADET', 1250.0, 20]]],
  ['kargo', 3, '2026-09-30', [['Kargo hizmeti (15 gönderi)', 15, 'ADET', 95.0, 20]]],
];
const fmt = (n) => n.toFixed(2);
/** Fatura düzeyinde KDV alt toplamları: oran başına matrah ve vergi */
const subtotals = (lines) => { const by = new Map(); for (const [, qty, , price, pct] of lines) { const amt = +(qty * price).toFixed(2); const t = +(amt * pct / 100).toFixed(2); const cur = by.get(pct) ?? { net: 0, tax: 0 }; by.set(pct, { net: +(cur.net + amt).toFixed(2), tax: +(cur.tax + t).toFixed(2) }); } return [...by].map(([pct, v]) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="TRY">${fmt(v.net)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="TRY">${fmt(v.tax)}</cbc:TaxAmount><cbc:Percent>${pct}</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join(''); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const uuid = (i) => `a1b2c3d4-0000-4000-8000-${String(i).padStart(12, '0')}`;

function xslt(sup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:n1="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
<xsl:output method="html" encoding="UTF-8"/>
<xsl:template match="/">
<html><head><meta charset="utf-8"/><style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;margin:0;padding:18px 26px;width:800px}
.band{background:${sup.color};color:#fff;padding:14px 18px;border-radius:6px;display:flex;justify-content:space-between;align-items:center}
.band b{font-size:22px;letter-spacing:.5px}.band small{opacity:.9}
.row{display:flex;justify-content:space-between;gap:20px;margin-top:16px}.box{flex:1}
.badge{border:2px solid #c00;color:#c00;border-radius:50%;width:54px;height:54px;display:grid;place-items:center;font-weight:bold;font-size:10px;text-align:center}
table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #888;padding:5px 6px;text-align:left}th{background:#eef0f3}
.r{text-align:right}.tot{width:300px;margin-left:auto;margin-top:12px}.tot td{border:none;padding:3px 6px}.tot .big td{font-weight:bold;border-top:2px solid #222;font-size:13px}
.info td{padding:2px 6px;border:none}.foot{margin-top:18px;color:#666;font-size:11px;border-top:1px solid #ccc;padding-top:8px}
</style></head><body>
<div class="band"><div><b>${esc(sup.name)}</b><br/><small>${esc(sup.tagline)}</small></div><div class="badge">e-FATURA</div></div>
<div class="row">
 <div class="box"><b>SAYIN</b><br/><xsl:value-of select="//cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name"/><br/><xsl:value-of select="//cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:StreetName"/><br/><xsl:value-of select="//cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:CityName"/><br/>VKN: <xsl:value-of select="//cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID"/></div>
 <div class="box"><table class="info">
  <tr><td>Fatura No</td><td><b><xsl:value-of select="/n1:Invoice/cbc:ID"/></b></td></tr>
  <tr><td>Fatura Tarihi</td><td><xsl:value-of select="/n1:Invoice/cbc:IssueDate"/></td></tr>
  <tr><td>Senaryo</td><td><xsl:value-of select="/n1:Invoice/cbc:ProfileID"/></td></tr>
  <tr><td>Fatura Tipi</td><td><xsl:value-of select="/n1:Invoice/cbc:InvoiceTypeCode"/></td></tr>
  <tr><td>ETTN</td><td style="font-size:10px"><xsl:value-of select="/n1:Invoice/cbc:UUID"/></td></tr>
 </table></div>
</div>
<table><tr><th>#</th><th>Mal / Hizmet</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">KDV</th><th class="r">Tutar</th></tr>
<xsl:for-each select="//cac:InvoiceLine"><tr><td><xsl:value-of select="cbc:ID"/></td><td><xsl:value-of select="cac:Item/cbc:Name"/></td><td class="r"><xsl:value-of select="cbc:InvoicedQuantity"/></td><td class="r"><xsl:value-of select="cac:Price/cbc:PriceAmount"/></td><td class="r">%<xsl:value-of select="cac:TaxTotal/cac:TaxSubtotal/cbc:Percent"/></td><td class="r"><xsl:value-of select="cbc:LineExtensionAmount"/></td></tr></xsl:for-each>
</table>
<table class="tot"><tr><td>Mal / Hizmet Toplamı</td><td class="r"><xsl:value-of select="//cac:LegalMonetaryTotal/cbc:LineExtensionAmount"/> TL</td></tr>
<tr><td>Hesaplanan KDV</td><td class="r"><xsl:value-of select="//cac:TaxTotal/cbc:TaxAmount"/> TL</td></tr>
<tr class="big"><td>Ödenecek Tutar</td><td class="r"><xsl:value-of select="//cac:LegalMonetaryTotal/cbc:PayableAmount"/> TL</td></tr></table>
<div class="foot">${esc(sup.name)} · ${esc(sup.city)} · Vergi Dairesi: ${esc(sup.vd)}${sup.sicil ? ' · Ticaret Sicil: ' + sup.sicil : ''} · Bu belge hayali bir örnektir.</div>
</body></html>
</xsl:template></xsl:stylesheet>`;
}

const rows = [['Fatura No', 'Fatura Tarihi', 'Geliş Zamanı', 'Fatura Tipi', 'Fatura Türü', 'Gönderen VKN/TCKN', 'Gönderen Unvan/Ad Soyad', 'Tutar', 'Döviz Cinsi', 'Durum', 'Yanıt Durumu', 'Yerele Aktarım Durumu', 'Zarf No', 'KEP İtiraz Durumu', 'Gib Portal Fatura Iptal Durumu', 'Resmi Yazı İtiraz Durumu', 'Gib Portal Fatura İtiraz Durumu', 'Şube', 'Hash', 'Etiket']];
const zipEntries = {};
INVOICES.forEach(([key, seq, date, lines], idx) => {
  const sup = SUPPLIERS[key];
  const no = `${sup.prefix}2026${String(seq).padStart(9, '0')}`;
  let net = 0, tax = 0;
  const lineXml = lines.map(([name, qty, unit, price, pct], i) => { const amt = +(qty * price).toFixed(2); const t = +(amt * pct / 100).toFixed(2); net += amt; tax += t; return `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="${unit}">${qty}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="TRY">${fmt(amt)}</cbc:LineExtensionAmount><cac:TaxTotal><cbc:TaxAmount currencyID="TRY">${fmt(t)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="TRY">${fmt(amt)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="TRY">${fmt(t)}</cbc:TaxAmount><cbc:Percent>${pct}</cbc:Percent><cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:Item><cbc:Name>${esc(name)}</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="TRY">${fmt(price)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`; }).join('');
  net = +net.toFixed(2); tax = +tax.toFixed(2); const gross = +(net + tax).toFixed(2);
  const party = sup.tckn
    ? `<cac:PartyIdentification><cbc:ID schemeID="TCKN">${sup.tckn}</cbc:ID></cac:PartyIdentification><cac:Person><cbc:FirstName>${sup.first}</cbc:FirstName><cbc:FamilyName>${sup.family}</cbc:FamilyName></cac:Person>`
    : `<cac:PartyIdentification><cbc:ID schemeID="VKN">${sup.vkn}</cbc:ID></cac:PartyIdentification>${sup.sicil ? `<cac:PartyIdentification><cbc:ID schemeID="TICARETSICILNO">${sup.sicil}</cbc:ID></cac:PartyIdentification>` : ''}<cac:PartyName><cbc:Name>${esc(sup.name)}</cbc:Name></cac:PartyName>`;
  const b64 = Buffer.from(xslt(sup), 'utf8').toString('base64');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>TR1.2</cbc:CustomizationID><cbc:ProfileID>${sup.profile}</cbc:ProfileID>
<cbc:ID>${no}</cbc:ID><cbc:CopyIndicator>false</cbc:CopyIndicator><cbc:UUID>${uuid(idx + 1)}</cbc:UUID><cbc:IssueDate>${date}</cbc:IssueDate><cbc:IssueTime>10:${String(10 + idx).padStart(2, '0')}:00</cbc:IssueTime>
<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode><cbc:Note>Hayali örnek fatura</cbc:Note><cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>
<cac:AdditionalDocumentReference><cbc:ID>1</cbc:ID><cbc:IssueDate>${date}</cbc:IssueDate><cbc:DocumentType>XSLT</cbc:DocumentType><cac:Attachment><cbc:EmbeddedDocumentBinaryObject characterSetCode="UTF-8" encodingCode="Base64" filename="${sup.prefix}.xslt" mimeCode="application/xml">${b64}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>
<cac:AccountingSupplierParty><cac:Party>${party}<cac:PostalAddress><cbc:StreetName>Örnek Cad. No:1</cbc:StreetName><cbc:CityName>${esc(sup.city)}</cbc:CityName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(sup.vd)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="VKN">${CUSTOMER.vkn}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${esc(CUSTOMER.name)}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${esc(CUSTOMER.addr)}</cbc:StreetName><cbc:CityName>${esc(CUSTOMER.city)}</cbc:CityName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress></cac:Party></cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">${fmt(tax)}</cbc:TaxAmount>${subtotals(lines)}</cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="TRY">${fmt(net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="TRY">${fmt(net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="TRY">${fmt(gross)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="TRY">${fmt(gross)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${lineXml}
</Invoice>`;
  const fname = `${no} - ${sup.vkn ?? sup.tckn} - ${sup.name.replace(/[^\wÇĞİÖŞÜçğıöşü]+/g, '_')}.xml`;
  writeFileSync(`${OUT}/xml/${fname}`, xml);
  zipEntries[fname] = new TextEncoder().encode(xml);
  const [y, m, d] = date.split('-');
  rows.push([no, `${d}/${m}/${y}`, `${d}/${m}/${y} 1${String(idx % 9)}:2${idx % 10}:05`, 'Satış', sup.profile === 'TEMELFATURA' ? 'Temel' : 'Ticari', sup.vkn ?? sup.tckn, sup.name, gross, 'TRY', 'Fatura hazır', sup.profile === 'TEMELFATURA' ? 'Bu fatura için gönderene cevap verilmemektedir.' : 'Fatura kabul edildi.', 'Yerele Aktarılacak', uuid(900 + idx), '', '', '', '', '', `hash${String(idx).padStart(4, '0')}==`, '']);
});
// irsaliye ve bozuk dosya (yükleme sonucu penceresi için)
writeFileSync(`${OUT}/xml/IRS2026000000001 - irsaliye.xml`, '<?xml version="1.0"?><DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>IRS2026000000001</cbc:ID></DespatchAdvice>');
writeFileSync(`${OUT}/bozuk-fatura.xml`, '<Invoice><cbc:ID>YARIM2026');
writeFileSync(`${OUT}/edm-faturalar-eylul-2026.zip`, zipSync(zipEntries));
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet0'); XLSX.writeFile(wb, `${OUT}/EDM Gelen Faturalar Eylul 2026.xlsx`);
writeFileSync(`${OUT}/kurallar-deneme-yayincilik.json`, JSON.stringify({ app: 'fatura-hesap-kodu', kind: 'rules', version: 2, exportedAt: new Date().toISOString(), firmName: 'Deneme Yayıncılık', rules: [{ conds: [{ kind: 'vkn', text: '1230000001' }], code: '770.03', enabled: true }, { conds: [{ kind: 'name', text: 'kargo' }], code: '760.02', enabled: true }, { conds: [{ kind: 'item', text: 'yumurta' }, { kind: 'qty', min: 1000, max: null }], code: '153', enabled: true }] }, null, 2));
writeFileSync(`${OUT}/hesap-kodlari.txt`, '153 Ticari mallar\n191 İndirilecek KDV\n740.01 Hizmet üretim: temizlik\n760.02 Pazarlama: kargo ve nakliye\n770.01 Genel yönetim: kırtasiye\n770.02 Genel yönetim: elektrik\n770.03 Genel yönetim: haberleşme\n770.05 Genel yönetim: danışmanlık\n770.09 Genel yönetim: mutfak ve ikram\n');
console.log(`demo verisi: ${INVOICES.length} XML + irsaliye + bozuk, ZIP, EDM listesi, kural dosyası, hesap kodları → ${OUT}`);
