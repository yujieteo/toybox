// One function per tool: (scene, args, ctx) => { ok: true, result } | { ok: false, errors: [{code, message}] }
// A command changes the scene only when the result is valid.
import { writeFileSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute, basename } from 'node:path';
import { newScene, validate, loadCatalogue, objectBounds, srt, saveScene, trackOf, checkScene, motionErrors, viewBlocks, focusAt, motionEnd,
  HARD_CODES, POSES, SHOTS, LOOKS, GROUNDS, CHANNELS, EASES, MOVES, ASPECT, sub, dot, cross, norm } from './scene.ts';
import { retime, cueTime, cued, narrationLength } from './narration.ts';
import { voiceFile, voiceSeconds } from './voice.ts';
import { captureCall } from './capture.ts';
import { isRecord, messageOf } from '../web/dom.js';
import { rotYaw } from './geom.ts';
import type { Scene, SceneObject, SceneMap, Vec3, Cue, Catalogue, Model, TrackKey, CameraFrame, Chapter, Callout, NarrationBeat, Motion, Ease, Channel, Look, Ground, Shot } from '../web/types.js';
import { parseOverpass, toMapBlock, writeSceneOdbl, validBbox } from './osm.ts';
import { assert } from './assert.ts';

export interface ToolError { code: string; message: string; path?: string }
export interface ToolOk<R = unknown> { ok: true; result: R }
export interface ToolFail { ok: false; errors: ToolError[] }
export type ToolResult<R = unknown> = ToolOk<R> | ToolFail;
// What a caller gives to a tool besides the scene.
export interface ToolContext {
  catalogue?: Catalogue;
  overpass?: unknown;
  odblPath?: string;
  sceneDir?: string;
  exportDir?: string;
}
export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: readonly unknown[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
}
export interface ToolSpec { name: string; description: string; inputSchema: JsonSchema }
export type ToolRun = (scene: Scene, args?: unknown, ctx?: ToolContext | null) => ToolResult;

class Fail extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
function fail(errors: ToolError[]): ToolFail { 
  assert(typeof errors === 'object');
  assert(errors.length < 1e7);
  return ({ ok: false, errors }); }
function okr<R>(result: R): ToolOk<R> { 
  return ({ ok: true, result }); }
const D = Math.PI / 180;
function r2(v: number): number { 
  assert(typeof v === 'number');
  assert(!Number.isNaN(v));
  const returned = Math.round(v * 1000) / 1000;
  assert(typeof returned === 'number');
  return returned; }
function r3(v: readonly number[]): Vec3 { 
  assert(typeof v === 'object');
  assert(v.length < 1e7);
  return [r2(v[0] ?? 0), r2(v[1] ?? 0), r2(v[2] ?? 0)]; }
function ceilMs(v: number): number { 
  assert(typeof v === 'number');
  assert(!Number.isNaN(v));
  const returned = Math.ceil(v * 1000 - 1e-6) / 1000;
  assert(typeof returned === 'number');
  return returned; }
function nth<T>(arr: readonly T[], i: number): T {
  assert(typeof arr === 'object');
  assert(typeof i === 'number');
  assert(arr.length < 1e7);
  assert(!Number.isNaN(i));
  const v = arr[i];
  if (v === undefined) throw new Error(`Index ${i} is out of range.`);
  return v;
}
const isXZ2 = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number');
type XZ = [number, number] | Vec3;
type Timed<T> = T & { t: number };
interface Cam { eye: Vec3; target: Vec3; fov?: number }
interface FrameOpts { view?: number; elevation?: number; margin?: number; distance?: number; fov?: number }


// ---------- JSON Schema pieces and a small argument checker
const num: JsonSchema = { type: 'number' };
const str: JsonSchema = { type: 'string' };
const vec3: JsonSchema = { type: 'array', items: num, minItems: 3, maxItems: 3 };
const vecXZ: JsonSchema = { description: '[x, z] (y is 0) or [x, y, z] in metres. x is east, z is south.', type: 'array', items: num, minItems: 2, maxItems: 3 };
const strArr: JsonSchema = { type: 'array', items: str };
const common = {
  id: { type: 'string', description: 'Object id. Auto-made when omitted.' },
  label: { type: 'string' }, tags: strArr,
  source: { type: 'string', description: 'Where the claim comes from (URL or text). Start with "estimated" for a guess.' },
  estimated: { type: 'boolean', description: 'True when no source gives this value.' },
  measured: { type: 'boolean', description: 'True when the value is a measured fact. Needs source.' },
} satisfies Record<string, JsonSchema>;
const cueArg: JsonSchema = { type: 'array', minItems: 1, maxItems: 3, description: '[sentence, "word", offset]: the time when the narration says "word" in sentence (0 is the first), plus offset seconds. [sentence] is the start of the sentence. The time follows the voice when the narration changes.' };

type ArgJob =
  | { kind: 'node'; schema: JsonSchema; v: unknown; path: string; out: ToolError[] }
  | { kind: 'tail'; schema: JsonSchema; v: unknown; path: string; out: ToolError[] }
  | { kind: 'any'; sinks: ToolError[][]; path: string; out: ToolError[] };

// Checks one value against its schema, then lists the checks its parts and its tail still need, in order.
function checkNode(job: Extract<ArgJob, { kind: 'node' }>): ArgJob[] {
  assert(typeof job === 'object');
  const { schema, v, path, out } = job;
  const e = (m: string) => {
    assert(typeof m === 'string');
    assert(m.length < 1e7);
    const returned = out.push({ code: 'bad_args', message: `${path}: ${m}` });
    assert(typeof returned === 'number');
    return returned;
  };
  if (schema.anyOf) {
    const sinks: ToolError[][] = [];
    const alternatives = schema.anyOf.map((s): ArgJob => {
      assert(typeof s === 'object');
      const sink: ToolError[] = [];
      sinks.push(sink);
      return { kind: 'node', schema: s, v, path, out: sink };
    });
    return [{ kind: 'any', sinks, path, out }, ...alternatives.reverse()];
  }
  const parts: ArgJob[] = [];
  const t = schema.type;
  if (t === 'string' && typeof v !== 'string') e('must be a string.');
  else if (t === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) e('must be a number.');
  else if (t === 'integer' && !Number.isInteger(v)) e('must be an integer.');
  else if (t === 'boolean' && typeof v !== 'boolean') e('must be a boolean.');
  else if (t === 'array') {
    if (!Array.isArray(v)) e('must be an array.');
    else {
      if (schema.minItems !== undefined && v.length < schema.minItems) e(`needs at least ${schema.minItems} items.`);
      if (schema.maxItems !== undefined && v.length > schema.maxItems) e(`needs at most ${schema.maxItems} items.`);
      const items = schema.items;
      if (items) v.forEach((x: unknown, i: number) => {
        assert(typeof parts === 'object');
        assert(typeof items === 'object');
        assert(parts.length < 1e7);
        assert(typeof i === 'number');
        assert(!Number.isNaN(i));
        const returned = parts.push({ kind: 'node', schema: items, v: x, path: `${path}[${i}]`, out });
        assert(typeof returned === 'number');
        return returned;
      });
    }
  } else if (t === 'object') {
    if (!isRecord(v)) e('must be an object.');
    else {
      for (const k of schema.required || []) if (v[k] === undefined) out.push({ code: 'bad_args', message: `${path}.${k}: is required.` });
      for (const [k, s] of Object.entries(schema.properties || {})) if (v[k] !== undefined && v[k] !== null) parts.push({ kind: 'node', schema: s, v: v[k], path: `${path}.${k}`, out });
      if (schema.additionalProperties === false) for (const k of Object.keys(v)) if (!schema.properties?.[k]) out.push({ code: 'bad_args', message: `${path}.${k}: unknown argument.` });
    }
  }
  return [{ kind: 'tail', schema, v, path, out }, ...parts.reverse()];
}

// An explicit stack, not recursion (JPL rule 1): the errors come out in the same order as a depth-first walk.
export function checkArgs(schema: JsonSchema, v: unknown, path = 'args'): ToolError[] {
  assert(typeof schema === 'object');
  const errs: ToolError[] = [];
  const stack: ArgJob[] = [{ kind: 'node', schema, v, path, out: errs }];
  for (let job = stack.pop(); job !== undefined; job = stack.pop()) {
    if (job.kind === 'node') stack.push(...checkNode(job));
    else if (job.kind === 'any') {
      if (!job.sinks.some((sink) => {
        assert(typeof sink === 'object');
        assert(sink.length < 1e7);
        return sink.length === 0;
      })) job.out.push({ code: 'bad_args', message: `${job.path}: does not match any allowed form.` });
    } else {
      if (job.schema.enum && !job.schema.enum.includes(job.v)) job.out.push({ code: 'bad_args', message: `${job.path}: must be one of ${job.schema.enum.join(', ')}.` });
      if (job.schema.minimum !== undefined && typeof job.v === 'number' && job.v < job.schema.minimum) job.out.push({ code: 'bad_args', message: `${job.path}: must be at least ${job.schema.minimum}.` });
    }
  }
  return errs;
}

// The one place that gives typed arguments to a tool: the checker has just compared them with the schema.
function validArgs<A>(schema: JsonSchema, args: unknown): { ok: true; args: A } | ToolFail {
  assert(typeof schema === 'object');
  const errs = checkArgs(schema, args);
  if (errs.length) return fail(errs);
  return { ok: true, args: args as A }; // allow-unsafe: args were validated against the tool's inputSchema by checkArgs
}

// ---------- helpers
function cloneScene(s: Scene): Scene { 
  assert(typeof s === 'object');
  return structuredClone(s); }
function replaceScene(target: Scene, src: Scene): void {
  assert(typeof target === 'object');
  assert(typeof src === 'object');
  const bag = target as unknown as Record<string, unknown>; // allow-unsafe: a scene is a plain object, and every key of it is dropped
  for (const k of Object.keys(bag)) delete bag[k];
  Object.assign(target, src);
}
function maxTime(s: Scene): number {
  assert(typeof s === 'object');
  let m = 0;
  const see = (t: unknown) => { 
    if (typeof t === 'number' && Number.isFinite(t) && t > m) m = t; };
  for (const t of s.tracks || []) for (const k of t.keys || []) see(k.t);
  for (const k of s.camera || []) see(k.t);
  for (const k of s.lighting || []) see(k.t);
  for (const k of [...(s.chapters || []), ...(s.captions || []), ...(s.callouts || [])]) see(k.end);
  for (const k of s.motions || []) see(motionEnd(k));   // the whole motion, not only t + d
  for (const n of s.narration || []) see(n?.end);        // the voice is content too
  see(narrationLength(s.narration));
  return m;
}
function errKey(e: ToolError): string { 
  assert(typeof e === 'object');
  const returned = `${e.code}|${e.message}`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned; }
