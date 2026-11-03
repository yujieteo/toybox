// The version of the scene file format (the `toybox` field) and the upgrade of older files.
// Pure, so the viewer and core/scene.ts share it. Format: docs/scene-format.md
import type { Scene } from './types.js';

export const FORMAT = 1;

// UPGRADES[n] changes a format n scene into a format n + 1 scene. A change to the format that an
// older scene does not satisfy adds an entry here and increments FORMAT.
export type Upgrades = Record<number, (scene: Scene) => Scene>;
export const UPGRADES: Upgrades = {};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ARRAYS = ['objects', 'tracks', 'camera', 'chapters', 'captions', 'callouts', 'credits'];

// The boundary between a file and the Scene type: the parts that every reader relies on are checked
// (the scene, the format number, the lists, the backdrop). A list that is left out is allowed, as
// before: validate reports what a scene needs. Throws an Error that tells what is wrong.
export function parseScene(input: unknown): Scene {
  if (!isRecord(input)) throw new Error('This is not a Toybox scene: the file must hold one JSON object.');
  const v = input.toybox;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('This is not a Toybox scene: the toybox field must be a format number.');
  for (const k of ARRAYS) if (input[k] !== undefined && !Array.isArray(input[k])) throw new Error(`This is not a Toybox scene: ${k} must be an array.`);
  if (input.backdrop !== undefined && !isRecord(input.backdrop)) throw new Error('This is not a Toybox scene: backdrop must be an object.');
  // The checks above are the whole boundary; the remaining fields are checked by validate().
  return input as unknown as Scene; // allow-unsafe: checked boundary of a JSON file
}

export function upgradeScene(input: unknown, upgrades: Upgrades = UPGRADES, format: number = FORMAT): Scene {
  const scene = parseScene(input);
  const v = scene.toybox;
  if (v > format) throw new Error(`This scene has format ${v}. This Toybox reads format ${format} and older. Use a newer Toybox.`);
  let s = scene;
  for (let n = v; n < format; n++) {
    const up = upgrades[n];
    if (!up) throw new Error(`No upgrade from format ${n} to ${n + 1}.`);
    s = { ...up(s), toybox: n + 1 };
  }
  return s;
}
