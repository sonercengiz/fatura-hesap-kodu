/**
 * Ekrana uyum: arayüz ölçeği, yerleşim yoğunluğu ve üst çubuk taşması için saf hesaplar.
 * Muhasebe bürolarındaki ekranlar çok çeşitli (eski kare 1024×768 / 1280×1024, %125 ölçekli dizüstüler, geniş monitörler);
 * tek bir sabit tasarım yerine pencere ölçüsünden türetilen kararlar kullanılır. Kullanıcı Ayarlar › Ekran'dan ezer.
 */

/** Seçilebilir arayüz ölçekleri (CSS zoom); %85 altı eski düşük yoğunluklu ekranlarda okunmaz */
export const SCALE_STEPS = [0.85, 0.9, 1, 1.1, 1.25, 1.5] as const;

/** Yerleşim "rahat" (geniş ekran) ya da "sıkışık" (kısayollar tek sıra, panel bilgileri iki sütun, dar panel) */
export type Density = 'comfortable' | 'compact';

/** Hedef çalışma alanı: bu CSS piksel ölçüsünün altındaki pencerelerde arayüz küçültülür */
export const TARGET_W = 1280;
export const TARGET_H = 760;
export const MIN_AUTO_SCALE = 0.85;

/**
 * Kendiliğinden ölçek: pencere hedef alandan küçükse arayüz küçültülür (en çok %15), büyükse %100 kalır.
 * 0,05 adımlarına yuvarlanır ki küçük pencere oynamalarında ölçek titremesin.
 */
export function autoUiScale(winW: number, winH: number): number {
  if (!(winW > 0) || !(winH > 0)) return 1;
  const raw = Math.min(1, winW / TARGET_W, winH / TARGET_H);
  const stepped = Math.floor(raw * 20 + 1e-9) / 20;
  return Math.max(MIN_AUTO_SCALE, Math.min(1, stepped));
}

/** Etkin (ölçek uygulanmış) alan 1280 genişlik ya da 860 yükseklikten darsa sıkışık yerleşim (liste en az 6 satır görsün) */
export function autoDensity(effW: number, effH: number): Density {
  return effW < 1280 || effH < 860 ? 'compact' : 'comfortable';
}

/** Etkin alan: pencere ölçüsü / ölçek (zoom arttıkça kullanılabilir CSS alanı azalır) */
export function effectiveSize(winW: number, winH: number, scale: number): { w: number; h: number } {
  const s = scale > 0 ? scale : 1;
  return { w: Math.round(winW / s), h: Math.round(winH / s) };
}

/** Etkin genişlik eşikleri: dar → durum kartları gizlenir; yığılı → panel görüntünün altına iner */
export const NARROW_W = 1200;
export const STACKED_W = 860;

/** Liste paneli genişliği: kullanıcı sürüklemediyse yoğunluğa göre; her durumda 240 px ile pencerenin yarısı arasında */
export function clampPanelWidth(w: number | null, density: Density, effW: number): number {
  const base = w ?? (density === 'compact' ? 320 : 400);
  const max = Math.max(240, Math.floor(effW * 0.5));
  return Math.max(240, Math.min(max, Math.round(base)));
}

/**
 * Üst çubuk taşması: öğeler sığmıyorsa en az önemli olandan başlayarak ⋯ menüsüne alınır.
 * @param widths  her öğenin genişliği (boşluk dahil), görüntü sırasında
 * @param dropOrder  menüye alınma sırası (önce gidecek önce); burada olmayanlar hiç gizlenmez
 * @param overflow  sığmayan piksel (scrollWidth − clientWidth); ≤ 0 ise hiçbir şey gizlenmez
 * @param menuW  ⋯ düğmesinin genişliği (boşluk dahil); bir şey gizlenecekse yer ayrılır
 * @returns gizlenecek öğe indeksleri (dropOrder sırasıyla)
 */
export function overflowItems(widths: number[], dropOrder: number[], overflow: number, menuW: number): number[] {
  if (overflow <= 0) return [];
  let need = overflow + menuW;
  const hidden: number[] = [];
  for (const i of dropOrder) {
    if (need <= 0) break;
    const w = widths[i] ?? 0;
    hidden.push(i);
    need -= w;
  }
  return hidden;
}

/** Ekran bilgisi metni: "1366 × 768 · Windows yazı ölçeği %125 · pencere 1093 × 614" */
export function describeScreen(info: { screenW: number; screenH: number; dpr: number; winW: number; winH: number }): string {
  const { screenW, screenH, dpr, winW, winH } = info;
  const phys = `${Math.round(screenW * dpr)} × ${Math.round(screenH * dpr)}`;
  const pct = Math.round(dpr * 100);
  const scaleTxt = Math.abs(dpr - 1) < 0.01 ? 'ölçek %100' : `Windows / tarayıcı ölçeği %${pct}`;
  return `${phys} piksel · ${scaleTxt} · pencere ${winW} × ${winH}`;
}
