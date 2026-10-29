// Tam tarayıcı takımı: her betik ayrı, çıktılar <SCRATCH>/full/<ad>.txt, özet <SCRATCH>/full/_summary.txt ("<ad> exit=<kod> ✗=<n>").
// Kullanım: node test/tools/full-suite.mjs   (uygulama 5179'da açıkken; koşarken src'ye dokunma; yollar için bkz. test/paths.mjs)
import { spawnSync, execFileSync } from 'node:child_process';
import { readdirSync, rmSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SCRATCH } from '../paths.mjs';

const OUT = join(SCRATCH, 'full');
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const SUMMARY = join(OUT, '_summary.txt');
for (const f of readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('-e2e.mjs')).sort()) {
  const n = f.slice(0, -4);
  const r = spawnSync(process.execPath, [join('test', f)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  writeFileSync(join(OUT, `${n}.txt`), out);
  const line = `${n} exit=${r.status} ✗=${out.split('\n').filter((l) => l.includes('✗')).length}`;
  appendFileSync(SUMMARY, line + '\n'); console.log(line);
}
// bulk-e2e ve chart-undo-e2e rehber görsellerinin üstüne yazar
try { execFileSync('git', ['checkout', 'public/guide/05b-toplu.png', 'public/guide/05c-liste.png'], { cwd: ROOT, stdio: 'ignore' }); } catch {}
appendFileSync(SUMMARY, 'BITTI\n');
