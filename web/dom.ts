import { assert } from './assert.ts';
// Typed DOM lookups. Each helper throws a clear error when the element is missing or has the
// wrong class, so the pages need no casts.

export function byId<T extends Element>(id: string, ctor: new () => T): T {
  assert(typeof id === 'string');
  assert(typeof ctor === 'function');
  assert(id.length < 1e7);
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element with the id "${id}".`);
  if (!(el instanceof ctor)) throw new Error(`The element "${id}" is a ${el.constructor.name}, not the expected class.`);
  return el;
}

// An element of any class (for text, hidden, attributes and events).
export function htmlById(id: string): HTMLElement {
  assert(id.length < 1e7);
  assert(typeof id === 'string');
  return byId(id, HTMLElement);
}

// The 2D context of a canvas, or an error when the browser gives none.
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  assert(typeof canvas === 'object');
  assert(canvas.width >= 0);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('The browser gives no 2D canvas context.');
  return g;
}

// The text of an error value of any kind.
export function messageOf(e: unknown): string {
  const returned = e instanceof Error ? e.message : String(e);
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}

// ---- type guards for data from fetch, postMessage and the like
export function isRecord(x: unknown): x is Record<string, unknown> {
  assert(typeof x !== 'symbol');
  assert(typeof x !== 'bigint');
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// A list that a hand-written or old scene file may leave out: the empty list in its place.
export function orEmpty<T>(list: readonly T[] | undefined): readonly T[] {
  assert(list === undefined || list.length >= 0);
  if (list === undefined) { const none: T[] = []; return none; }
  return list;
}

// The text of a value from JSON or a request: strings and numbers as they are, anything else as JSON.
export function textOf(v: unknown): string {
  assert(typeof v !== 'symbol');
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  return stringify(v) ?? '';
}
function stringify(v: unknown): string | undefined {
  assert(typeof v !== 'symbol');
  return JSON.stringify(v);
}
