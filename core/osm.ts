// OpenStreetMap buildings (Overpass API) and OneMap tile addresses.
// OpenStreetMap data is ODbL 1.0. Keep the credit with any data file. Never store OneMap data.
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { VERSION } from './version.ts';
import type { OsmBuilding, Scene, Vec2 } from '../web/types.js';
import { assert } from './assert.ts';

export interface LatLon { lat: number; lon: number }
export type Bbox = [number, number, number, number];
// A footprint as parseOverpass makes it: local metres in poly, the original degrees in ll.
export interface Building { id: string; height: number; levels?: number; poly: Vec2[]; ll?: Vec2[] }
// Any footprint that toMapBlock and writeOdbl take: parsed from Overpass (ll set) or already local (scene file).
export type MapBuilding = OsmBuilding & { ll?: Vec2[] };
export interface OverpassElement { type?: string; id?: number | string; tags?: Record<string, string> | undefined; geometry?: { lat: number; lon: number }[] }
export interface OverpassResult { elements?: OverpassElement[] }
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export interface OdblFile {
  header: { license: string; licenseUrl: string; credit: string; notice: string };
  origin: LatLon | null;
  bearing?: number;
  osm: { attribution: string; buildings: unknown[] };
}

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const ATTRIBUTION = '© OpenStreetMap contributors';
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const LEVEL_HEIGHT = 3.2;
export const DEFAULT_HEIGHT = 9;
const R = 6371008.8;
const D = Math.PI / 180;

// Equirectangular projection to local metres: x east, z south, origin at (0, 0).
export function project(lat: number, lon: number, origin: LatLon): Vec2 {
  assert(typeof D === 'number');
  assert(typeof R === 'number');
  assert(typeof lat === 'number');
  assert(typeof lon === 'number');
  assert(typeof origin === 'object');
  assert(!Number.isNaN(lat));
  assert(!Number.isNaN(lon));
  return [(lon - origin.lon) * D * R * Math.cos(origin.lat * D), -(lat - origin.lat) * D * R];
}

export function buildingHeight(tags: Record<string, string> = {}): { height: number; levels: number | undefined } {
  assert(typeof LEVEL_HEIGHT === 'number');
  assert(typeof DEFAULT_HEIGHT === 'number');
  const h = parseFloat((tags.height ?? '').replace(',', '.'));
  if (Number.isFinite(h) && h > 0) return { height: h, levels: parseInt(tags['building:levels'] ?? '', 10) || undefined };
  const lv = parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(lv) && lv > 0) return { height: Math.round(lv * LEVEL_HEIGHT * 10) / 10, levels: Math.round(lv) };
  return { height: DEFAULT_HEIGHT, levels: undefined };
}

const round2 = ([a, b]: Vec2): Vec2 => [Math.round(a * 100) / 100, Math.round(b * 100) / 100];

export function parseOverpass(json: OverpassResult, origin: LatLon): Building[] {
  assert(typeof json === 'object');
  assert(typeof origin === 'object');
  const out: Building[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'way' || !el.tags?.building || !el.geometry?.length) continue;
    let ll = el.geometry.map((g): Vec2 => {
      assert(typeof g === 'object');
      return [g.lat, g.lon];
    });
    const first = ll[0], last = ll[ll.length - 1];
    if (ll.length > 1 && first && first[0] === last?.[0] && first[1] === last[1]) ll = ll.slice(0, -1);
    if (ll.length < 3) continue;
    const { height, levels } = buildingHeight(el.tags);
    const b: Building = { id: `w${el.id}`, height, poly: ll.map(([la, lo]) => round2(project(la, lo, origin))), ll };
    if (levels) b.levels = levels;
    out.push(b);
  }
  return out;
}

function overpassResult(v: unknown): OverpassResult {
  if (typeof v !== 'object' || v === null) throw new Error('Overpass answered something that is not JSON data');
  return v;   // elements are read defensively by parseOverpass
}
export async function fetchOverpass(query: string, { endpoint = OVERPASS_URL, fetchImpl = fetch }: { endpoint?: string; fetchImpl?: FetchLike } = {}): Promise<OverpassResult> {
  assert(typeof query === 'string');
  assert(query.length < 1e7);
  const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': `toybox/${VERSION}` }, body: 'data=' + encodeURIComponent(query) });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  return overpassResult(await res.json());
}
export const bboxQuery = ([s, w, n, e]: Bbox): string => {
  const returned = `[out:json][timeout:25];way["building"](${s},${w},${n},${e});out geom;`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
};

