import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_ENV } from '../core/capture.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'toybox', 'replay');
const LARGE_CHANGE = 0.2;

interface Options {
  accept: boolean;
  capture: boolean;
  base: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { accept: false, capture: false, base: 'main' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--accept') opts.accept = true;
    else if (a === '--capture') opts.capture = true;
    else if (a === '--base') opts.base = argv[++i] ?? '';
    else throw new Error(`Unknown argument ${a}. Usage: bun scripts/replay.ts [--capture] [--base REF] [--accept]`);
  }
  if (!opts.base) throw new Error('--base needs a ref');
  return opts;
}

function run(cmd: string, args: string[], env: Record<string, string> = {}): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`);
}

function capture(inputs: string): void {
  rmSync(inputs, { recursive: true, force: true });
  mkdirSync(inputs, { recursive: true });
  run(process.execPath, ['test', 'test/'], { [CAPTURE_ENV]: inputs });
  console.log(`Captured ${readdirSync(inputs).length} calls in ${inputs}`);
}

function exportBase(ref: string, dest: string): void {
  const archive = spawnSync('git', ['-C', root, 'archive', ref], { maxBuffer: 1 << 30 });
  if (archive.status !== 0) throw new Error(`git archive ${ref} failed: ${archive.stderr.toString()}`);
  const untar = spawnSync('tar', ['-x', '-C', dest], { input: archive.stdout });
  if (untar.status !== 0) throw new Error('tar failed');
}

function replay(tree: string, inputs: string, outputs: string): void {
  run(process.execPath, [join(root, 'scripts', 'replay-worker.ts'), tree, inputs, outputs]);
}

const opts = parseArgs(process.argv.slice(2));
const inputs = join(cache, 'inputs');
if (opts.capture) capture(inputs);
if (!existsSync(inputs) || readdirSync(inputs).length === 0) throw new Error(`No captured inputs in ${inputs}. Run: bun scripts/replay.ts --capture`);

const work = mkdtempSync(join(tmpdir(), 'toybox-replay-run-'));
try {
  const baseTree = join(work, 'base');
  mkdirSync(baseTree);
  exportBase(opts.base, baseTree);
  const baseOut = join(work, 'base-out'), branchOut = join(work, 'branch-out');
  replay(baseTree, inputs, baseOut);
  replay(root, inputs, branchOut);
  const files = readdirSync(inputs).filter((f) => f.endsWith('.json')).sort();
  const diffs = files.filter((f) => readFileSync(join(baseOut, f), 'utf8') !== readFileSync(join(branchOut, f), 'utf8'));
  console.log(`Replayed ${files.length} calls against ${opts.base}: ${diffs.length} differ.`);
  for (const f of diffs.slice(0, 5)) {
    const d = spawnSync('diff', ['-u', join(baseOut, f), join(branchOut, f)], { encoding: 'utf8' });
    console.log(`--- ${f}\n${d.stdout.split('\n').slice(0, 40).join('\n')}`);
  }
  if (diffs.length / files.length > LARGE_CHANGE) console.log(`Large change: more than ${LARGE_CHANGE * 100} percent of the outputs differ.`);
  if (diffs.length > 0 && !opts.accept) process.exitCode = 1;
  else if (diffs.length > 0) console.log('Accepted by --accept.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
