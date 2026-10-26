import { parseLines } from '../core/xml/parseUbl';
import type { Invoice } from '../core/types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const money = (n: number | null, cur: string) => (n == null ? '' : `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(cur)}`);

/**
 * XSLT yokken (ya da dönüşüm başarısızken) kullanılan sade görünüm: başlık bilgileri + kalemler.
 * Resmî şablon değildir; kullanıcıya bu durum ayrıca bildirilir.
 */
export function fallbackHtml(inv: Invoice, xml: string | null, note: string): string {
  const lines = xml ? safeLines(xml) : [];
  const rows = lines
    .map(
      (l) => `<tr><td>${esc(l.name)}</td><td class="r">${esc(l.quantity)} ${esc(l.unit)}</td><td class="r">${money(l.price, inv.currency)}</td><td class="r">${l.taxPercent ? '%' + esc(l.taxPercent) : ''}</td><td class="r">${money(l.amount, inv.currency)}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${esc(inv.no)}</title>
<style>
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d2330;margin:24px auto;max-width:860px;padding:0 16px}
.note{background:#fff7e0;color:#b45309;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:18px}
.head{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;border-bottom:2px solid #1d2330;padding-bottom:14px}
.name{font-size:22px;font-weight:700}
.muted{color:#6b7280}
.kv{display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:13px}
.kv span{color:#6b7280}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}
th,td{padding:6px 8px;border-bottom:1px solid #e3e6ea;text-align:left;vertical-align:top}
th{background:#f5f6f8}
.r{text-align:right;white-space:nowrap}
.tot{margin-top:14px;margin-left:auto;width:320px;font-size:14px}
.tot div{display:flex;justify-content:space-between;padding:3px 0}
.tot .big{font-size:18px;font-weight:700;border-top:2px solid #1d2330;margin-top:4px;padding-top:6px}
</style></head><body>
<div class="note">${esc(note)}</div>
<div class="head">
  <div><div class="name">${esc(inv.supplierName || '—')}</div><div class="muted">VKN/TCKN ${esc(inv.supplierVkn)}</div></div>
  <div class="kv">
    <span>Fatura No</span><b>${esc(inv.no)}</b>
    <span>Tarih</span><b>${esc(inv.date)}</b>
    <span>Tip · Tür</span><b>${esc(inv.invoiceType)} · ${esc(inv.profile)}</b>
    ${inv.uuid ? `<span>ETTN</span><b style="font-size:11px">${esc(inv.uuid)}</b>` : ''}
  </div>
</div>
${rows ? `<table><thead><tr><th>Mal / Hizmet</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">KDV</th><th class="r">Tutar</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
<div class="tot">
  ${inv.taxExclusive != null ? `<div><span>Vergiler hariç</span><span>${money(inv.taxExclusive, inv.currency)}</span></div>` : ''}
  ${inv.taxAmount != null ? `<div><span>Vergiler</span><span>${money(inv.taxAmount, inv.currency)}</span></div>` : ''}
  <div class="big"><span>Ödenecek</span><span>${money(inv.amount, inv.currency)}</span></div>
</div>
</body></html>`;
}

function safeLines(xml: string) {
  try {
    return parseLines(xml);
  } catch {
    return [];
  }
}
