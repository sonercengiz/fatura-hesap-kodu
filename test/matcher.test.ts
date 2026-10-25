import { describe, it, expect } from 'vitest';
import { findKnownInvoiceNos, findEttns } from '../src/core/match/parse';
import { matchPdfs, applyManualLinks } from '../src/core/match/matcher';

const known = new Set(['ABC2026000000001', 'DEF2026000000002', 'GHI2026000000003']);

describe('fatura no çıkarma', () => {
  it('düz metinden bulur', () => {
    expect(findKnownInvoiceNos('Fatura No: ABC2026000000001 Tarih 30-09-2026', known)).toEqual(['ABC2026000000001']);
  });
  it('parçalanmış metinden bulur', () => {
    expect(findKnownInvoiceNos('Fatura No: ABC 2026 000000001', known)).toEqual(['ABC2026000000001']);
  });
  it('bilinmeyen numarayı almaz', () => {
    expect(findKnownInvoiceNos('XYZ2026000000001', known)).toEqual([]);
  });
  it('ETTN bulur', () => {
    expect(findEttns('ETTN: 66D373B6-0109-4C12-82C3-2EEE78669BC3')).toEqual(['66d373b6-0109-4c12-82c3-2eee78669bc3']);
  });
});

describe('PDF eşleştirme', () => {
  it('dosya adından eşler (metin olmasa bile)', () => {
    const r = matchPdfs(known, [{ fileId: 'f1', fileName: 'DEF2026000000002.pdf', pages: ['', ''] }]);
    expect(r.refs.get('DEF2026000000002')).toEqual([{ fileId: 'f1', fileName: 'DEF2026000000002.pdf', pageStart: 1, pageEnd: 2 }]);
    expect(r.unmatched).toEqual([]);
  });
  it('tek faturalı çok sayfalı dosyayı bütün olarak eşler', () => {
    const r = matchPdfs(known, [{ fileId: 'f1', fileName: 'a.pdf', pages: ['Fatura No: ABC2026000000001', 'devam sayfası', 'devam'] }]);
    expect(r.refs.get('ABC2026000000001')?.[0]).toMatchObject({ pageStart: 1, pageEnd: 3 });
  });
  it('birleştirilmiş PDF\'i segmentlere böler', () => {
    const r = matchPdfs(known, [{
      fileId: 'f1', fileName: 'toplu.pdf',
      pages: ['no ABC2026000000001', 'devam', 'no DEF2026000000002', 'no GHI2026000000003', 'devam', 'devam'],
    }]);
    expect(r.refs.get('ABC2026000000001')?.[0]).toMatchObject({ pageStart: 1, pageEnd: 2 });
    expect(r.refs.get('DEF2026000000002')?.[0]).toMatchObject({ pageStart: 3, pageEnd: 3 });
    expect(r.refs.get('GHI2026000000003')?.[0]).toMatchObject({ pageStart: 4, pageEnd: 6 });
    expect(r.duplicates).toEqual([]);
  });
  it('numarasız ve metinsiz dosyaları ayırır, tekrarı raporlar', () => {
    const r = matchPdfs(known, [
      { fileId: 'f1', fileName: 'x.pdf', pages: ['hiç numara yok'] },
      { fileId: 'f2', fileName: 'y.pdf', pages: [''] },
      { fileId: 'f3', fileName: 'z.pdf', pages: ['ABC2026000000001'] },
      { fileId: 'f4', fileName: 'w.pdf', pages: ['ABC2026000000001'] },
    ]);
    expect(r.unmatched.map((u) => u.reason)).toEqual(['no-number', 'no-text']);
    expect(r.duplicates).toEqual(['ABC2026000000001']);
  });
});

describe('elle bağlama', () => {
  it('eşleşmeyen dosyayı faturaya bağlar ve listeden düşürür', () => {
    const r = matchPdfs(known, [{ fileId: 'f1', fileName: 'x.pdf', pages: ['numara yok'] }]);
    expect(r.unmatched.length).toBe(1);
    const m = applyManualLinks(r, [{ no: 'ABC2026000000001', fileId: 'f1', fileName: 'x.pdf', pageStart: 1, pageEnd: 1 }]);
    expect(m.unmatched).toEqual([]);
    expect(m.refs.get('ABC2026000000001')).toEqual([{ fileId: 'f1', fileName: 'x.pdf', pageStart: 1, pageEnd: 1 }]);
  });
  it('yanlış otomatik eşleşmeyi düzeltir', () => {
    const r = matchPdfs(known, [{ fileId: 'f1', fileName: 'x.pdf', pages: ['ABC2026000000001'] }]);
    const m = applyManualLinks(r, [{ no: 'DEF2026000000002', fileId: 'f1', fileName: 'x.pdf', pageStart: 1, pageEnd: 1 }]);
    expect(m.refs.has('ABC2026000000001')).toBe(false);
    expect(m.refs.get('DEF2026000000002')?.[0].fileId).toBe('f1');
    expect(m.duplicates).toEqual([]);
  });
});
