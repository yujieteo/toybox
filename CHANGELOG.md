# Changelog

All notable changes to Toybox are in this file. The form is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is in `core/version.mjs`. The scene file format has its own number, the `toybox` field (`web/format.js`).

## [Unreleased]

## [0.1.0] - 2026-10-28

### Added

- A 3D explainer scene builder: the scene file format (format 1), a validator, 27 tools, an MCP server, a catalogue kit, OpenStreetMap helpers, evals and tests (#1).
- The Goose Wasm engine, the hosted viewer page with orbit, pick and edit, and skinned MakeHuman people (#1).
- The localhost daemon with a chat page, MP4 export with captions and headless render (#1).
- Person outfits (police, police-shield, soc-riot) with parts that follow body bones (#2).
- A blocked-view camera check that finds a building, a structure or a vehicle between the camera and a chapter subject (#2).
- One motion check for every model pair: collisions, people and vehicles off the ground, and vehicles in the wrong lane (#3).
- Narrated scenes timed by a local Kokoro voice, with cues on words, sourced facts, motion words, a narrator character, raised and lowered label text, and voice audio in the viewer and the MP4 export (#5).
- A loader that upgrades scene files of an older format, and that refuses a newer format with a clear message.
- `scripts/release.sh`, which tags a version and makes its GitHub release.

### Changed

- The motion words, the life of a character, the raised and lowered text and the narration timing are in Goose (`engine/vid.goose`). The browser and Node run them from `web/vid.wasm` through `web/vid.js`. `web/motion.js` and `web/marks.js` are deleted (#6).
- The repository holds the Goose-generated `engine/scene.c` and `engine/scene.h`. `engine/build.sh` makes them again only when `GOOSE` is set (#4).
- The riot eval has the Committee of Inquiry in its own room, traffic that keeps left, and crowd and police paths that keep apart (#3).

### Fixed

- `validate` fails a hidden object, a building or vehicle that vanishes, an outdoor cutaway and a callout outside its chapter (#3).
- Held shields and batons follow the forearm and wrist bones (#3).
- Sign labels show only in the chapters that focus on them (#3).

[Unreleased]: https://github.com/yujieteo/toybox/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yujieteo/toybox/releases/tag/v0.1.0
