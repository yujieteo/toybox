// Shared by the eval scripts: a builder that uses only the tool commands, and the quality-bar report.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newScene, validate, srt, saveScene, contrast_ok, CAPTION_STYLE, loadCatalogue, blockedViews, motionErrors, MAX_CAPTION, MIN_SEC_PER_CHAR, MAX_SHOT_MOVE } from '../core/scene.ts';
import { runTool } from '../core/commands.ts';

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');

import type { Scene, Look } from '../web/types.ts';
import { assert } from '../core/assert.ts';

export interface SceneOpts { title?: string; author?: string; ground?: Scene['backdrop']['ground']; look?: Look; size?: [number, number]; color?: string }
export type Args = Record<string, unknown>;
export interface CmdContext { sceneDir?: string; overpass?: unknown; odblPath?: string }

// The tool results that the eval scripts read: the ids of a build and the end time of a move.
export function idsOf(r: unknown): string[] {
  if (typeof r !== 'object' || r === null || !('ids' in r) || !Array.isArray(r.ids)) return [];
  const ids = r.ids.filter((i): i is string => typeof i === 'string');
  assert(Array.isArray(ids));
  assert(ids.length <= r.ids.length);
  return ids;
}
export function endOf(r: unknown): number {
  if (typeof r !== 'object' || r === null || !('end' in r) || typeof r.end !== 'number') throw new Error('the tool result has no end time');
  const returned = r.end;
  assert(typeof returned === 'number');
  assert(!Number.isNaN(returned));
  return returned;
}

export class Builder {
  scene: Scene;
  calls: number;
  constructor(opts: SceneOpts) { this.scene = newScene(opts); this.calls = 0; }
  cmd(tool: string, args: Args, ctx: CmdContext = {}): unknown {
    assert(typeof tool === 'string');
    assert(typeof args === 'object');
    assert(tool.length < 1e7);
    this.calls++;
    const r = runTool(this.scene, tool, args, { catalogue: loadCatalogue(), ...ctx });
    if (!r.ok) throw new Error(`${tool} ${JSON.stringify(args).slice(0, 200)} failed: ${r.errors.map((e) => {
      assert(typeof e === 'object');
      const returned = `${e.code}: ${e.message}`;
      assert(typeof returned === 'string');
      assert(returned.length < 1e7);
      return returned;
    }).join(' | ')}`);
    return r.result;
  }
}

// Deterministic random numbers for scripts (the tools have their own seeds).
export function rng(seed: number): () => number { 
  assert(typeof seed === 'number');
  assert(!Number.isNaN(seed));
  let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; const returned = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
assert(typeof returned === 'number');
return returned; }; }

// Quality bars b, e, f, g, i, j from docs/design.md section 11, computed from the scene file.
export interface Row { bar: string; label: string; ok: boolean; detail: string }
export interface Report { name: string; rows: Row[]; ok: boolean; stats: { objects: number; tracks: number; chapters: number; captions: number; duration: number } }
export interface FinishedReport extends Report { file: string; calls: number }
export interface ReportOpts { fullPeople?: boolean; dir?: string }

type Bar = (id: string, label: string, ok: unknown, detail: string) => number;
type Problems = ReturnType<typeof validate>;

// (b) people
function barPeople(bar: Bar, scene: Scene, opts: ReportOpts): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  assert(typeof opts === 'object');
  const people = scene.objects.filter((o) => {
    assert(typeof o === 'object');
    return o.model === 'person';
  });
  const variants = new Set(people.map((p) => {
    assert(typeof p === 'object');
    return p.variant;
  }));
  const poses = new Set<string>();
  for (const p of people) if (p.pose) poses.add(p.pose);
  for (const t of scene.tracks) if (t.channel === 'pose') for (const k of t.keys) if (typeof k.v === 'string') poses.add(k.v);
  const walks = poses.has('walk');
  if (opts.fullPeople !== false) {
    bar('b', 'at least 10 distinct people variants', variants.size >= 10, `${variants.size} variants`);
    bar('b', 'at least 8 poses', poses.size >= 8, `${poses.size} poses: ${[...poses].join(', ')}`);
  }
  bar('b', 'a walk cycle is present', walks, walks ? 'walk pose used' : 'no walk');
}

