import { describe, it, expect } from 'vitest';
import { buildFileName, EDM_HEADERS } from '../src/core/excel/writeOutput';

describe('çıktı dosyası', () => {
  it('EDM başlıkları 20 sütundur', () => {
    expect(EDM_HEADERS.length).toBe(20);
    expect(EDM_HEADERS[0]).toBe('Fatura No');
    expect(EDM_HEADERS[19]).toBe('Etiket');
  });
  it('dosya adı AY YIL FİRMA FATURA biçimindedir; ay faturaların baskın ayıdır', () => {
    expect(buildFileName('Abc Ltd. Şti', [{ isoDate: '2026-09-10' }, { isoDate: '2026-09-30' }, { isoDate: '2026-10-01' }])).toBe('09 2026 ABC_LTD._ŞTİ FATURA.xlsx');
    expect(buildFileName('Abc', [], new Date(2026, 9, 25))).toBe('10 2026 ABC FATURA.xlsx');
  });
});
