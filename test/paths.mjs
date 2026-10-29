// Tarayıcı testlerinin ortak yolları (macOS ve Windows'ta aynı). Ortam değişkenleri varsayılanı ezer:
// SCRATCH (geçici çıktılar), XML_DIR (gerçek e-Fatura XML'leri; depoya girmez), DEMO_DIR (make-demo çıktısı), OUT_DIR (rehber görselleri).
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SCRATCH = process.env.SCRATCH || join(tmpdir(), 'fhk-e2e');
mkdirSync(SCRATCH, { recursive: true });
/** Varsayılan: depo, sccmac çalışma klasöründeki yerinde (`<scc>/fatura-hesap-kodu`) → `<scc>/xml fatura örnek`. */
export const XML_DIR = process.env.XML_DIR || join(ROOT, '..', 'xml fatura örnek');
export const DEMO_DIR = process.env.DEMO_DIR || join(SCRATCH, 'demo');
export const GUIDE_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'guide');
export const FIXTURES = join(ROOT, 'test', 'fixtures');
/** `'file://' + yol` Windows'ta (C:\…) bozuk adres üretir; bunu kullan. */
export const fileUrl = (p) => pathToFileURL(p).href;
