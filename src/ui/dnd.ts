/** Sürükle-bırak ile gelen dosya ve klasörleri (alt klasörler dahil) düz dosya listesine çevirir. */
interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (es: EntryLike[]) => void, err?: (e: unknown) => void) => void };
}

/** Okunamayan dosya/klasör: yükleme raporunda nedeniyle görünür (eskiden sessizce atlanıyordu) */
export interface DropFailure { file: string; reason: string }
export interface Dropped { files: File[]; failed: DropFailure[] }

const MAX_DEPTH = 8;

async function readAll(entry: EntryLike, out: Dropped, depth: number, path: string): Promise<void> {
  const here = path ? `${path}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    const f = await new Promise<File | null>((res) => entry.file!((x) => res(x), () => res(null)));
    if (f && !/^\./.test(f.name)) out.files.push(f);
    else if (!f && !/^\./.test(entry.name)) out.failed.push({ file: here, reason: 'Dosya okunamadı (izin ya da bağlantı sorunu)' });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    if (/^(__MACOSX|\.)/.test(entry.name)) return;
    if (depth >= MAX_DEPTH) { out.failed.push({ file: `${here}/`, reason: `Klasör çok derin (${MAX_DEPTH} kattan fazla); içi okunmadı, bu klasörü ayrıca sürükleyin` }); return; }
    const reader = entry.createReader();
    // readEntries parça parça döner; boş gelene kadar oku
    for (;;) {
      const batch = await new Promise<EntryLike[] | null>((res) => reader.readEntries((es) => res(es), () => res(null)));
      if (batch === null) { out.failed.push({ file: `${here}/`, reason: 'Klasör okunamadı (izin ya da ağ sürücüsü sorunu); içindekiler yüklenmedi' }); break; }
      if (batch.length === 0) break;
      for (const e of batch) await readAll(e, out, depth + 1, here);
    }
  }
}

export async function filesFromDataTransfer(dt: DataTransfer | null): Promise<Dropped> {
  if (!dt) return { files: [], failed: [] };
  const items = Array.from(dt.items ?? []);
  const entries = items.map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null);
  if (entries.some((e) => e)) {
    const out: Dropped = { files: [], failed: [] };
    for (const e of entries) if (e) await readAll(e, out, 0, '');
    if (out.files.length || out.failed.length) return out;
  }
  return { files: Array.from(dt.files ?? []), failed: [] };
}

/** Test edilebilirlik için: giriş yapısından dosya listesi ve okunamayanlar */
export async function filesFromEntries(entries: EntryLike[]): Promise<Dropped> {
  const out: Dropped = { files: [], failed: [] };
  for (const e of entries) await readAll(e, out, 0, '');
  return out;
}
