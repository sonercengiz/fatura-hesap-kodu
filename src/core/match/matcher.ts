import type { PdfRef } from '../types';
import { findKnownInvoiceNos } from './parse';

export interface PdfDoc {
  fileId: string;
  fileName: string;
  /** Sayfa başına çıkarılmış metin (boş dize = metin katmanı yok). */
  pages: string[];
}

export interface UnmatchedSegment extends PdfRef {
  reason: 'no-text' | 'no-number';
}

export interface MatchResult {
  /** fatura no -> sayfa aralıkları */
  refs: Map<string, PdfRef[]>;
  unmatched: UnmatchedSegment[];
  /** Birden fazla PDF'e eşlenen faturalar */
  duplicates: string[];
}

/**
 * Deterministik eşleştirme:
 * 1) dosya adında bilinen fatura no,
 * 2) sayfa metninde bilinen fatura no (numaralı sayfa yeni faturayı başlatır, numarasız sayfa öncekinin devamıdır).
 */
export function matchPdfs(known: Set<string>, docs: PdfDoc[]): MatchResult {
  const refs = new Map<string, PdfRef[]>();
  const unmatched: UnmatchedSegment[] = [];
  const push = (no: string, ref: PdfRef) => {
    const list = refs.get(no) ?? [];
    list.push(ref);
    refs.set(no, list);
  };

  for (const doc of docs) {
    const n = doc.pages.length;
    const fromName = findKnownInvoiceNos(doc.fileName, known)[0] ?? null;
    const hasText = doc.pages.some((p) => p.trim().length > 0);

    if (n === 0) continue;
    if (!hasText) {
      if (fromName) push(fromName, { fileId: doc.fileId, fileName: doc.fileName, pageStart: 1, pageEnd: n });
      else unmatched.push({ fileId: doc.fileId, fileName: doc.fileName, pageStart: 1, pageEnd: n, reason: 'no-text' });
      continue;
    }

    // Sayfa bazlı bölütleme
    const pageNos = doc.pages.map((t) => findKnownInvoiceNos(t, known));
    const distinct = new Set(pageNos.flat());

    if (distinct.size === 0) {
      if (fromName) push(fromName, { fileId: doc.fileId, fileName: doc.fileName, pageStart: 1, pageEnd: n });
      else unmatched.push({ fileId: doc.fileId, fileName: doc.fileName, pageStart: 1, pageEnd: n, reason: 'no-number' });
      continue;
    }

    if (distinct.size === 1) {
      // Tek fatura: tüm dosya ona ait (önde numarasız kapak sayfası olsa bile)
      const no = distinct.values().next().value as string;
      push(no, { fileId: doc.fileId, fileName: doc.fileName, pageStart: 1, pageEnd: n });
      continue;
    }

    // Birleştirilmiş PDF: segmentlere böl
    let current: string | null = fromName;
    let start = 1;
    for (let i = 0; i < n; i++) {
      const nos = pageNos[i];
      const no = nos[0] ?? null;
      if (no && no !== current) {
        if (i > 0) {
          if (current) push(current, { fileId: doc.fileId, fileName: doc.fileName, pageStart: start, pageEnd: i });
          else unmatched.push({ fileId: doc.fileId, fileName: doc.fileName, pageStart: start, pageEnd: i, reason: 'no-number' });
        }
        current = no;
        start = i + 1;
      }
    }
    if (current) push(current, { fileId: doc.fileId, fileName: doc.fileName, pageStart: start, pageEnd: n });
    else unmatched.push({ fileId: doc.fileId, fileName: doc.fileName, pageStart: start, pageEnd: n, reason: 'no-number' });
  }

  const duplicates = Array.from(refs.entries())
    .filter(([, list]) => list.length > 1)
    .map(([no]) => no);
  return { refs, unmatched, duplicates };
}

export interface ManualLink {
  no: string;
  fileId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
}

/** Elle kurulan bağlantılar otomatik sonucu geçersiz kılar: ilgili sayfa aralığı eşleşmeyenlerden çıkar, faturaya eklenir. */
export function applyManualLinks(result: MatchResult, links: ManualLink[]): MatchResult {
  if (links.length === 0) return result;
  const refs = new Map(Array.from(result.refs, ([no, list]) => [no, list.slice()]));
  let unmatched = result.unmatched.slice();
  for (const l of links) {
    unmatched = unmatched.filter((u) => !(u.fileId === l.fileId && u.pageStart === l.pageStart && u.pageEnd === l.pageEnd));
    // Aynı dosya/sayfa başka bir faturaya otomatik eşlenmişse oradan kaldır
    for (const [no, list] of refs) {
      const kept = list.filter((r) => !(r.fileId === l.fileId && r.pageStart === l.pageStart && r.pageEnd === l.pageEnd));
      if (kept.length !== list.length) {
        if (kept.length) refs.set(no, kept);
        else refs.delete(no);
      }
    }
    const list = refs.get(l.no) ?? [];
    list.unshift({ fileId: l.fileId, fileName: l.fileName, pageStart: l.pageStart, pageEnd: l.pageEnd });
    refs.set(l.no, list);
  }
  const duplicates = Array.from(refs.entries()).filter(([, list]) => list.length > 1).map(([no]) => no);
  return { refs, unmatched, duplicates };
}
