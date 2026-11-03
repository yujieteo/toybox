import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const transpiler = new Bun.Transpiler({ loader: 'ts' });
for (const f of readdirSync(web).filter((n) => n.endsWith('.ts'))) {
  writeFileSync(join(web, f.replace(/\.ts$/, '.js')), transpiler.transformSync(readFileSync(join(web, f), 'utf8')));
  console.log(`web/${f.replace(/\.ts$/, '.js')}`);
}
