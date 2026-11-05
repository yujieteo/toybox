import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEscapes } from './escapes.ts';
import { measurePages } from './budget.ts';
import { checkC } from './c-check.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures: string[] = [];

function step(name: string, cmd: string, args: string[]): void {
  console.log(`\n== ${name}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) failures.push(name);
}

step('tsc --noEmit', resolve(root, 'node_modules/.bin/tsc'), ['--noEmit']);

console.log('\n== escape hatches (any, as, !, ts directives need an allow-unsafe: reason on the line)');
const tracked = spawnSync('git', ['-C', root, 'ls-files', '*.ts'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const escapes = tracked.flatMap((f) => findEscapes(resolve(root, f)));
for (const e of escapes) console.log(`${e.file.slice(root.length + 1)}:${e.line}: ${e.kind}`);
if (escapes.length > 0) failures.push('escape hatches');

console.log('\n== web page budget');
for (const p of measurePages(resolve(root, 'web'))) {
  const over = p.totalKb > p.budgetKb;
  console.log(`${over ? 'FAIL' : 'ok  '} ${p.page}: ${p.totalKb.toFixed(1)} of ${p.budgetKb} KB gzip`);
  if (over) failures.push(`budget ${p.page}`);
}

// The shared Power of 10 checker (rules 1, 2, 4, 5, 6, 8, 9), pinned by power10.lock to one full commit
// and version (0.2.0, Goose compiled to C). The launcher builds it through the shared runner; there is no
// baseline file: the project is at zero and stays there.
step('Power of 10 rules 1, 2, 4, 5, 6, 8, 9 (power10-check, pinned by power10.lock)', resolve(root, 'scripts/power10-check'), []);
step('Power of 10 rule 10: typescript-eslint strict and stylistic, type-aware', resolve(root, 'node_modules/.bin/eslint'), ['--max-warnings', '0', '.']);
console.log('\n== C warnings and analyser (engine/*.c, Goose-made C without the code-generator warnings and dead stores)');
const cProblems = checkC(root);
for (const p of cProblems) console.log(p);
if (cProblems.length > 0) failures.push('C warnings and analyser');

const SHELLCHECK_FROM = 'shellcheck-py==0.11.0.1'; // ships shellcheck 0.11.0
const shellFirstLine = /^#!\s*\S*\/(?:env\s+(?:-\S+\s+)*)?(?:sh|bash|ksh)\b/;
const allTracked = spawnSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const shellFiles = allTracked.filter((f) => f.endsWith('.sh') || shellFirstLine.test(readFileSync(resolve(root, f), 'latin1').split('\n', 1)[0] ?? ''));
step('shellcheck 0.11.0, every optional rule', 'uvx', ['--from', SHELLCHECK_FROM, 'shellcheck', '-o', 'all', ...shellFiles]);

step('dead code (knip)', resolve(root, 'node_modules/.bin/knip'), []);
const replayBase = process.env.TOYBOX_REPLAY_BASE;
step('tests and process replay against main', process.execPath, [resolve(root, 'scripts/replay.ts'), '--capture', ...(replayBase ? ['--base', replayBase] : [])]);

if (failures.length > 0) {
  console.log(`\nFAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
