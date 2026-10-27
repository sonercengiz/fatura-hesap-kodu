/** Sürükle-bırak ile gelen dosya ve klasörleri (alt klasörler dahil) düz dosya listesine çevirir. */
interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (es: EntryLike[]) => void, err?: (e: unknown) => void) => void };
}

async function readAll(entry: EntryLike, out: File[], depth: number): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File | null>((res) => entry.file!((x) => res(x), () => res(null)));
    if (f && !/^\./.test(f.name)) out.push(f);
    return;
  }
  if (entry.isDirectory && entry.createReader && depth < 8) {
    if (/^(__MACOSX|\.)/.test(entry.name)) return;
    const reader = entry.createReader();
    // readEntries parça parça döner; boş gelene kadar oku
    for (;;) {
      const batch = await new Promise<EntryLike[]>((res) => reader.readEntries((es) => res(es), () => res([])));
      if (batch.length === 0) break;
      for (const e of batch) await readAll(e, out, depth + 1);
    }
  }
}

export async function filesFromDataTransfer(dt: DataTransfer | null): Promise<File[]> {
  if (!dt) return [];
  const items = Array.from(dt.items ?? []);
  const entries = items.map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null);
  if (entries.some((e) => e)) {
    const out: File[] = [];
    for (const e of entries) if (e) await readAll(e, out, 0);
    if (out.length) return out;
  }
  return Array.from(dt.files ?? []);
}

/** Test edilebilirlik için: giriş yapısından dosya listesi */
export async function filesFromEntries(entries: EntryLike[]): Promise<File[]> {
  const out: File[] = [];
  for (const e of entries) await readAll(e, out, 0);
  return out;
}