function hardErrors(errs: ToolError[]): ToolError[] { 
  assert(typeof errs === 'object');
  assert(errs.length < 1e7);
  return errs.filter((e) => {
  assert(typeof e === 'object');
  return HARD_CODES.has(e.code);
}); }

// Apply fn to a copy. Keep the copy only if it adds no new hard validation error.
function mutate<R>(scene: Scene, ctx: ToolContext | null | undefined, fn: (copy: Scene, cat: Catalogue) => R): ToolResult<R> {
  assert(typeof scene === 'object');
  assert(typeof fn === 'function');
  const cat = ctx?.catalogue || loadCatalogue();
  // A duration that the tools computed from the content can be recomputed after an edit that makes
  // the content shorter (make_voice after stand-in times, remove, a shorter track). A duration that
  // a scene file set longer than the content is a floor and stays.
  const autoDuration = Math.abs((scene.duration || 0) - r2(maxTime(scene))) <= 0.001;
  const copy = cloneScene(scene);
  let result: R;
  try {
    result = fn(copy, cat);
    if (copy.narration?.length || cued(copy).length) { retime(copy); reframe(copy, cat); }
  } catch (e) {
    if (e instanceof Fail) return fail([{ code: e.code, message: e.message }]);
    if (e instanceof Error && (e.message.startsWith('Cue ') || e.message.includes('is not in sentence'))) return fail([{ code: 'bad_cue', message: e.message }]);
    throw e;
  }
  // Ceil to the millisecond: duration must never be shorter than the unrounded content end, or
  // validate would report duration_too_short after a command that succeeded (and no tool can set it).
  copy.duration = Math.max(autoDuration ? 0 : copy.duration || 0, ceilMs(maxTime(copy)));
  const after = hardErrors(validate(copy, cat));
  if (after.length) {
    const before = new Set(hardErrors(validate(scene, cat)).map(errKey));
    const added = after.filter((e) => {
      assert(typeof e === 'object');
      return !before.has(errKey(e));
    });
    if (added.length) {
      const shown: ToolError[] = added.slice(0, 8).map((e) => {
        assert(typeof e === 'object');
        return { code: e.code, message: e.message, path: e.path };
      });
      if (added.length > 8) shown.push({ code: 'more_errors', message: `${added.length - 8} more errors not shown.` });
      return fail(shown);
    }
  }
  replaceScene(scene, copy);
  return okr(result);
}

// A framed camera key computes its eye and target again at its time, after a cue moved the key or its subject.
function reframe(s: Scene, cat: Catalogue): void {
  assert(typeof s === 'object');
  assert(typeof cat === 'object');
  for (const k of s.camera || []) if (k.frame) {
    const { ids, ...opts } = k.frame;
    const f = frameCamera(s, cat, ids, k.shot ?? 'wide', k.t, { ...opts, fov: k.fov });
    k.eye = f.eye; k.target = f.target;
  }
}

// The time that a: gives with cue (a cue of the narration) or with key (a number).
function timeArg(s: Scene, cue: Cue | undefined, value: number | undefined, key = 't', cueKey = 'cue'): number {
  assert(typeof s === 'object');
  if (cue) { try { return cueTime(s.narration, cue); } catch (e) { throw new Fail('bad_cue', messageOf(e)); } }
  if (value === undefined) throw new Fail('bad_args', `Give ${key} or ${cueKey}.`);
  return value;
}
const find = (s: Scene, id: string): SceneObject => { 
  assert(typeof s === 'object');
  assert(typeof id === 'string');
  assert(id.length < 1e7);
  const o = s.objects.find((x) => x.id === id); if (!o) throw new Fail('unknown_object', `No object with id "${id}".`); return o; };
function posOf(o: SceneObject): Vec3 { 
  assert(typeof o === 'object');
  return o.at ?? [0, 0, 0]; }
function catModel(cat: Catalogue, model: string): Model {
  assert(typeof cat === 'object');
  assert(typeof model === 'string');
  assert(model.length < 1e7);
  const m = cat.models.find((x) => {
    assert(typeof x === 'object');
    return x.id === model;
  });
  if (!m) {
    const near = cat.models.filter((x) => {
      assert(typeof x === 'object');
      return x.id.includes(String(model).split('-')[0] ?? '') || x.name.toLowerCase().includes(String(model).toLowerCase());
    }).slice(0, 5).map((x) => {
      assert(typeof x === 'object');
      const returned = x.id;
      assert(typeof returned === 'string');
      assert(returned.length < 1e7);
      return returned;
    });
    throw new Fail('unknown_model', `Unknown model "${model}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ' Use list_models to find ids.'}`);
  }
  return m;
}
function modelOrFail(cat: Catalogue, model: string): Model | null {
  assert(typeof cat === 'object');
  assert(typeof model === 'string');
  assert(model.length < 1e7);
  if (model === 'person') return null;
  return catModel(cat, model);
}
function uniqueId(s: Scene, base: string): string {
  assert(typeof s === 'object');
  assert(typeof base === 'string');
  assert(base.length < 1e7);
  const used = new Set(s.objects.map((o) => {
    assert(typeof o === 'object');
    const returned = o.id;
    assert(typeof returned === 'string');
    assert(returned.length < 1e7);
    return returned;
  }));
  if (!used.has(base) && base !== 'person') return base;
  let n = 1; while (used.has(`${base}-${n}`)) n++;
  const returned = `${base}-${n}`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}
function at3(a: XZ, y0 = 0): Vec3 { 
  assert(typeof a === 'object');
  assert(a.length < 1e7);
  return (a.length === 2 ? [a[0], y0, a[1]] : [a[0], a[1], a[2]]); }
function scaleOf(v: number | Vec3 | undefined): Vec3 { return (v === undefined ? [1, 1, 1] : typeof v === 'number' ? [v, v, v] : v); }
function mulberry32(a: number): () => number { 
  assert(typeof a === 'number');
  assert(!Number.isNaN(a));
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; const returned = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
assert(typeof returned === 'number');
return returned; }; }
const SHIRTS = ['#c8553d', '#3f6e9a', '#d9b44a', '#6f9a6a', '#a99bb8', '#e8dcc0', '#5f9ea0', '#b8765f', '#8c8c86'];
const PANTS = ['#3a3f47', '#4a5568', '#6b5b4b', '#2f4a6b', '#55595f'];
// The item that a random number r in [0, 1) picks.
function pick<T>(arr: readonly T[], r: number): T { 
  assert(typeof arr === 'object');
  assert(typeof r === 'number');
  assert(arr.length < 1e7);
  assert(!Number.isNaN(r));
  return nth(arr, Math.floor(r * arr.length)); }

// ---------- argument types (each one follows the inputSchema of its tool)
interface PlaceProps {
  model: string; at?: XZ; yaw?: number; scale?: number | Vec3; flip?: boolean; colors?: Record<string, string>;
  variant?: number; pose?: string; outfit?: string;
  id?: string; label?: string; tags?: string[]; source?: string; estimated?: boolean; measured?: boolean;
}
interface PlaceArgs extends PlaceProps { at: XZ }
interface PlaceNearArgs extends PlaceProps { near: string; offset?: XZ }
interface PlaceGroupArgs extends PlaceArgs {
  count: number; pattern?: 'line' | 'grid' | 'ring' | 'scatter'; spacing?: number; seed?: number; variants?: number[]; poses?: string[];
  angle?: number; cols?: number; radius?: number; area?: [number, number]; face?: 'center' | 'out' | 'none';
}
interface ListModelsArgs { query?: string; kind?: string }
interface NewSceneArgs { title?: string; author?: string; ground?: Ground; look?: Look; size?: [number, number]; color?: string }
interface GetSceneArgs { full?: boolean }
interface TransformArgs { id: string; at?: XZ; yaw?: number; scale?: number | Vec3; flip?: boolean }
interface DuplicateArgs { id: string; count?: number; offset?: XZ }
interface RemoveArgs { id: string }
interface Opening { wall: 'n' | 's' | 'e' | 'w'; at: number; width?: number }
interface BuildRoomArgs { id: string; at: XZ; size: Vec3; doors?: Opening[]; windows?: Opening[]; floor?: boolean; ceiling?: boolean; source?: string; estimated?: boolean }
interface BuildStairsArgs { id?: string; from: XZ; yaw?: number; height?: number; width?: number; source?: string; estimated?: boolean }
interface PlaceSignArgs { text: string; at: XZ; yaw?: number; model?: string; id?: string; source?: string; estimated?: boolean; scale?: number | Vec3 }
interface SetPoseArgs { id: string; t?: number; cue?: Cue; pose: string }
interface KeyArg { t?: number; cue?: Cue; v: unknown; ease?: Ease }
interface AnimateArgs { id: string; channel: Channel; keys: KeyArg[] }
interface MoveAlongArgs { id: string; path: XZ[]; speed?: number; times?: number[]; start?: number; cue?: Cue; pose?: string; end_pose?: string }
interface SetCameraArgs {
  t?: number; cue?: Cue; shot: Shot; frame?: string[]; eye?: Vec3; target?: Vec3; fov?: number; ease?: Ease;
  view?: number; elevation?: number; margin?: number; distance?: number; cut?: boolean;
}
interface SetLightingArgs { t?: number; cue?: Cue; look: Look }
interface AddCaptionArgs { start: number; end: number; text: string }
interface AddCalloutArgs { start?: number; end?: number; cue?: Cue; end_cue?: Cue; text: string; object?: string; source?: string; estimated?: boolean; measured?: boolean }
interface AddChapterArgs {
  start?: number; end?: number; cue?: Cue; end_cue?: Cue; title: string; clock?: string; caption?: string; focus?: string[]; shot?: Shot;
  source?: string; estimated?: boolean; measured?: boolean; id?: string;
}
interface SetBackdropArgs {
  ground?: Ground; size?: [number, number]; color?: string; origin?: { lat: number; lon: number }; onemap?: { zoom?: number; style?: string };
  source?: string; estimated?: boolean; drive?: 'left' | 'right';
}
interface ImportOsmArgs { bbox: [number, number, number, number]; bearing?: number }
interface SetCutawayArgs { ceilings?: boolean; nearWalls?: boolean }
interface AddCreditArgs { text: string }
interface SentenceObject { text: string; pause?: number; facts?: string[] }
interface NarrateArgs { sentences: (string | SentenceObject)[] }
type NoArgs = Record<string, never>;
interface AddFactArgs { id?: string; text: string; source: string }
interface AddMotionArgs { id: string; move: string; t?: number; cue?: Cue; d?: number; h?: number; x?: number; y?: number; deg?: number }
interface RenderPreviewArgs { t: number }
interface ExportSceneArgs { path?: string }
interface GuideArgs { name?: string }

