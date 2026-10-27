import { type Invoice } from '../../core/types';
import { PrintOpts, batchRec, busy, invoices, printJob, printOpen, showToast } from './core';

export function openPrint() {
  if (!batchRec.value || invoices.value.length === 0) { showToast('Yazdırılacak fatura yok.'); return; }
  printOpen.value = true;
}

export function closePrint() {
  printOpen.value = false;
}

export function startPrint(items: Invoice[], opts: PrintOpts) {
  if (items.length === 0) return;
  printOpen.value = false;
  const size = opts.chunk > 0 ? opts.chunk : items.length;
  const parts: Invoice[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  printJob.value = { items, opts, parts, part: 0 };
}

/** Bir parça yazdırıldı: sıradaki varsa ona geç, yoksa bitir */
export function nextPrintPart() {
  const j = printJob.value;
  if (!j) return;
  if (j.part + 1 < j.parts.length) {
    showToast(`Parça ${j.part + 1}/${j.parts.length} gönderildi · ${j.part + 2}/${j.parts.length} hazırlanıyor`, 3000);
    printJob.value = { ...j, part: j.part + 1 };
  } else {
    if (j.parts.length > 1) showToast(`Parçalı yazdırma tamamlandı (${j.parts.length} parça, ${j.items.length} fatura)`, 4000);
    finishPrint();
  }
}

export function finishPrint() {
  printJob.value = null;
  busy.value = null;
}
