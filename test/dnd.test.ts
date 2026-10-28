// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { filesFromEntries } from '../src/ui/dnd';

const fileEntry = (name: string) => ({ isFile: true, isDirectory: false, name, file: (ok: (f: File) => void) => ok(new File(['<Invoice/>'], name)) });
const dirEntry = (name: string, children: unknown[]) => {
  let served = false;
  return { isFile: false, isDirectory: true, name, createReader: () => ({ readEntries: (ok: (es: unknown[]) => void) => { ok(served ? [] : children); served = true; } }) };
};

describe('sürükle-bırak klasör okuma', () => {
  it('alt klasörleri gezer, gizli ve __MACOSX öğelerini atlar', async () => {
    const tree = [fileEntry('a.xml'), dirEntry('Eylul', [fileEntry('b.xml'), dirEntry('ic', [fileEntry('c.zip')]), fileEntry('.DS_Store')]), dirEntry('__MACOSX', [fileEntry('._a.xml')])];
    const { files, failed } = await filesFromEntries(tree as never);
    expect(files.map((f) => f.name)).toEqual(['a.xml', 'b.xml', 'c.zip']);
    expect(failed).toEqual([]);
  });
  it('okunamayan dosya, okunamayan ve çok derin klasör raporlanır (sessiz kalmaz)', async () => {
    const badFile = { isFile: true, isDirectory: false, name: 'kilitli.xml', file: (_ok: unknown, err: (e: unknown) => void) => err(new Error('izin')) };
    const badDir = { isFile: false, isDirectory: true, name: 'ag', createReader: () => ({ readEntries: (_ok: unknown, err: (e: unknown) => void) => err(new Error('izin')) }) };
    let deep: unknown = fileEntry('en-dip.xml');
    for (let i = 9; i >= 1; i--) deep = dirEntry(`k${i}`, [deep]);
    const { files, failed } = await filesFromEntries([dirEntry('Eylul', [fileEntry('a.xml'), badFile, badDir]), deep] as never);
    expect(files.map((f) => f.name)).toEqual(['a.xml']);
    expect(failed.map((f) => f.file)).toEqual(['Eylul/kilitli.xml', 'Eylul/ag/', 'k1/k2/k3/k4/k5/k6/k7/k8/k9/']);
    expect(failed[2].reason).toMatch(/çok derin/);
  });
});
