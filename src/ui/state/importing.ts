import { parseUbl, decodeBytes, dominantMonth, UblParseError } from '../../core/xml/parseUbl';
import { sha256 } from '../../core/hash';
import { sheetToInvoices, type EdmSheet } from '../../core/legacy';
import { readEdmSheet, edmRowsByNo } from '../../core/excel/readEdm';
import { db, type BatchRecord, type InvoiceRecord, type AssignmentRecord } from '../../storage/db';
import { forgetHtml } from '../../render/xslt';
import { readZip, ZipError } from '../../core/zip';
import { batchRec, busy, current, currentIndex, importReport, invoiceRecs, invoices, lastImportReport, settingsOpen, settingsTab, showToast } from './core';
import { createBatch, isQuotaError, notifyOtherTabs, openBatch, refreshBatchList } from './firms';
import { applyRules } from './rules';

/** ZIP dosyalarını açar (iç içe bir düzey dahil); XML'leri dosya olarak döndürür, diğerlerini olduğu gibi geçirir. */
export async function expandZips(list: File[], depth = 0): Promise<File[]> {
  const out: File[] = [];
  for (const f of list) {
    if (!/\.zip$/i.test(f.name) && f.type !== 'application/zip' && f.type !== 'application/x-zip-compressed') { out.push(f); continue; }
    try {
      const entries = readZip(new Uint8Array(await f.arrayBuffer()));
      const inner: File[] = [];
      for (const { path, bytes } of entries) {
        if (/(^|\/)__MACOSX\//.test(path) || /(^|\/)\./.test(path)) continue;
        const name = path.split('/').pop() || path;
        const type = /\.xml$/i.test(name) ? 'application/xml' : /\.zip$/i.test(name) ? 'application/zip' : '';
        inner.push(new File([bytes as BlobPart], name, { type }));
      }
      const xmlsOrZips = inner.filter((x) => /\.(xml|zip)$/i.test(x.name));
      if (xmlsOrZips.length === 0) { out.push(new File([], `${f.name} (içinde XML yok)`, { type: '' })); continue; }
      out.push(...(depth < 1 ? await expandZips(xmlsOrZips, depth + 1) : xmlsOrZips.filter((x) => /\.xml$/i.test(x.name))));
    } catch (e) {
      console.warn('ZIP açılamadı', f.name, e);
      out.push(new File([], `${f.name} (ZIP açılamadı${e instanceof ZipError ? ': ' + e.message : ''})`, { type: '' }));
    }
  }
  return out;
}

export interface ImportReport {
  added: number;
  skipped: number;
  /** Zaten dönemde olduğu için atlanan dosyalar */
  skippedFiles: { file: string; no: string }[];
  /** Kuralla kendiliğinden atanan */
  ruled: number;
  /** XML'i sonradan gelen (daha önce yalnızca listeden eklenmiş) faturalar */
  upgraded: number;
  /** EDM listesi: eşleşen ve yeni (XML'siz) eklenen */
  edmMatched: number;
  edmAdded: number;
  failed: { file: string; reason: string }[];
}

/**
 * e-Fatura XML dosyalarını açık döneme ekler (dönem yoksa oluşturur). Aynı fatura no dönemde varsa atlanır.
 * XSLT'ler özetleriyle tekilleştirilir; daha önce başka dönemde atanmış faturaların kodu taşınır.
 */
export async function importXml(rawList: File[]): Promise<ImportReport> {
  const report: ImportReport = { added: 0, skipped: 0, skippedFiles: [], ruled: 0, upgraded: 0, edmMatched: 0, edmAdded: 0, failed: [] };
  busy.value = rawList.some((f) => /\.zip$/i.test(f.name)) ? 'ZIP açılıyor…' : busy.value;
  const list = await expandZips(rawList);
  const isXml = (f: File) => /\.xml$/i.test(f.name) || f.type === 'text/xml' || f.type === 'application/xml';
  const isEdm = (f: File) => /\.xlsx?$/i.test(f.name);
  const xmls = list.filter(isXml);
  const edms = list.filter(isEdm);
  for (const f of list) if (!isXml(f) && !isEdm(f) && !/^\.|\.ds_store$/i.test(f.name)) report.failed.push({ file: f.name, reason: /\(içinde XML yok\)$/.test(f.name) ? 'ZIP içinde XML yok' : /\(ZIP açılamadı.*\)$/.test(f.name) ? 'ZIP açılamadı; arşivi bilgisayarınızda açıp XML dosyalarını yükleyin' : 'XML dosyası değil (yalnızca .xml ve .zip yüklenir)' });
  if (xmls.length === 0 && edms.length === 0) {
    busy.value = null;
    if (report.failed.length) importReport.value = report;
    else showToast('XML dosyası seçilmedi. e-Fatura XML dosyalarını (.xml ya da .zip) yükleyin.', 4000);
    return report;
  }
  busy.value = 'XML okunuyor…';
  try {
    const b = batchRec.value ?? (await createBatch());
    const existing = new Set(invoiceRecs.value.map((r) => r.no));
    /** XML'siz (listeden gelmiş) kayıtlar: XML gelince tamamlanır */
    const upgradable = new Map(invoiceRecs.value.filter((r) => !r.xml).map((r) => [r.no, r]));
    const upgrades: InvoiceRecord[] = [];
    const seenNow = new Set<string>();
    const recs: InvoiceRecord[] = [];
    const xsltTexts = new Map<string, string>();
    let order = invoiceRecs.value.reduce((m, r) => Math.max(m, r.order + 1), 0);
    const now = Date.now();
    let n = 0;
    for (const f of xmls) {
      n++;
      if (n % 10 === 0 || n === xmls.length) busy.value = `XML okunuyor ${n}/${xmls.length}`;
      try {
        const text = decodeBytes(new Uint8Array(await f.arrayBuffer()));
        const u = parseUbl(text);
        const no = u.no.toUpperCase();
        const up = upgradable.get(no);
        if (!up && (existing.has(no) || seenNow.has(no))) { report.skipped++; report.skippedFiles.push({ file: f.name, no }); continue; }
        if (up && seenNow.has(no)) { report.skipped++; report.skippedFiles.push({ file: f.name, no }); continue; }
        seenNow.add(no);
        let xsltId: string | null = null;
        if (u.xslt) {
          xsltId = await sha256(u.xslt);
          if (!xsltTexts.has(xsltId)) xsltTexts.set(xsltId, u.xslt);
        }
        const rec: InvoiceRecord = {
          batchId: b.id,
          no,
          uuid: u.uuid,
          issueDate: u.issueDate,
          issueTime: u.issueTime,
          profileId: u.profileId,
          typeCode: u.typeCode,
          currency: u.currency,
          supplierVkn: u.supplierVkn,
          supplierName: u.supplierName,
          payable: u.payable,
          taxExclusive: u.taxExclusive,
          taxAmount: u.taxAmount,
          lineCount: u.lineCount,
          itemText: u.itemText,
          xml: u.xml,
          xsltId,
          fileName: f.name,
          addedAt: now,
          order: order++ };
        if (up) { upgrades.push({ ...rec, edm: up.edm, addedAt: up.addedAt, order: up.order }); report.upgraded++; }
        else recs.push(rec);
      } catch (e) {
        report.failed.push({ file: f.name, reason: e instanceof UblParseError ? e.message : /\.xml$/i.test(f.name) ? 'Dosya okunamadı (bozuk ya da yarım inmiş olabilir)' : 'XML dosyası değil' });
      }
    }
    if (upgrades.length) {
      busy.value = 'Kaydediliyor…';
      await db.invoices.bulkPut(upgrades);
      for (const u of upgrades) forgetHtml(`${b.id}|${u.no}`);
      // XSLT'leri de yaz
    }
    if (recs.length || upgrades.length) {
      busy.value = 'Kaydediliyor…';
      if (xsltTexts.size) {
        const have = new Set((await db.xslts.where('id').anyOf(Array.from(xsltTexts.keys())).primaryKeys()) as string[]);
        const put = Array.from(xsltTexts, ([id, text]) => ({ id, text })).filter((x) => !have.has(x.id));
        if (put.length) await db.xslts.bulkPut(put);
      }
      if (recs.length) await db.invoices.bulkPut(recs);
      // Daha önce başka dönemde atanmış aynı faturalar varsa atamayı taşı
      const prior = recs.length ? (await db.assignments.where('no').anyOf(recs.map((r) => r.no)).toArray()).filter((a) => a.batchId !== b.id) : [];
      if (prior.length) {
        const latestByNo = new Map<string, AssignmentRecord>();
        for (const a of prior) {
          const cur = latestByNo.get(a.no);
          if (!cur || a.at > cur.at) latestByNo.set(a.no, a);
        }
        const own = new Set((await db.assignments.where('batchId').equals(b.id).primaryKeys()).map((k) => k[1]));
        await db.assignments.bulkPut(Array.from(latestByNo.values()).filter((a) => !own.has(a.no)).map((a) => ({ ...a, batchId: b.id })));
      }
      const patch: Partial<BatchRecord> = { updatedAt: now };
      if (b.autoName) {
        const all = [...invoiceRecs.value, ...recs].map((r) => r.issueDate);
        const month = dominantMonth(all);
        if (month) patch.name = month;
      }
      await db.batches.update(b.id, patch);
      report.added = recs.length;
      await refreshBatchList();
      const keepNo = current.value?.no;
      await openBatch(b.id);
      if (keepNo && existing.size) {
        const idx = invoices.value.findIndex((i) => i.no === keepNo);
        if (idx >= 0) currentIndex.value = idx;
      }
      // Kurallar: yeni gelen ve kod almamış faturalara kendiliğinden uygula
      const newNos = new Set(recs.map((r) => r.no));
      report.ruled = await applyRules((i) => newNos.has(i.no), true);
    }
    // EDM listesi (Excel): mevcut faturalara ek sütunlar, listede olup XML'i olmayanlar görselsiz kayıt
    for (const f of edms) {
      try {
        const sheet = await readEdmSheet(await f.arrayBuffer());
        await applyEdmList(sheet, report);
      } catch (e) {
        report.failed.push({ file: f.name, reason: (e as Error).message || 'Excel okunamadı' });
      }
    }
    const parts = [`${report.added} fatura eklendi`];
    if (report.upgraded) parts.push(`${report.upgraded} faturanın XML'i tamamlandı`);
    if (report.edmMatched || report.edmAdded) parts.push(`EDM listesi: ${report.edmMatched} eşleşti, ${report.edmAdded} listeden eklendi`);
    if (report.ruled) parts.push(`${report.ruled} kuralla atandı`);
    if (report.skipped) parts.push(`${report.skipped} zaten vardı`);
    if (report.failed.length) parts.push(`${report.failed.length} dosya okunamadı`);
    showToast(parts.join(' · '), 3500);
    if (report.failed.length) { console.warn('Okunamayan XML dosyaları', report.failed); importReport.value = report; }
    else lastImportReport.value = report;
    notifyOtherTabs();
  } catch (e) {
    if (isQuotaError(e)) {
      showToast('Tarayıcının depolama alanı doldu; yükleme kaydedilemedi. Ayarlar › Yedek › Depolama bölümünden eski dönemlerin görsellerini arşivleyin ya da dönem silin.', 9000);
      settingsTab.value = 'backup';
      settingsOpen.value = true;
    } else {
      console.error(e);
      showToast(`Yükleme sırasında hata: ${(e as Error).message ?? e}`, 7000);
    }
  } finally {
    busy.value = null;
  }
  return report;
}

/**
 * EDM listesini açık döneme işler: numarası eşleşen faturalara ham EDM sütunları eklenir (çıktıda boş kalan
 * alanlar dolar); listede olup dönemde olmayanlar XML'siz (görselsiz) fatura olarak eklenir.
 */
export async function applyEdmList(sheet: EdmSheet, report: ImportReport) {
  const b = batchRec.value;
  if (!b) return;
  const byNo = edmRowsByNo(sheet);
  const current = await db.invoices.where('batchId').equals(b.id).toArray();
  const have = new Map(current.map((r) => [r.no, r]));
  const puts: InvoiceRecord[] = [];
  for (const [no, edm] of byNo) {
    const r = have.get(no);
    if (r) { puts.push({ ...r, edm }); report.edmMatched++; }
  }
  const fields = sheetToInvoices(sheet);
  let order = current.reduce((m, r) => Math.max(m, r.order + 1), 0);
  const now = Date.now();
  for (const f of fields) {
    if (have.has(f.no)) continue;
    puts.push({
      batchId: b.id, no: f.no, uuid: '', issueDate: f.issueDate, issueTime: '', profileId: f.profileId, typeCode: f.typeCode, currency: f.currency,
      supplierVkn: f.supplierVkn, supplierName: f.supplierName, payable: f.payable, taxExclusive: null, taxAmount: null, lineCount: null, itemText: '',
      xml: null, xsltId: null, edm: byNo.get(f.no), fileName: sheet.sheetName, addedAt: now, order: order++ });
    have.set(f.no, puts[puts.length - 1]);
    report.edmAdded++;
  }
  if (puts.length) {
    await db.invoices.bulkPut(puts);
    await db.batches.update(b.id, { updatedAt: now });
    await refreshBatchList();
    const keepNo = current.length ? current[0].no : undefined;
    await openBatch(b.id);
    if (keepNo) { const idx = invoices.value.findIndex((i) => i.no === keepNo); if (idx >= 0) currentIndex.value = idx; }
    const newNos = new Set(fields.map((f) => f.no));
    report.ruled += await applyRules((i) => newNos.has(i.no), true);
  }
}