export async function fetchBuildings({ lat, lon, radius = 150, endpoint = OVERPASS_URL, fetchImpl = fetch }: { lat: number; lon: number; radius?: number; endpoint?: string; fetchImpl?: FetchLike }): Promise<Building[]> {
  return parseOverpass(await fetchOverpass(`[out:json][timeout:25];way["building"](around:${radius},${lat},${lon});out geom;`, { endpoint, fetchImpl }), { lat, lon });
}

// Local metres turned so that a street with compass bearing `bearing` runs along z.
export function turn([x, z]: Vec2, bearing = 0): Vec2 {
  const c = Math.cos(bearing * D), s = Math.sin(bearing * D);
  return [x * c + z * s, -x * s + z * c];
}

// The map.osm block for a scene file. Re-projects to `origin` when buildings carry lat/lon.
export function toMapBlock(buildings: MapBuilding[], origin: LatLon, bearing = 0): { attribution: string; buildings: OsmBuilding[] } {
  assert(typeof buildings === 'object');
  assert(typeof origin === 'object');
  assert(buildings.length < 1e7);
  return {
    attribution: ATTRIBUTION,
    buildings: buildings.map((b) => {
      const o: OsmBuilding = { id: b.id, height: b.height, poly: b.ll ? b.ll.map(([la, lo]) => round2(turn(project(la, lo, origin), bearing))) : b.poly };
      if (b.levels) o.levels = b.levels;
      return o;
    }),
  };
}

// A data file taken from OpenStreetMap. The header keeps the licence and the credit with the data.
export function writeOdbl(path: string, buildings: MapBuilding[], origin: LatLon | null | undefined, bearing = 0): OdblFile {
  assert(typeof path === 'string');
  assert(typeof buildings === 'object');
  assert(path.length < 1e7);
  assert(buildings.length < 1e7);
  const file: OdblFile = {
    header: {
      license: 'ODbL 1.0', licenseUrl: ODBL_URL, credit: ATTRIBUTION,
      notice: 'This file is a database derived from OpenStreetMap. You may share it only under the ODbL and with this credit. See https://www.openstreetmap.org/copyright',
    },
    origin: origin ?? null,
    ...(bearing ? { bearing } : {}),
    osm: toMapBlock(buildings, origin ?? { lat: 0, lon: 0 }, bearing),
  };
  if (!origin) file.osm = { attribution: ATTRIBUTION, buildings: buildings.map((b) => ({ id: b.id, ...(b.height === undefined ? {} : { height: b.height }), ...(b.levels === undefined ? {} : { levels: b.levels }), poly: b.poly })) };
  writeFileSync(path, JSON.stringify(file, null, 1) + '\n');
  return file;
}

// Writes the ODbL data file that map.osm.dataFile names into dir, from the footprints in the scene.
export function writeSceneOdbl(scene: Scene, dir: string): string | null {
  assert(typeof scene === 'object');
  assert(typeof dir === 'string');
  assert(dir.length < 1e7);
  const map = scene.map, osm = map?.osm;
  if (!map || !osm?.dataFile) return null;
  const p = join(dir, basename(osm.dataFile));
  writeOdbl(p, osm.buildings, map.origin, map.bearing || 0);
  return p;
}

export const validBbox = (b: unknown): b is Bbox => {
  return Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && b[2] - b[0] <= 0.01 && b[3] - b[1] <= 0.01;
};

// OneMap raster tiles (Web Mercator, EPSG:3857). Tiles load live. Do not store them.
export function tileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  assert(typeof lat === 'number');
  assert(typeof lon === 'number');
  assert(typeof zoom === 'number');
  assert(!Number.isNaN(lat));
  assert(!Number.isNaN(lon));
  assert(!Number.isNaN(zoom));
  const n = 2 ** zoom, latR = lat * D;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n) };
}
export function tileUrl(lat: number, lon: number, zoom = 18, style = 'Default'): string {
  assert(typeof lat === 'number');
  assert(typeof lon === 'number');
  assert(!Number.isNaN(lat));
  assert(!Number.isNaN(lon));
  const { x, y } = tileXY(lat, lon, zoom);
  const returned = `https://www.onemap.gov.sg/maps/tiles/${style}/${zoom}/${x}/${y}.png`;
  assert(typeof returned === 'string');
  assert(returned.length < 1e7);
  return returned;
}
