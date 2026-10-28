import { describe, it, expect } from 'vitest';
import { normalizeListColumns, DEFAULT_LIST_COLUMNS } from '../src/core/types';
import { FIELD_DEFS } from '../src/core/excel/template';

const valid = (id: string) => id in FIELD_DEFS;

describe('liste görünümü sütunları', () => {
  it('eski 15 sütunlu seçim yeni alan kimliklerine çevrilir, sıra korunur', () => {
    expect(normalizeListColumns(['no', 'supplier', 'lines', 'code', 'account', 'issues'], valid)).toEqual(['no', 'name', 'lineCount', 'code', 'accountName', 'issues']);
  });
  it('bilinmeyen, yinelenen ve boş sütun atılır; Hesap Kodu zorunlu değil; "KDV Diğer" çevrilir', () => {
    expect(normalizeListColumns(['no', 'xyz', 'no', 'blank', 'vat20Tax', 'vatOtherTax', 'vatOtherBase'], valid)).toEqual(['no', 'vat20Tax', 'vatOddTax']);
  });
  it('dizi değilse ya da hiç geçerli sütun kalmazsa varsayılan', () => {
    expect(normalizeListColumns(undefined, valid)).toEqual(DEFAULT_LIST_COLUMNS);
    expect(normalizeListColumns(['bogus'], valid)).toEqual(DEFAULT_LIST_COLUMNS);
  });
});
