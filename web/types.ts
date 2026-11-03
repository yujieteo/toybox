export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Ease = 'linear' | 'inout' | 'step';
export type Channel = 'at' | 'yaw' | 'scale' | 'pose';
export type Look = 'day' | 'dusk' | 'night' | 'indoor';
export type Ground = 'grass' | 'street' | 'floor' | 'plain' | 'map';
export type Shot = 'wide' | 'medium' | 'close' | 'top' | 'follow' | 'orbit';
export type Cue = [number] | [number, string] | [number, string, number];

export interface SceneObject {
  id: string;
  model: string;
  variant?: number;
  at?: Vec3;
  yaw?: number;
  scale?: Vec3 | number;
  flip?: boolean;
  colors?: Record<string, string>;
  outfit?: string;
  pose?: string;
  tags?: string[];
  label?: string;
  parent?: string | null;
  source?: string;
  estimated?: boolean;
  measured?: boolean;
  hidden?: boolean;
}

export type TrackValue = Vec3 | number | string;
export interface TrackKey {
  t: number;
  v: TrackValue;
  ease?: Ease;
  cue?: Cue;
}
export interface Track {
  object: string;
  channel: Channel;
  keys: TrackKey[];
}

export interface CameraFrame {
  ids: string[];
  view?: number;
  elevation?: number;
  margin?: number;
  distance?: number;
}
export interface CameraKey {
  t: number;
  shot?: Shot;
  eye: Vec3;
  target: Vec3;
  fov?: number;
  ease?: Ease;
  cue?: Cue;
  frame?: CameraFrame;
}

export interface Chapter {
  estimated?: boolean;
  measured?: boolean;
  id: string;
  start: number;
  end: number;
  title?: string;
  clock?: string;
  caption?: string;
  focus?: string[];
  shot?: Shot;
  source?: string;
  cue?: Cue;
  endCue?: Cue;
}
export interface Caption {
  start: number;
  end: number;
  text: string;
}
export interface Callout {
  source?: string;
  estimated?: boolean;
  measured?: boolean;
  start: number;
  end: number;
  text: string;
  object?: string;
  cue?: Cue;
  endCue?: Cue;
}
export interface Fact {
  id: string;
  text: string;
  source?: string;
}
export interface NarrationBeat {
  text: string;
  facts?: string[];
  pause?: number;
  voice?: string;
  seconds?: number;
  start?: number;
  end?: number;
}
export interface Motion {
  object: string;
  move: string;
  t: number;
  d?: number;
  h?: number;
  x?: number;
  y?: number;
  deg?: number;
  cue?: Cue;
}
export interface LightingKey {
  t: number;
  look: Look;
  cue?: Cue;
}

export interface OsmBuilding {
  id: string;
  height?: number;
  levels?: number;
  poly: Vec2[];
}
export interface SceneMap {
  source?: string;
  estimated?: boolean;
  origin: { lat: number; lon: number };
  bearing?: number;
  osm?: { attribution?: string; dataFile?: string; buildings: OsmBuilding[] };
  onemap?: { zoom?: number; style?: string };
}

export interface Scene {
  toybox: number;
  title: string;
  author?: string;
  duration: number;
  backdrop: { ground: Ground; size: Vec2; color?: string };
  map?: SceneMap;
  lighting?: LightingKey[];
  cutaway?: { ceilings?: boolean; nearWalls?: boolean };
  drive?: 'left' | 'right';
  objects: SceneObject[];
  tracks: Track[];
  camera: CameraKey[];
  chapters: Chapter[];
  captions: Caption[];
  callouts: Callout[];
  credits: string[];
  facts?: Fact[];
  narration?: NarrationBeat[];
  motions?: Motion[];
}

export type Prim = 'box' | 'cylinder' | 'sphere' | 'wedge';
export interface Part {
  prim: Prim;
  pos: Vec3;
  size: Vec3;
  rot?: Vec3;
  slot?: string;
  color?: string;
  bone?: string;
  eye?: boolean;
}
export interface Model {
  id: string;
  name: string;
  kind: string;
  license: string;
  size: Vec3;
  parts: Part[];
  base?: [number, number, number, number];
  tags?: string[];
  [extra: string]: unknown;
}
export interface Outfit {
  id: string;
  name: string;
  colors: Record<string, string>;
  parts: Part[];
  source?: string;
  note?: string;
}
export interface Catalogue {
  models: Model[];
  outfits?: Outfit[];
}
