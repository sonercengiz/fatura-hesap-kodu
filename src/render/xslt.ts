/**
 * Fatura görseli: XML + gömülü XSLT → HTML. Tarayıcının yerleşik XSLTProcessor'ı varsa o,
 * yoksa (Chrome XSLT'yi kaldırdığında) libxslt'nin WASM derlemesi (xslt-polyfill) kullanılır.
 */
import polyfillUrl from 'xslt-polyfill/xslt-polyfill.min.js?url';

declare global {
  interface Window {
    xsltUsePolyfillOnlyIfNeeded?: boolean;
    xsltDontAutoloadXmlDocs?: boolean;
    xsltPolyfillInstalled?: boolean;
    xsltPolyfillReady?: () => Promise<void>;
  }
}

let readyPromise: Promise<'native' | 'polyfill'> | null = null;

export function hasNativeXslt(): boolean {
  return typeof XSLTProcessor === 'function' && /\[native code\]/.test(Function.prototype.toString.call(XSLTProcessor));
}

/** XSLT motorunu hazırlar; hangi motorun kullanıldığını döndürür. */
export function ensureXslt(): Promise<'native' | 'polyfill'> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (hasNativeXslt()) return 'native';
    window.xsltUsePolyfillOnlyIfNeeded = true;
    window.xsltDontAutoloadXmlDocs = true;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = polyfillUrl;
      s.charset = 'utf-8';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('XSLT motoru yüklenemedi'));
      document.head.appendChild(s);
    });
    if (window.xsltPolyfillReady) await window.xsltPolyfillReady();
    return 'polyfill';
  })();
  readyPromise.catch(() => (readyPromise = null));
  return readyPromise;
}

export class XsltError extends Error {}

/** Dönüşümü yapar; sonucu tam HTML belgesi metni olarak döndürür. ensureXslt() tamamlanmış olmalı. */
export function transformToHtml(xmlText: string, xsltText: string): string {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new XsltError('XML okunamadı');
  const xsl = parser.parseFromString(xsltText.replace(/^﻿/, ''), 'application/xml');
  if (xsl.getElementsByTagName('parsererror').length) throw new XsltError('XSLT okunamadı');
  const proc = new XSLTProcessor();
  proc.importStylesheet(xsl);
  const res = proc.transformToDocument(xml);
  if (!res || !res.documentElement) throw new XsltError('Dönüşüm sonuç üretmedi');
  const html = new XMLSerializer().serializeToString(res);
  return /^\s*<!doctype/i.test(html) ? html : `<!DOCTYPE html>\n${html}`;
}

/** Görüntüleyici çerçevesine eklenen temel stil: kenar boşluğu, taşan görseller, bağlantılar yeni sekmede. */
const FRAME_HEAD = `<base target="_blank"><style>
html{background:#fff}
body{margin:16px auto;max-width:900px;background:#fff}
img{max-width:100%}
@media print{body{margin:0;max-width:none}}
</style>`;

export function decorateHtml(html: string): string {
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${FRAME_HEAD}`);
  if (/<html[\s>]/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${FRAME_HEAD}</head>`);
  return `<!DOCTYPE html><html><head>${FRAME_HEAD}</head><body>${html}</body></html>`;
}

/** Son N dönüşüm sonucu bellekte tutulur (gezinti geri-ileri hızlı olsun). */
const cache = new Map<string, string>();
const CACHE_MAX = 40;

export function cachedHtml(key: string): string | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}
export function rememberHtml(key: string, html: string) {
  cache.set(key, html);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}
export function forgetHtml(prefix: string) {
  for (const k of Array.from(cache.keys())) if (k.startsWith(prefix)) cache.delete(k);
}