// (e) camera
function barCamera(bar: Bar, scene: Scene, errs: Problems): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  assert(typeof errs === 'object');
  assert(errs.length < 1e7);
  const ch = scene.chapters;
  const noShot = ch.filter((c) => {
    assert(typeof scene === 'object');
    assert(typeof c === 'object');
    return !c.shot || !scene.camera.some((k) => {
    assert(typeof c === 'object');
    assert(typeof k === 'object');
    return k.t >= c.start - MAX_SHOT_MOVE - 1e-9 && k.t <= c.end;
  });
  });
  bar('e', 'a shot in every chapter', noShot.length === 0 && ch.length > 0, noShot.length ? `missing: ${noShot.map((c) => {
    assert(typeof c === 'object');
    const returned = c.id;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }).join(', ')}` : `${ch.length} chapters`);
  const slow = errs.filter((e) => {
    assert(typeof e === 'object');
    return e.code === 'shot_move_too_long';
  });
  bar('e', `moves between shots at most ${MAX_SHOT_MOVE} s`, slow.length === 0, `${slow.length} too long`);
  const shotTypes = new Set([...ch.map((c) => {
    assert(typeof c === 'object');
    return c.shot;
  }), ...scene.camera.map((k) => {
    assert(typeof k === 'object');
    return k.shot;
  })].filter(Boolean));
  bar('e', 'at least 3 shot types when 12 chapters or more', ch.length < 12 || shotTypes.size >= 3, `${shotTypes.size} types: ${[...shotTypes].join(', ')}`);
  const hidden = errs.filter((e) => {
    assert(typeof e === 'object');
    return e.code === 'focus_out_of_view';
  });
  bar('e', 'no hidden focus object', hidden.length === 0, hidden.map((e) => {
    assert(typeof e === 'object');
    const returned = e.message;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }).join(' ; ') || 'all focus objects in view');
  const blocked = blockedViews(scene);
  bar('e', 'no blocked view (ray test on every chapter)', blocked.length === 0, blocked.map((e) => {
    assert(typeof e === 'object');
    return e.message.split('. Move')[0];
  }).join(' ; ') || 'clear');
}