function makeObject(s: Scene, cat: Catalogue, a: PlaceProps, extra: { at?: Vec3 } = {}): SceneObject {
  assert(typeof s === 'object');
  assert(typeof cat === 'object');
  assert(typeof a === 'object');
  modelOrFail(cat, a.model);
  const person = a.model === 'person';
  const id = a.id || uniqueId(s, person ? 'p' : a.model);
  if (!extra.at && !a.at) throw new Fail('bad_args', 'Give at.');
  return {
    id, model: a.model,
    ...(person ? { variant: a.variant ?? (s.objects.filter((x) => {
      assert(typeof x === 'object');
      return x.model === 'person';
    }).length % 24) } : {}),
    at: extra.at ?? at3(a.at ?? [0, 0]),
    yaw: a.yaw ?? 0,
    scale: scaleOf(a.scale),
    flip: !!a.flip,
    ...(a.colors ? { colors: a.colors } : {}),
    ...(person ? { pose: a.pose || 'stand' } : a.pose ? { pose: a.pose } : {}),
    ...(person && a.outfit ? { outfit: a.outfit } : {}),
    tags: a.tags || [],
    label: a.label || '',
    parent: null,
    source: a.source || '',
    estimated: !!a.estimated,
    ...(a.measured !== undefined ? { measured: a.measured } : {}),
    hidden: false,
  };
}
const placeProps = {
  model: { type: 'string', description: 'Catalogue id (see list_models) or "person".' },
  at: vecXZ, yaw: { type: 'number', description: 'Degrees, counter-clockwise from above. 0 faces +z (south), 90 faces +x (east), 180 faces north, 270 faces west.' },
  scale: { anyOf: [num, vec3] }, flip: { type: 'boolean' }, colors: { type: 'object', description: 'Slot to hex colour. A person uses shirt and pants.' },
  variant: { type: 'integer', minimum: 0, description: 'Person face and body, 0 to 23.' }, pose: { type: 'string', enum: POSES },
  outfit: { type: 'string', description: 'Person uniform from list_models outfits, for example soc-riot or police. It sets the uniform colours and gear. See guide "people".' },
  ...common,
} satisfies Record<string, JsonSchema>;

// ---------- camera framing
interface ShotParam { elev: number; az: number; margin: number; min: number }
const SHOT_PARAMS: Record<string, ShotParam> = {
  wide: { elev: 28, az: 20, margin: 1.3, min: 10 },
  medium: { elev: 14, az: 20, margin: 1.2, min: 5 },
  close: { elev: 6, az: 15, margin: 1.15, min: 2.2 },
  top: { elev: 85, az: 0, margin: 1.25, min: 8 },
  follow: { elev: 12, az: 0, margin: 1.3, min: 4 },
  orbit: { elev: 20, az: 0, margin: 1.3, min: 8 },
};
function shotParams(shot: string): ShotParam {
  assert(typeof shot === 'string');
  assert(shot.length < 1e7);
  const P = SHOT_PARAMS[shot];
  if (!P) throw new Error(`Unknown shot "${shot}".`);
  return P;
}
export function frameCamera(scene: Scene, cat: Catalogue, ids: string[], shot: string, t: number, opts: FrameOpts = {}): { eye: Vec3; target: Vec3; fov: number; distance: number } {
  assert(typeof scene === 'object');
  assert(typeof cat === 'object');
  assert(typeof ids === 'object');
  assert(typeof shot === 'string');
  assert(typeof t === 'number');
  assert(ids.length < 1e7);
  assert(shot.length < 1e7);
  assert(!Number.isNaN(t));
  const bt = objectBounds(scene, cat, t);
  const bs = ids.map((id) => { 
    assert(typeof id === 'string');
    assert(id.length < 1e7);
    const b = bt[id]; if (!b) throw new Fail('unknown_object', `Cannot frame "${id}": no such object.`); return b; });
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const pts: Vec3[] = [];
  for (const b of bs) for (const y of [b.min[1], b.max[1]]) for (const c of b.corners) {
    pts.push([c[0], y, c[1]]);
    const q: Vec3 = [c[0], y, c[1]];
    for (let i = 0; i < 3; i++) { const v = q[i] ?? 0; min[i] = Math.min(min[i] ?? Infinity, v); max[i] = Math.max(max[i] ?? -Infinity, v); }
  }
  const P = shotParams(shot);
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  if (shot === 'close') center[1] = Math.max(center[1], min[1] + 0.7 * (max[1] - min[1]));
  let az = opts.view ?? P.az;
  if (shot === 'follow' && opts.view === undefined) az = (bs[0]?.yaw ?? 0) + 180;
  const el = opts.elevation ?? P.elev, fov = opts.fov ?? 50, margin = opts.margin ?? P.margin;
  const dir: Vec3 = [Math.sin(az * D) * Math.cos(el * D), Math.sin(el * D), Math.cos(az * D) * Math.cos(el * D)];
  const f: Vec3 = [-dir[0], -dir[1], -dir[2]];
  const right = norm(cross(f, [0, 1, 0])), up = cross(right, f);
  const tanV = Math.tan((fov * D) / 2), tanH = tanV * ASPECT;
  let d = opts.distance ?? P.min;
  if (opts.distance === undefined) {
    for (const p of pts) {
      const q = sub(p, center);
      d = Math.max(d, (margin * Math.abs(dot(q, right))) / tanH - dot(q, f), (margin * Math.abs(dot(q, up))) / tanV - dot(q, f));
    }
  }
  return { eye: r3([center[0] + dir[0] * d, center[1] + dir[1] * d, center[2] + dir[2] * d]), target: r3(center), fov, distance: r2(d) };
}

// What hides the subject from a camera at time t: [{ id, by }], plus { id: 'frame', by } when an occluder
// covers too much of the frame. The subject is the chapter focus at t (the check that validate does), or
// the framed objects when no chapter holds t.
function blocksAt(scene: Scene, cat: Catalogue, cam: Cam, ids: string[], t: number) {
  assert(typeof scene === 'object');
  assert(typeof cat === 'object');
  assert(typeof cam === 'object');
  assert(typeof ids === 'object');
  assert(typeof t === 'number');
  assert(ids.length < 1e7);
  assert(!Number.isNaN(t));
  const v = viewBlocks(scene, cat, { ...cam, fov: cam.fov ?? 50 }, focusAt(scene, t) ?? ids, t);
  return v.frame ? [...v.objects, { id: 'frame', by: v.frame }] : v.objects;
}
// Up to three view angles (with elevation) near the asked one that give a clear view of the frame.
function clearViews(scene: Scene, cat: Catalogue, ids: string[], a: Timed<SetCameraArgs>): { view: number; elevation: number }[] {
  assert(typeof scene === 'object');
  assert(typeof cat === 'object');
  assert(typeof ids === 'object');
  assert(ids.length < 1e7);
  const P = shotParams(a.shot), v0 = a.view ?? P.az, out: { view: number; elevation: number }[] = [];
  for (const el of [a.elevation ?? P.elev, Math.min(80, (a.elevation ?? P.elev) + 20)]) for (let k = 1; k <= 12 && out.length < 3; k++) for (const sg of [1, -1]) {
    const view = (((v0 + sg * k * 15) % 360) + 360) % 360;
    if (out.length >= 3 || out.some((o) => {
      assert(typeof view === 'number');
      assert(typeof el === 'number');
      assert(!Number.isNaN(view));
      assert(!Number.isNaN(el));
      assert(typeof o === 'object');
      return o.view === view && o.elevation === el;
    })) continue;
    const f = frameCamera(scene, cat, ids, a.shot, a.t, { ...a, view, elevation: el });
    if (!blocksAt(scene, cat, f, ids, a.t).length) out.push({ view, elevation: el });
  }
  return out;
}

// ---------- key helpers
function mergeKeys(scene: Scene, id: string, channel: Channel, keys: TrackKey[], holdBefore: boolean): void {
  assert(typeof scene === 'object');
  assert(typeof id === 'string');
  assert(typeof channel === 'string');
  assert(typeof keys === 'object');
  assert(typeof holdBefore === 'boolean');
  assert(id.length < 1e7);
  assert(channel.length < 1e7);
  assert(keys.length < 1e7);
  let tr = trackOf(scene, id, channel);
  if (!tr) { tr = { object: id, channel, keys: [] }; scene.tracks.push(tr); }
  const t0 = nth(keys, 0).t, t1 = nth(keys, keys.length - 1).t;
  tr.keys = tr.keys.filter((k) => {
    assert(typeof t0 === 'number');
    assert(typeof t1 === 'number');
    assert(!Number.isNaN(t0));
    assert(!Number.isNaN(t1));
    assert(typeof k === 'object');
    return k.t < t0 - 1e-9 || k.t > t1 + 1e-9;
  });
  const before = [...tr.keys].reverse().find((k) => {
    assert(typeof k === 'object');
    return k.t < t0;
  });
  if (before && holdBefore) before.ease = 'step';
  tr.keys.push(...keys);
  tr.keys.sort((a, b) => {
    assert(typeof a === 'object');
    assert(typeof b === 'object');
    const returned = a.t - b.t;
    assert(typeof returned === 'number');
    return returned;
  });
}
function wrapYaw(prev: number, y: number): number { 
  assert(typeof prev === 'number');
  assert(typeof y === 'number');
  assert(!Number.isNaN(prev));
  assert(!Number.isNaN(y));
  let d = (y - prev) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; const returned = prev + d;
assert(typeof returned === 'number');
return returned; }
// A cue as [sentence, word, offset] with the defaults filled in.
function cueParts(cue: Cue): [number, string, number] {
  assert(typeof cue === 'object');
  assert(cue.length < 1e7);
  const p: readonly (number | string | undefined)[] = cue;
  const [a, b, c] = p;
  return [typeof a === 'number' ? a : 0, typeof b === 'string' ? b : '', typeof c === 'number' ? c : 0];
}

// ---------- tools
const TOOL_NAMES = ['list_models', 'new_scene', 'get_scene', 'place', 'place_near', 'place_group', 'transform', 'duplicate', 'remove', 'build_room', 'build_stairs', 'place_sign',
  'set_pose', 'animate', 'move_along', 'set_camera', 'set_lighting', 'add_caption', 'add_callout', 'add_chapter', 'set_backdrop', 'import_osm', 'set_cutaway', 'add_credit',
  'narrate', 'make_voice', 'add_fact', 'add_motion', 'validate', 'render_preview', 'export_scene', 'guide'] as const;
