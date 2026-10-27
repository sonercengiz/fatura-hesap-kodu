import { describe, it, expect } from 'vitest';
import { autoUiScale, autoDensity, effectiveSize, overflowItems, clampPanelWidth, describeScreen } from '../src/core/layout';

describe('arayüz ölçeği (kendiliğinden)', () => {
  it('geniş pencerede %100', () => { expect(autoUiScale(1920, 1080)).toBe(1); expect(autoUiScale(1440, 900)).toBe(1); });
  it('1366×768 dizüstü: yükseklik 760 hedefini karşılar → %100', () => { expect(autoUiScale(1366, 768)).toBe(1); });
  it('eski kare 1024×768: genişlikten %80 çıkar, tabana %85 vurur', () => { expect(autoUiScale(1024, 768)).toBe(0.85); });
  it('%125 Windows ölçeğinde 1366×768 (pencere 1093×614): %85', () => { expect(autoUiScale(1093, 614)).toBe(0.85); });
  it('1280×1024 kare: tam %100', () => { expect(autoUiScale(1280, 1024)).toBe(1); });
  it('1200×900: 0,9375 → 0,05 adımına aşağı yuvarlanır %90', () => { expect(autoUiScale(1200, 900)).toBe(0.9); });
  it('geçersiz ölçüde %100', () => { expect(autoUiScale(0, 0)).toBe(1); expect(autoUiScale(NaN, 700)).toBe(1); });
});

describe('yoğunluk ve etkin alan', () => {
  it('ölçek etkin alanı büyütür', () => { expect(effectiveSize(1024, 768, 0.85)).toEqual({ w: 1205, h: 904 }); expect(effectiveSize(1000, 700, 0)).toEqual({ w: 1000, h: 700 }); });
  it('1366×768 %100: yükseklik kısa → sıkışık', () => { expect(autoDensity(1366, 768)).toBe('compact'); });
  it('1280×1024 ve 1440×900: rahat', () => { expect(autoDensity(1280, 1024)).toBe('comfortable'); expect(autoDensity(1440, 900)).toBe('comfortable'); });
  it('1422×800 (1280×720 %150 ölçekli, %90 küçültülmüş): kısa → sıkışık', () => { expect(autoDensity(1422, 800)).toBe('compact'); });
  it('1205×904 (1024×768 ölçeklenmiş): genişlik dar → sıkışık', () => { expect(autoDensity(1205, 904)).toBe('compact'); });
});

describe('liste paneli genişliği', () => {
  it('varsayılan yoğunluğa göre', () => { expect(clampPanelWidth(null, 'comfortable', 1400)).toBe(400); expect(clampPanelWidth(null, 'compact', 1200)).toBe(320); });
  it('240 ile pencerenin yarısı arasında', () => { expect(clampPanelWidth(100, 'compact', 1200)).toBe(240); expect(clampPanelWidth(900, 'compact', 1200)).toBe(600); expect(clampPanelWidth(350, 'compact', 1200)).toBe(350); });
});

describe('üst çubuk taşması', () => {
  const widths = [60, 50, 70, 80, 40]; // görüntü sırası
  const drop = [4, 1, 0, 2, 3]; // önce 4 gider
  it('sığıyorsa hiçbir şey gizlenmez', () => { expect(overflowItems(widths, drop, 0, 30)).toEqual([]); expect(overflowItems(widths, drop, -5, 30)).toEqual([]); });
  it('menü düğmesine yer ayırarak en az önemliden başlar', () => { expect(overflowItems(widths, drop, 10, 30)).toEqual([4]); /* 40 ≥ 10+30 */ });
  it('gerektiği kadar öğe alır', () => { expect(overflowItems(widths, drop, 70, 30)).toEqual([4, 1, 0]); /* 40+50 < 100 → +60 */ });
  it('listede olmayanlar hiç gizlenmez', () => { expect(overflowItems(widths, [4], 500, 30)).toEqual([4]); });
});

describe('ekran metni', () => {
  it('fiziksel piksel ve ölçek', () => {
    expect(describeScreen({ screenW: 1093, screenH: 614, dpr: 1.25, winW: 1093, winH: 614 })).toBe('1366 × 768 piksel · Windows / tarayıcı ölçeği %125 · pencere 1093 × 614');
    expect(describeScreen({ screenW: 1280, screenH: 1024, dpr: 1, winW: 1280, winH: 900 })).toBe('1280 × 1024 piksel · ölçek %100 · pencere 1280 × 900');
  });
});
