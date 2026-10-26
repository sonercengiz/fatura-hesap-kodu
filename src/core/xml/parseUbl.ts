/**
 * UBL-TR e-Fatura XML ayrıştırma. Tarayıcının DOMParser'ı ile çalışır (testlerde jsdom).
 * Yalnızca uygulamanın ihtiyacı olan başlık alanları okunur; gömülü XSLT ayrılır ve
 * saklanan XML'den çıkarılır (aynı XSLT yüzlerce faturada tekrar eder).
 */
export const NS = {
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
} as const;

export interface UblInvoice {
  no: string;
  uuid: string;
  /** YYYY-AA-GG */
  issueDate: string;
  issueTime: string;
  profileId: string;
  typeCode: string;
  currency: string;
  supplierVkn: string;
  supplierName: string;
  customerVkn: string;
  payable: number | null;
  taxInclusive: number | null;
  taxExclusive: number | null;
  taxAmount: number | null;
  lineCount: number | null;
  /** Kalem adlarının birleştirilmiş, normalize edilmiş metni (kurallar için; en çok 4000 karakter) */
  itemText: string;
  /** Gömülü görünüm şablonu (metin); yoksa null */
  xslt: string | null;
  xsltFileName: string | null;
  /** XSLT içeriği boşaltılmış, yeniden serileştirilmiş XML */
  xml: string;
}

export interface UblLine {
  name: string;
  quantity: string;
  unit: string;
  price: number | null;
  amount: number | null;
  taxAmount: number | null;
  taxPercent: string;
}

function children(el: Element | null, ns: string, name: string): Element[] {
  if (!el) return [];
  const out: Element[] = [];
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 1 && (c as Element).localName === name && (c as Element).namespaceURI === ns) out.push(c as Element);
  }
  return out;
}
const child = (el: Element | null, ns: string, name: string): Element | null => children(el, ns, name)[0] ?? null;
const text = (el: Element | null): string => (el?.textContent ?? '').trim();
const cbc = (el: Element | null, name: string) => text(child(el, NS.cbc, name));
const cac = (el: Element | null, name: string) => child(el, NS.cac, name);

