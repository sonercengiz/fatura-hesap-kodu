import { describe, it, expect } from 'vitest';
import { matchRules, matchPermanent, activeRules, ruleMatches, normText, validateRule, validateCond, parseRulesFile, upgradeRule, ruleKey, ruleLabel, condLabel, beats, toRate, type Rule, type Cond, type RuleTarget } from '../src/core/rules';

let seq = 0;
const mk = (conds: Cond[], code: string, updatedAt = 1, enabled = true, batchId: string | null = null): Rule => ({ id: `r${++seq}`, firmId: 'f', batchId, conds, code, enabled, createdAt: 1, updatedAt });
const one = (kind: Cond['kind'], text: string, code: string, updatedAt = 1, enabled = true, batchId: string | null = null) => mk([{ kind, text }], code, updatedAt, enabled, batchId);

const t: RuleTarget = {
  supplierVkn: '1234567801', supplierName: 'GÜNEŞ TEMİZLİK HİZMETLERİ LTD. ŞTİ.', itemText: 'ofis temizliği | cam silme', typeCode: 'SATIS', amount: 12000, vatRates: [20],
  lines: [{ name: 'ofis temizliği', qty: 4, unit: 'C62', vat: 20 }, { name: 'cam silme', qty: 1, unit: 'C62', vat: 20 }],
};
const gida: RuleTarget = {
  supplierVkn: '6780000006', supplierName: 'LEZZET GIDA TOPTAN LTD. ŞTİ.', itemText: 'yumurta 30 lu | çay 1 kg', typeCode: 'SATIS', amount: 1500, vatRates: [1, 10],
  lines: [{ name: 'yumurta 30 lu', qty: 2, unit: 'C62', vat: 10 }, { name: 'çay 1 kg', qty: 20, unit: 'KGM', vat: 1 }],
};
const gidaToptan: RuleTarget = { ...gida, amount: 90000, lines: [{ name: 'yumurta', qty: 3000, unit: 'C62', vat: 10 }], itemText: 'yumurta' };

