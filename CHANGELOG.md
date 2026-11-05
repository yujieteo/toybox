# Changelog

All notable changes to Toybox are in this file. The form is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is in `core/version.mjs`. The scene file format has its own number, the `toybox` field (`web/format.js`).

## [Unreleased]

### Changed

- `bun run check` compiles `engine/*.c` for WebAssembly with all warnings and `-Werror`, and runs `clang --analyze`. Goose-made C has the five code-generator warnings and the dead-store check off. It needs emsdk (`EMSDK`).
- All project JavaScript is strict TypeScript (`strict`, `noUncheckedIndexedAccess`) and runs with Bun. The daemon transpiles `web/*.ts` for the browser. `bun scripts/build-web.ts` writes `dist/web/` for a static host.
- `bun run check` runs the type check, the escape-hatch scan, the web page budget, the dead-code check, the tests and a process replay against `main`.
- The MP4 encoder level and bitrate follow the export size and the frame rate. The daemon refuses a size that the browser cannot encode before it starts a browser job.
- The MP4 button saves a pending scene edit before it starts the export.
- The export waits for the OneMap tiles before it captures the first frame.

### Added

- A narrated "How to board an MRT train" demo scene (#11). It has these parts:
  - `evals/mrt.mjs`, with the generated scene, captions and voice files in `web/scenes/mrt/`.
  - Facts from Wikipedia and LTA.
  - An MRT station kit: train car, platform screen doors, track, platform edge, station wall and fare gate.
  - An eval case.
- A static page (`web/demo.html`) that plays the demo scene (#11). It lists the steps of boarding from the scene chapters and names the sources and credits. It opens at `?t=<seconds>` or plays at `?play=1`. It has a test and a README section.
- Engine: the outline keeps a constant pixel width at each resolution. The shadow of an elevated object sits at the object base. The cutaway hides only walls between the camera and the target (`engine/scene.goose`, `engine/gl_shim.h`).
- A unit test file for the render timing fixes, and a unit test file for the export helpers.

### Fixed

- `bun run check` passes in a checkout whose path has a space: the tests turn file URLs into paths with `fileURLToPath`, not `URL.pathname`, which kept `%20`. The process replay compares against `origin/main` when the clone has no local `main`.
- The scene duration can become shorter after a change that removes content, such as `make_voice` after stand-in times or `remove`. A longer duration from a scene file stays.
- A motion word at the end of a scene is no longer cut off: the duration covers the full motion, including the hop bounce.
- The voice speaks a narration sentence with raised or lowered text as plain text, and a cue time uses the spoken words.
- Validate refuses a negative chapter, caption or callout time, and the `.srt` output cannot show a negative time.
- The MP4 export sends a scene snapshot to the daemon. An edit during the export cannot mix two scene versions in the MP4, the `.srt` and the copied scene file.
- A full-frame readback for a debug hash no longer runs in each normal export. An export is about 20% faster.
- The export cannot run past the last rendered frame.
- The daemon answers with an error and stays alive when Chrome is absent, a job callback is stray, or ffmpeg fails. A failed mux keeps the frames for a retry.
- `render_preview` gives the picture to the agent as an MCP image, not only a file path.
- A duration that rounds below the unrounded content end no longer leaves an unfixable `duration_too_short` error.

## [0.1.0] - 2026-10-28

### Added in 0.1.0

- A 3D explainer scene builder (#1). It has the scene file format (format 1), a validator, 27 tools, an MCP server, a catalogue kit, OpenStreetMap helpers, evals and tests.
- The Goose Wasm engine, the hosted viewer page with orbit, pick and edit, and skinned MakeHuman people (#1).
- The localhost daemon with a chat page, MP4 export with captions and headless render (#1).
- Person outfits (police, police-shield, soc-riot) with parts that follow body bones (#2).
- A blocked-view camera check that finds a building, a structure or a vehicle between the camera and a chapter subject (#2).
- One motion check for every model pair: collisions, people and vehicles off the ground, and vehicles in the wrong lane (#3).
- Narrated scenes timed by a local Kokoro voice (#5). They have cues on words, sourced facts, motion words, a narrator character and raised and lowered label text. The viewer and the MP4 export play the voice audio.
- A loader that upgrades scene files of an older format, and that refuses a newer format with a clear message.
- `scripts/release.sh`, which tags a version and makes its GitHub release.

### Changed in 0.1.0

- The motion words, the life of a character, the raised and lowered text and the narration timing are in Goose (`engine/vid.goose`). The browser and Node run them from `web/vid.wasm` through `web/vid.js`. We deleted `web/motion.js` and `web/marks.js` (#6).
- The repository holds the Goose-generated `engine/scene.c` and `engine/scene.h`. `engine/build.sh` makes them again only if you set `GOOSE` (#4).
- The riot eval has the Committee of Inquiry in its own room, traffic that keeps left, and crowd and police paths that keep apart (#3).

### Fixed in 0.1.0

- `validate` fails a hidden object, a building or vehicle that vanishes, an outdoor cutaway and a callout outside its chapter (#3).
- Held shields and batons follow the forearm and wrist bones (#3).
- Sign labels show only in the chapters that focus on them (#3).

[Unreleased]: https://github.com/yujieteo/toybox/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yujieteo/toybox/releases/tag/v0.1.0
