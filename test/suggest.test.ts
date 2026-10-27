import { describe, it, expect } from 'vitest';
import { supplierHint, completeCode } from '../src/core/suggest/engine';

const now = Date.now();
const history = [
  { vkn: '111', code: '770.01', count: 2, lastUsed: now },
  { vkn: '222', code: '770.01', count: 2, lastUsed: now },
  { vkn: '111', code: '760.02', count: 1, lastUsed: now },
  { vkn: '333', code: '153', count: 5, lastUsed: now - 1000 },
  { vkn: '444', code: '770.05', count: 3, lastUsed: now },
];

describe('satıcı ipucu', () => {
  it('satıcıya en çok verilen kodu döner', () => {
    expect(supplierHint(history, '111')).toEqual({ code: '770.01', count: 2 });
    expect(supplierHint(history, '999')).toBeNull();
  });
  it('tamamlama', () => {
    expect(completeCode('60', ['600.001', '601.02', '153', '760'])).toEqual(['600.001', '601.02', '760']);
  });
});