type ToolName = (typeof TOOL_NAMES)[number];
interface ToolEntry extends ToolSpec { run: ToolRun }
const tools: ToolEntry[] = [];
// A tool is defined once. Its run function checks the arguments, then calls fn with typed arguments.
function defineTool<A>(name: ToolName, description: string, properties: Record<string, JsonSchema>, required: readonly string[],
  fn: (scene: Scene, a: A, ctx: ToolContext) => ToolResult, answer?: (s: Scene) => unknown): void {
  assert(typeof name === 'string');
  assert(typeof description === 'string');
  assert(typeof properties === 'object');
  assert(typeof required === 'object');
  assert(typeof fn === 'function');
  assert(name.length < 1e7);
  assert(description.length < 1e7);
  assert(required.length < 1e7);
  const inputSchema: JsonSchema = { type: 'object', properties, required, additionalProperties: false };
  const run: ToolRun = (scene, args, ctx) => {
    assert(typeof name === 'string');
    assert(typeof inputSchema === 'object');
    assert(typeof fn === 'function');
    assert(name.length < 1e7);
    assert(typeof scene === 'object');
    captureCall(name, scene, args, ctx);
    const checked = validArgs<A>(inputSchema, args || {});
    if (!checked.ok) return checked;
    try {
      const r = fn(scene, checked.args, ctx || {});
      return r.ok && answer ? okr(answer(scene)) : r;
    } catch (e) { if (e instanceof Fail) return fail([{ code: e.code, message: e.message }]); throw e; }
  };
  tools.push({ name, description, inputSchema, run });
}


const openingSchema: JsonSchema = { type: 'object', required: ['wall', 'at'], properties: { wall: { type: 'string', enum: ['n', 's', 'e', 'w'] }, at: { type: 'number', description: 'Centre of the gap in metres along the wall, from its west end (n, s) or north end (e, w).' }, width: num } };
interface Wall { L: number; yaw: number; pos: (u: number) => Vec3; lo: number; hi: number }

const keySchema: JsonSchema = { type: 'object', required: ['v'], properties: { t: num, cue: cueArg, v: { description: 'Value: [x,y,z] for at, a number for yaw, number or [x,y,z] for scale, a pose name for pose.' }, ease: { type: 'string', enum: EASES } } };
// The value of a key: the schema does not give it a type, the file format does.
function trackValue(v: unknown): TrackKey['v'] {
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number')) return [Number(v[0]), Number(v[1]), Number(v[2])];
  throw new Fail('bad_args', 'A key value must be a number, a pose name or [x, y, z].');
}

// ---------- narration, facts and motion words (guide "narration")
const beats = (s: Scene) => ({ length: s.captions.at(-1)?.end ?? 0, beats: (s.narration || []).map((n, i) => {
  assert(typeof n === 'object');
  assert(typeof i === 'number');
  assert(!Number.isNaN(i));
  return { i, start: n.start, end: n.end, text: n.text, voice: !!n.voice };
}) });
const sentence: JsonSchema = { anyOf: [str, { type: 'object', required: ['text'], additionalProperties: false, properties: {
  text: str, pause: { type: 'number', minimum: 0, description: 'Seconds of silence after the sentence: the picture holds after a change.' }, facts: { ...strArr, description: 'Ids of the facts (add_fact) that the sentence states.' } } }] };