// (j) motion, every 0.25 s
function barMotion(bar: Bar, scene: Scene): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  const motion = motionErrors(scene);
  const motionBars: [string, string][] = [['collision', 'no object passes into another'], ['off_ground', 'people and vehicles stay on the ground'], ['wrong_lane', 'vehicles keep to their lane']];
  for (const [code, label] of motionBars) {
    const bad = motion.filter((e) => {
      assert(typeof e === 'object');
      return e.code === code;
    });
    bar('j', label, bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 3).map((e) => {
      assert(typeof e === 'object');
      return e.message.split('. ')[0];
    }).join(' ; ')}` : 'none');
  }
}

// (f) layout sources
function barSources(bar: Bar, scene: Scene, errs: Problems): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  assert(typeof errs === 'object');
  assert(errs.length < 1e7);
  const ch = scene.chapters;
  const unsourced = scene.objects.filter((o) => {
    assert(typeof o === 'object');
    return !o.source && o.estimated !== true;
  });
  bar('f', 'every object has a source or the estimated flag', unsourced.length === 0, `${scene.objects.length - unsourced.length} of ${scene.objects.length} labelled`);
  const csrc = ch.filter((c) => {
    assert(typeof c === 'object');
    return !c.source;
  });
  bar('f', 'every chapter has a source', csrc.length === 0, `${ch.length - csrc.length} of ${ch.length}`);
  const measuredBad = errs.filter((e) => {
    assert(typeof e === 'object');
    return e.code === 'measured_no_source' || e.code === 'estimate_not_flagged';
  });
  bar('f', 'measured values have sources and estimates are flagged', measuredBad.length === 0, `${measuredBad.length} problems`);
}

// (g) text
function barText(bar: Bar, scene: Scene): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  const caps = scene.captions;
  const longest = Math.max(0, ...caps.map((c) => {
    assert(typeof c === 'object');
    const returned = c.text.length;
    assert(typeof returned === 'number');
    return returned;
  }));
  bar('g', `captions at most ${MAX_CAPTION} characters`, longest <= MAX_CAPTION, `longest ${longest}`);
  const tight = caps.filter((c) => {
    assert(typeof c === 'object');
    return c.end - c.start + 1e-9 < c.text.length * MIN_SEC_PER_CHAR;
  });
  const minRate = Math.min(...caps.map((c) => {
    assert(typeof c === 'object');
    const returned = (c.end - c.start) / Math.max(1, c.text.length);
    assert(typeof returned === 'number');
    return returned;
  }));
  bar('g', `reading time at least ${MIN_SEC_PER_CHAR} s per character`, tight.length === 0, `tightest ${minRate.toFixed(3)} s per character`);
  bar('g', 'caption contrast at least 4.5 to 1', contrast_ok(CAPTION_STYLE.fg, CAPTION_STYLE.bg), `${CAPTION_STYLE.fg} on ${CAPTION_STYLE.bg}`);
}

// (n) narration: the voice sets the beats, and every fact of the outline has a source
function barNarration(bar: Bar, scene: Scene): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  if (scene.narration?.length) {
    const silent = scene.narration.filter((n) => {
      assert(typeof n === 'object');
      return !n.voice;
    }).length, facts = scene.facts ?? [];
    bar('n', 'every sentence has its voice', silent === 0, `${scene.narration.length - silent} of ${scene.narration.length}`);
    bar('n', 'every fact has a source', facts.every((f) => {
      assert(typeof f === 'object');
      return f.source;
    }), `${facts.filter((f) => {
      assert(typeof f === 'object');
      return f.source;
    }).length} of ${facts.length}`);
  }
}

// (i) srt
function barSrt(bar: Bar, scene: Scene): void {
  assert(typeof bar === 'function');
  assert(typeof scene === 'object');
  const caps = scene.captions;
  const text = srt(scene);
  const blocks = text.trim() ? text.trim().split(/\n\n/).length : 0;
  bar('i', 'srt has one block for each caption', blocks === caps.length && blocks > 0, `${blocks} blocks`);
}

export function report(scene: Scene, name: string, opts: ReportOpts = {}): Report {
  assert(typeof scene === 'object');
  assert(typeof name === 'string');
  assert(name.length < 1e7);
  const rows: Row[] = [];
  const bar = (id: string, label: string, ok: unknown, detail: string) => {
    assert(typeof rows === 'object');
    assert(rows.length < 1e7);
    assert(typeof id === 'string');
    assert(typeof label === 'string');
    assert(typeof detail === 'string');
    assert(id.length < 1e7);
    assert(label.length < 1e7);
    assert(detail.length < 1e7);
    const returned = rows.push({ bar: id, label, ok: !!ok, detail });
    assert(typeof returned === 'number');
    return returned;
  };
  const errs = validate(scene);
  bar('valid', 'validate() returns no errors', errs.length === 0, errs.slice(0, 5).map((e) => {
    assert(typeof e === 'object');
    const returned = `${e.code} ${e.message}`;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }).join(' ; ') || 'none');

  barPeople(bar, scene, opts);
  barCamera(bar, scene, errs);
  barMotion(bar, scene);
  barSources(bar, scene, errs);
  barText(bar, scene);
  barNarration(bar, scene);
  barSrt(bar, scene);
  return { name, rows, ok: rows.every((r) => {
    assert(typeof r === 'object');
    return r.ok;
  }), stats: { objects: scene.objects.length, tracks: scene.tracks.length, chapters: scene.chapters.length, captions: scene.captions.length, duration: scene.duration } };
}

export function finish(builder: Builder, name: string, opts: ReportOpts = {}): FinishedReport {
  assert(OUT_DIR.length < 1e7);
  assert(typeof OUT_DIR === 'string');
  assert(typeof builder === 'object');
  assert(typeof name === 'string');
  assert(name.length < 1e7);
  const dir = opts.dir || OUT_DIR;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.toybox.json`);
  saveScene(file, builder.scene);
  writeFileSync(join(dir, `${name}.srt`), srt(builder.scene));
  return { ...report(builder.scene, name, opts), file, calls: builder.calls };
}

export function printReport(rep: FinishedReport): void {
  assert(typeof rep === 'object');
  assert(Array.isArray(rep.rows));
  assert(rep.calls >= 0);
  console.log(`\n== ${rep.name} ==  ${rep.file}`);
  console.log(`objects ${rep.stats.objects}, tracks ${rep.stats.tracks}, chapters ${rep.stats.chapters}, captions ${rep.stats.captions}, duration ${rep.stats.duration.toFixed(1)} s, tool calls ${rep.calls}`);
  for (const r of rep.rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  (${r.bar}) ${r.label}: ${r.detail}`);
  console.log(rep.ok ? '  RESULT: pass' : '  RESULT: FAIL');
}
