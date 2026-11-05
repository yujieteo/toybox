import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The C in engine/ is compiled for WebAssembly by emcc (engine/build.sh), so the check
// compiles and analyses it for the same target, with the emsdk sysroot headers.
// Goose-made C (a .c file with a .goose file beside it) gets the five code-generator
// warnings off, and the analyser's dead-store check off, because the Goose compiler
// writes that code and only the .goose source can fix it. Hand-written C gets everything.
// -Wno-unused-variable also turns off -Wunused-const-variable, which clang groups under it.
export const GENERATED_OFF = [
  '-Wno-unused-variable',
  '-Wno-unused-function',
  '-Wno-unused-parameter',
  '-Wno-unused-but-set-variable',
  '-Wno-unterminated-string-initialization',
];

const ANALYSER_LINE = /: warning: (.*) \[([\w.]+)\]$/;

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return `${r.stdout}${r.stderr}`;
}

// The analyser findings allowed to stay, one per line: "file checker message". Line numbers are
// left out so a regenerated file keeps its entries. Blank lines and # comments are skipped.
export function readKnownFindings(listFile: string): Set<string> {
  const lines = readFileSync(listFile, 'utf8').split('\n');
  return new Set(lines.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#')));
}

export function checkC(root: string): string[] {
  const emsdk = process.env.EMSDK;
  if (!emsdk) return ['EMSDK is not set: run `source emsdk_env.sh` (the engine C includes the emscripten headers)'];
  const engine = resolve(root, 'engine');
  const sysroot = join(emsdk, 'upstream/emscripten/cache/sysroot/include');
  const known = readKnownFindings(resolve(root, 'scripts/c-analyzer-known.txt'));
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const file of readdirSync(engine).filter((f) => f.endsWith('.c')).sort()) {
    const generated = existsSync(join(engine, file.replace(/\.c$/, '.goose')));
    const target = ['--target=wasm32-unknown-emscripten', '-nostdinc', '-isystem', sysroot, '-I', engine, '-DGS_STACK_RESERVE=(16ull<<20)'];
    const off = generated ? GENERATED_OFF : [];

    const compile = run('clang', [...target, '-fsyntax-only', '-Wall', '-Wextra', '-Wpedantic', '-Werror', ...off, join(engine, file)]);
    if (compile.trim() !== '') problems.push(`${file}: compiler warnings or errors\n${compile.trim()}`);

    const analyserOff = generated ? ['-Xanalyzer', '-analyzer-disable-checker=deadcode.DeadStores'] : [];
    const analysis = run('clang', ['--analyze', ...target, '-Xanalyzer', '-analyzer-output=text', '-o', '/dev/null', ...analyserOff, join(engine, file)]);
    for (const line of analysis.split('\n')) {
      if (/: error: /.test(line)) problems.push(`${file}: analyser error: ${line}`);
      const m = ANALYSER_LINE.exec(line);
      if (!m) continue;
      const key = `${file} ${m[2]} ${m[1]}`;
      seen.add(key);
      if (!known.has(key)) problems.push(`${file}: new analyser finding: ${line}`);
    }
  }

  for (const key of known) {
    if (!seen.has(key)) problems.push(`scripts/c-analyzer-known.txt lists a finding that is gone, delete the line: ${key}`);
  }
  return problems;
}
