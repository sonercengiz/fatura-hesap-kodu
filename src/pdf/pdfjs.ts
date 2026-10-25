import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy };

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data }).promise;
}

/** Her sayfanın metni; metin katmanı yoksa boş dize. */
export async function extractPageTexts(doc: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const parts: string[] = [];
    for (const item of tc.items) {
      if ('str' in item) {
        parts.push(item.str);
        if (item.hasEOL) parts.push('\n');
      }
    }
    out.push(parts.join(' '));
    page.cleanup();
  }
  return out;
}

const cache = new Map<string, Promise<PDFDocumentProxy>>();

export function getCachedPdf(fileId: string, blob: Blob): Promise<PDFDocumentProxy> {
  let p = cache.get(fileId);
  if (!p) {
    p = blob.arrayBuffer().then(loadPdf);
    cache.set(fileId, p);
  }
  return p;
}

export function evictPdf(fileId: string) {
  const p = cache.get(fileId);
  cache.delete(fileId);
  p?.then((d) => d.loadingTask.destroy()).catch(() => undefined);
}