export function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** XML bildirimi (ya da BOM) ile belirtilen karakter kümesi; yoksa utf-8 */
export function sniffEncoding(bytes: Uint8Array): string {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return 'utf-16';
  let head = '';
  for (let i = 0; i < Math.min(bytes.length, 200); i++) head += String.fromCharCode(bytes[i]);
  const m = head.match(/encoding\s*=\s*["']([\w-]+)["']/i);
  return m ? m[1].toLowerCase() : 'utf-8';
}

export function decodeBytes(bytes: Uint8Array): string {
  const enc = sniffEncoding(bytes);
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Satıcı adı: PartyName/Name; yoksa Person Ad Soyad (şahıs mükellef). */
function partyName(party: Element | null): string {
  const name = cbc(cac(party, 'PartyName'), 'Name');
  if (name) return name;
  const person = cac(party, 'Person');
  if (person) {
    const parts = [cbc(person, 'Title'), cbc(person, 'FirstName'), cbc(person, 'MiddleName'), cbc(person, 'FamilyName')].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return '';
}

/** VKN ya da TCKN; şema etiketi yoksa ilk kimlik. */
function partyId(party: Element | null): string {
  const ids = children(party, NS.cac, 'PartyIdentification').map((p) => child(p, NS.cbc, 'ID')).filter((x): x is Element => !!x);
  const pick = (scheme: string) => ids.find((x) => (x.getAttribute('schemeID') ?? '').toUpperCase() === scheme);
  const hit = pick('VKN') ?? pick('TCKN') ?? ids.find((x) => /^\d{10,11}$/.test(text(x))) ?? ids[0];
  return hit ? text(hit) : '';
}

export class UblParseError extends Error {}

/**
 * XML metnini ayrıştırır. Geçersiz XML ya da Invoice olmayan belge için UblParseError fırlatır.
 * `parser` ve `serializer` verilmezse genel DOMParser/XMLSerializer kullanılır.
 */
export function parseUbl(xmlText: string): UblInvoice {
  const doc = new DOMParser().parseFromString(xmlText.replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new UblParseError('XML okunamadı (bozuk dosya).');
  const root = doc.documentElement;
  if (!root || root.localName !== 'Invoice') throw new UblParseError(`Bu bir e-Fatura XML'i değil (kök öğe: ${root?.localName ?? 'yok'}).`);

  const no = cbc(root, 'ID');
  if (!no) throw new UblParseError('Fatura numarası (cbc:ID) bulunamadı.');

  const supplier = cac(cac(root, 'AccountingSupplierParty'), 'Party');
  const customer = cac(cac(root, 'AccountingCustomerParty'), 'Party');
  const total = cac(root, 'LegalMonetaryTotal');
  const taxTotals = children(root, NS.cac, 'TaxTotal');
  const taxAmount = taxTotals.length ? taxTotals.reduce((s, t) => s + (toNum(cbc(t, 'TaxAmount')) ?? 0), 0) : null;
  const payable = toNum(cbc(total, 'PayableAmount'));
  const taxInclusive = toNum(cbc(total, 'TaxInclusiveAmount'));
  const currency = cbc(root, 'DocumentCurrencyCode') || child(total, NS.cbc, 'PayableAmount')?.getAttribute('currencyID') || 'TRY';

  // Gömülü XSLT: AdditionalDocumentReference içindeki ikili nesnelerden stylesheet olanı
  let xslt: string | null = null;
  let xsltFileName: string | null = null;
  for (const adr of children(root, NS.cac, 'AdditionalDocumentReference')) {
    const bin = child(cac(adr, 'Attachment'), NS.cbc, 'EmbeddedDocumentBinaryObject');
    if (!bin) continue;
    const b64 = text(bin);
    if (!b64) continue;
    const fname = bin.getAttribute('filename') ?? '';
    const docType = cbc(adr, 'DocumentType').toUpperCase();
    const looksXslt = /\.xslt?$/i.test(fname) || docType === 'XSLT';
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(b64);
    } catch {
      continue;
    }
    let head = '';
    for (let i = 0; i < Math.min(bytes.length, 3000); i++) head += String.fromCharCode(bytes[i]);
    if (!looksXslt && !/stylesheet|xsl:transform/i.test(head)) continue;
    if (!/xsl/i.test(head)) continue; // adı XSLT ama içeriği değil (örn. JSON ek)
    xslt = decodeBytes(bytes);
    xsltFileName = fname || null;
    bin.textContent = '';
    break;
  }

  return {
    no,
    uuid: cbc(root, 'UUID'),
    issueDate: cbc(root, 'IssueDate'),
    issueTime: cbc(root, 'IssueTime'),
    profileId: cbc(root, 'ProfileID'),
    typeCode: cbc(root, 'InvoiceTypeCode'),
    currency,
    supplierVkn: partyId(supplier),
    supplierName: partyName(supplier),
    customerVkn: partyId(customer),
    payable: payable ?? taxInclusive,
    taxInclusive,
    taxExclusive: toNum(cbc(total, 'TaxExclusiveAmount')),
    taxAmount,
    lineCount: toNum(cbc(root, 'LineCountNumeric')) ?? children(root, NS.cac, 'InvoiceLine').length,
    itemText: itemTextOf(root),
    xslt,
    xsltFileName,
    xml: new XMLSerializer().serializeToString(doc),
  };
}

/** Kalem adları (Item/Name, yoksa Description) tek metin halinde: küçük harf, tekilleştirilmiş, sınırlı uzunluk */
export function itemTextOf(root: Element | null, max = 4000): string {
  const seen = new Set<string>();
  for (const ln of children(root, NS.cac, 'InvoiceLine')) {
    const item = cac(ln, 'Item');
    const name = (cbc(item, 'Name') || cbc(item, 'Description')).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
    if (name) seen.add(name);
  }
  return Array.from(seen).join(' | ').slice(0, max);
}

/** Fatura kalemleri (yedek görünüm için). */
export function parseLines(xmlText: string): UblLine[] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const root = doc.documentElement;
  return children(root, NS.cac, 'InvoiceLine').map((ln) => {
    const qty = child(ln, NS.cbc, 'InvoicedQuantity');
    const tax = cac(ln, 'TaxTotal');
    const sub = cac(tax, 'TaxSubtotal');
    return {
      name: cbc(cac(ln, 'Item'), 'Name') || cbc(cac(ln, 'Item'), 'Description'),
      quantity: text(qty),
      unit: qty?.getAttribute('unitCode') ?? '',
      price: toNum(cbc(cac(ln, 'Price'), 'PriceAmount')),
      amount: toNum(cbc(ln, 'LineExtensionAmount')),
      taxAmount: toNum(cbc(tax, 'TaxAmount')),
      taxPercent: cbc(sub, 'Percent'),
    };
  });
}

/** Baskın ay: faturaların çoğunun ait olduğu "Ay YYYY" (Türkçe). */
export function dominantMonth(isoDates: string[]): string | null {
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const count = new Map<string, number>();
  for (const d of isoDates) {
    const m = d.match(/^(\d{4})-(\d{2})/);
    if (!m) continue;
    const k = `${m[1]}-${m[2]}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of count) if (n > bestN || (n === bestN && best !== null && k > best)) { best = k; bestN = n; }
  if (!best) return null;
  const [y, mo] = best.split('-');
  return `${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}
