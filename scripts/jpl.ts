import ts from "typescript";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const JPL_GOOSE_GLOBS = ["engine/**/*.goose"];
const SOURCE_GLOBS = ["{app,core,docs,evals,scripts,test,tools,web}/**/*.{ts,mts}"];
const JPL_MAX_LINES = 60;
// Shrink-only: a listed function may not grow, and its entry must drop when it shrinks.
const JPL_LONG_FUNCTIONS: Record<string, number> = {
  "engine/scene.goose:render_frame": 131,
  "app/serve.ts:handle": 150,
  "core/scene.ts:motionErrors": 70,
  "core/scene.ts:validate": 217,
  "evals/hometeamns.ts:build": 84,
  "evals/lib.ts:report": 70,
  "evals/mrt.ts:build": 167,
  "evals/riot.ts:build": 246,
  "tools/assets/import.ts:readGltf": 72,
  "web/controls.ts:bindControls": 75,
  "web/demo.ts:start": 78,
  "web/viewer.ts:createViewer": 587,
  "web/viewer.ts:load": 92,
  "web/viewer.ts:drawOverlay": 78,
};

type Fn = { file: string; name: string; start: number; lines: number; calls: Set<string> };

function files(root: string, patterns: readonly string[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) for (const f of new Glob(pattern).scanSync({ cwd: root })) found.add(f);
  return [...found].sort();
}

function blankCommentsAndStrings(text: string): string {
  return text.replace(/\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"/g, (m) => " ".repeat(m.length));
}

function gooseFunctions(file: string, text: string): Fn[] {
  const code = blankCommentsAndStrings(text);
  const found: Fn[] = [];
  const header = /^(?:export\s+)?fn\s+(\w+)/gm;
  for (let m = header.exec(code); m !== null; m = header.exec(code)) {
    const name = m[1];
    if (name === undefined) continue;
    const open = code.indexOf("{", m.index);
    let depth = 0;
    let end = open;
    for (; end < code.length; end++) {
      if (code[end] === "{") depth++;
      else if (code[end] === "}" && --depth === 0) break;
    }
    const line = (at: number): number => code.slice(0, at).split("\n").length;
    const calls = new Set([...code.slice(open, end).matchAll(/(?<![.\w])(\w+)\s*\(/g)].flatMap((c) => (c[1] === undefined ? [] : [c[1]])));
    found.push({ file, name, start: line(m.index), lines: line(end) - line(m.index) + 1, calls });
  }
  return found;
}

const FUNCTION_KINDS = [ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.Constructor];

function callsIn(function_: ts.Node): Set<string> {
  const calls = new Set<string>();
  const stack = [...function_.getChildren()];
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    if (FUNCTION_KINDS.includes(c.kind)) continue;
    if (ts.isCallExpression(c)) {
      const callee = c.expression;
      if (ts.isIdentifier(callee)) calls.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) calls.add(callee.name.text);
    }
    stack.push(...c.getChildren());
  }
  return calls;
}

function tsFunctions(file: string, text: string): Fn[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Fn[] = [];
  const seen = new Map<string, number>();
  const nameOf = (node: ts.Node, outer: string): string => {
    const parent = node.parent;
    let own = "";
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) && node.name) own = node.name.getText(source);
    else if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) own = parent.name.getText(source);
    else if (ts.isConstructorDeclaration(node)) own = "constructor";
    return own === "" ? `${outer}>anonymous` : own;
  };
  const pending: [ts.Node, string][] = [[source, "file"]];
  for (let item = pending.shift(); item !== undefined; item = pending.shift()) {
    const [node, outer] = item;
    let scope = outer;
    if (FUNCTION_KINDS.includes(node.kind)) {
      const base = nameOf(node, outer);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const name = n === 1 ? base : `${base}#${n}`;
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const last = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      found.push({ file, name, start: first, lines: last - first + 1, calls: callsIn(node) });
      scope = name;
    }
    for (const child of node.getChildren(source)) pending.push([child, scope]);
  }
  return found;
}

function recursion(fns: Fn[]): string[] {
  const problems: string[] = [];
  const byName = new Map<string, Fn[]>();
  for (const f of fns) byName.set(`${f.file}\0${f.name.split("#")[0]}`, [...(byName.get(`${f.file}\0${f.name.split("#")[0]}`) ?? []), f]);
  const edges = (f: Fn): Fn[] => [...f.calls].flatMap((c) => byName.get(`${f.file}\0${c}`) ?? []);
  for (const f of fns) {
    const visited = new Set<Fn>();
    const stack = edges(f);
    for (let g = stack.pop(); g !== undefined; g = stack.pop()) {
      if (g === f) { problems.push(`${f.file}:${f.start}: ${f.name} can call itself (JPL rule 1: no recursion)`); break; }
      if (!visited.has(g)) { visited.add(g); stack.push(...edges(g)); }
    }
  }
  return problems;
}

export function checkJpl(root: string, allowedLong: Record<string, number> = JPL_LONG_FUNCTIONS): string[] {
  const fns = [
    ...files(root, JPL_GOOSE_GLOBS).flatMap((f) => gooseFunctions(f, readFileSync(`${root}/${f}`, "utf8"))),
    ...files(root, SOURCE_GLOBS).flatMap((f) => tsFunctions(f, readFileSync(`${root}/${f}`, "utf8"))),
  ];
  const problems = recursion(fns);
  const listed = new Set<string>();
  for (const f of fns) {
    const key = `${f.file}:${f.name}`;
    const allowed = allowedLong[key];
    if (allowed !== undefined) listed.add(key);
    if (f.lines > (allowed ?? JPL_MAX_LINES)) {
      problems.push(`${f.file}:${f.start}: ${f.name} has ${f.lines} lines (JPL rule 4: at most ${allowed ?? JPL_MAX_LINES})`);
    } else if (allowed !== undefined && f.lines < allowed) {
      problems.push(`${f.file}:${f.start}: ${f.name} has ${f.lines} lines: lower its limit in JPL_LONG_FUNCTIONS to ${f.lines > JPL_MAX_LINES ? f.lines : "nothing (remove it)"}`);
    }
  }
  for (const key of Object.keys(allowedLong)) if (!listed.has(key)) problems.push(`${key} is in JPL_LONG_FUNCTIONS but no such function exists: remove it`);
  return problems;
}

if (import.meta.main) {
  const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
  const list = process.argv.includes("--list");
  const problems = checkJpl(root);
  if (list) {
    for (const p of problems) { const m = /^(.+?):\d+: (\S+) has (\d+) lines \(/.exec(p); if (m) console.log(`  "${m[1]}:${m[2]}": ${m[3]},`); }
  } else for (const p of problems) console.log(p);
}
