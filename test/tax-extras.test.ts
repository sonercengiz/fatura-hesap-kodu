// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseUbl } from '../src/core/xml/parseUbl';
import { FIELD_DEFS } from '../src/core/excel/template';
import type { Invoice } from '../src/core/types';
import { operatorXml } from './e2e-helpers.mjs';

const xml = readFileSync(resolve(process.cwd(), 'test/fixtures/ubl-sirket.xml'), 'utf8');
const inv = (u: ReturnType<typeof parseUbl>, over: Partial<Invoice> = {}) => ({ amount: u.payable, currency: u.currency, vatBreakdown: u.vatBreakdown, taxExtras: u.taxExtras, ...over }) as Invoice;
const val = (id: keyof typeof FIELD_DEFS, i: Invoice) => FIELD_DEFS[id].value(i, { codes: new Map() });

describe('KDV dışı vergiler, tevkifat, kur', () => {
  it('operatör faturası: ÖİV ve telsiz ücreti adıyla; KDV dışı toplam; matrah + KDV + öbür vergiler = fatura toplamı', () => {
    const u = parseUbl(operatorXml(xml));
    expect(u.taxExtras.other).toEqual([{ code: '4081', name: 'ÖİV', amount: 36.1 }, { code: '8006', name: 'Telsiz ücreti', amount: 26.98 }]);
    const i = inv(u);
    expect(val('oivTax', i)).toBe(36.1);
    expect(val('otvTax', i)).toBeNull();
    expect(val('otherTaxTotal', i)).toBe(63.08);
    expect(val('otherTaxesText', i)).toBe('ÖİV 36,10; Telsiz ücreti 26,98');
    expect(val('vatRatesText', i)).toBe('%20');
    expect(360.98 + 72.2 + 63.08).toBeCloseTo(u.taxInclusive as number, 2);
  });
  it('tevkifat ve döviz: WithholdingTaxTotal ve kur okunur; TL karşılığı ödenecek × kur', () => {
    const fx = xml
      .replace('<cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>', '<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode><cac:PricingExchangeRate><cbc:SourceCurrencyCode>USD</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>TRY</cbc:TargetCurrencyCode><cbc:CalculationRate>41.25</cbc:CalculationRate></cac:PricingExchangeRate>')
      .replace('<cac:LegalMonetaryTotal>', '<cac:WithholdingTaxTotal><cbc:TaxAmount currencyID="TRY">125.00</cbc:TaxAmount></cac:WithholdingTaxTotal><cac:LegalMonetaryTotal>');
    const u = parseUbl(fx);
    expect(u.taxExtras.withholding).toBe(125);
    expect(u.taxExtras.exchangeRate).toBe(41.25);
    expect(val('withholding', inv(u))).toBe(125);
    expect(val('amountTry', inv(u, { amount: 100, currency: 'USD' }))).toBe(4125);
    expect(val('amountTry', inv(u, { amount: 100, currency: 'TRY' }))).toBe(100);
    expect(val('amountTry', inv(u, { amount: 100, currency: 'USD', taxExtras: { other: [], withholding: null, exchangeRate: null } }))).toBeNull();
  });
  it('XML\'siz kayıtta alanlar boş', () => {
    const i = { amount: 10, currency: 'TRY', vatBreakdown: [] } as unknown as Invoice;
    expect(val('oivTax', i)).toBeNull();
    expect(val('otherTaxesText', i)).toBe('');
    expect(val('withholding', i)).toBeNull();
  });
});
