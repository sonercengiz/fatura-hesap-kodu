import type { Invoice } from '../core/types';

export function fmtAmount(n: number | null, cur: string) {
  if (n == null) return '';
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

export function InvoiceCard({ inv, hasFiles }: { inv: Invoice; hasFiles: boolean }) {
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
      <div class="card-hint">{hasFiles ? 'Bu fatura için PDF eşleşmedi.' : 'PDF eklenmedi; Excel bilgileri gösteriliyor.'}</div>
    </div>
  );
}
