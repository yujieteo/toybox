import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024;
export const DEFAULT_BUDGET_KB = 710;
export const PAGE_BUDGET_KB: Readonly<Record<string, number>> = {
  'app.html': 710,
  'demo.html': 710,
  'viewer.html': 710,
  'headless.html': 700,
};

const transpiler = new Bun.Transpiler({ loader: 'ts' });

function sourceFor(file: string): string {
  if (file.endsWith('.js')) {
    const ts = file.slice(0, -3) + '.ts';
    if (existsSync(ts)) return ts;
  }
  return file;
}

function bytesOf(file: string): Uint8Array {
  const source = sourceFor(file);
  if (source.endsWith('.ts')) return new TextEncoder().encode(transpiler.transformSync(readFileSync(source, 'utf8')));
  return readFileSync(source);
}

function references(file: string): string[] {
  const dir = dirname(file);
  const text = sourceFor(file).endsWith('.wasm') || file.endsWith('.ttf') ? '' : readFileSync(sourceFor(file), 'utf8');
  const found: string[] = [];
  const add = (ref: string | undefined): void => {
    if (ref && !/^(data:|https?:|\/\/|#)/.test(ref)) found.push(resolve(dir, ref.split(/[?#]/)[0] ?? ref));
  };
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) add(m[1]);
    for (const m of text.matchAll(/<link[^>]*\shref="([^"]+)"/g)) add(m[1]);
  } else if (file.endsWith('.css')) {
    for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(m[1]);
  } else if (file.endsWith('.js') || file.endsWith('.ts')) {
    for (const m of text.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) add(m[1]);
    for (const m of text.matchAll(/\bimport\s+['"](\.[^'"]+)['"]/g)) add(m[1]);
    for (const m of text.matchAll(/new URL\(['"](\.[^'"]+)['"],\s*import\.meta\.url\)/g)) add(m[1]);
  }
  return found;
}

export interface PageSize {
  page: string;
  files: Map<string, number>;
  totalKb: number;
  budgetKb: number;
}

export function measurePages(webDir: string): PageSize[] {
  const pages = readdirSync(webDir).filter((f) => f.endsWith('.html')).sort();
  return pages.map((page) => {
    const files = new Map<string, number>();
    const pending = [join(webDir, page)];
    for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
      if (files.has(file) || !existsSync(sourceFor(file))) continue;
      files.set(file, gzipSync(bytesOf(file)).length);
      pending.push(...references(file).reverse());
    }
    const totalKb = [...files.values()].reduce((a, b) => a + b, 0) / KB;
    return { page, files, totalKb, budgetKb: PAGE_BUDGET_KB[page] ?? DEFAULT_BUDGET_KB };
  });
}

if (import.meta.main) {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
  let failed = false;
  for (const p of measurePages(join(root, 'web'))) {
    const over = p.totalKb > p.budgetKb;
    if (over) failed = true;
    console.log(`${over ? 'FAIL' : 'ok  '} ${p.page}: ${p.totalKb.toFixed(1)} KB gzip of ${p.budgetKb} KB (${p.files.size} files)`);
    if (over) for (const [f, n] of p.files) console.log(`       ${f.slice(root.length + 1)} ${(n / KB).toFixed(1)} KB`);
  }
  if (failed) process.exit(1);
}