const GUIDE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'guide');
function defineTools1(): void {
  defineTool<ListModelsArgs>('list_models', 'List catalogue models. Filter by words in the id, name or tags, and by kind. "person" is always available (variant 0 to 23). It also lists the person outfits (uniforms) with their sources.',
    { query: str, kind: { type: 'string', enum: ['vehicle', 'building', 'furniture', 'structure', 'prop', 'sign', 'road', 'nature', 'person'] } }, [],
    (_scene, a, ctx) => {
      assert(typeof _scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      const cat = ctx.catalogue || loadCatalogue();
      const words = (a.query || '').toLowerCase().split(/\s+/).filter(Boolean);
      const rows: { id: string; name: string; kind: string; size: Vec3; tags: string[] }[] = cat.models.map((m) => {
        assert(typeof m === 'object');
        return { id: m.id, name: m.name, kind: m.kind, size: m.size, tags: m.tags || [] };
      });
      rows.unshift({ id: 'person', name: 'Person (variant 0 to 23, poses: ' + POSES.join(', ') + ')', kind: 'person', size: [0.5, 1.75, 0.35], tags: ['people', 'human'] });
      const out = rows.filter((m) => {
        assert(typeof a === 'object');
        assert(typeof words === 'object');
        assert(words.length < 1e7);
        assert(typeof m === 'object');
        return (!a.kind || m.kind === a.kind) && words.every((w) => {
        assert(typeof w === 'string');
        assert(w.length < 1e7);
        return `${m.id} ${m.name} ${m.tags.join(' ')}`.toLowerCase().includes(w);
      });
      });
      const outfits = (cat.outfits || []).map(({ id, name, source, note }) => ({ id, name, source, note }));
      return okr({ count: out.length, models: out, outfits });
    });

  defineTool<NewSceneArgs>('new_scene', 'Start a new empty scene. This replaces the current scene.',
    { title: str, author: str, ground: { type: 'string', enum: GROUNDS }, look: { type: 'string', enum: LOOKS }, size: { type: 'array', items: num, minItems: 2, maxItems: 2 }, color: str },
    [], (scene, a) => { 
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      replaceScene(scene, newScene(a)); return okr({ title: scene.title }); });
}
function defineTools2(): void {

  defineTool<GetSceneArgs>('get_scene', 'Read the scene. By default it returns a summary with every object id. Pass full true for the whole file.',
    { full: { type: 'boolean' } }, [], (scene, a) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      if (a.full) return okr(scene);
      return okr({
        title: scene.title, duration: scene.duration, backdrop: scene.backdrop, lighting: scene.lighting, map: scene.map ? { origin: scene.map.origin, osm: scene.map.osm ? `${scene.map.osm.buildings?.length || 0} buildings` : undefined } : undefined,
        counts: { objects: scene.objects.length, tracks: scene.tracks.length, camera: scene.camera.length, chapters: scene.chapters.length, captions: scene.captions.length, callouts: scene.callouts.length },
        objects: scene.objects.map((o) => {
          assert(typeof o === 'object');
          return { id: o.id, model: o.model, at: o.at, yaw: o.yaw, label: o.label || undefined, tags: o.tags?.length ? o.tags : undefined };
        }),
        chapters: scene.chapters.map((c) => {
          assert(typeof c === 'object');
          return { id: c.id, start: c.start, end: c.end, title: c.title, shot: c.shot };
        }),
        camera: scene.camera.map((k) => {
          assert(typeof k === 'object');
          return { t: k.t, shot: k.shot, ease: k.ease };
        }),
        narration: scene.narration?.map((n, i) => {
          assert(typeof i === 'number');
          assert(!Number.isNaN(i));
          assert(typeof n === 'object');
          return { i, start: n.start, end: n.end, text: n.text, voice: !!n.voice };
        }),
        facts: scene.facts, motions: scene.motions?.length,
      });
    });

  defineTool<PlaceArgs>('place', 'Place one model at a position. Returns the object id.', placeProps, ['model', 'at'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s, cat) => { 
      assert(typeof s === 'object');
      assert(typeof cat === 'object');
      const o = makeObject(s, cat, a); s.objects.push(o); return { id: o.id }; });
    });
}
function defineTools3(): void {

  assert(typeof placeProps === 'object');
  assert(typeof num === 'object');
  assert(typeof find === 'function');
  defineTool<PlaceNearArgs>('place_near', 'Place a model near another object. offset is [dx, dz] or [dx, dy, dz] in metres from that object.',
    { ...placeProps, near: { type: 'string', description: 'Id of the object to place beside.' }, offset: { type: 'array', items: num, minItems: 2, maxItems: 3 } }, ['model', 'near'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s, cat) => {
      assert(typeof s === 'object');
      assert(typeof cat === 'object');
      const n = posOf(find(s, a.near));
      const off: Vec3 = a.offset ? at3(a.offset) : [1.5, 0, 0];
      const o = makeObject(s, cat, a, { at: [r2(n[0] + off[0]), r2(n[1] + off[1]), r2(n[2] + off[2])] });
      s.objects.push(o); return { id: o.id, at: o.at };
    });
    });
}
function defineTools4(): void {

  assert(typeof placeProps === 'object');
  assert(typeof num === 'object');
  defineTool<PlaceGroupArgs>('place_group', 'Place many models in a line, grid, ring or scatter. Same seed gives the same result. For "person" it picks variants, poses and clothes from the seed.',
    { ...placeProps, count: { type: 'integer', minimum: 1 }, pattern: { type: 'string', enum: ['line', 'grid', 'ring', 'scatter'] }, spacing: num, seed: { type: 'integer' },
      variants: { type: 'array', items: { type: 'integer' }, description: 'Person variants to draw from.' }, poses: { type: 'array', items: { type: 'string', enum: POSES } },
      angle: { type: 'number', description: 'Line or grid direction in degrees (0 = along +x).' }, cols: { type: 'integer', minimum: 1 }, radius: num,
      area: { type: 'array', items: num, minItems: 2, maxItems: 2, description: 'Scatter area [width, depth].' }, face: { type: 'string', enum: ['center', 'out', 'none'] } },
    ['model', 'count', 'at'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s, cat) => {
      assert(typeof s === 'object');
      assert(typeof cat === 'object');
      modelOrFail(cat, a.model);
      if (a.count > 500) throw new Fail('bad_args', 'count must be 500 or fewer.');
      const rng = mulberry32(a.seed ?? 1), n = a.count, sp = a.spacing ?? 1.2, c = at3(a.at), person = a.model === 'person';
      const pts: { p: Vec3; yaw?: number }[] = [];
      const dirv = rotYaw([1, 0, 0], a.angle ?? 0), dirz = rotYaw([0, 0, 1], a.angle ?? 0);
      if (a.pattern === 'line' || !a.pattern) for (let i = 0; i < n; i++) pts.push({ p: [c[0] + dirv[0] * i * sp, c[1], c[2] + dirv[2] * i * sp] });
      else if (a.pattern === 'grid') { const cols = a.cols ?? Math.ceil(Math.sqrt(n)); for (let i = 0; i < n; i++) { const x = (i % cols) * sp, z = Math.floor(i / cols) * sp; pts.push({ p: [c[0] + dirv[0] * x + dirz[0] * z, c[1], c[2] + dirv[2] * x + dirz[2] * z] }); } }
      else if (a.pattern === 'ring') {
        const rad = a.radius ?? Math.max(sp * n / (2 * Math.PI), 0.3);
        for (let i = 0; i < n; i++) { const th = (i / n) * 2 * Math.PI; const face = a.face ?? 'center'; pts.push({ p: [c[0] + Math.sin(th) * rad, c[1], c[2] + Math.cos(th) * rad], yaw: face === 'none' ? undefined : (th / D + (face === 'center' ? 180 : 0)) % 360 }); }
      } else {
        const [w, d] = a.area ?? [Math.sqrt(n) * sp * 1.5, Math.sqrt(n) * sp * 1.5];
        for (let i = 0; i < n; i++) {
          let best: Vec3 = c;
          for (let k = 0; k < 30; k++) {
            const p: Vec3 = [c[0] + (rng() - 0.5) * w, c[1], c[2] + (rng() - 0.5) * d];
            best = p;
            if (pts.every((q) => {
              assert(typeof q === 'object');
              return Math.hypot(q.p[0] - p[0], q.p[2] - p[2]) >= sp * 0.8;
            })) break;
          }
          pts.push({ p: best, yaw: rng() * 360 });
        }
      }
      const base = a.id || a.model;
      const ids: string[] = [];
      pts.forEach((pt, i) => {
        assert(typeof pt === 'object');
        assert(typeof i === 'number');
        assert(!Number.isNaN(i));
        const v = person ? (a.variants?.length ? pick(a.variants, rng()) : Math.floor(rng() * 24)) : undefined;
        const colors = a.colors || (person && !a.outfit ? { shirt: pick(SHIRTS, rng()), pants: pick(PANTS, rng()) } : undefined);
        const pose = a.poses?.length ? pick(a.poses, rng()) : a.pose;
        const o = makeObject(s, cat, { ...a, id: uniqueId(s, `${base}-${i + 1}`), variant: v, colors, pose, yaw: pt.yaw ?? a.yaw ?? 0, tags: [...(a.tags || []), `group:${base}`] }, { at: r3(pt.p) });
        s.objects.push(o); ids.push(o.id);
      });
      return { count: ids.length, ids };
    });
    });
}
function defineTools5(): void {

  assert(typeof str === 'object');
  assert(typeof vecXZ === 'object');
  assert(typeof num === 'object');
  defineTool<TransformArgs>('transform', 'Move, turn, scale or flip an existing object.', { id: str, at: vecXZ, yaw: num, scale: { anyOf: [num, vec3] }, flip: { type: 'boolean' } }, ['id'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      const o = find(s, a.id);
      if (a.at) o.at = at3(a.at, posOf(o)[1]);
      if (a.yaw !== undefined) o.yaw = a.yaw;
      if (a.scale !== undefined) o.scale = scaleOf(a.scale);
      if (a.flip !== undefined) o.flip = a.flip;
      return { id: o.id, at: o.at, yaw: o.yaw };
    });
    });
}
function defineTools6(): void {

  assert(typeof str === 'object');
  assert(typeof num === 'object');
  assert(typeof find === 'function');
  defineTool<DuplicateArgs>('duplicate', 'Copy an object. Each copy moves by offset more than the last.', { id: str, count: { type: 'integer', minimum: 1 }, offset: { type: 'array', items: num, minItems: 2, maxItems: 3 } }, ['id'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      const o = find(s, a.id), off: Vec3 = a.offset ? at3(a.offset) : [1.5, 0, 0], ids: string[] = [];
      const oat = posOf(o);
      for (let i = 1; i <= (a.count ?? 1); i++) {
        const c = structuredClone(o); c.id = uniqueId(s, `${o.id}-copy`); c.at = [r2(oat[0] + off[0] * i), r2(oat[1] + off[1] * i), r2(oat[2] + off[2] * i)]; s.objects.push(c); ids.push(c.id);
      }
      return { ids };
    });
    });
}
function defineTools7(): void {

  defineTool<RemoveArgs>('remove', 'Remove an object, its animation tracks and its children. Remove only an object that does not belong in the scene. Never remove a building, a structure or a vehicle to clear a camera view: move the camera.', { id: str }, ['id'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      find(s, a.id);
      const gone = new Set([a.id]);
      let grew = true; while (grew) { grew = false; for (const o of s.objects) if (o.parent && gone.has(o.parent) && !gone.has(o.id)) { gone.add(o.id); grew = true; } }
      s.objects = s.objects.filter((o) => {
        assert(typeof o === 'object');
        return !gone.has(o.id);
      });
      s.tracks = s.tracks.filter((t) => {
        assert(typeof t === 'object');
        return !gone.has(t.object);
      });
      for (const k of s.camera) if (k.frame) { k.frame.ids = k.frame.ids.filter((f) => {
        assert(typeof f === 'string');
        assert(f.length < 1e7);
        return !gone.has(f);
      }); if (!k.frame.ids.length) delete k.frame; }
      for (const c of s.chapters) if (c.focus) c.focus = c.focus.filter((f) => {
        assert(typeof f === 'string');
        assert(f.length < 1e7);
        return !gone.has(f);
      });
      s.callouts = s.callouts.filter((c) => {
        assert(typeof c === 'object');
        return !(c.object !== undefined && gone.has(c.object));
      });
      if (s.motions) s.motions = s.motions.filter((m) => {
        assert(typeof m === 'object');
        return !gone.has(m.object);
      });
      return { removed: [...gone] };
    });
    });
}
function defineTools8(): void {
  defineTool<BuildRoomArgs>('build_room', 'Build a room from wall, floor and ceiling objects. at is the floor centre [x, y, z]. size is [width (x), depth (z), height]. Walls n, s, e, w face outward (yaw 180, 0, 90, 270) and carry the wall tag.',
    { id: str, at: vecXZ, size: vec3, doors: { type: 'array', items: openingSchema }, windows: { type: 'array', items: openingSchema }, floor: { type: 'boolean' }, ceiling: { type: 'boolean' }, source: common.source, estimated: common.estimated },
    ['id', 'at', 'size'],
    (scene, a, ctx) => mutate(scene, ctx, (s, cat) => {
      const [w, d, h] = a.size, c = at3(a.at), T = 0.15, made: string[] = [];
      const meta = { source: a.source || '', estimated: !!a.estimated };
      const push = (model: string, id: string, pos: Vec3, yaw: number, scale: Vec3, tags: string[]) => { 
        assert(typeof model === 'string');
        assert(typeof id === 'string');
        assert(typeof pos === 'object');
        assert(typeof yaw === 'number');
        assert(typeof scale === 'object');
        assert(typeof tags === 'object');
        assert(model.length < 1e7);
        assert(id.length < 1e7);
        assert(pos.length < 1e7);
        assert(!Number.isNaN(yaw));
        assert(scale.length < 1e7);
        assert(tags.length < 1e7);
        const o = makeObject(s, cat, { model, id, yaw, scale, tags: [...tags, a.id], ...meta }, { at: r3(pos) }); s.objects.push(o); made.push(o.id); };
      const walls: Record<string, Wall> = {
        n: { L: w, yaw: 180, pos: (u) => [c[0] - w / 2 + u, c[1], c[2] - d / 2], lo: -T / 2, hi: w + T / 2 },
        s: { L: w, yaw: 0, pos: (u) => [c[0] - w / 2 + u, c[1], c[2] + d / 2], lo: -T / 2, hi: w + T / 2 },
        e: { L: d, yaw: 90, pos: (u) => [c[0] + w / 2, c[1], c[2] - d / 2 + u], lo: T / 2, hi: d - T / 2 },
        w: { L: d, yaw: 270, pos: (u) => [c[0] - w / 2, c[1], c[2] - d / 2 + u], lo: T / 2, hi: d - T / 2 },
      };
      const ops = (key: string, list: Opening[] | undefined, kind: 'door' | 'window') => (list || []).filter((o) => o.wall === key).map((o) => {
        const wd = o.width ?? (kind === 'door' ? 1.0 : 1.2);
        return { u0: o.at - wd / 2, u1: o.at + wd / 2, kind, wd, y0: kind === 'door' ? 0 : 0.9, y1: 2.1 };
      });
      for (const [key, W] of Object.entries(walls)) {
        const list = [...ops(key, a.doors, 'door'), ...ops(key, a.windows, 'window')].sort((p, q) => p.u0 - q.u0);
        let cur = W.lo, k = 1;
        for (const op of list) {
          if (op.u0 < cur + 0.05 || op.u1 > W.hi - 0.05) throw new Fail('bad_opening', `Opening on wall ${key} at ${((op.u0 + op.u1) / 2).toFixed(2)} m does not fit. Walls ${key} runs 0 to ${W.L} m and openings must not touch each other or the corners.`);
          seg(cur, op.u0, 0, h, key, W, k++);
          if (op.y0 > 0) seg(op.u0, op.u1, 0, op.y0, key, W, k++);
          if (h > op.y1) seg(op.u0, op.u1, op.y1, h, key, W, k++);
          const fx = op.kind === 'door' ? 'door' : 'window', fw = fx === 'door' ? 1.05 : 1.2;
          const q = W.pos((op.u0 + op.u1) / 2);
          push(fx, `${a.id}-${key}-${fx}-${k++}`, [q[0], q[1] + op.y0, q[2]], W.yaw, [op.wd / fw, 1, 1], ['wall']);
          cur = op.u1;
        }
        seg(cur, W.hi, 0, h, key, W, k++);
      }
      function seg(u0: number, u1: number, y0: number, y1: number, key: string, W: Wall, k: number): void {
        assert(typeof u1 === 'number');
        assert(typeof u0 === 'number');
        const len = u1 - u0; if (len < 0.01 || y1 - y0 < 0.01) return;
        const m = len > 4 ? 'wall-5' : 'wall-3', base = m === 'wall-5' ? 5 : 3;
        const p = W.pos((u0 + u1) / 2); p[1] += y0;
        push(m, `${a.id}-${key}-wall-${k}`, p, W.yaw, [len / base, (y1 - y0) / 2.8, 1], ['wall']);
      }
      if (a.floor !== false) push('floor-tile', `${a.id}-floor`, [c[0], c[1], c[2]], 0, [w / 2, 1, d / 2], ['floor']);
      if (a.ceiling !== false) push('ceiling-tile', `${a.id}-ceiling`, [c[0], c[1] + h - 0.05, c[2]], 0, [w / 2, 1, d / 2], ['ceiling']);
      return { count: made.length, ids: made };
    }));
}
function defineTools9(): void {

  assert(typeof str === 'object');
  assert(typeof vecXZ === 'object');
  assert(typeof num === 'object');
  defineTool<BuildStairsArgs>('build_stairs', 'Place a flight of 14 steps. from is the foot of the stairs at the middle of the first step [x, y, z]. yaw is the climbing direction (0 climbs toward +z). Returns a path for move_along.',
    { id: str, from: vecXZ, yaw: num, height: { type: 'number', description: 'Total rise in metres. Default 2.38.' }, width: { type: 'number', description: 'Default 1.2 m.' }, source: common.source, estimated: common.estimated },
    ['from'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s, cat) => {
      assert(typeof s === 'object');
      assert(typeof cat === 'object');
      const m = catModel(cat, 'stairs-14'), yaw = a.yaw ?? 0, hgt = a.height ?? m.size[1], wd = a.width ?? m.size[0];
      const f = at3(a.from), fw = rotYaw([0, 0, 1], yaw), len = m.size[2];
      const at: Vec3 = [f[0] + fw[0] * len / 2, f[1], f[2] + fw[2] * len / 2];
      const o = makeObject(s, cat, { model: 'stairs-14', id: a.id, yaw, scale: [wd / m.size[0], hgt / m.size[1], 1], tags: ['stairs'], source: a.source, estimated: a.estimated }, { at: r3(at) });
      s.objects.push(o);
      const top = r3([f[0] + fw[0] * len, f[1] + hgt, f[2] + fw[2] * len]);
      return { id: o.id, bottom: f, top, path: [f, top] };
    });
    });
}
function defineTools10(): void {

  assert(typeof str === 'object');
  assert(typeof vecXZ === 'object');
  defineTool<PlaceSignArgs>('place_sign', 'Place a sign model. Its text shows as a label next to it, only in the chapters that list the sign in focus (always when the scene has no chapters).', { text: str, at: vecXZ, yaw: num, model: str, id: str, source: common.source, estimated: common.estimated, scale: placeProps.scale },
    ['text', 'at'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s, cat) => {
      assert(typeof s === 'object');
      assert(typeof cat === 'object');
      if (a.text.length > 60) throw new Fail('sign_text_too_long', 'Sign text must be 60 characters or fewer.');
      const o = makeObject(s, cat, { model: a.model || 'sign', id: a.id || uniqueId(s, 'sign'), at: a.at, yaw: a.yaw, scale: a.scale, label: a.text, tags: ['sign'], source: a.source, estimated: a.estimated });
      s.objects.push(o); return { id: o.id };
    });
    });
}
function defineTools11(): void {

  assert(typeof str === 'object');
  assert(typeof num === 'object');
  assert(typeof cueArg === 'object');
  defineTool<SetPoseArgs>('set_pose', 'Set the pose of an object at time t (or at a cue of the narration). Without t (or t = 0) it sets the starting pose.', { id: str, t: num, cue: cueArg, pose: { type: 'string', enum: POSES } }, ['id', 'pose'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      const o = find(s, a.id);
      if (a.cue) {
        if (!trackOf(s, o.id, 'pose')) mergeKeys(s, o.id, 'pose', [{ t: 0, v: o.pose || 'stand', ease: 'step' }], false);
        const t = timeArg(s, a.cue, a.t);
        mergeKeys(s, o.id, 'pose', [{ t, v: a.pose, ease: 'step', cue: a.cue }], false);
        return { id: o.id, t, pose: a.pose };
      }
      if (!a.t) { o.pose = a.pose; if (trackOf(s, o.id, 'pose')) mergeKeys(s, o.id, 'pose', [{ t: 0, v: a.pose, ease: 'step' }], false); return { id: o.id, t: 0, pose: a.pose }; }
      if (!trackOf(s, o.id, 'pose')) mergeKeys(s, o.id, 'pose', [{ t: 0, v: o.pose || 'stand', ease: 'step' }], false);
      mergeKeys(s, o.id, 'pose', [{ t: a.t, v: a.pose, ease: 'step' }], false);
      return { id: o.id, t: a.t, pose: a.pose };
    });
    });
}
function defineTools12(): void {
  assert(typeof str === 'object');
  assert(typeof keySchema === 'object');
  assert(typeof find === 'function');
  defineTool<AnimateArgs>('animate', 'Write a whole animation track (replaces the track). Each key has t or a cue of the narration. Keys need strictly rising t. Never scale a building, a structure or a vehicle to nothing to clear a camera view (validate: object_vanishes). A vehicle may be swapped for another vehicle at the same place and time.', { id: str, channel: { type: 'string', enum: CHANNELS }, keys: { type: 'array', items: keySchema, minItems: 1 } }, ['id', 'channel', 'keys'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof find === 'function');
      assert(typeof a === 'object');
      assert(typeof isXZ2 === 'function');
      assert(typeof s === 'object');
      find(s, a.id);
      s.tracks = s.tracks.filter((t) => {
        assert(typeof t === 'object');
        return !(t.object === a.id && t.channel === a.channel);
      });
      s.tracks.push({ object: a.id, channel: a.channel, keys: a.keys.map((k) => {
        assert(typeof s === 'object');
        assert(typeof a === 'object');
        assert(typeof isXZ2 === 'function');
        assert(typeof k === 'object');
        return { t: timeArg(s, k.cue, k.t), v: a.channel === 'at' && isXZ2(k.v) ? at3(k.v) : trackValue(k.v), ease: k.ease || (a.channel === 'pose' ? 'step' : 'linear'), ...(k.cue ? { cue: k.cue } : {}) };
      }) });
      return { id: a.id, channel: a.channel, keys: a.keys.length };
    });
    });
}
function defineTools13(): void {

  defineTool<MoveAlongArgs>('move_along', 'Move an object along a path of points. Writes at, yaw and pose tracks. Use speed (m/s) or times (one absolute time per point). With cue (a cue of the narration) the move starts at the cue, and times count from it. It uses the walk pose (run above 3 m/s) while it moves and stand at the end. When the moving object passes into another object, leaves the ground or drives in the wrong lane, the answer has "collisions". See guide "motion".',
    { id: str, path: { type: 'array', items: { type: 'array', items: num, minItems: 2, maxItems: 3 }, minItems: 2 }, speed: num, times: { type: 'array', items: num }, start: num, cue: cueArg, pose: { type: 'string', enum: POSES }, end_pose: { type: 'string', enum: POSES } },
    ['id', 'path'],
    (scene, a, ctx) => mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      const o = find(s, a.id), start = a.cue ? timeArg(s, a.cue, a.start, 'start') : a.start ?? 0;
      const y0 = posOf(o)[1];
      const P = a.path.map((p) => at3(p, y0));
      let times: number[];
      if (a.times) {
        const given = a.times;
        if (given.length !== P.length) throw new Fail('bad_args', 'times needs one value per path point.');
        times = a.cue ? given.map((t) => {
          assert(typeof t === 'number');
          assert(!Number.isNaN(t));
          const returned = r2(start + t - nth(given, 0));
          assert(typeof returned === 'number');
          return returned;
        }) : given;
      } else {
        const sp = a.speed ?? 1.4; times = [start];
        for (let i = 1; i < P.length; i++) times.push(r2(nth(times, i - 1) + Math.max(Math.hypot(nth(P, i)[0] - nth(P, i - 1)[0], nth(P, i)[1] - nth(P, i - 1)[1], nth(P, i)[2] - nth(P, i - 1)[2]) / sp, 0.05)));
      }
      for (let i = 1; i < times.length; i++) if (nth(times, i) <= nth(times, i - 1)) throw new Fail('time_backwards', `times must rise: ${nth(times, i)} is not after ${nth(times, i - 1)}.`);
      const t0 = nth(times, 0), tEnd = nth(times, times.length - 1);
      const speed = (a.speed ?? Math.hypot(nth(P, 1)[0] - nth(P, 0)[0], nth(P, 1)[2] - nth(P, 0)[2]) / (nth(times, 1) - nth(times, 0)));
      const moving = a.pose || (speed > 3 ? 'run' : 'walk');
      const [ci, word, off] = a.cue ? cueParts(a.cue) : [0, '', 0];
      const follow = (ks: TrackKey[]): TrackKey[] => (a.cue ? ks.map((k) => ({ ...k, cue: [ci, word, r2(off + k.t - t0)] satisfies Cue })) : ks);
      mergeKeys(s, o.id, 'at', follow(P.map((p, i): TrackKey => ({ t: nth(times, i), v: r3(p), ease: 'linear' }))), true);
      // yaw: face the direction of travel, turning over 0.24 s at corners
      const yk: TrackKey[] = []; let yaw = o.yaw ?? 0;
      const segYaw = (i: number) => Math.atan2(nth(P, i + 1)[0] - nth(P, i)[0], nth(P, i + 1)[2] - nth(P, i)[2]) / D;
      const first = trackOf(s, o.id, 'yaw')?.keys.filter((k) => k.t < t0).pop();
      yaw = wrapYaw(typeof first?.v === 'number' ? first.v : yaw, segYaw(0));
      yk.push({ t: t0, v: r2(yaw), ease: 'linear' });
      for (let i = 1; i < P.length - 1; i++) {
        const ny = wrapYaw(yaw, segYaw(i));
        if (Math.abs(ny - yaw) > 1) {
          const h = Math.min(0.12, (nth(times, i) - nth(times, i - 1)) / 3, (nth(times, i + 1) - nth(times, i)) / 3);
          yk.push({ t: r2(nth(times, i) - h), v: r2(yaw), ease: 'linear' }, { t: r2(nth(times, i) + h), v: r2(ny), ease: 'linear' });
          yaw = ny;
        }
      }
      mergeKeys(s, o.id, 'yaw', follow(yk), true);
      if (o.model === 'person') {
        if (!trackOf(s, o.id, 'pose') && t0 > 0) mergeKeys(s, o.id, 'pose', [{ t: 0, v: o.pose || 'stand', ease: 'step' }], false);
        mergeKeys(s, o.id, 'pose', follow([{ t: t0, v: moving, ease: 'step' }, { t: tEnd, v: a.end_pose || 'stand', ease: 'step' }]), false);
      }
      if (!trackOf(s, o.id, 'at')?.keys.some((k) => k.t < t0)) o.at = r3(nth(P, 0));
      const out = { id: o.id, start: t0, end: tEnd, pose: o.model === 'person' ? moving : undefined };
      const hits = motionErrors(s, ctx.catalogue || loadCatalogue(), { only: [o.id], from: t0, to: tEnd });
      if (hits.length) Object.assign(out, { collisions: hits.slice(0, 5).map((e) => e.message), warning: 'The path runs into something. Change the path or the times before export.' });
      return out;
    }));
}
function defineTools14(): void {

  assert(typeof num === 'object');
  assert(typeof cueArg === 'object');
  assert(typeof strArr === 'object');
  defineTool<SetCameraArgs>('set_camera', 'Add or replace a camera key at time t (or at a cue of the narration). Give frame (object ids, the tool computes eye and target) or eye and target. The camera moves between keys. Two keys with different shots may be 1.5 s apart at most, unless cut is true (hold the old shot, then cut). When a building, structure or vehicle stands between the camera and a focus object of the chapter at t (the framed objects when no chapter holds t), or covers much of the frame, the answer has "blocked" and "clear_views" (view and elevation values that give a clear view).',
    { t: num, cue: cueArg, shot: { type: 'string', enum: SHOTS }, frame: strArr, eye: vec3, target: vec3, fov: num, ease: { type: 'string', enum: EASES },
      view: { type: 'number', description: 'Camera side in degrees: 0 looks north from the south side, 90 looks west from the east side.' }, elevation: num, margin: num, distance: num, cut: { type: 'boolean' } },
    ['shot'],
    (scene, args, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof args === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s, cat) => {
      assert(typeof s === 'object');
      assert(typeof cat === 'object');
      const a: Timed<SetCameraArgs> = { ...args, t: timeArg(s, args.cue, args.t) };
      const ids = a.frame?.length ? a.frame : undefined;
      let eye = a.eye, target = a.target, fov = a.fov ?? 50;
      if (ids) { const f = frameCamera(s, cat, ids, a.shot, a.t, a); eye = f.eye; target = f.target; fov = f.fov; }
      if (!eye || !target) throw new Fail('bad_args', 'Give frame (object ids) or both eye and target.');
      const framing = ids ? { frame: { ids, ...(a.view !== undefined ? { view: a.view } : {}), ...(a.elevation !== undefined ? { elevation: a.elevation } : {}), ...(a.margin !== undefined ? { margin: a.margin } : {}), ...(a.distance !== undefined ? { distance: a.distance } : {}) } satisfies CameraFrame } : {};
      const key = { t: a.t, shot: a.shot, eye: r3(eye), target: r3(target), fov, ease: a.ease || 'inout', ...(a.cue ? { cue: a.cue } : {}), ...framing };
      s.camera = s.camera.filter((k) => {
        assert(typeof k === 'object');
        return Math.abs(k.t - a.t) > 1e-9;
      });
      const prev = [...s.camera].reverse().find((k) => {
        assert(typeof k === 'object');
        return k.t < a.t;
      });
      if (a.cut && prev) prev.ease = 'step';
      s.camera.push(key);
      s.camera.sort((p, q) => {
        assert(typeof p === 'object');
        assert(typeof q === 'object');
        const returned = p.t - q.t;
        assert(typeof returned === 'number');
        return returned;
      });
      const out = { t: key.t, shot: key.shot, eye: key.eye, target: key.target, fov };
      const blocked = blocksAt(s, cat, key, a.frame || [], a.t);
      if (blocked.length) Object.assign(out, { blocked, warning: 'Something stands between the camera and the subject. Change the view before export.', ...(ids ? { clear_views: clearViews(s, cat, ids, a) } : {}) });
      return out;
    });
    });
}
function defineTools15(): void {

  defineTool<SetLightingArgs>('set_lighting', 'Set the lighting look from time t (or from a cue of the narration): day, dusk, night, indoor.', { t: num, cue: cueArg, look: { type: 'string', enum: LOOKS } }, ['look'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      const t = timeArg(s, a.cue, a.t);
      s.lighting = (s.lighting || []).filter((k) => {
        assert(typeof k === 'object');
        return k.t !== t;
      }); s.lighting.push({ t, look: a.look, ...(a.cue ? { cue: a.cue } : {}) }); s.lighting.sort((p, q) => {
        assert(typeof p === 'object');
        assert(typeof q === 'object');
        const returned = p.t - q.t;
        assert(typeof returned === 'number');
        return returned;
      }); return { t, look: a.look };
    });
    });

  defineTool<AddCaptionArgs>('add_caption', 'Add a caption (up to 280 characters, at least 0.06 s per character on screen, no overlap with other captions). A scene with narration makes its captions from the narration: do not add captions to it.', { start: num, end: num, text: str }, ['start', 'end', 'text'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      if (s.narration?.length) throw new Fail('narrated', 'This scene has narration. Its captions are the sentences of the narration. Change the narration with narrate.'); s.captions.push({ start: a.start, end: a.end, text: a.text }); return { index: s.captions.length - 1, chars: a.text.length }; });
    });

  defineTool<AddCalloutArgs>('add_callout', 'Add a callout label tied to an object for a time range (start and end, or cue and end_cue of the narration). The range must be inside one chapter (validate: callout_outside_chapter). ^{...} and _{...} in the text draw small raised and lowered text, for example "m^{2}" or "CO_{2}".', { start: num, end: num, cue: cueArg, end_cue: cueArg, text: str, object: str, source: common.source, estimated: common.estimated, measured: common.measured }, ['text'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      const c: Callout = { start: timeArg(s, a.cue, a.start, 'start'), end: timeArg(s, a.end_cue, a.end, 'end', 'end_cue'), text: a.text };
      if (a.object !== undefined) c.object = a.object;
      if (a.source !== undefined) c.source = a.source;
      if (a.estimated !== undefined) c.estimated = a.estimated;
      if (a.measured !== undefined) c.measured = a.measured;
      if (a.cue) c.cue = a.cue;
      if (a.end_cue) c.endCue = a.end_cue;
      s.callouts.push(c); return { index: s.callouts.length - 1 };
    });
    });
}
function defineTools16(): void {

  defineTool<AddChapterArgs>('add_chapter', 'Add a chapter (a named time range: start and end, or cue and end_cue of the narration). With caption it also adds the caption for the whole chapter (not in a scene with narration). focus lists the objects the shot must show. source says where the chapter facts come from.',
    { start: num, end: num, cue: cueArg, end_cue: cueArg, title: str, clock: str, caption: str, focus: strArr, shot: { type: 'string', enum: SHOTS }, source: common.source, estimated: common.estimated, measured: common.measured, id: str },
    ['title'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      if (a.caption && s.narration?.length) throw new Fail('narrated', 'A narrated scene makes its captions from the narration. Do not give a chapter a caption.');
      const id = a.id || `c${s.chapters.length + 1}`;
      const c: Chapter = { id, start: timeArg(s, a.cue, a.start, 'start'), end: timeArg(s, a.end_cue, a.end, 'end', 'end_cue'), title: a.title, ...(a.cue ? { cue: a.cue } : {}), ...(a.end_cue ? { endCue: a.end_cue } : {}), clock: a.clock || '', caption: a.caption || '', focus: a.focus || [], ...(a.shot !== undefined ? { shot: a.shot } : {}), source: a.source || '' };
      if (a.estimated !== undefined) c.estimated = a.estimated;
      if (a.measured !== undefined) c.measured = a.measured;
      for (const f of c.focus ?? []) find(s, f);
      s.chapters.push(c);
      if (a.caption) s.captions.push({ start: c.start, end: c.end, text: a.caption });
      return { id };
    });
    });
}
function defineTools17(): void {

  defineTool<SetBackdropArgs>('set_backdrop', 'Set the ground and the map. ground is grass, street, floor, plain or map. Ground "map" with an origin shows OneMap tiles. origin is {lat, lon}. onemap is {zoom, style} for the tiles. drive is the side of the road that traffic keeps to: "left" (Singapore, the default) or "right".',
    { ground: { type: 'string', enum: GROUNDS }, size: { type: 'array', items: num, minItems: 2, maxItems: 2 }, color: str,
      origin: { type: 'object', properties: { lat: num, lon: num }, required: ['lat', 'lon'] }, onemap: { type: 'object' }, source: str, estimated: { type: 'boolean' },
      drive: { type: 'string', enum: ['left', 'right'] } }, [],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      if (a.drive) s.drive = a.drive;
      s.backdrop = { ...s.backdrop, ...(a.ground ? { ground: a.ground } : {}), ...(a.size ? { size: a.size } : {}), ...(a.color ? { color: a.color } : {}) };
      if (a.origin || a.onemap) {
        const map: SceneMap = s.map ?? {};
        s.map = map;
        if (a.origin) map.origin = a.origin;
        if (a.onemap) map.onemap = a.onemap;
        if (a.source !== undefined) map.source = a.source;
        if (a.estimated !== undefined) map.estimated = a.estimated;
      }
      return { backdrop: s.backdrop };
    });
    });
}
function defineTools18(): void {

  defineTool<ImportOsmArgs>('import_osm', 'Import the OpenStreetMap building footprints inside bbox [south, west, north, east] in degrees (at most 0.01 degrees a side). The scene origin becomes the bbox centre when the scene has no origin. bearing (degrees) turns the map so that a street with that compass bearing runs along z. The scene shows the OpenStreetMap credit by itself. The tool writes the ODbL data file next to the scene.',
    { bbox: { type: 'array', items: num, minItems: 4, maxItems: 4 }, bearing: num }, ['bbox'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      const r = mutate(scene, ctx, (s) => {
        assert(typeof s === 'object');
        const [so, w, n, e] = a.bbox;
        if (!validBbox(a.bbox)) throw new Fail('bad_args', 'bbox is [south, west, north, east] with south < north, west < east and at most 0.01 degrees a side.');
        if (!ctx.overpass) throw new Fail('no_osm_data', 'No OpenStreetMap answer. Call import_osm through the MCP server or the command line.');
        const origin = s.map?.origin || { lat: Math.round((so + n) * 5e5) / 1e6, lon: Math.round((w + e) * 5e5) / 1e6 };
        const map = s.map ?? { origin };
        s.map = map;
        map.origin = origin;
        const found = parseOverpass(ctx.overpass, origin);
        if (!found.length) throw new Fail('no_buildings', 'OpenStreetMap has no building footprints inside this bbox.');
        const osm: NonNullable<NonNullable<Scene['map']>['osm']> = toMapBlock(found, origin, a.bearing || 0);
        map.osm = osm;
        if (a.bearing) map.bearing = a.bearing; else delete map.bearing;
        if (ctx.odblPath) osm.dataFile = basename(ctx.odblPath);
        return { buildings: found.length, origin, bearing: a.bearing || 0, dataFile: osm.dataFile };
      });
      if (r.ok && ctx.odblPath) writeSceneOdbl(scene, dirname(ctx.odblPath));
      return r;
    });
}
function defineTools19(): void {

  defineTool<SetCutawayArgs>('set_cutaway', 'Hide ceilings and the walls between the camera and its target, for rooms made with build_room only. It never hides buildings, vehicles or other objects. Outdoors, move the camera instead.', { ceilings: { type: 'boolean' }, nearWalls: { type: 'boolean' } }, [],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => { 
      assert(typeof s === 'object');
      s.cutaway = { ceilings: a.ceilings ?? true, nearWalls: a.nearWalls ?? true }; return s.cutaway; });
    });

  defineTool<AddCreditArgs>('add_credit', 'Add a credit line that the export draws (for example a data licence credit).', { text: str }, ['text'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => { 
      assert(typeof s === 'object');
      s.credits = s.credits || []; if (!s.credits.includes(a.text)) s.credits.push(a.text); return { credits: s.credits.length }; });
    });
}
function defineTools20(): void {
  defineTool<NarrateArgs>('narrate', 'Set the narration (replaces it). 1 sentence = 1 beat, and each sentence is also the caption of its beat. A sentence that has a voice file keeps it. Others get stand-in times until make_voice. Returns the start and end of each beat. Read guide "narration".',
    { sentences: { type: 'array', items: sentence, minItems: 1 } }, ['sentences'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      s.narration = a.sentences.map((x) => {
        const n: NarrationBeat = typeof x === 'string' ? { text: x } : { ...x };
        if (!n.text.trim()) throw new Fail('bad_args', 'A sentence needs a text.');
        const sec = ctx.sceneDir ? voiceSeconds(ctx.sceneDir, n.text) : null;
        if (sec) Object.assign(n, { voice: voiceFile(n.text), seconds: sec });
        return n;
      });
      s.captions = [];
      return null;
    });
    }, (s) => {
      assert(typeof s === 'object');
      return beats(s);
    });

  defineTool<NoArgs>('make_voice', 'Make the voice of each sentence of the narration on this computer (Kokoro, voice af_heart) and time the beats with it. The first call on a computer installs the voice (about 750 MB in ~/.cache/toybox/voice) and can take some minutes. Cued times move with the new beats.', {}, [],
    (scene, _a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof _a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      if (!s.narration?.length) throw new Fail('no_narration', 'The scene has no narration. Call narrate first.');
      if (!ctx.sceneDir) throw new Fail('no_voice', 'No voice here. Call make_voice through the MCP server or the command line.');
      for (const n of s.narration) {
        const sec = voiceSeconds(ctx.sceneDir, n.text);
        if (!sec) throw new Fail('no_voice', `No voice file for "${n.text}".`);
        Object.assign(n, { voice: voiceFile(n.text), seconds: sec });
      }
      return null;
    });
    }, (s) => {
      assert(typeof s === 'object');
      return beats(s);
    });
}
function defineTools21(): void {

  defineTool<AddFactArgs>('add_fact', 'Add a fact of the outline with its source. Use only facts that you read in a source. Never guess a fact: leave out a fact that has no source. A sentence of the narration lists the ids of the facts that it states.',
    { id: str, text: str, source: { type: 'string', description: 'The URL or the document where you read the fact.' } }, ['text', 'source'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      s.facts = s.facts || [];
      const id = a.id || `f${s.facts.length + 1}`;
      if (s.facts.some((f) => {
        assert(typeof f === 'object');
        return f.id === id;
      })) throw new Fail('duplicate_id', `Fact ${id} exists.`);
      s.facts.push({ id, text: a.text, source: a.source });
      return { id };
    });
    });
}
function defineTools22(): void {

  defineTool<AddMotionArgs>('add_motion', `Add a motion word to an object at time t (or at a cue of the narration): ${MOVES.join(', ')}. pop grows it from nothing, out shrinks it to nothing, hop jumps (h: height in half-heights of the model, d: seconds), squash presses it down, wave rocks it (deg). blink, squint, look (x and y from -1 to 1: right and up, for d seconds), glance and spin move the eyes of a character (the model "narrator"). A model with motions stays a pure function of time. Never pop or out a building, a structure or a vehicle.`,
    { id: str, move: { type: 'string', enum: MOVES }, t: num, cue: cueArg, d: { type: 'number', description: 'Seconds.' }, h: num, x: num, y: num, deg: num }, ['id', 'move'],
    (scene, a, ctx) => {
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      assert(typeof ctx === 'object');
      return mutate(scene, ctx, (s) => {
      assert(typeof s === 'object');
      find(s, a.id);
      const m: Motion = { object: a.id, move: a.move, t: timeArg(s, a.cue, a.t) };
      if (a.d !== undefined) m.d = a.d;
      if (a.h !== undefined) m.h = a.h;
      if (a.x !== undefined) m.x = a.x;
      if (a.y !== undefined) m.y = a.y;
      if (a.deg !== undefined) m.deg = a.deg;
      if (a.cue) m.cue = a.cue;
      s.motions = s.motions || [];
      s.motions.push(m);
      return { id: a.id, move: a.move, t: m.t };
    });
    });

  defineTool<NoArgs>('validate', 'Check the whole scene. Returns every error with code, path and message. An empty list means valid. It also tests every chapter for a blocked view (code view_blocked): a building, structure or vehicle between the camera and a focus object, or in front of much of the frame, for more than 0.5 s. And it tests motion every 0.25 s: collision (two objects pass into each other), off_ground (a person or a vehicle floats or sinks) and wrong_lane (a vehicle drives on the wrong side).', {}, [],
    (scene, _a, ctx) => { 
      assert(typeof scene === 'object');
      assert(typeof _a === 'object');
      assert(typeof ctx === 'object');
      const errs = checkScene(scene, ctx.catalogue || loadCatalogue()); return okr({ valid: errs.length === 0, count: errs.length, errors: errs }); });

  defineTool<RenderPreviewArgs>('render_preview', 'Render a picture of the scene at time t so you can look at it. The daemon does the rendering.', { t: num }, ['t'],
    (_scene, a) => {
      assert(typeof _scene === 'object');
      assert(typeof a === 'object');
      return okr({ stub: true, t: a.t, message: 'Not rendered here. The Toybox daemon renders the picture and replaces this answer.' });
    });
}
function defineTools23(): void {

  defineTool<ExportSceneArgs>('export_scene', 'Write the scene to a .toybox.json file (and the captions to a .srt file next to it). Without path it returns the scene.', { path: str }, [],
    (scene, a, ctx) => {
      assert(typeof ctx === 'object');
      assert(typeof scene === 'object');
      assert(typeof a === 'object');
      const errs = checkScene(scene, ctx.catalogue || loadCatalogue());
      if (!a.path) return okr({ errors: errs.length, scene });
      let file = a.path;
      if (ctx.exportDir) {
        file = resolve(ctx.exportDir, a.path);
        const rel = relative(ctx.exportDir, file);
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || !file.endsWith('.toybox.json')) throw new Fail('bad_path', `path must be a .toybox.json file inside ${ctx.exportDir}.`);
      }
      saveScene(file, scene);
      if (ctx.sceneDir && resolve(dirname(file)) !== resolve(ctx.sceneDir)) for (const n of scene.narration || []) if (n.voice) {
        mkdirSync(join(dirname(file), 'voice'), { recursive: true });
        copyFileSync(join(ctx.sceneDir, n.voice), join(dirname(file), n.voice));
      }
      const srtPath = file.replace(/(\.toybox)?\.json$/, '') + '.srt';
      writeFileSync(srtPath, srt(scene));
      const odbl = writeSceneOdbl(scene, dirname(resolve(file)));
      return okr({ path: file, srt: srtPath, ...(odbl ? { odbl } : {}), errors: errs.length });
    });
}
function defineTools24(): void {
  defineTool<GuideArgs>('guide', 'Read a how-to guide. Start with "overview". Others: people, motion, camera, indoor, map, explainer, narration.', { name: str }, [],
    (_scene, a) => {
      assert(typeof _scene === 'object');
      assert(typeof a === 'object');
      const names = readdirSync(GUIDE_DIR).filter((f) => {
        assert(typeof f === 'string');
        assert(f.length < 1e7);
        return f.endsWith('.txt');
      }).map((f) => {
        assert(typeof f === 'string');
        assert(f.length < 1e7);
        const returned = f.slice(0, -4);
        assert(typeof returned === 'string');
        assert(returned.length < 1e7);
        return returned;
      });
      const name = a.name || 'overview';
      if (!names.includes(name)) throw new Fail('unknown_guide', `No guide "${name}". Guides: ${names.join(', ')}.`);
      return okr({ name, text: readFileSync(join(GUIDE_DIR, `${name}.txt`), 'utf8') });
    });
}
function defineAllTools(): void {
  defineTools1();
  defineTools2();
  defineTools3();
  defineTools4();
  defineTools5();
  defineTools6();
  defineTools7();
  defineTools8();
  defineTools9();
  defineTools10();
  defineTools11();
  defineTools12();
  defineTools13();
  defineTools14();
  defineTools15();
  defineTools16();
  defineTools17();
  defineTools18();
  defineTools19();
  defineTools20();
  defineTools21();
  defineTools22();
  defineTools23();
  defineTools24();
}
defineAllTools();
export const toolSpecs: ToolSpec[] = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
const byName = new Map<string, ToolRun>(tools.map((t) => [t.name, t.run]));
function tool(name: ToolName): ToolRun {
  assert(typeof name === 'string');
  assert(name.length < 1e7);
  const run = byName.get(name);
  if (!run) throw new Error(`Tool "${name}" is not defined.`);
  return run;
}
export const commands = Object.fromEntries(TOOL_NAMES.map((n) => [n, tool(n)])) as Record<ToolName, ToolRun>; // allow-unsafe: tool() gives a run for each name of TOOL_NAMES, or throws
export function runTool(scene: Scene, name: string, args?: unknown, ctx?: ToolContext | null): ToolResult {
  assert(typeof scene === 'object');
  assert(typeof name === 'string');
  assert(name.length < 1e7);
  const run = byName.get(name);
  if (!run) return fail([{ code: 'unknown_tool', message: `Unknown tool "${name}". Tools: ${TOOL_NAMES.join(', ')}.` }]);
  return run(scene, args, ctx);
}

export const READ_ONLY = new Set(['list_models', 'get_scene', 'validate', 'render_preview', 'guide', 'export_scene']);
