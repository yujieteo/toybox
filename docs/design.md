# Toybox design

Status: settled in grill rounds 1 to 3. Items marked **OPEN** wait for the final confirmation round.

## 1. Product

Toybox is one product with three modes on one page: **Build** (a sandbox where a visitor places models and takes pictures), **Play** (a story told as ordered steps, played by scroll or tap) and **Remix** (open a story in Build). An agent can author the same files through a local MCP server. The page is static and mobile first. It is free and non-commercial. Any visitor can use it, with no account.

The end goal: ask an agent, again and again, to build an explainer like the Straits Times "Little India riot, 10 years on" page, at higher quality. Scenes are streets and also interiors (rooms, offices, homes, shops, stairs, corridors).

## 2. Engine

- The renderer, scene, camera, gestures and draw calls are written in **Goose** (https://aardappel.github.io/goose/), compiled to C (`goose -o out.c`), then to WebAssembly with a C-to-WebAssembly compiler (emcc). Goose is the engine, for performance.
- The Goose `gfx` package uses SDL3 GPU (Direct3D 12, Vulkan, Metal). SDL3 GPU has no WebGL or WebGPU backend (forum post, 2025-05-17, may be out of date). So the renderer calls WebGL2 through Goose `extern fn`. A thin JavaScript layer does only what the browser requires: create the WebGL2 context, fetch files, deliver touch events, PNG download and share, file open and save.
- **Spike first.** Before the full build: Goose to C to emcc with WebGL2, one lit model, one-finger drag, the toon and outline pass, in headless Chrome at phone size with touch input and 4x CPU slowdown (chrome-devtools-axi). Pass bar: 30 frames per second and a `.wasm` file below 2 MB. If the spike fails, stop and report options before more work. The owner confirms on a real phone from the PR before merge.

## 3. Interaction (Build)

- Orbit camera. One finger on empty space orbits. Two fingers pinch to zoom and pan. One finger on a model moves it on the ground. Tap selects.
- Per object: scale, rotate, flip, delete, duplicate. No colour change and no other knobs. Static placement, no snap, 20 undo steps.
- Four ready backdrops picked by tapping a picture: empty ground, grass, street, room floor.
- Lighting: one fixed sun plus ambient light and a soft shadow. Visitors get a day button and a night button. Authors set the sun angle in the story file.
- Pictures: PNG of the canvas through the phone share sheet, else download. No credit strip (see section 9 for the OpenStreetMap exception).
- Saving: autosave to `localStorage`, plus download and open of a scene file.

## 4. Models

CC0 only (checked on each pack's licence page, a pack that is not CC0 is refused), plus our own primitives.

| Source | Used for | Facts checked |
|---|---|---|
| Kenney (https://kenney.nl/support) | people, furniture, food, buildings, roads, nature, vehicles | every pack page opened prints CC0; counts are file counts (Furniture Kit 140, Food Kit 200, City Kit Commercial 50, Suburban 40, Roads 90, Retro Urban Kit 120, Nature Kit 330, Car Kit 45, and others) |
| Poly Haven (https://polyhaven.com/license) | realistic props | 521 models, all CC0; furniture 83, food and kitchen 35, electronics 35, office 9; no people; median 11,146 triangles, so only selected light models |
| MakeHuman exports | people with readable faces | see section 6 |
| Our own Toybox kit | walls, floors, doors, windows, stairs, shophouse bays, shop fronts, signs, bus stop, kerb, road tiles | built from primitives in Goose, CC0 |

Out: Polyfork (its licence treats a public scene builder as redistribution that needs the paid Platform plan), SimReady (attribution and industrial), Quaternius (licence page forbids redistributing the assets themselves).

Only converted compact files are committed (`assets/`). The README has a short sources list. The build script reads the licence line of every pack and refuses non-CC0. Whether Kenney packs contain a bus, an ambulance, a police car or posed people is unchecked; the first build job opens the packs and counts.

## 5. Streets, buildings and indoor scenes

- **Street layouts.** The author gives measured numbers (road width, block length, building width and storeys), each with a `source` text. An optional importer reads building footprints from OpenStreetMap (section 9) and turns them into extruded buildings with `building:levels` or `height` tags where they exist.
- **Indoor scenes are first-class.** The Toybox kit has walls, floors, ceilings, doors, windows and stairs. A `build_room` helper makes a room from width, depth, height and a list of openings. A cutaway camera hides the ceiling and the walls nearest the camera so the inside shows. Furniture comes from Kenney Furniture Kit and selected Poly Haven models.
- Vehicles are static with a heading (Kenney Car Kit and others; bus, police car and ambulance from primitives if missing).

## 6. People

People need readable faces and variety. Quaternius stays out.

- **MakeHuman.** MakeHuman's FAQ says that since September 2020 "Assets are per default released as CC0" and "The exported models end up being licensed CC0" (https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html , https://static.makehumancommunity.org/oldsite/faq/can_i_sell_models_created_with_makehuman.html). Some bundled assets can still be CC-BY (the FAQ links a CC-BY note). The build pipeline must read the licence of each asset used and refuse anything that is not CC0.
- Plan: export about 24 people (age, build, skin, hair, clothes) with the default skeleton. Poses are fixed bone angles applied by skinning in the vertex shader: stand, walk, run, lie, sit, crouch, arms up, fall. This is a static pose, not animation. Groups use `place_group`.
- **Risk.** I have not verified a headless MakeHuman export, the triangle budget per person, or face quality on a phone. A second spike (after the phone spike) tests 24 people, 8 poses and a crowd of 50 at 30 frames per second. Fallback: Kenney figures with 3 poses.

## 7. Explainer format and playback

- One file format, `.toybox.json`, for scenes and stories. A scene is a story with one step. It is described by a JSON Schema kept in the repo.
- Header: title, author, backdrop, model ids used. Then ordered steps. Each step has: `time` (clock label such as "21:21", optional `date`), camera shot (position, target, field of view), the placed objects or changes since the previous step, one caption (up to 280 characters), up to 4 callouts (a pin on an object or point, label up to 40 characters, optional ring or arrow), optional lighting (day or night), and `source` text for claims.
- Play: a full-screen canvas stays fixed and caption cards scroll over it. Scroll position scrubs the camera between steps (the camera moves, no model animates). Objects switch at step boundaries. Tap pauses the scroll lock so the visitor can orbit; "back to story" returns to the shot. `prefers-reduced-motion` gives cuts, no glide. A clock chip and progress bar with ticks show the timeline.
- Published stories are files in the site repo under the Toybox sub-path, loaded by `?story=<name>`. Only the models they list are fetched.

## 8. MCP server (agents)

A local program started by the agent's client (stdio transport; the MCP specification defines stdio and Streamable HTTP: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports ). It edits a story file on disk. The page opens the file by drag and drop, by `?story=`, or by reload from a local dev server that watches the file. Nothing is hosted. Anyone who runs the program with their own agent may author. The public page only plays and remixes and never talks to an agent.

Tools: `list_models(query, kind)` (id, name, kind, size in metres), `get_story`, `new_story`, `place`, `place_near(model, anchor, relation, distance)`, `transform`, `duplicate`, `remove`, `place_group`, `set_pose`, `build_room`, `place_sign(text)`, `set_lighting`, `set_camera` with `frame(ids)`, `set_caption`, `add_callout`, `add_step`, `import_osm(bbox)` (off by default), `validate_story`, `render_preview(step)` (PNG through a headless browser on the local machine).

**Consistency.** Every tool validates and returns structured errors: unknown model id, object below ground or overlapping, step time going backwards, caption too long, focus object outside the camera view (computed), step without callout, measured value without `source`. An eval gates changes: a fixed brief, a scorer and a pass rule. First eval: a neutral 8-step street accident (no real people). Second eval: the riot brief from the Committee of Inquiry facts. The scorer checks step count and order, times in order, caption and callout per step, focus objects visible, sources present, and a picture diff of 3 chosen steps with a fixed tolerance. Pass rule: 5 runs in a row.

## 9. Maps and the OpenStreetMap credit

Building footprints come from OpenStreetMap, licensed under the ODbL. The credit "© OpenStreetMap contributors" is added automatically to the page and to every exported picture of a scene that used OpenStreetMap data (https://www.openstreetmap.org/copyright , https://osmfoundation.org/wiki/Licence/Attribution_Guidelines). The stored footprint file is a database taken from OpenStreetMap, and "if you alter or build upon the data, you may distribute the result only under the same licence", so that data file is published under the ODbL (reading of the pages, not legal advice). Our code is not affected.

Alternatives checked:
- **Overture Maps** buildings theme: "License for theme: ODbL © OpenStreetMap contributors" plus other sources, so the same duty (https://docs.overturemaps.org/attribution/). No gain.
- **Google Open Buildings**: CC BY 4.0 or ODbL, your choice (https://sites.research.google/gr/open-buildings/). Credit still required. Singapore coverage not verified.
- **Microsoft GlobalMLBuildingFootprints**: CDLA Permissive 2.0 (https://github.com/microsoft/GlobalMLBuildingFootprints). I did not read the licence text for duties, and coverage of Little India is not verified. Footprints only.
- **Singapore government data (data.gov.sg)**: Singapore Open Data Licence requires "a conspicuous notice acknowledging the source of the datasets" and a licence link (https://data.gov.sg/open-data-licence). OneMap's legal page did not load for me.
- **Open 3D building data**: NUS released 3D models of HDB blocks (LOD1) and a CityJSON sample (https://ual.sg/post/2019/08/25/release-of-3d-building-open-data-of-hdbs-in-singapore/). I did not open a licence. Not suited to Little India shophouses.
Decision: use OpenStreetMap, as asked, unless a check in the build shows one of the others clearly better for the first target area.

## 10. Style

One look for everything, set in the Goose shader: flat colours from the model texture, 2 or 3 light steps (toon), a dark outline of 1 pixel on a 390-pixel-wide screen, and a paper-grain overlay. Watercolour texture is a later optional pass. Poly Haven textures pass through the same shader so they match Kenney. The outline pass has an unmeasured phone cost; the spike measures it, and the fallback is flat unlit colour with outlines.

## 11. Quality bars (the high quality version)

Reference weak points: the ST riot page shows its 3D as pre-rendered video clips (21 `video` blocks and 3 scroll sections in its data file), so the camera is fixed and nothing can be remixed. Its 71 paragraphs sit beside the clips. Its layout came from a 10-year-old basic map plus map measurements (making-of page: https://www.straitstimes.com/multimedia/graphics/2024/02/little-india-explainer/index.html?shell ). I did not view the clips and could not measure the video size.

All bars hold only if the spike passes 30 frames per second; if it fails, the report names which bar to drop.

| Bar | Measure |
|---|---|
| a. Interaction | every step can be orbited and zoomed (100% of steps) |
| b. Model detail | at least 10 distinct person models, 8 poses; at most 150,000 triangles in view on a phone (proposal, checked by the spike) |
| c. Lighting | day and night looks; one 1024 by 1024 shadow map; at most 4 point lights near the camera |
| d. Style | toon with 1-pixel outline on a 390-pixel screen, no flicker when the camera moves |
| e. Camera | a shot in every step; glide at most 1.5 s; no hidden focus object (the tool checks); at least 3 shot types in a 12-step story |
| f. Layout | each named dimension has a `source` and sits within 1 metre of the given number (the validator checks) |
| g. Text | captions up to 280 characters; a time label per step; text at least 16 pixels on a 390-pixel screen; contrast at least 4.5 to 1 |
| h. Phone | 30 frames per second; scene visible within 3 seconds on throttled 4G; first download at most 5 MB for a 12-step story; `.wasm` below 2 MB |
| i. Accessibility | captions are real text for screen readers; reduced motion respected |

Risk: the riot page names real people and shows a real death. Real events use faceless or generic figures, no names on figures, and a `source` on every claim in a caption.

## 12. Build plan (Phase 2, after confirmation)

1. Phone spike (section 2) and people spike (section 6). Stop and report if either fails.
2. Asset pipeline: pack licence check, conversion to compact files, catalogue with sizes in metres.
3. Engine: renderer, camera, gestures, toon and outline, shadow, picking.
4. Build mode: placement, edit, backdrops, undo, scene file, autosave, picture export.
5. Toybox kit: walls, floors, doors, windows, stairs, shophouse bays, shop fronts, signs, bus stop, roads, cutaway camera.
6. Play mode, `.toybox.json` schema, scroll playback, callouts, timeline.
7. MCP server, validation, `render_preview`, evals.
8. OpenStreetMap importer with automatic credit.
9. README with licences of every model and library, before and after screenshots (phone and desktop) in the PR description. Publishing on the site is a separate task.

Licences to list in the README: Goose (Apache 2.0), Kenney (CC0), Poly Haven (CC0), MakeHuman exports (CC0), OpenStreetMap data (ODbL), the C-to-WebAssembly compiler and any library we link.
