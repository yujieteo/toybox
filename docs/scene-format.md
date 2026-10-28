# Scene file format (`.toybox.json`, schema version 1)

This file is the only source of truth for a scene. The engine, the viewer, the MP4 export and the MCP tools all read it. Units are metres and seconds. The y axis points up, x points east (right) and z points south (toward the viewer in the default camera). A person faces +z when `yaw` is 0. `yaw` is in degrees, counter-clockwise seen from above.

```json
{
  "toybox": 1,
  "title": "string",
  "author": "string",
  "duration": 60,
  "backdrop": { "ground": "grass | street | floor | plain | map", "size": [80, 80], "color": "#9fb88c" },
  "map": {
    "origin": { "lat": 1.3066, "lon": 103.8518 },
    "osm": { "attribution": "© OpenStreetMap contributors", "buildings": [ { "id": "w123", "height": 12, "levels": 4, "poly": [[x, z], [x, z]] } ] },
    "onemap": { "zoom": 18, "style": "Default" }
  },
  "lighting": [ { "t": 0, "look": "day | dusk | night | indoor" } ],
  "cutaway": { "ceilings": true, "nearWalls": true },
  "drive": "left | right",
  "objects": [
    { "id": "p1", "model": "person", "variant": 3, "at": [0, 0, 0], "yaw": 0, "scale": [1, 1, 1],
      "flip": false, "colors": { "shirt": "#3366aa" }, "pose": "stand", "tags": [], "label": "",
      "parent": null, "source": "", "estimated": false, "hidden": false }
  ],
  "tracks": [ { "object": "p1", "channel": "at | yaw | scale | pose", "keys": [ { "t": 0, "v": [0, 0, 0], "ease": "linear | inout | step" } ] } ],
  "camera": [ { "t": 0, "shot": "wide | medium | close | top | follow | orbit", "eye": [0, 6, 14], "target": [0, 1, 0], "fov": 50, "ease": "inout" } ],
  "chapters": [ { "id": "c1", "start": 0, "end": 8, "title": "", "clock": "21:21", "caption": "", "focus": ["p1"], "shot": "wide", "source": "" } ],
  "captions": [ { "start": 0, "end": 5, "text": "up to 280 characters" } ],
  "callouts": [ { "start": 0, "end": 5, "text": "", "object": "p1" } ],
  "credits": [ "free text lines that the export draws" ]
}
```

## Rules

- `objects[].model` is an id from `assets/catalogue.json`, or `person`. A person has `variant` 0 to 23 and a `pose` from: `stand`, `walk`, `run`, `wave`, `point`, `cheer`, `sit`, `bend`.
- `colors` maps a colour slot of the model (for example `body`, `roof`, `shirt`, `pants`) to a hex colour. A person uses the slots `shirt` and `pants` only. Skin, hair and eyes come from `variant`.
- `outfit` (person only) is an id from the catalogue `outfits` list, for example `soc-riot`. The outfit sets the default `shirt` and `pants` colours and adds its parts (helmet, shield, baton). `colors` still wins over the outfit colours.
- `parent` is an object id. `at`, `yaw` and `scale` are then local to the parent. Compound catalogue models are expanded by the viewer, so an author never needs `parent` for them.
- `tags` may hold `wall` (with `yaw` as the outward normal direction of its front face), `ceiling`, `floor`. `cutaway` hides objects tagged `ceiling`, and walls that face the camera and sit between the camera and the camera target. Only room parts carry these tags: a building, a vehicle or a tree with a `wall` or `ceiling` tag fails `validate` (`cutaway_outdoor`).
- `hidden: true` fails `validate` (`object_hidden`). A building or a structure never scales to nothing, and a vehicle does so only when another vehicle appears at the same place within 1 s (a swap, for example a car that burns) (`object_vanishes`). A blocked view is fixed by moving the camera.
- `drive` is the side of the road that traffic keeps to. The default is `left` (Singapore). A vehicle that drives faster than 1 m/s on a `road-straight` or `road-zebra` tile must keep to that side for its direction (`wrong_lane`).
- Solid objects must not pass into each other at any time (`collision`, sampled every 0.25 s; two footprints may share at most 10 percent of the smaller one). A person counts as a 0.3 m square. A model with `base` in the catalogue counts as that footprint. Roads, floors, ceilings, doors and models tagged `effect` do not count. A seated person may share space with a seat, and a person on stairs with the stairs. People and vehicles must stand on the ground, on the top of an object under them, or on stairs (`off_ground`).
- A callout must lie inside one chapter (`callout_outside_chapter`).
- A track replaces the static value of its channel. Between keys the value is interpolated by the `ease` of the earlier key. A `pose` track has string values and `step` ease. The engine cross-fades poses over 0.3 s. A walk, run or wave cycle runs on the scene time.
- Keys in a track and in `camera` have strictly increasing `t`.
- `map.osm` holds footprints already projected to local metres from `map.origin` (x east, z south). The `import_osm` tool writes it, and `map.osm.dataFile` names the ODbL data file next to the scene. The data file and the scene file must stay together. The viewer and the MP4 show "© OpenStreetMap contributors" for every scene with footprints.
- `map.bearing` (degrees) turns the footprints so that a street with this compass bearing runs along z. Ground `map` cannot have a bearing.
- Ground `map` with `map.origin` makes the viewer draw OneMap tiles live under the scene. `map.onemap` can set `zoom` and `style`. The file holds no OneMap data.
- `source` is a free text that names where a measured value or a claim comes from. `estimated: true` marks any value that no source gives. A measured claim needs `source`. An estimate needs `estimated: true`.
- Time values are seconds from the start. `duration` is at least the end of every caption, chapter, callout and key.

## Catalogue (`assets/catalogue.json`)

```json
{ "models": [ { "id": "car-sedan", "name": "Sedan", "kind": "vehicle", "license": "CC0 (Toybox kit)",
    "size": [1.8, 1.5, 4.5],
    "parts": [ { "prim": "box | cylinder | sphere | wedge", "pos": [0, 0.5, 0], "size": [1.8, 0.6, 4.5], "rot": [0, 0, 0], "slot": "body", "color": "#c0392b" } ] } ] }
```

- `parts` are drawn by the engine. `pos` is the part centre in model space with the model origin on the ground at the middle of the footprint. `size` is the full extent in x, y, z. `rot` is Euler degrees (x, y, z). A `cylinder` has its axis along y. A `wedge` is a triangular prism with its ridge along z (a gable roof). A part with `slot` takes the object's `colors[slot]` when given, else its own `color`.
- `outfits` is a list of `{ id, name, colors, parts, source, note }`. Each part is a part as above plus `bone`, the name of a body bone in `assets/people/skel.json`. Its `pos` and `rot` are in the rest pose of the body (origin on the ground between the feet, facing +z), and the part moves with that bone in every pose.
- `base` (optional) is `[x0, z0, x1, z1]`, the footprint of the parts below 1 m when it is smaller than `size` (a tree trunk, a lamp post). The collision check uses it.
- `kind` is one of: `vehicle`, `building`, `furniture`, `structure`, `prop`, `sign`, `road`, `nature`.
- Every model has `license` and `size` (x, y, z metres of the bounding box).
- `sign` models show text. The viewer draws the object's `label` next to the model in the caption font, only in the chapters that list the sign in `focus`. A sign that no chapter lists in `focus` (a street name) shows its label in every chapter.
