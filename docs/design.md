# Toybox design

Status: rounds 1 to 4 settled most choices. The owner's words of 2026-10-28 (agent-first, animation, MP4 and scene-file export) change the product shape. Items marked **OPEN** wait for round 5.

## 1. Product

Toybox is a tool where **an agent builds an animated 3D explainer scene for you**. You ask in a chat. The agent builds the scene and its animation through a local program, and you watch the result in a viewer beside the chat. You then export:

- **(a) an MP4 video** with the scene animation and text captions, or
- **(b) the scene file** (`.toybox.json`), which Toybox opens to regenerate the same scene and animation.

Toybox has **two surfaces** that share one engine and one file format:

1. **Authoring app on localhost**, like femahoy. The agent builds scenes and animations through the local MCP server. A person can also build and edit scenes by hand there (place, move, scale, rotate, flip, delete, duplicate, camera, timeline).
2. **Viewer hosted on teoyujie.org.** It opens scene files. Visitors can manipulate an opened scene (camera, and the per-object edits: move, scale, rotation, flip, delete, duplicate). The site has no MCP and no agent, and no server. Whether visitors can save their changed file is round 5 question 9.

The reference for the interface is femahoy (section 2). Toybox must build two real examples. The first is the Little India riot, a street scene from the Committee of Inquiry facts. The second is an indoor walk at HomeTeamNS Punggol from the entrance up to the ballroom. The Straits Times page "Little India riot, 10 years on" is the quality target (section 11).

## 2. Reference: how femahoy works (read from /Users/yj/src/femahoy, read-only)

- femahoy is "a chat for finite element and CFD analyses" (README.md). `fh serve` runs a local daemon on 127.0.0.1 (port 8790, a random token in the state folder). It serves one page with the chat on the left and a wasm 3D viewer in the centre.
- The agent is Claude Code, started by the daemon with the user's own login (`--input-format stream-json --output-format stream-json`). femahoy has no agent loop and holds no credential (DESIGN.md section 4.3).
- **femahoy does not use MCP.** The daemon starts the agent with `--strict-mcp-config` and no MCP server (`crates/fh/src/daemon/chat.rs`). The agent works through the `fh` command-line program, and `fh guide NAME` prints how-to guides on demand. The daemon watches a state folder that `fh run` writes, and shows the results in the viewer. `fh report` writes one HTML file with the results and the same wasm viewer.
The owner said Toybox "runs through the MCP". The design keeps that. It has one engine program with commands and an MCP server as a thin front for the same commands. The femahoy-style chat page is the viewer. See OPEN 1.

## 3. Pieces