describe('otomatik atama kuralları (çok koşullu)', () => {
  it('normalize ve oran', () => {
    expect(normText('  GÜNEŞ   Temİzlik ')).toBe('güneş temizlik');
    expect(normText('ENERJI TÜK. BED.')).toBe('enerji tük. bed.'); // noktasız I da i olur
    expect(toRate('%10')).toBe(10); expect(toRate('10,00')).toBe(10); expect(toRate('x')).toBeNull(); expect(toRate('101')).toBeNull();
  });
  it('tek koşullu eşleşmeler (eski davranış korunur)', () => {
    expect(ruleMatches(one('vkn', '123 456 78-01', 'x'), t)).toBe(true);
    expect(ruleMatches(one('vkn', '1234567802', 'x'), t)).toBe(false);
    expect(ruleMatches(one('name', 'güneş temizlik', 'x'), t)).toBe(true);
    expect(ruleMatches(one('name', 'ay temizlik', 'x'), t)).toBe(false);
    expect(ruleMatches(one('item', 'Cam Silme', 'x'), t)).toBe(true);
    expect(ruleMatches(one('item', 'halı', 'x'), t)).toBe(false);
    expect(ruleMatches(one('item', 'enerji', 'x'), { ...t, itemText: 'enerjı tük. bed.', lines: [{ name: 'enerjı tük. bed.', qty: 841.6, unit: 'KWH', vat: 20 }] })).toBe(true);
    expect(ruleMatches(one('name', 'ILETISIM', 'x'), { ...t, supplierName: 'CEPTAŞ İLETİŞİM' })).toBe(false); // ş ≠ s; yalnızca ı/i katlanır
    expect(ruleMatches(one('name', 'iletişim', 'x'), { ...t, supplierName: 'CEPTAŞ ILETIŞIM' })).toBe(true);
    expect(ruleMatches(one('name', '', 'x'), t)).toBe(false);
    expect(ruleMatches(mk([], 'x'), t)).toBe(false);
  });
  it('yeni koşullar: KDV oranı, fatura tipi, tutar aralığı', () => {
    expect(ruleMatches(one('vat', '10', 'x'), gida)).toBe(true);
    expect(ruleMatches(one('vat', '%1', 'x'), gida)).toBe(true);
    expect(ruleMatches(one('vat', '20', 'x'), gida)).toBe(false);
    expect(ruleMatches(one('type', 'satis', 'x'), t)).toBe(true);
    expect(ruleMatches(one('type', 'IADE', 'x'), t)).toBe(false);
    expect(ruleMatches(mk([{ kind: 'amount', min: 10000, max: null }], 'x'), t)).toBe(true);
    expect(ruleMatches(mk([{ kind: 'amount', min: null, max: 5000 }], 'x'), t)).toBe(false);
    expect(ruleMatches(mk([{ kind: 'amount', min: 1000, max: 2000 }], 'x'), gida)).toBe(true);
    expect(ruleMatches(mk([{ kind: 'amount', min: 1, max: 2 }], 'x'), { ...gida, amount: null })).toBe(false);
  });
  it('miktar aralığı kalemle birlikte: 30 yumurta ikram, 3000 yumurta ticari mal', () => {
    const ikram = mk([{ kind: 'item', text: 'yumurta' }, { kind: 'qty', min: null, max: 999 }], '770.09');
    const ticari = mk([{ kind: 'item', text: 'yumurta' }, { kind: 'qty', min: 1000, max: null }], '153');
    expect(ruleMatches(ikram, gida)).toBe(true); expect(ruleMatches(ticari, gida)).toBe(false);
    expect(ruleMatches(ikram, gidaToptan)).toBe(false); expect(ruleMatches(ticari, gidaToptan)).toBe(true);
    // miktar, aynı kuraldaki kalemde aranır: çay 20 kg, yumurta 2 → "yumurta + miktar 10–50" tutmaz
    expect(ruleMatches(mk([{ kind: 'item', text: 'yumurta' }, { kind: 'qty', min: 10, max: 50 }], 'x'), gida)).toBe(false);
    // kalem koşulu yoksa herhangi bir kalem yeter
    expect(ruleMatches(mk([{ kind: 'qty', min: 10, max: 50 }], 'x'), gida)).toBe(true);
    // kalem bilgisi olmayan (listeden gelen) kayıt: ad birleşik metinden, miktar eşleşmez
    const noLines: RuleTarget = { ...gida, lines: [] };
    expect(ruleMatches(one('item', 'yumurta', 'x'), noLines)).toBe(true);
    expect(ruleMatches(mk([{ kind: 'qty', min: 1, max: 5 }], 'x'), noLines)).toBe(false);
  });
  it('birim fiyat, kalem tutarı ve tarih: demirbaş sınırı ve dönem içi tarih', () => {
    const ofis: RuleTarget = { supplierVkn: '1', supplierName: 'TEKNO A.Ş.', itemText: 'dizüstü bilgisayar | kablosuz fare', typeCode: 'SATIS', amount: 30000, vatRates: [20], isoDate: '2026-09-22',
      lines: [{ name: 'dizüstü bilgisayar', qty: 1, unit: 'C62', vat: 20, price: 24000, amount: 24000 }, { name: 'kablosuz fare', qty: 2, unit: 'C62', vat: 20, price: 500, amount: 1000 }] };
    const demirbas = mk([{ kind: 'price', min: 9900, max: null }], '255');
    const gider = mk([{ kind: 'item', text: 'fare' }, { kind: 'price', min: null, max: 9899 }], '770');
    expect(ruleMatches(demirbas, ofis)).toBe(true);
    expect(ruleMatches(gider, ofis)).toBe(true);
    expect(ruleMatches(mk([{ kind: 'item', text: 'bilgisayar' }, { kind: 'price', min: null, max: 9899 }], 'x'), ofis)).toBe(false); // fiyat aynı kalemde aranır
    expect(ruleMatches(mk([{ kind: 'lineAmount', min: 20000, max: null }], 'x'), ofis)).toBe(true);
    expect(ruleMatches(mk([{ kind: 'lineAmount', min: 2000, max: 5000 }], 'x'), ofis)).toBe(false);
    expect(ruleMatches(mk([{ kind: 'date', from: '2026-09-22', to: '2026-09-22' }], 'x'), ofis)).toBe(true);
    expect(ruleMatches(mk([{ kind: 'date', from: '2026-09-23' }], 'x'), ofis)).toBe(false);
    expect(ruleMatches(mk([{ kind: 'date', to: '2026-09-30' }], 'x'), { ...ofis, isoDate: '' })).toBe(false);
    expect(ruleMatches(mk([{ kind: 'price', min: 1, max: null }], 'x'), { ...ofis, lines: [{ name: 'x', qty: 1, unit: '', vat: null }] })).toBe(false); // eski kayıt: fiyat yok
    expect(condLabel({ kind: 'price', min: 9900, max: null })).toBe('birim fiyat ≥ 9.900 ₺');
    expect(condLabel({ kind: 'price', min: 0.125, max: null })).toBe('birim fiyat ≥ 0,125 ₺'); // kutudaki gibi 3 ondalık, 0,13'e yuvarlanmaz
    expect(condLabel({ kind: 'date', from: '2026-09-22', to: '2026-09-22' })).toBe('tarih 22.09.2026');
    expect(condLabel({ kind: 'date', from: '2026-09-01', to: '2026-09-30' })).toBe('tarih 01.09.2026–30.09.2026');
    expect(validateCond({ kind: 'date' })).toMatch(/başlangıç/);
    expect(validateCond({ kind: 'date', from: '2026-10-01', to: '2026-09-01' })).toMatch(/sonra olamaz/);
    expect(validateCond({ kind: 'date', from: '2026-09-22' })).toBeNull();
    expect(ruleKey([{ kind: 'date', from: '2026-09-22', to: '' }])).toBe(ruleKey([{ kind: 'date', from: '2026-09-22' }]));
  });
  it('VE: koşulların hepsi tutmalı (sayı sınırı yok)', () => {
    const r = mk([{ kind: 'name', text: 'abc kırtasiye' }, { kind: 'item', text: 'klasör' }, { kind: 'vat', text: '20' }, { kind: 'amount', min: 100, max: 50000 }], '543');
    const abc: RuleTarget = { supplierVkn: '1', supplierName: 'ABC KIRTASİYE A.Ş.', itemText: 'klasör geniş sırt', typeCode: 'SATIS', amount: 1632, vatRates: [20], lines: [{ name: 'klasör geniş sırt', qty: 24, unit: 'C62', vat: 20 }] };
    expect(ruleMatches(r, abc)).toBe(true);
    expect(ruleMatches(r, { ...abc, vatRates: [10] })).toBe(false);
    expect(ruleMatches(r, { ...abc, lines: [{ name: 'kalem', qty: 1, unit: '', vat: 20 }], itemText: 'kalem' })).toBe(false);
  });
  it('öncelik: dönem › daha çok koşul › VKN › unvan › kalem …; aynı düzeyde en yeni; kapalı sayılmaz', () => {
    const vkn = one('vkn', '1234567801', '770.01', 1);
    const name = one('name', 'güneş', '770.02', 5);
    const item = one('item', 'cam', '770.03', 9);
    expect(matchRules(t, [item, name, vkn])?.code).toBe('770.01');
    expect(matchRules(t, [item, name])?.code).toBe('770.02');
    const specific = mk([{ kind: 'item', text: 'cam' }, { kind: 'amount', min: 10000, max: null }], '770.05', 1);
    expect(matchRules(t, [vkn, specific])?.code).toBe('770.05'); // iki koşul tek VKN'yi geçer
    expect(beats(specific, vkn)).toBe(true);
    expect(matchRules(t, [one('name', 'güneş', 'eski', 1), one('name', 'temizlik', 'yeni', 2)])?.code).toBe('yeni');
    expect(matchRules(t, [one('vkn', '1234567801', 'x', 1, false)])).toBeNull();
    expect(matchRules({ supplierVkn: '9', supplierName: 'Başka', itemText: '' }, [vkn, name, item])).toBeNull();
  });
  it('kapsam: dönem kuralı kalıcının önüne geçer, başka dönemde sayılmaz', () => {
    const perm = one('vkn', '1234567801', '770.01', 9);
    const month = one('name', 'güneş', '740.01', 1, true, 'b-eylul');
    const other = one('vkn', '1234567801', '999', 9, true, 'b-ekim');
    const all = [perm, month, other];
    expect(matchRules(t, all, 'b-eylul')?.code).toBe('740.01');
    expect(matchRules(t, all, 'b-ekim')?.code).toBe('999');
    expect(matchRules(t, all, 'b-kasim')?.code).toBe('770.01');
    expect(matchPermanent(t, all)?.code).toBe('770.01');
    expect(activeRules(all, 'b-eylul').map((r) => r.code)).toEqual(['770.01', '740.01']);
  });
  it('doğrulama', () => {
    expect(validateRule([{ kind: 'vkn', text: '123' }], '770')).toMatch(/rakam/);
    expect(validateRule([{ kind: 'vkn', text: '1234567801' }], '')).toMatch(/boş/);
    expect(validateRule([], '770')).toMatch(/En az bir/);
    expect(validateRule([{ kind: 'name', text: 'ab' }], '770')).toMatch(/3 karakter/);
    expect(validateCond({ kind: 'vat', text: 'abc' })).toMatch(/0–100/);
    expect(validateCond({ kind: 'qty', min: null, max: null })).toMatch(/sınır/);
    expect(validateCond({ kind: 'qty', min: 10, max: 5 })).toMatch(/büyük olamaz/);
    expect(validateCond({ kind: 'amount', min: null, max: 500 })).toBeNull();
    expect(validateRule([{ kind: 'vkn', text: '1234567801' }, { kind: 'vkn', text: '1234567801' }], '770')).toMatch(/iki kez/);
    expect(validateRule([{ kind: 'item', text: 'abc' }, { kind: 'item', text: 'def' }, { kind: 'item', text: 'ghi' }, { kind: 'vat', text: '10' }, { kind: 'qty', min: 1, max: null }, { kind: 'amount', min: 1, max: null }], '770')).toBeNull(); // koşul sayısı sınırsız
    expect(validateRule([{ kind: 'name', text: 'güneş' }, { kind: 'qty', min: 1, max: null }], '770')).toBeNull();
  });
  it('etiket ve anahtar', () => {
    expect(condLabel({ kind: 'qty', min: 1, max: 1000 })).toBe('miktar 1–1.000');
    expect(condLabel({ kind: 'qty', min: 1000, max: null })).toBe('miktar ≥ 1.000');
    expect(condLabel({ kind: 'amount', min: null, max: 10000 })).toBe('tutar ≤ 10.000 ₺');
    expect(condLabel({ kind: 'vat', text: '%10' })).toBe('KDV %10');
    expect(condLabel({ kind: 'type', text: 'iade' })).toBe('tip İade');
    expect(ruleLabel({ conds: [{ kind: 'name', text: 'ABC' }, { kind: 'item', text: 'klasör' }] })).toBe('unvan "ABC" + kalem "klasör"');
    expect(ruleKey([{ kind: 'item', text: ' Klasör ' }, { kind: 'vkn', text: '123-456-7801' }])).toBe(ruleKey([{ kind: 'vkn', text: '1234567801' }, { kind: 'item', text: 'klasör' }]));
  });
  it('eski tek belirteçli kayıt ve dosya biçimi okunur', () => {
    expect(upgradeRule({ kind: 'vkn', pattern: '123 456 7801', code: ' 770.01 ', enabled: true })).toMatchObject({ conds: [{ kind: 'vkn', text: '1234567801' }], code: '770.01', enabled: true });
    expect(upgradeRule({ kind: 'bogus', pattern: 'x', code: 'y' })).toBeNull();
    expect(upgradeRule({ conds: [{ kind: 'qty', min: 1, max: 5 }, { kind: 'nope' }], code: '1' })?.conds).toEqual([{ kind: 'qty', min: 1, max: 5 }]);
    const v1 = parseRulesFile(JSON.stringify({ app: 'fatura-hesap-kodu', kind: 'rules', version: 1, firmName: 'ABC', rules: [{ kind: 'vkn', pattern: '1234567801', code: '770.01' }, { kind: 'bogus', pattern: 'x', code: 'y' }, { kind: 'item', pattern: 'kağıt', code: '770.02', enabled: false }] }));
    expect(v1.firmName).toBe('ABC');
    expect(v1.rules).toEqual([{ conds: [{ kind: 'vkn', text: '1234567801' }], code: '770.01', enabled: true }, { conds: [{ kind: 'item', text: 'kağıt' }], code: '770.02', enabled: false }]);
    const v2 = parseRulesFile(JSON.stringify({ app: 'fatura-hesap-kodu', kind: 'rules', version: 2, rules: [{ conds: [{ kind: 'item', text: 'yumurta' }, { kind: 'qty', min: 1000 }], code: '153' }, { conds: [{ kind: 'vkn', text: '12' }], code: '1' }] }));
    expect(v2.rules).toEqual([{ conds: [{ kind: 'item', text: 'yumurta' }, { kind: 'qty', min: 1000, max: null }], code: '153', enabled: true }]); // geçersiz VKN'li kural atlanır
    expect(() => parseRulesFile('{}')).toThrow(/kural dosyası değil/);
    expect(() => parseRulesFile('x')).toThrow(/JSON/);
  });
});
