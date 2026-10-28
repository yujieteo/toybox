# Toybox design

Status: rounds 1 to 4 settled most choices. The owner's words of 2026-10-28 (agent-first, animation, MP4 and scene-file export) change the product shape. Items marked **OPEN** wait for round 5.

## 1. Product

Toybox is a tool where **an agent builds an animated 3D explainer scene for you**. You ask in a chat. The agent builds the scene and its animation through a local program, and you watch the result in a viewer beside the chat. You then export:

- **(a) an MP4 video** with the scene animation and text captions, or
- **(b) the scene file** (`.toybox.json`), which Toybox opens to regenerate the same scene and animation.

The reference for the interface is femahoy (section 2). Real examples that Toybox must build: the Little India riot (a street scene, from the Committee of Inquiry facts) and an indoor walk at HomeTeamNS Punggol from the entrance up to the ballroom. The Straits Times "Little India riot, 10 years on" page is the quality target (section 11).

## 2. Reference: how femahoy works (read from /Users/yj/src/femahoy, read-only)

- femahoy is "a chat for finite element and CFD analyses" (README.md). `fh serve` runs a local daemon on 127.0.0.1 (port 8790, a random token in the state folder). It serves one page with the chat on the left and a wasm 3D viewer in the centre.
- The agent is Claude Code, started by the daemon with the user's own login (`--input-format stream-json --output-format stream-json`). femahoy has no agent loop and holds no credential (DESIGN.md section 4.3).
- **femahoy does not use MCP.** The daemon starts the agent with `--strict-mcp-config` and no MCP server (`crates/fh/src/daemon/chat.rs`). The agent works through the `fh` command-line program, and `fh guide NAME` prints how-to guides on demand. The daemon watches a state folder that `fh run` writes, and shows the results in the viewer. `fh report` writes one HTML file with the results and the same wasm viewer.
- The owner said Toybox "runs through the MCP". The design keeps that: one engine program with commands, an MCP server as a thin front for the same commands, and the femahoy-style chat page as the viewer. See OPEN 1.

## 3. Pieces

```
 browser page: chat + wasm viewer (Goose engine)
        |  HTTP (127.0.0.1, token)
        v
 toybox serve (daemon) --- starts ---> agent (Claude Code, owner's login)
        |                                    |  MCP tools (or toybox commands)
      watches                                v
        |                              toybox core: scene + timeline files
        v                                    |
   state folder <--- writes scene ----------+
        |
        +--> export: MP4 (headless browser frames + ffmpeg)   |   scene file (.toybox.json)
```

- **toybox core**: one program that edits and validates the scene file. Its commands are the MCP tools (section 8).
- **MCP server**: a local stdio server that exposes the same commands (the MCP specification defines stdio and Streamable HTTP: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports ).
- **Page and viewer**: the engine compiled to WebAssembly, shown beside the chat, with a timeline scrubber and play button. It reloads when the scene file changes.
- **Daemon**: femahoy's pattern. It binds 127.0.0.1 only, uses a token, rejects other origins, and starts the agent with the owner's login. Nothing is hosted.

## 4. Engine

