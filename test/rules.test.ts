import { describe, it, expect } from 'vitest';
import { matchRules, ruleMatches, normText, normPattern, validateRule, parseRulesFile, type Rule } from '../src/core/rules';

const mk = (kind: Rule['kind'], pattern: string, code: string, updatedAt = 1, enabled = true): Rule => ({ id: pattern, firmId: 'f', kind, pattern, code, enabled, createdAt: 1, updatedAt });
const t = { supplierVkn: '1234567801', supplierName: 'GÜNEŞ TEMİZLİK HİZMETLERİ LTD. ŞTİ.', itemText: 'ofis temizliği | cam silme' };

describe('otomatik atama kuralları', () => {
  it('normalize: Türkçe küçük harf ve boşluk', () => {
    expect(normText('  GÜNEŞ   Temİzlik ')).toBe('güneş temizlik');
    expect(normPattern('vkn', '123 456 78-01')).toBe('1234567801');
  });
  it('türlere göre eşleşme', () => {
    expect(ruleMatches(mk('vkn', '1234567801', 'x'), t)).toBe(true);
    expect(ruleMatches(mk('vkn', '1234567802', 'x'), t)).toBe(false);
    expect(ruleMatches(mk('name', 'güneş temizlik', 'x'), t)).toBe(true);
    expect(ruleMatches(mk('name', 'GÜNEŞ', 'x'), t)).toBe(true);
    expect(ruleMatches(mk('name', 'ay temizlik', 'x'), t)).toBe(false);
    expect(ruleMatches(mk('item', 'Cam Silme', 'x'), t)).toBe(true);
    expect(ruleMatches(mk('item', 'halı', 'x'), t)).toBe(false);
    expect(ruleMatches(mk('name', '', 'x'), t)).toBe(false);
  });
  it('öncelik: VKN > unvan > kalem; aynı türde en yeni; kapalı kural sayılmaz', () => {
    const rules = [mk('item', 'cam', '770.03', 9), mk('name', 'güneş', '770.02', 5), mk('vkn', '1234567801', '770.01', 1)];
    expect(matchRules(t, rules)?.code).toBe('770.01');
    expect(matchRules(t, rules.slice(0, 2))?.code).toBe('770.02');
    expect(matchRules(t, [mk('name', 'güneş', 'eski', 1), mk('name', 'temizlik', 'yeni', 2)])?.code).toBe('yeni');
    expect(matchRules(t, [mk('vkn', '1234567801', 'x', 1, false)])).toBeNull();
    expect(matchRules({ supplierVkn: '9', supplierName: 'Başka', itemText: '' }, rules)).toBeNull();
  });
  it('doğrulama', () => {
    expect(validateRule('vkn', '123', '770')).toMatch(/rakam/);
    expect(validateRule('vkn', '1234567801', '')).toMatch(/boş/);
    expect(validateRule('name', 'ab', '770')).toMatch(/3 karakter/);
    expect(validateRule('name', 'güneş', '770')).toBeNull();
    expect(validateRule('vkn', '12345678901', '770')).toBeNull();
  });
  it('kural dosyası okuma', () => {
    const f = parseRulesFile(JSON.stringify({ app: 'fatura-hesap-kodu', kind: 'rules', version: 1, firmName: 'ABC', rules: [{ kind: 'vkn', pattern: '1234567801', code: '770.01' }, { kind: 'bogus', pattern: 'x', code: 'y' }, { kind: 'item', pattern: 'kağıt', code: '770.02', enabled: false }] }));
    expect(f.firmName).toBe('ABC');
    expect(f.rules).toEqual([{ kind: 'vkn', pattern: '1234567801', code: '770.01', enabled: true }, { kind: 'item', pattern: 'kağıt', code: '770.02', enabled: false }]);
    expect(() => parseRulesFile('{}')).toThrow(/kural dosyası değil/);
    expect(() => parseRulesFile('x')).toThrow(/JSON/);
  });
});
