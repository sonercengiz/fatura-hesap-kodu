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
    const files = await filesFromEntries(tree as never);
    expect(files.map((f) => f.name)).toEqual(['a.xml', 'b.xml', 'c.zip']);
  });
});
