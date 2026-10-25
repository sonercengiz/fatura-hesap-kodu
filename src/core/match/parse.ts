/** e-Fatura numarası: 3 harf/rakam + 4 haneli yıl (20xx) + 9 hane sıra = 16 karakter. */
export const INVOICE_NO_RE = /[A-Z0-9]{3}20\d{2}\d{9}/g;
export const ETTN_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function isInvoiceNo(s: string): boolean {
  return /^[A-Z0-9]{3}20\d{2}\d{9}$/.test(s);
}

/** Metinde geçen, bilinen kümede olan fatura numaraları (ilk görülme sırasıyla). */
export function findKnownInvoiceNos(text: string, known: Set<string>): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const variants = [text.toUpperCase(), text.toUpperCase().replace(/\s+/g, '')];
  for (const t of variants) {
    for (const m of t.matchAll(INVOICE_NO_RE)) {
      const no = m[0];
      if (known.has(no) && !seen.has(no)) {
        seen.add(no);
        found.push(no);
      }
    }
  }
  if (found.length === 0 && known.size <= 5000) {
    // Metin parçalanmış olabilir: bilinen numaraları boşluksuz metinde doğrudan ara
    const squashed = variants[1];
    for (const no of known) {
      if (squashed.includes(no)) {
        found.push(no);
      }
    }
    found.sort((a, b) => squashed.indexOf(a) - squashed.indexOf(b));
  }
  return found;
}

export function findEttns(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(ETTN_RE), (m) => m[0].toLowerCase())));
}