- The renderer, scene, camera and animation sampler are written in **Goose** (https://aardappel.github.io/goose/), compiled to C (`goose -o out.c`), then to WebAssembly with a C-to-WebAssembly compiler (emcc). Goose is the engine, for performance.
- The Goose `gfx` package uses SDL3 GPU (Direct3D 12, Vulkan, Metal). SDL3 GPU has no WebGL or WebGPU backend (forum post, 2025-05-17, may be out of date). So the renderer calls WebGL2 through Goose `extern fn`. A thin JavaScript layer does only what the browser requires (context, file fetch, input, capture).
- Goose and emcc are not installed on this machine (checked: not on PATH). `ffmpeg` is installed with `libx264` and `h264_videotoolbox`.
- The renderer must be **deterministic by time**: `render(scene, t)` gives the same image for the same `t`. The viewer plays in real time. Export steps `t` frame by frame.

## 5. Animation (a timeline)

Earlier rounds said "no animation". The owner now wants animation, so:

- A scene has one **timeline** in seconds. Objects have keyframes for position, rotation and scale with easing (linear, ease in-out). The camera has keyframes too (position, target, field of view). Lights have keyframes (day to night). Captions and callouts have a start and an end time.
- **People** need pose animation (walking, running, falling). Plan: the MakeHuman default skeleton, pose keyframes of bone angles, skinned in the vertex shader. A walk or run cycle is a looping set of bone-angle keyframes authored by us (CC0). Motion capture from Mixamo (used by the ST team) is Adobe's service and is not CC0, so it is not used. Kenney characters may ship animation files; I have not opened the packs (OPEN 4).
- **Vehicles and props** move along paths: a list of waypoints with speed or times.
- Steps from earlier rounds become **chapters**: a named time range with a caption, a clock label (`time`, such as "21:21") and a camera shot. A story is still an ordered list, now laid on the timeline.

## 6. Export

### (a) MP4 with text captions and video

- Pipeline: the toybox command opens the scene in a **headless browser** (chrome-devtools-axi is available here), steps `t` by `1/fps`, captures each frame, burns in captions and callouts (drawn in the same canvas so the text is identical to the viewer), and pipes the frames to **ffmpeg** (H.264, `libx264` or `h264_videotoolbox`). ffmpeg stays a separate program (femahoy's rule for GPL and LGPL tools, DESIGN.md section 2). The command fails with an install hint if ffmpeg is missing.
- Alternative inside the browser: WebCodecs `VideoEncoder` plus a JavaScript MP4 muxer. This needs no ffmpeg but needs a muxer library and a browser with WebCodecs. Not chosen as the default because headless frame capture is easier to make exact and to test.
- Defaults: 1920 by 1080 and 1080 by 1920 (vertical) at 30 frames per second. A 60-second video is 1,800 frames. The time per frame in headless Chrome (software or GPU GL) is **unmeasured** and is the main risk (section 10).
- Credits that licences require are drawn into the video: the OneMap logo and attribution, and "© OpenStreetMap contributors" when OpenStreetMap data is used (section 9).
- Audio is not in scope (the owner said "text and video").

### (b) The scene file

- `.toybox.json` is the only source of truth: header (title, author, backdrop, model ids and content hashes, tool version), objects, timeline keyframes, chapters, captions, callouts, lighting, camera, `source` text for claims, and `estimated` flags. It is validated by a JSON Schema kept in the repo.
- Toybox opens it to regenerate the scene and the animation, and can export the MP4 from it. The model files are referenced by id and hash and fetched from the Toybox asset set, so the file stays small.
- **Round trip test:** load a file, export frames, compare 3 chosen frames to stored pictures with a fixed tolerance. A file written by an older version still loads (the header has a schema version and a migration step).

## 7. What the new words make unnecessary or lower priority

| Earlier part | Now |
|---|---|
| Visitor sandbox with Build mode, orbit and pinch gestures, tap to pick backdrop, undo, localStorage autosave, share sheet | **Lower priority.** The author is an agent plus the owner. Keep a simple orbit and pan with the mouse or trackpad in the viewer. Touch gestures, undo and backdrop pictures wait for a later task. |
| Public visitors, accounts, hosting | **Not needed.** Everything runs on the owner's computer, as in femahoy. The hosted site can show exported MP4 files and scene files later. |
| Phone spike bars (30 frames per second, 2 MB wasm on a throttled phone) | **Replaced.** The bar becomes: a 60-second 1080p MP4 exports in a stated time on this computer, and the viewer plays at 30 frames per second on a laptop. The `.wasm` size bar stays loose (below 5 MB). |
| Scroll playback on the phone | **Lower priority.** Playback is the timeline plus the exported video. A scroll-driven web player is an optional later view of the same file. |
| Phone layout, share sheet, PNG share | **Lower priority.** PNG still exports a single frame from the command. |
| Local MCP server writing `story.json` | **Kept, extended** to scene plus timeline, and now the main interface. |
| Evals (riot and indoor walk), tools with validation, `render_preview` | **Higher priority.** The agent must build both cases consistently. |
| Quality bars a to i | **Kept**, but a (interaction) and h (phone) change as above; see section 11. |
| People spike | **Higher priority**, now with animation. |
| Models (Kenney, Poly Haven, MakeHuman, our kit), OneMap, OpenStreetMap | **Kept.** |

## 8. MCP tools (the agent's interface)

Same commands for the MCP server and the `toybox` command line. `list_models(query, kind)`, `new_scene`, `get_scene`, `place`, `place_near`, `place_group`, `transform`, `duplicate`, `remove`, `build_room`, `place_sign(text)`, `set_pose`, `animate(object, keyframes)`, `move_along(object, path, speed)`, `set_camera(time, shot)` with `frame(ids)`, `set_lighting(time, look)`, `add_caption(start, end, text)`, `add_callout(start, end, target, text)`, `add_chapter(time, label, clock)`, `import_osm(bbox)` (off by default), `load_basemap(place)` (OneMap tiles), `validate`, `render_frame(t)` (PNG so the agent can look), `export_mp4(options)`, `export_scene(path)`, and `guide(name)` for how-to text (femahoy's `fh guide` pattern).

**Consistency.** Every command validates and returns structured errors: unknown model id, object below ground or overlapping, time going backwards, caption too long or on screen too short to read, focus object outside the camera view at its chapter (computed), chapter without caption, measured value without `source`, estimate without the `estimated` flag. The eval gates changes: a fixed brief, a scorer and a pass rule, for the two real cases: the Little India riot and the HomeTeamNS indoor walk. The scorer checks chapter count and order, times, caption and callout per chapter, focus objects visible, sources present, MP4 length and a picture diff of 3 chosen frames against stored images. Pass rule: 5 runs in a row.

## 9. Models, maps, credits

**Models.** CC0 only (checked on each pack's licence page; a pack that is not CC0 is refused), plus our own primitives.

| Source | Used for | Facts checked |
|---|---|---|
| Kenney (https://kenney.nl/support) | people, furniture, food, buildings, roads, nature, vehicles | every pack page opened prints CC0; counts are file counts (Furniture Kit 140, Food Kit 200, City Kit Commercial 50, Suburban 40, Roads 90, Retro Urban Kit 120, Nature Kit 330, Car Kit 45) |
| Poly Haven (https://polyhaven.com/license) | realistic props | 521 models, all CC0; no people; median 11,146 triangles, so only light models |
| MakeHuman exports | people with readable faces | exports are CC0 since 2020 ("The exported models end up being licensed CC0", https://static.makehumancommunity.org/oldsite/faq/can_i_sell_models_created_with_makehuman.html ); some bundled assets can be CC-BY, so the pipeline checks each asset |
| Our own Toybox kit | walls, floors, doors, windows, stairs, shophouse bays, shop fronts, signs, bus stop, kerb, road tiles | built from primitives in Goose, CC0 |

Out: Polyfork (a public scene builder is redistribution that needs the paid Platform plan), SimReady (attribution), Quaternius (its licence page forbids redistributing the assets). Only converted compact files are committed (`assets/`), and the README has a short sources list. Whether the Kenney packs contain a bus, an ambulance, a police car or posed or animated people is unchecked.

**Maps: OneMap first, OpenStreetMap for footprints.**
- OneMap: "Use of the datasets is governed by the Singapore Open Data Licence" (https://www.onemap.gov.sg/legal/apitermsofservice.html). That licence requires "a conspicuous notice acknowledging the source of the datasets and including a link to the most recent version of this Licence" (https://data.gov.sg/open-data-licence). Base map services also require the OneMap logo and attribution (https://www.onemap.gov.sg/docs/maps/).
- OneMap Terms of Use say you may not "store, download, archive, print, distribute, publicly display, reproduce" SLA Data, nor "combine or integrate with or incorporate into any other materials" (https://www.onemap.gov.sg/legal/termsofuse.html). I cannot tell which document wins. So the repo stores no OneMap data. Toybox loads OneMap raster tiles live (`https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png`, EPSG:3857) as a flat ground texture, with logo and attribution in the viewer and in the MP4. An MP4 is a copy of the displayed tiles; whether that is "reproduce" is OPEN 3.
- OneMap's maps documentation does not mention building footprints or 3D buildings. data.gov.sg lists URA Master Plan "indicative" building footprint layers (seen in search only; a build check opens one).
- OpenStreetMap footprints (ODbL): the credit "© OpenStreetMap contributors" is drawn into the viewer and into the MP4 of any scene that used OpenStreetMap data (https://www.openstreetmap.org/copyright , https://osmfoundation.org/wiki/Licence/Attribution_Guidelines). The stored footprint file is a database taken from OpenStreetMap; "if you alter or build upon the data, you may distribute the result only under the same licence", so that data file is published under the ODbL (my reading, not legal advice). Our code is not affected.
- Other sources checked: Overture buildings carry "License for theme: ODbL © OpenStreetMap contributors" (https://docs.overturemaps.org/attribution/); Google Open Buildings is CC BY 4.0 or ODbL (https://sites.research.google/gr/open-buildings/); Microsoft footprints are CDLA Permissive 2.0 (https://github.com/microsoft/GlobalMLBuildingFootprints, duties not read); Singapore Open Data Licence needs a source notice. None is clearly better than OpenStreetMap.

**Indoor scenes.** First-class: our walls, floors, ceilings, doors, windows and stairs, `build_room`, a cutaway camera that hides the ceiling and the nearest walls, and furniture from Kenney and selected Poly Haven models. For a real building the layout comes from public floor directories, venue plans and photos, and the owner's photos. Anything not in a source is estimated and labelled `source: "estimated"`; the viewer and the MP4 show a small "approximate" tag on those chapters. I could not confirm a HomeTeamNS clubhouse at Punggol with a ballroom: HomeTeamNS sites block my automated requests, and search found clubhouses at Bedok Reservoir, Bukit Batok, Khatib and Tampines only (OPEN 2).

## 10. Spikes (order by risk)

1. **Export spike (highest risk).** Goose to C to emcc to WebAssembly with WebGL2; render one lit model with an outline pass at `t`; open it in headless Chrome; capture frames; encode with ffmpeg; time it. Pass: a deterministic 10-second 1080p clip at 30 frames per second, repeated runs give identical frames (within a stated tolerance), and the time for a 60-second clip is reported. If headless Chrome has no usable GL, report that and the options (software GL, a native renderer, or WebCodecs).
2. **Animation and people spike.** 24 MakeHuman people with the default skeleton, 8 bone-angle poses, a walk cycle, a crowd of 50, skinned in the vertex shader, at 30 frames per second in the viewer. Fallback: Kenney figures, with limits stated.
3. **Scene-file round trip.** Write a file, load it, export frames, compare.
4. The earlier phone-first spike is dropped. A phone viewer is a later task.

Stop and report after spikes 1 and 2 before the rest of the build.

## 11. Style and quality bars

**Style.** One look for everything, set in the Goose shader: flat colours from the texture, 2 or 3 light steps (toon), a dark outline, and a paper-grain overlay. Watercolour is a later option. The ST team chose "the graphic novel look" with "watercolour textures and bold outlines" (https://www.straitstimes.com/multimedia/graphics/2024/02/little-india-explainer/index.html?shell ).

**Reference weak points.** The ST riot page shows its 3D as pre-rendered video clips (21 `video` blocks and 3 scroll sections in its data file) beside 71 paragraphs, with a layout built from a 10-year-old basic map plus map measurements. I did not view the clips and could not measure the video size.

| Bar | Measure (all checked by a tool, not by eye, unless stated) |
|---|---|
| a. Scene file | the MP4 and the viewer are made from the same file; the round trip test passes |
| b. People | at least 10 distinct people with readable faces, 8 poses, a walk cycle |
| c. Lighting | day and night looks; one 1024 by 1024 shadow map |
| d. Style | outline of 1 pixel at 1080 pixels high, no flicker between frames |
| e. Camera | a shot in every chapter; moves of at most 1.5 s between shots; no hidden focus object; at least 3 shot types in a 12-chapter story |
| f. Layout | each named dimension has a `source` and sits within 1 metre of it; estimates are labelled |
| g. Text | captions up to 280 characters, on screen long enough to read (at least 0.06 s per character, my proposal), text at least 4% of the frame height, contrast at least 4.5 to 1 |
| h. Export | a 60-second 1080p MP4 exports in a stated time on this computer (set after spike 1); the viewer plays at 30 frames per second on a laptop |
| i. Accessibility | captions also written to an `.srt` file next to the MP4 |

Risk: the riot page names real people and shows a real death. Real events use generic faces from the pool, no names on figures, and a `source` on every claim in a caption.

## 12. Build plan (after round 5 is answered)

1. Spikes 1 and 2 (section 10). Stop and report.
2. Asset pipeline: pack licence check, conversion, catalogue with sizes in metres.
3. Engine: renderer, camera, timeline sampler, toon and outline, shadow.
4. toybox core, scene schema, validation, daemon and chat page with the viewer.
5. MCP server and `guide` text; `render_frame`; evals.
6. Toybox kit and the indoor path (walls, floors, doors, windows, stairs, cutaway camera).
7. People with animation.
8. MP4 export with captions and credits; scene-file export and round trip.
9. OpenStreetMap and OneMap loaders.
10. README with the licences of every model and library, before and after screenshots of the page and a sample MP4 in the PR description. Publishing on the site is a separate task.

Licences to list in the README: Goose (Apache 2.0), Kenney (CC0), Poly Haven (CC0), MakeHuman exports (CC0), OpenStreetMap data (ODbL), OneMap (Singapore Open Data Licence), ffmpeg (LGPL or GPL by build, separate program), the C-to-WebAssembly compiler and any library we link.
