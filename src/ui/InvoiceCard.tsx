import type { Invoice } from '../core/types';
import { fmtMoney } from '../core/num';

export function fmtAmount(n: number | null, cur: string) {
  if (n == null) return '';
  return `${fmtMoney(n)} ${cur}`.trim();
}

/** XML'i olmayan (EDM listesinden gelen ya da XML'i kaldırılan) faturalar için büyük puntolu kart. */
export function InvoiceCard({ inv }: { inv: Invoice }) {
  return (
    <div class="card">
      <div class="card-name">{inv.supplierName || '—'}</div>
      <div class="card-vkn">VKN {inv.supplierVkn}</div>
      <div class="card-no">{inv.no}</div>
      <div class="card-meta">
        <span>{inv.date}</span>
        {inv.invoiceType && <span class="chip">{inv.invoiceType}</span>}
        {inv.profile && <span class="chip">{inv.profile}</span>}
      </div>
      <div class="card-amount">{fmtAmount(inv.amount, inv.currency)}</div>
      <div class="card-hint">Bu faturanın XML'i yok (EDM listesinden geldi ya da yer açmak için kaldırıldı); yalnızca liste bilgileri gösteriliyor. XML'ini yüklerseniz fatura görüntüsü çizilir.</div>
    </div>
  );
}
