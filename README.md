# Toybox

Toybox lets an agent build an animated 3D explainer scene for you in a chat page, with a viewer next to the chat.

A scene can have a narration. A voice on your computer speaks each sentence, and the scene follows the words of the voice (guide `core/guide/narration.txt`).

You can export two things:

- An MP4 video with text captions, credit lines and the voice of the narration.
- A `.toybox.json` scene file. Toybox opens this file again. The static viewer in `web/viewer.html` opens it too, with no server, no agent and no account.

A visitor to the static viewer can orbit the camera. The visitor can also move, scale, turn, flip, duplicate and delete objects, and save the changed file.

## Parts

![Toybox architecture. The chat page and the daemon talk to each other. The daemon starts Claude Code. Claude Code calls the MCP server, and the MCP server writes the scene file. The daemon reads the scene file. Headless Chrome renders the scene file into frames, and ffmpeg makes the MP4 video from the frames and the voice. The static viewer opens the scene file.](docs/figures/architecture.svg)

| Folder | Content |
| --- | --- |
| `engine/` | The renderer and the vid utilities (motion words, marks, narration times), written in [Goose](https://aardappel.github.io/goose/). It compiles to C and then to WebAssembly with emcc. |
| `core/` | The scene schema, the checks, the model kit, the MCP server and the guides for the agent. |
| `app/serve.ts` | The local daemon. It serves the page, runs the chat agent and renders pictures and videos in a headless browser. |
| `web/` | The chat page (`app.html`), the static viewer (`viewer.html`), the MRT demo page (`demo.html`), the export code and the style. |
| `assets/` | The model catalogue, the person mesh, the imported CC0 models (`assets/models/`) and their credits (`assets/ATTRIBUTION.md`). |
| `tools/people/` | The script that turns the MakeHuman CC0 body into the person mesh. |
| `tools/assets/` | The list of imported CC0 models (`sources.json`) and the import script. Run `bun tools/assets/import.ts`. |
| `docs/` | The design (`design.md`), the file format (`scene-format.md`), the spike results (`spikes-1-2.md`) and the README figures (`figures/`). |
| `evals/` | Scenes that the tools build, with their quality bars. Run `bun evals/run.ts`. `evals/narrated.ts` is a short narrated example with its voice files in `evals/out/voice/`. |
| `test/` | Tests. Run `bun test test/` |
| `scripts/` | The local check (`bun run check`), the process replay (`scripts/replay.ts`), the web page budget and `build-web.ts`. |

## Build and run

0. Install [Bun](https://bun.sh) and run `bun install`.
1. Install emsdk (and the Goose compiler if you change `engine/scene.goose` or `engine/vid.goose`). Then run `source emsdk_env.sh`.
2. Build the engine: `engine/build.sh engine-build`. The Goose-generated `engine/scene.c`, `engine/scene.h`, `engine/vid.c` and `engine/vid.h` are in the repo. Set `GOOSE=/path/to/goose` to regenerate them from the `.goose` files. The script also builds `web/vid.wasm` (the motion words, the raised and lowered text and the narration times). This file is in the repo, so the tests and the tools in `core/` run without emsdk.
3. Start the daemon: `bun app/serve.ts --scene my.toybox.json --engine engine-build`
4. Open the address that the daemon prints. It has a secret token and works on 127.0.0.1 only.

The chat uses the `claude` command with only the Toybox MCP server. You need ffmpeg for the MP4 export. You need Google Chrome for pictures and videos.

The voice runs on your computer, with no cloud and no account. It is Kokoro-82M (voice `af_heart`) through kokoro-js 1.2.1 on the CPU. The first `make_voice` installs it into `~/.cache/toybox/voice` with npm and downloads the model from Hugging Face. This needs 736 MB of disk: 416 MB of packages (onnxruntime-node is 211 MB) and the 326 MB model. On the maker laptop the install and the first sentence took about 56 s. A scene without narration needs none of it.

For the static viewer, run `bun scripts/build-web.ts`. It writes `dist/web/`: the `web/` files, with each `web/*.ts` as a `.js` file. Host `dist/web/`, `assets/` and the engine files together. Open `viewer.html?scene=URL` or choose a file in the page.

## Demos

The MRT demo page (`web/demo.html`) is a static page. It plays one narrated scene, lists the steps of boarding beside it, and names the sources and credits below. Build the scene first:

```sh
bun evals/mrt.ts
```

The script writes the scene file, its `.srt` captions and the voice files under `web/scenes/mrt/`. Then host `web/`, `assets/` and the engine files together. The daemon does this, for example:

```sh
bun app/serve.ts --scene web/scenes/mrt/mrt.toybox.json --engine engine-build --port 8831
```

Open `http://127.0.0.1:8831/demo.html`. A static page needs no token. Add `?t=12.5` to open the page paused at 12.5 seconds, for screenshots and checks. Add `?play=1` to start the scene at once.

## Numbers that we measured

Measured in headless Chrome on the maker laptop (Apple GPU):

| Case | Result |
| --- | --- |
| 10 s clip at 1920 by 1080, 30 fps, with encode and captions | 3 s |
| Crowd of 50 people at 1080p | 6.8 ms for each frame, including the encode |
| Same crowd at 720 by 1280 | 5.1 ms for each frame |
| Scene file, open again, same frame | The same bytes |

We could not measure a real phone. A headless browser does not limit the GPU. The check on a phone stays open.

## Known gaps

- People differ only by colour, size, hair and outfit gear (helmet, shield, baton). The body shape is the same.
- Clothes are colour regions of the body. Feet slide a little when a person walks. A sitting person has no chair of its own.
- The shadow is a soft disc, not a shadow map.
- The catalogue has few Kenney and Poly Haven models. Boxes, cylinders, spheres and wedges make the other models.
- An imported model shows flat colours. The engine has no textures. The import script reduces each model to a small number of colours (`maxColors` in `tools/assets/sources.json`).
- The voice gives no word times. A cue to a word uses the place of the word in the characters of the sentence. A cue can be some tenths of a second early or late.
- OneMap tiles load live from the OneMap server. Toybox stores none of them. A browser that blocks the tile server shows no map, and the credit text does not show.

## Licences

| Item | Licence |
| --- | --- |
| Toybox code | The owner has not chosen a licence yet |
| Goose (compiler and runtime) | Apache 2.0 |
| Emscripten (emcc) | MIT and University of Illinois/NCSA |
| MakeHuman base mesh, skeleton and weights | CC0 |
| Toybox model kit (the models in `assets/catalogue.json` without a `mesh` file) | CC0, made for this project |
| Kenney and Poly Haven models (`assets/models/`) | CC0 1.0. Each model has its source page, author and licence in the catalogue and in `assets/ATTRIBUTION.md`. The riot and Home Team NS eval scenes use them. |
| OpenStreetMap footprints | ODbL. The scene shows "© OpenStreetMap contributors". A scene file that holds footprints holds ODbL data. Keep the credit with the data. |
| OneMap tiles | Singapore Open Data Licence, with the OneMap logo and "OneMap © Singapore Land Authority". Not stored. |
| DM Sans and Source Serif 4 fonts | SIL Open Font Licence 1.1 (`web/fonts/OFL-*.txt`) |
| ffmpeg | A separate program. Toybox runs it and does not include it. |
| Kokoro-82M model and voices | Apache 2.0. Downloaded at the first use. Not in the repo. |
| kokoro-js, phonemizer, Transformers.js | Apache 2.0. Installed at the first use. Not in the repo. phonemizer holds eSpeak NG, which has the GPL 3.0 licence. |
| ONNX Runtime | MIT. Installed at the first use. Not in the repo. |
| Voice files in `evals/out/voice/` | Made with Kokoro-82M (Apache 2.0) |

Excluded models: Polyfork, SimReady and Quaternius. Their licences do not fit this project.

## Checks

`bun run check` is the local check. It runs `tsc --noEmit`, a scan, the gzip budget of each web page, the C check, the Power of 10 checker (`power10-check`, pinned to one commit and version of github.com/yujieteo/power10-check in `scripts/check.ts`; `power10.toml` only skips the Goose-made C, and there is no list of tolerated breaks: rules 1, 2, 4, 5, 6, 8 and 9), typescript-eslint at its strict and stylistic type-aware sets (rule 10, `eslint.config.mjs`), shellcheck, knip (dead code) and the tests. The C check compiles `engine/*.c` for WebAssembly with all warnings and `-Werror`, and runs `clang --analyze`. It needs emsdk (`source emsdk_env.sh`, which sets `EMSDK`) for the engine headers. The Goose-made C (a `.c` with a `.goose` beside it) has the five code-generator warnings and the dead-store check off. Its four analyser findings per file are listed in `scripts/c-analyzer-known.txt`. That list only shrinks. The scan fails on `any`, `as` casts, `!` and `@ts-` directives without an `allow-unsafe: reason` on the line. The check then replays the inputs of the tests (`TOYBOX_REPLAY_CAPTURE`) through `runTool` on `main` (or `origin/main` in a clone with no local `main`; `TOYBOX_REPLAY_BASE` names another) and on your working tree, and fails on any difference. After a change that must change the output, read the diff and run `bun scripts/replay.ts --accept`.
