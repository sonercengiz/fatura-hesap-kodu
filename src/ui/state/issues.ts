import { signal } from '@preact/signals';
import type { Invoice } from '../../core/types';
import { amountGaps, usesVat, vatGroupOf, CURRENT_VAT_RATES, type ExpandedTemplate } from '../../core/excel/template';
import { fmtMoney } from '../../core/num';
import { assignments, accounts, accountMap, outputTemplate } from './core';

/** Uyarı türleri; her biri bir seviyede (renk) ve önizlemede ilgili hücreleri tonlar */
export type IssueKind = 'no-code' | 'not-in-chart' | 'type' | 'amount-gap' | 'vat-derived' | 'payable-diff' | 'no-view';
/** high: kod eksik/yanlış · medium: tutar Excel'e eksik/farklı girer · low: kontrol edin */
export type IssueLevel = 'high' | 'medium' | 'low';
export const LEVEL_RANK: Record<IssueLevel, number> = { high: 3, medium: 2, low: 1 };

/** Ödenecek tutar vergiler dahil fatura toplamından farklı (yuvarlama, önceki dönem borcu) */
export const payableDiffers = (inv: Invoice) => inv.amount !== null && inv.taxInclusive !== null && Math.abs(inv.amount - inv.taxInclusive) >= 0.005;

/** Açılmış şablonda bir alanın sütunları */
const colsOf = (e: ExpandedTemplate, ids: string[]) => e.columns.map((c, k) => (ids.includes(c.id) ? k : -1)).filter((k) => k >= 0);
const sameRate = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Türetilen matrahın tonlanacağı sütunlar: o oranın matrah/KDV'si; güncel olmayan oran Diğer'de, Toplam'da toplam sütunları */
function derivedCells(inv: Invoice, e: ExpandedTemplate): number[] {
  const out = new Set<number>();
  for (const p of inv.vatBreakdown) {
    if (!p.derived || p.rate === null) continue;
    const g = String(p.rate).replace('.', '-');
    e.columns.forEach((c, k) => { if (vatGroupOf(c) === g) out.add(k); });
    if (!CURRENT_VAT_RATES.some((r) => sameRate(r, p.rate as number))) colsOf(e, ['vatRestBase', 'vatRestTax']).forEach((k) => out.add(k));
    colsOf(e, ['vatBaseTotal', 'vatTotal']).forEach((k) => out.add(k));
  }
  return [...out];
}

export const ISSUE_META: Record<IssueKind, { level: IssueLevel; label: string; short?: string; cells: (inv: Invoice, e: ExpandedTemplate) => number[] }> = {
  'no-code': { level: 'high', label: 'Hesap kodu atanmamış', cells: (_i, e) => colsOf(e, ['code']) },
  'not-in-chart': { level: 'high', label: 'Kod hesap kodu listesinde yok', cells: (_i, e) => colsOf(e, ['code']) },
  'amount-gap': { level: 'medium', label: 'Tutar bilgisi Excel\'e girmiyor', cells: (_i, e) => colsOf(e, ['amount']) },
  'payable-diff': { level: 'medium', label: 'Ödenecek tutar fatura toplamından farklı (yuvarlama ya da önceki dönem borcu)', short: 'Ödenecek ≠ fatura toplamı', cells: (_i, e) => colsOf(e, ['amount']) },
  type: { level: 'medium', label: 'Tevkifat / İade faturası, kontrol edin', cells: (_i, e) => colsOf(e, ['type']) },
  'vat-derived': { level: 'low', label: 'KDV matrahı faturada yazmıyor; vergiden hesaplandı, kontrol edin', short: 'Matrah vergiden hesaplandı', cells: derivedCells },
  'no-view': { level: 'low', label: 'XML yok (EDM listesinden geldi ya da yer açmak için kaldırıldı); fatura görüntüsü çizilemez', cells: () => [] },
};
export const ISSUE_KINDS = Object.keys(ISSUE_META) as IssueKind[];
export const levelOf = (k: IssueKind) => ISSUE_META[k].level;
/** Uyarıların en yüksek seviyesi (yoksa null) */
export const topLevel = (ks: IssueKind[]): IssueLevel | null => ks.reduce<IssueLevel | null>((m, k) => (!m || LEVEL_RANK[levelOf(k)] > LEVEL_RANK[m] ? levelOf(k) : m), null);

export function issuesFor(inv: Invoice): IssueKind[] {
  // Excel'den çıkarılan fatura çıktıyla ilgili uyarı almaz
  if (inv.excluded) return inv.hasView ? [] : ['no-view'];
  const out: IssueKind[] = [];
  const code = assignments.value.get(inv.no);
  if (!code) out.push('no-code');
  else if (accounts.value.length > 0 && !accountMap.value.has(code)) out.push('not-in-chart');
  if (/tevkifat|iade/i.test(inv.invoiceType)) out.push('type');
  const t = outputTemplate.value;
  if (amountGaps(inv, t).length) out.push('amount-gap');
  if (usesVat(t) && inv.vatBreakdown.some((p) => p.derived)) out.push('vat-derived');
  // Yalnızca şablonda "Tutar (ödenecek)" varken: Excel'deki tutar matrah + vergilerle uyuşmayacak
  if (t.columns.some((c) => c.id === 'amount') && payableDiffers(inv)) out.push('payable-diff');
  if (!inv.hasView) out.push('no-view');
  return out;
}

/** Uyarının bu faturaya özgü açıklaması (satır ipucu ve panel): etiket + tutarlar */
export function issueText(inv: Invoice, k: IssueKind): string {
  const label = ISSUE_META[k].label;
  if (k === 'payable-diff') return `${label}: ödenecek ${fmtMoney(inv.amount)} · fatura toplamı ${fmtMoney(inv.taxInclusive)}`;
  if (k === 'vat-derived') return `${label}: ${inv.vatBreakdown.filter((p) => p.derived).map((p) => `%${p.rate} matrahı ${fmtMoney(p.base)}`).join(', ')}`;
  if (k === 'amount-gap') return `${label}: ${amountGaps(inv, outputTemplate.value).map((g) => g.text).join(' · ')}`;
  return label;
}

/** Üst çubuk ve listede gösterilecek uyarılar: atanmamış kod ve XML eksikliği hariç. */
export function attentionIssues(inv: Invoice): IssueKind[] {
  return issuesFor(inv).filter((k) => k !== 'no-code' && k !== 'no-view');
}

const MUTED_KEY = 'previewMuted';
const readMuted = (): IssueKind[] => { try { const v = JSON.parse(localStorage.getItem(MUTED_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((k) => k in ISSUE_META) : []; } catch { return []; } };
/** Önizlemede rengi kapatılan uyarı türleri (bilgisayara özgü; Excel'i değiştirmez) */
export const previewMuted = signal<IssueKind[]>(readMuted());
export function toggleMuted(k: IssueKind) {
  const next = previewMuted.value.includes(k) ? previewMuted.value.filter((x) => x !== k) : [...previewMuted.value, k];
  previewMuted.value = next;
  try { localStorage.setItem(MUTED_KEY, JSON.stringify(next)); } catch { /* yok say */ }
}
