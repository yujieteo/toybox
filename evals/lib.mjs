// Shared by the eval scripts: a builder that uses only the tool commands, and the quality-bar report.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newScene, validate, srt, saveScene, contrast_ok, CAPTION_STYLE, loadCatalogue, blockedViews, motionErrors, MAX_CAPTION, MIN_SEC_PER_CHAR, MAX_SHOT_MOVE } from '../core/scene.mjs';
import { runTool } from '../core/commands.mjs';

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out');

export class Builder {
  constructor(opts) { this.scene = newScene(opts); this.calls = 0; }
  cmd(tool, args, ctx = {}) {
    this.calls++;
    const r = runTool(this.scene, tool, args, { catalogue: loadCatalogue(), ...ctx });
    if (!r.ok) throw new Error(`${tool} ${JSON.stringify(args).slice(0, 200)} failed: ${r.errors.map((e) => `${e.code}: ${e.message}`).join(' | ')}`);
    return r.result;
  }
}

// Deterministic random numbers for scripts (the tools have their own seeds).
export function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Quality bars b, e, f, g, i, j from docs/design.md section 11, computed from the scene file.
export function report(scene, name, opts = {}) {
  const rows = [];
  const bar = (id, label, ok, detail) => rows.push({ bar: id, label, ok: !!ok, detail });
  const errs = validate(scene);
  bar('valid', 'validate() returns no errors', errs.length === 0, errs.slice(0, 5).map((e) => `${e.code} ${e.message}`).join(' ; ') || 'none');

  // (b) people
  const people = scene.objects.filter((o) => o.model === 'person');
  const variants = new Set(people.map((p) => p.variant));
  const poses = new Set(people.map((p) => p.pose).filter(Boolean));
  for (const t of scene.tracks) if (t.channel === 'pose') for (const k of t.keys) poses.add(k.v);
  const walks = poses.has('walk');
  if (opts.fullPeople !== false) {
    bar('b', 'at least 10 distinct people variants', variants.size >= 10, `${variants.size} variants`);
    bar('b', 'at least 8 poses', poses.size >= 8, `${poses.size} poses: ${[...poses].join(', ')}`);
  }
  bar('b', 'a walk cycle is present', walks, walks ? 'walk pose used' : 'no walk');

  // (e) camera
  const ch = scene.chapters;
  const noShot = ch.filter((c) => !c.shot || !scene.camera.some((k) => k.t >= c.start - MAX_SHOT_MOVE - 1e-9 && k.t <= c.end));
  bar('e', 'a shot in every chapter', noShot.length === 0 && ch.length > 0, noShot.length ? `missing: ${noShot.map((c) => c.id).join(', ')}` : `${ch.length} chapters`);
  const slow = errs.filter((e) => e.code === 'shot_move_too_long');
  bar('e', `moves between shots at most ${MAX_SHOT_MOVE} s`, slow.length === 0, `${slow.length} too long`);
  const shotTypes = new Set([...ch.map((c) => c.shot), ...scene.camera.map((k) => k.shot)].filter(Boolean));
  bar('e', 'at least 3 shot types when 12 chapters or more', ch.length < 12 || shotTypes.size >= 3, `${shotTypes.size} types: ${[...shotTypes].join(', ')}`);
  const hidden = errs.filter((e) => e.code === 'focus_out_of_view');
  bar('e', 'no hidden focus object', hidden.length === 0, hidden.map((e) => e.message).join(' ; ') || 'all focus objects in view');
  const blocked = blockedViews(scene);
  bar('e', 'no blocked view (ray test on every chapter)', blocked.length === 0, blocked.map((e) => e.message.split('. Move')[0]).join(' ; ') || 'clear');

  // (j) motion, every 0.25 s
  const motion = motionErrors(scene);
  for (const [code, label] of [['collision', 'no object passes into another'], ['off_ground', 'people and vehicles stay on the ground'], ['wrong_lane', 'vehicles keep to their lane']]) {
    const bad = motion.filter((e) => e.code === code);
    bar('j', label, bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 3).map((e) => e.message.split('. ')[0]).join(' ; ')}` : 'none');
  }

  // (f) layout sources
  const unsourced = scene.objects.filter((o) => !o.source && o.estimated !== true);
  bar('f', 'every object has a source or the estimated flag', unsourced.length === 0, `${scene.objects.length - unsourced.length} of ${scene.objects.length} labelled`);
  const csrc = ch.filter((c) => !c.source);
  bar('f', 'every chapter has a source', csrc.length === 0, `${ch.length - csrc.length} of ${ch.length}`);
  const measuredBad = errs.filter((e) => e.code === 'measured_no_source' || e.code === 'estimate_not_flagged');
  bar('f', 'measured values have sources and estimates are flagged', measuredBad.length === 0, `${measuredBad.length} problems`);

  // (g) text
  const caps = scene.captions;
  const longest = Math.max(0, ...caps.map((c) => c.text.length));
  bar('g', `captions at most ${MAX_CAPTION} characters`, longest <= MAX_CAPTION, `longest ${longest}`);
  const tight = caps.filter((c) => c.end - c.start + 1e-9 < c.text.length * MIN_SEC_PER_CHAR);
  const minRate = Math.min(...caps.map((c) => (c.end - c.start) / Math.max(1, c.text.length)));
  bar('g', `reading time at least ${MIN_SEC_PER_CHAR} s per character`, tight.length === 0, `tightest ${minRate.toFixed(3)} s per character`);
  bar('g', 'caption contrast at least 4.5 to 1', contrast_ok(CAPTION_STYLE.fg, CAPTION_STYLE.bg), `${CAPTION_STYLE.fg} on ${CAPTION_STYLE.bg}`);

  // (i) srt
  const text = srt(scene);
  const blocks = text.trim() ? text.trim().split(/\n\n/).length : 0;
  bar('i', 'srt has one block for each caption', blocks === caps.length && blocks > 0, `${blocks} blocks`);
  return { name, rows, ok: rows.every((r) => r.ok), stats: { objects: scene.objects.length, tracks: scene.tracks.length, chapters: ch.length, captions: caps.length, duration: scene.duration } };
}

export function finish(builder, name, opts = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}.toybox.json`);
  saveScene(file, builder.scene);
  writeFileSync(join(OUT_DIR, `${name}.srt`), srt(builder.scene));
  const rep = report(builder.scene, name, opts);
  rep.file = file; rep.calls = builder.calls;
  return rep;
}

export function printReport(rep) {
  console.log(`\n== ${rep.name} ==  ${rep.file}`);
  console.log(`objects ${rep.stats.objects}, tracks ${rep.stats.tracks}, chapters ${rep.stats.chapters}, captions ${rep.stats.captions}, duration ${rep.stats.duration.toFixed(1)} s, tool calls ${rep.calls}`);
  for (const r of rep.rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  (${r.bar}) ${r.label}: ${r.detail}`);
  console.log(rep.ok ? '  RESULT: pass' : '  RESULT: FAIL');
}
