// OpenStreetMap buildings (Overpass API) and OneMap tile addresses.
// OpenStreetMap data is ODbL 1.0. Keep the credit with any data file. Never store OneMap data.
import { writeFileSync } from 'node:fs';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const ATTRIBUTION = '© OpenStreetMap contributors';
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const LEVEL_HEIGHT = 3.2;
export const DEFAULT_HEIGHT = 9;
const R = 6371008.8;
const D = Math.PI / 180;

// Equirectangular projection to local metres: x east, z south, origin at (0, 0).
export function project(lat, lon, origin) {
  return [(lon - origin.lon) * D * R * Math.cos(origin.lat * D), -(lat - origin.lat) * D * R];
}

export function buildingHeight(tags = {}) {
  const h = parseFloat(String(tags.height ?? '').replace(',', '.'));
  if (Number.isFinite(h) && h > 0) return { height: h, levels: parseInt(tags['building:levels'], 10) || undefined };
  const lv = parseFloat(tags['building:levels']);
  if (Number.isFinite(lv) && lv > 0) return { height: Math.round(lv * LEVEL_HEIGHT * 10) / 10, levels: Math.round(lv) };
  return { height: DEFAULT_HEIGHT, levels: undefined };
}

export function parseOverpass(json, origin) {
  const out = [];
  for (const el of json.elements || []) {
    if (el.type !== 'way' || !el.tags?.building || !el.geometry?.length) continue;
    let ll = el.geometry.map((g) => [g.lat, g.lon]);
    if (ll.length > 1 && ll[0][0] === ll[ll.length - 1][0] && ll[0][1] === ll[ll.length - 1][1]) ll = ll.slice(0, -1);
    if (ll.length < 3) continue;
    const { height, levels } = buildingHeight(el.tags);
    const b = { id: `w${el.id}`, height, poly: ll.map(([la, lo]) => project(la, lo, origin).map((v) => Math.round(v * 100) / 100)), ll };
    if (levels) b.levels = levels;
    out.push(b);
  }
  return out;
}

export async function fetchOverpass(query, { endpoint = OVERPASS_URL, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'toybox/0.1' }, body: 'data=' + encodeURIComponent(query) });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  return res.json();
}
export const bboxQuery = ([s, w, n, e]) => `[out:json][timeout:25];way["building"](${s},${w},${n},${e});out geom;`;

export async function fetchBuildings({ lat, lon, radius = 150, endpoint = OVERPASS_URL, fetchImpl = fetch }) {
  return parseOverpass(await fetchOverpass(`[out:json][timeout:25];way["building"](around:${radius},${lat},${lon});out geom;`, { endpoint, fetchImpl }), { lat, lon });
}

// Local metres turned so that a street with compass bearing `bearing` runs along z.
export function turn([x, z], bearing = 0) {
  const c = Math.cos(bearing * D), s = Math.sin(bearing * D);
  return [x * c + z * s, -x * s + z * c];
}

// The map.osm block for a scene file. Re-projects to `origin` when buildings carry lat/lon.
export function toMapBlock(buildings, origin, bearing = 0) {
  return {
    attribution: ATTRIBUTION,
    buildings: buildings.map((b) => {
      const o = { id: b.id, height: b.height, poly: b.ll ? b.ll.map(([la, lo]) => turn(project(la, lo, origin), bearing).map((v) => Math.round(v * 100) / 100)) : b.poly };
      if (b.levels) o.levels = b.levels;
      return o;
    }),
  };
}

// A data file taken from OpenStreetMap. The header keeps the licence and the credit with the data.
export function writeOdbl(path, buildings, origin, bearing = 0) {
  const file = {
    header: {
      license: 'ODbL 1.0', licenseUrl: ODBL_URL, credit: ATTRIBUTION,
      notice: 'This file is a database derived from OpenStreetMap. You may share it only under the ODbL and with this credit. See https://www.openstreetmap.org/copyright',
    },
    origin: origin || null,
    ...(bearing ? { bearing } : {}),
    osm: toMapBlock(buildings, origin || { lat: 0, lon: 0 }, bearing),
  };
  if (!origin) file.osm = { attribution: ATTRIBUTION, buildings: buildings.map(({ ll, ...b }) => b) };
  writeFileSync(path, JSON.stringify(file, null, 1) + '\n');
  return file;
}

// OneMap raster tiles (Web Mercator, EPSG:3857). Tiles load live. Do not store them.
export function tileXY(lat, lon, zoom) {
  const n = 2 ** zoom, latR = lat * D;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n) };
}
export function tileUrl(lat, lon, zoom = 18, style = 'Default') {
  const { x, y } = tileXY(lat, lon, zoom);
  return `https://www.onemap.gov.sg/maps/tiles/${style}/${zoom}/${x}/${y}.png`;
}
