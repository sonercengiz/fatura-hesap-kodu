import { signal, computed } from '@preact/signals';
import { autoUiScale, autoDensity, effectiveSize, clampPanelWidth, NARROW_W, STACKED_W, type Density } from '../../core/layout';

/**
 * Ekran tercihleri BU BİLGİSAYARA özgüdür (localStorage): yedek dosyasına girmez, başka makineye taşınmaz.
 * null / 'auto' = pencere ölçüsünden kendiliğinden.
 */
export interface ScreenPrefs { uiScale: number | null; density: 'auto' | Density; panelW: number | null }

const KEY = 'screenPrefs';
const DEFAULT_PREFS: ScreenPrefs = { uiScale: null, density: 'auto', panelW: null };

function loadPrefs(): ScreenPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<ScreenPrefs>;
    return {
      uiScale: typeof p.uiScale === 'number' && p.uiScale > 0.5 && p.uiScale < 3 ? p.uiScale : null,
      density: p.density === 'compact' || p.density === 'comfortable' ? p.density : 'auto',
      panelW: typeof p.panelW === 'number' && p.panelW > 0 ? p.panelW : null,
    };
  } catch { return DEFAULT_PREFS; }
}

export const screenPrefs = signal<ScreenPrefs>(loadPrefs());

export function setScreenPrefs(patch: Partial<ScreenPrefs>) {
  screenPrefs.value = { ...screenPrefs.value, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(screenPrefs.value)); } catch { /* yok say */ }
}

const hasWin = typeof window !== 'undefined';

/** Pencere ölçüsü (CSS px) ve ekran bilgisi; yeniden boyutlandırma / tarayıcı yakınlaştırmasıyla güncellenir */
export const winSize = signal({ w: hasWin ? window.innerWidth : 1280, h: hasWin ? window.innerHeight : 800 });
export const screenInfo = signal({ screenW: hasWin ? screen.width : 0, screenH: hasWin ? screen.height : 0, dpr: hasWin ? window.devicePixelRatio || 1 : 1 });

if (hasWin) {
  const refresh = () => {
    winSize.value = { w: window.innerWidth, h: window.innerHeight };
    screenInfo.value = { screenW: screen.width, screenH: screen.height, dpr: window.devicePixelRatio || 1 };
  };
  window.addEventListener('resize', refresh);
  // Tarayıcı yakınlaştırması (Ctrl +/−) resize de tetikler; yine de piksel oranı için ayrıca dinle
  try { matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', refresh, { once: true }); } catch { /* yok say */ }
}

/** Kendiliğinden ölçek (kullanıcı seçmediyse) */
export const autoScale = computed(() => autoUiScale(winSize.value.w, winSize.value.h));

/** Uygulanan arayüz ölçeği (CSS zoom, kök öğede) */
export const uiScale = computed(() => screenPrefs.value.uiScale ?? autoScale.value);

/** Ölçek sonrası kullanılabilir alan (CSS px) */
export const effSize = computed(() => effectiveSize(winSize.value.w, winSize.value.h, uiScale.value));

export const autoDens = computed<Density>(() => autoDensity(effSize.value.w, effSize.value.h));

export const density = computed<Density>(() => (screenPrefs.value.density === 'auto' ? autoDens.value : screenPrefs.value.density));

/** Dar: durum kartları gizlenir. Yığılı: liste paneli görüntünün altına iner. */
export const narrow = computed(() => effSize.value.w < NARROW_W);
export const stacked = computed(() => effSize.value.w < STACKED_W);

/** Liste paneli genişliği (CSS px) */
export const panelW = computed(() => clampPanelWidth(screenPrefs.value.panelW, density.value, effSize.value.w));

export const PANEL_DEFAULT = (d: Density) => (d === 'compact' ? 320 : 400);