```text
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

- toybox core: one program that edits and validates the scene file. Its commands are the MCP tools (section 8).
- MCP server: a local stdio server that exposes the same commands. The MCP specification defines stdio and Streamable HTTP (<https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>).
- Page and viewer: the engine compiled to WebAssembly, shown beside the chat, with a timeline scrubber and play button. It reloads when the scene file changes. The same wasm viewer, without the chat and the daemon, is the **hosted viewer**. It is a static page. It opens a scene file by `?scene=<url>`, by file open, or by drag and drop. It fetches the models that the file lists.
- Daemon (authoring app only): femahoy's pattern. It binds 127.0.0.1 only, uses a token, rejects other origins, and starts the agent with the owner's login. Nobody hosts it.

## 4. Engine

- We write the renderer, scene, camera and animation sampler in **Goose** (<https://aardappel.github.io/goose/>). Goose compiles to C (`goose -o out.c`), and a C-to-WebAssembly compiler (emcc) compiles the C to WebAssembly. Goose is the engine, for performance.
- The Goose `gfx` package uses SDL3 GPU (Direct3D 12, Vulkan, Metal). SDL3 GPU has no WebGL or WebGPU backend (forum post, 2025-05-17, may be out of date). So the renderer calls WebGL2 through Goose `extern fn`. A thin JavaScript layer does only what the browser requires (context, file fetch, input, capture).
- Goose and emcc are not on PATH on this machine. `ffmpeg` is there, with `libx264` and `h264_videotoolbox`.
- The renderer must be **deterministic by time**: `render(scene, t)` gives the same image for the same `t`. The viewer plays in real time. Export steps `t` frame by frame.

## 5. Animation (a timeline)

Earlier rounds said "no animation". The owner now wants animation, so:

- A scene has one **timeline** in seconds. Objects have keyframes for position, rotation and scale with easing (linear, ease in-out). The camera has keyframes too (position, target, field of view). Lights have keyframes (day to night). Captions and callouts have a start and an end time.
- **People** need pose animation (walking, running, falling). Plan: the MakeHuman default skeleton, pose keyframes of bone angles, skinned in the vertex shader. We author a walk or run cycle as a looping set of bone-angle keyframes (CC0). Motion capture from Mixamo (used by the ST team) is Adobe's service and is not CC0, so we do not use it. Kenney characters may ship animation files. I did not open the packs (OPEN 4).
- **Vehicles and props** move along paths: a list of waypoints with speed or times.
- Steps from earlier rounds become **chapters**: a named time range with a caption, a clock label (`time`, such as "21:21") and a camera shot. A story is still an ordered list, now laid on the timeline.

## 6. Export

### (a) MP4 with text captions and video

- Pipeline: the toybox command opens the scene in a **headless browser** (chrome-devtools-axi is available here) and steps `t` by `1/fps`. It captures each frame and burns in captions and callouts. It draws them in the same canvas, so the text is identical to the viewer. It pipes the frames to **ffmpeg** (H.264, `libx264` or `h264_videotoolbox`). ffmpeg stays a separate program (femahoy's rule for GPL and LGPL tools, DESIGN.md section 2). The command fails with an install hint if ffmpeg is missing.
- Alternative inside the browser: WebCodecs `VideoEncoder` plus a JavaScript MP4 muxer. This needs no ffmpeg but needs a muxer library and a browser with WebCodecs. Not chosen as the default because headless frame capture is easier to make exact and to test.
- Defaults: 1920 by 1080 and 1080 by 1920 (vertical) at 30 frames per second. A 60-second video is 1,800 frames. We have not measured the time per frame in headless Chrome (software or GPU GL). It is the main risk (section 10).
- The video shows the credits that licences require: the OneMap logo and attribution, and "© OpenStreetMap contributors" when the scene uses OpenStreetMap data (section 9).
- The first design had no audio (the owner said "text and video"). A narrated scene now adds the voice to the MP4 (`scene-format.md`, section Narration).

### (b) The scene file

- `.toybox.json` is the only source of truth. It holds the header (title, author, backdrop, model ids and content hashes, tool version). It also holds objects, timeline keyframes, chapters, captions, callouts, lighting, camera, `source` text for claims, and `estimated` flags. A JSON Schema kept in the repo validates it.
- Toybox opens it to regenerate the scene and the animation, and can export the MP4 from it. The hosted viewer opens the same file. If visitors change the scene and the site has no server, they can save the change only as a file download (round 5 question 9). The file references the model files by id and hash, and the viewer fetches them from the Toybox asset set, so the file stays small.
- **Round trip test:** load a file, export frames, compare 3 chosen frames to stored pictures with a fixed tolerance. A file written by an older version still loads (the header has a schema version and a migration step).

## 7. What the new words make unnecessary or lower priority

| Earlier part | Now |
|---|---|
| Visitor sandbox: orbit and pinch gestures, per-object edits, undo, localStorage autosave | **Moves to the hosted viewer (surface 2) and stays lower priority than the agent path.** The viewer needs orbit, pan, zoom, select, move, scale, rotate, flip, delete, duplicate. Touch gestures matter there, because visitors may use phones. Undo and autosave are optional there. Tap-to-pick backdrop pictures and the share sheet wait for a later task. |
| Public visitors, accounts, hosting | **Only the viewer goes on the site**, as static files on teoyujie.org. No accounts, no server, no agent, no MCP on the site. The authoring app and the MCP server run on the owner's computer. |
| Phone spike bars (30 frames per second, 2 MB wasm on a throttled phone) | **Split.** Authoring and export: a 60-second 1080p MP4 exports in a stated time on this computer. The authoring viewer plays at 30 frames per second on a laptop. Hosted viewer: it loads a scene, and plays it at 30 frames per second on a throttled phone. The `.wasm` file stays below 2 MB (the earlier bar). This check runs after spikes 1 and 2, not before. |
| Scroll playback on the phone | **Lower priority.** Playback is the timeline plus the exported video. A scroll-driven web player is an optional later view of the same file. |
| Phone layout, share sheet, PNG share | **Lower priority.** PNG still exports a single frame from the command. |
| Local MCP server writing `story.json` | **Kept, extended** to scene plus timeline, and now the main interface. |
| Evals (riot and indoor walk), tools with validation, `render_preview` | **Higher priority.** The agent must build both cases consistently. |
| Quality bars a to i | **Kept**, but a (interaction) and h (phone) change as above. See section 11. |
| People spike | **Higher priority**, now with animation. |
| Models (Kenney, Poly Haven, MakeHuman, our kit), OneMap, OpenStreetMap | **Kept.** |

## 8. MCP tools (the agent's interface)

The MCP server and the `toybox` command line use the same commands. These are the commands:

- Scene: `list_models(query, kind)`, `new_scene`, `get_scene`, `validate`.
- Objects: `place`, `place_near`, `place_group`, `transform`, `duplicate`, `remove`, `build_room`, `place_sign(text)`.
- Animation: `set_pose`, `animate(object, keyframes)`, `move_along(object, path, speed)`.
- Camera and light: `set_camera(time, shot)` with `frame(ids)`, `set_lighting(time, look)`.
- Text: `add_caption(start, end, text)`, `add_callout(start, end, target, text)`, `add_chapter(time, label, clock)`.
- Maps: `import_osm(bbox)` (off by default), `load_basemap(place)` (OneMap tiles).
- Output: `render_frame(t)` (PNG so the agent can look), `export_mp4(options)`, `export_scene(path)`.
- Help: `guide(name)` for how-to text (femahoy's `fh guide` pattern).

**Consistency.** Every command validates and returns structured errors. These are the errors:

- unknown model id
- object below ground or overlapping
- time going backwards
- caption too long, or on screen too short to read
- focus object outside the camera view at its chapter (computed)
- chapter without caption
- measured value without `source`
- estimate without the `estimated` flag

The eval gates changes. It has a fixed brief, a scorer and a pass rule for the two real cases: the Little India riot and the HomeTeamNS indoor walk. The scorer checks chapter count and order, times, and caption and callout per chapter. It also checks focus objects visible, sources present, MP4 length, and a picture diff of 3 chosen frames against stored images. Pass rule: 5 runs in a row.

## 9. Models, maps, credits

**Models.** CC0 only, plus our own primitives. We check each pack's licence page, and we refuse a pack that is not CC0.

| Source | Used for | Facts checked |
|---|---|---|
| Kenney (<https://kenney.nl/support>) | people, furniture, food, buildings, roads, nature, vehicles | every pack page that we opened prints CC0. Counts are file counts. Furniture Kit 140. Food Kit 200. City Kit Commercial 50. Suburban 40. Roads 90. Retro Urban Kit 120. Nature Kit 330. Car Kit 45 |
| Poly Haven (<https://polyhaven.com/license>) | realistic props | 521 models, all CC0. No people. Median 11,146 triangles, so only light models |
| MakeHuman exports | people with readable faces | exports are CC0 since 2020 (the FAQ says the exported models are CC0, <https://static.makehumancommunity.org/oldsite/faq/can_i_sell_models_created_with_makehuman.html>). Some bundled assets can be CC-BY, so the pipeline checks each asset |
| Our own Toybox kit | walls, floors, doors, windows, stairs, shophouse bays, shop fronts, signs, bus stop, kerb, road tiles | built from primitives in Goose, CC0 |

Out: Polyfork (a public scene builder is redistribution that needs the paid Platform plan), SimReady (attribution), Quaternius (its licence page forbids redistributing the assets). We commit only converted compact files (`assets/`), and the README has a short sources list. We have not checked whether the Kenney packs contain a bus, an ambulance, a police car or posed or animated people.

**Maps: OneMap first, OpenStreetMap for footprints.**

- OneMap: the terms say the Singapore Open Data Licence covers the datasets (<https://www.onemap.gov.sg/legal/apitermsofservice.html>). That licence requires "a conspicuous notice" that names the source and links to the most recent version of the Licence. See <https://data.gov.sg/open-data-licence>. Base map services also require the OneMap logo and attribution (<https://www.onemap.gov.sg/docs/maps/>).
- OneMap Terms of Use say you may not "store, download, archive, print, distribute, publicly display, reproduce" SLA Data. They also say you may not "combine or integrate with or incorporate into any other materials" (<https://www.onemap.gov.sg/legal/termsofuse.html>). I cannot tell which document wins. So the repo stores no OneMap data. Toybox loads OneMap raster tiles live (`https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png`, EPSG:3857) as a flat ground texture. The viewer and the MP4 show the logo and attribution. An MP4 is a copy of the displayed tiles. Whether that is "reproduce" is OPEN 3.
- OneMap's maps documentation does not mention building footprints or 3D buildings. data.gov.sg lists URA Master Plan "indicative" building footprint layers (seen in search only). A build check opens one.
- OpenStreetMap footprints (ODbL): Toybox draws the credit "© OpenStreetMap contributors" into the viewer and into the MP4 of any scene that used OpenStreetMap data (<https://www.openstreetmap.org/copyright>, <https://osmfoundation.org/wiki/Licence/Attribution_Guidelines>). The stored footprint file is a database taken from OpenStreetMap. The rule is "if you alter or build on the data, you may distribute the result only under the same licence". So we publish that data file under the ODbL (my reading, not legal advice). Our code stays outside this rule.
- Other sources checked: Overture buildings carry "License for theme: ODbL © OpenStreetMap contributors" (<https://docs.overturemaps.org/attribution/>). Google Open Buildings is CC BY 4.0 or ODbL (<https://sites.research.google/gr/open-buildings/>). Microsoft footprints are CDLA Permissive 2.0 (<https://github.com/microsoft/GlobalMLBuildingFootprints>, duties not read). The Singapore Open Data Licence needs a source notice. None is clearly better than OpenStreetMap.

**Indoor scenes.** First-class: our walls, floors, ceilings, doors, windows and stairs. Also `build_room`, a cutaway camera that hides the ceiling and the nearest walls, and furniture from Kenney and selected Poly Haven models. For a real building the layout comes from public floor directories, venue plans and photos, and the owner's photos. We estimate anything that no source gives and label it `source: "estimated"`. The viewer and the MP4 show a small "approximate" tag on those chapters. I could not confirm a HomeTeamNS clubhouse at Punggol with a ballroom. HomeTeamNS sites block my automated requests. Search found clubhouses at Bedok Reservoir, Bukit Batok, Khatib and Tampines only (OPEN 2).

## 10. Spikes (order by risk)

1. Export spike (highest risk). Goose to C to emcc to WebAssembly with WebGL2. Render one lit model with an outline pass at `t`. Open it in headless Chrome, capture frames, encode with ffmpeg, and time it. Pass: a deterministic 10-second 1080p clip at 30 frames per second. Repeated runs give identical frames (within a stated tolerance). Report the time for a 60-second clip. If headless Chrome has no usable GL, report that. Also report the options: software GL, a native renderer, or WebCodecs.
2. Animation and people spike. Use 24 MakeHuman people with the default skeleton, 8 bone-angle poses, a walk cycle and a crowd of 50. Skin them in the vertex shader. They run at 30 frames per second in the viewer. Fallback: Kenney figures, with limits stated.
3. Scene-file round trip. Write a file, load it, export frames, compare.
4. Hosted viewer check (after 1 and 2). The static viewer opens a scene file on a throttled phone profile and edits an object by touch. It plays at 30 frames per second with `.wasm` below 2 MB.

Stop and report after spikes 1 and 2 before the rest of the build.

## 11. Style and quality bars

**Style.** One look for everything, set in the Goose shader. It has flat colours from the texture, 2 or 3 light steps (toon), a dark outline and a paper-grain overlay. Watercolour is a later option. The ST team chose "the graphic novel look" with "watercolour textures and bold outlines" (<https://www.straitstimes.com/multimedia/graphics/2024/02/little-india-explainer/index.html?shell>).

**Reference weak points.** The ST riot page shows its 3D as pre-rendered video clips beside 71 paragraphs. Its data file has 21 `video` blocks and 3 scroll sections. The layout comes from a 10-year-old basic map plus map measurements. I did not view the clips and could not measure the video size.

| Bar | Measure (all checked by a tool, not by eye, unless stated) |
|---|---|
| a. Scene file | the MP4 and the viewer come from the same file. The round trip test passes |
| b. People | at least 10 distinct people with readable faces, 8 poses, a walk cycle |
| c. Lighting | day and night looks, one 1024 by 1024 shadow map |
| d. Style | outline of 1 pixel at 1080 pixels high, no flicker between frames |
| e. Camera | a shot in every chapter. Moves of at most 1.5 s between shots. No hidden focus object. No blocked view (a ray test from the camera to each focus object and across the frame). We clear a blocked view by moving the camera, never by hiding an object. At least 3 shot types in a 12-chapter story |
| f. Layout | each named dimension has a `source` and sits within 1 metre of it. Estimates have a label |
| g. Text | captions up to 280 characters. A caption stays on screen at least 0.06 s per character (my proposal). Text is at least 4% of the frame height. Contrast is at least 4.5 to 1 |
| h. Export | a 60-second 1080p MP4 exports in a stated time on this computer (set after spike 1). The viewer plays at 30 frames per second on a laptop |
| i. Accessibility | captions also written to an `.srt` file next to the MP4 |
| j. Motion | sampled every 0.25 s: no object passes into another (people, vehicles, props and buildings). People and vehicles stand on the ground, a floor or stairs. Moving vehicles keep to their lane |

Risk: the riot page names real people and shows a real death. Real events use generic faces from the pool, no names on figures, and a `source` on every claim in a caption.

## 12. Build plan (after round 5 has answers)

1. Spikes 1 and 2 (section 10). Stop and report.
2. Asset pipeline: pack licence check, conversion, catalogue with sizes in metres.
3. Engine: renderer, camera, timeline sampler, toon and outline, shadow.
4. toybox core, scene schema, validation, daemon and chat page with the viewer.
5. MCP server and `guide` text, `render_frame`, evals.
6. Toybox kit and the indoor path (walls, floors, doors, windows, stairs, cutaway camera).
7. People with animation.
8. MP4 export with captions and credits, scene-file export and round trip.
9. OpenStreetMap and OneMap loaders.
10. README with the licences of every model and library, before and after screenshots of the page and a sample MP4 in the PR description. Publishing on the site is a separate task.

The README lists these licences:

- Goose (Apache 2.0)
- Kenney (CC0)
- Poly Haven (CC0)
- MakeHuman exports (CC0)
- OpenStreetMap data (ODbL)
- OneMap (Singapore Open Data Licence)
- ffmpeg (LGPL or GPL by build, separate program)
- the C-to-WebAssembly compiler and any library we link

## 13. UI: femahoy as the base

The authoring page and the hosted viewer follow the Apple Human Interface Guidelines and the concept-ui skill, as femahoy does. The concept-ui skill is not in my skill list or in the firstmate skills folder. So I follow femahoy's written rules (`/Users/yj/src/femahoy/DESIGN.md` section 8). I copy its page patterns, read-only: `crates/fh/src/daemon/page.html`, `crates/viewer/src/ui.rs` and the `ui.css` components. I copy them closely and add no style of my own.

- One UI layer with the only design tokens: light and dark colours, type sizes, spacing, corner radius, hit target. A new view adds no colour, size or control style of its own. A new component goes into the layer.
- Controls the person clicks are at least 44 points high. Each HTML control has a keyboard path and a VoiceOver label. A shortcut shows its keys. Both appearances work. No animation runs with reduced motion. No state shows by colour only.
- Layout: the chat panel is on the left (authoring app only) and the viewer is in the centre. Controls float over the viewer and do not push it. The person can hide panels. The hosted viewer is the viewer without the chat.
- Fonts: the same DM Sans and Source Serif 4 under the SIL Open Font License 1.1, with their licences in the README.
- Plain text in the chat, no Markdown (femahoy's phone finding: raw `##` and `**` showed).
- This does not change the spike order. We build the UI after spikes 1 and 2.
