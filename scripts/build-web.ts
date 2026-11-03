import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web'), out = join(root, 'dist', 'web');
const transpiler = new Bun.Transpiler({ loader: 'ts' });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(web)) {
  if (f.endsWith('.ts')) writeFileSync(join(out, f.replace(/\.ts$/, '.js')), transpiler.transformSync(readFileSync(join(web, f), 'utf8')));
  else cpSync(join(web, f), join(out, f), { recursive: true });
}
console.log(`Wrote ${out}`);
