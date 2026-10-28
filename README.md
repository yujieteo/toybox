# Toybox

Toybox lets an agent build an animated 3D explainer scene. You talk to the agent in a chat page. The scene plays in a viewer next to the chat.

A scene can have a narration. A voice on your computer speaks each sentence, and the scene follows the words of the voice (guide `core/guide/narration.txt`).

You can export two things:

- An MP4 video with text captions, credit lines and the voice of the narration.
- A `.toybox.json` scene file. Toybox opens this file again. The static viewer in `web/viewer.html` opens it too, with no server, no agent and no account.

A visitor to the static viewer can orbit the camera. The visitor can also move, scale, turn, flip, duplicate and delete objects, and save the changed file.

## Parts

| Folder | Content |
| --- | --- |
| `engine/` | The renderer, written in [Goose](https://aardappel.github.io/goose/). It compiles to C and then to WebAssembly with emcc. |
| `core/` | The scene schema, the checks, the model kit, the MCP server and the guides for the agent. |
| `app/serve.mjs` | The local daemon. It serves the page, runs the chat agent and renders pictures and videos in a headless browser. |
| `web/` | The chat page (`app.html`), the static viewer (`viewer.html`), the export code and the style. |
| `assets/` | The model catalogue, the person mesh, the imported CC0 models (`assets/models/`) and their credits (`assets/ATTRIBUTION.md`). |
| `tools/people/` | The script that turns the MakeHuman CC0 body into the person mesh. |
| `tools/assets/` | The list of imported CC0 models (`sources.json`) and the import script. Run `node tools/assets/import.mjs` |
| `docs/` | The design (`design.md`), the file format (`scene-format.md`) and the spike results (`spikes-1-2.md`). |
| `evals/` | Scenes that the tools build, with their quality bars. Run `node evals/run.mjs`. `evals/narrated.mjs` is a short narrated example with its voice files in `evals/out/voice/`. |
| `test/` | Tests. Run `node --test test/` |

## Build and run

1. Install emsdk (and the Goose compiler if you change `engine/scene.goose`). Then run `source emsdk_env.sh`.
2. Build the engine: `engine/build.sh engine-build`. The Goose-generated `engine/scene.c` and `engine/scene.h` are in the repo. Set `GOOSE=/path/to/goose` to regenerate them from `engine/scene.goose`.
3. Start the daemon: `node app/serve.mjs --scene my.toybox.json --engine engine-build`
4. Open the address that the daemon prints. It has a secret token and works on 127.0.0.1 only.

The chat uses the `claude` command with only the Toybox MCP server. You need ffmpeg for the MP4 export. You need Google Chrome for pictures and videos.

The voice runs on your computer, with no cloud and no account. It is Kokoro-82M (voice `af_heart`) through kokoro-js 1.2.1 on the CPU. The first `make_voice` installs it into `~/.cache/toybox/voice` with npm and downloads the model from Hugging Face. This needs 736 MB of disk: 416 MB of packages (onnxruntime-node is 211 MB) and the 326 MB model. On the maker laptop the install and the first sentence took about 56 s. A scene without narration needs none of it.

For the static viewer, host the `web/`, `assets/` and engine files together. Open `viewer.html?scene=URL` or choose a file in the page.

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
- The catalogue has few Kenney and Poly Haven models. The other models are built from boxes, cylinders, spheres and wedges.
- An imported model shows flat colours. The engine has no textures, so the import script reduces each model to a small number of colours (`maxColors` in `tools/assets/sources.json`).
- The voice gives no word times. A cue to a word uses the place of the word in the characters of the sentence, so a cue can be some tenths of a second early or late.
- OneMap tiles load live from the OneMap server. Toybox stores none of them. A browser that blocks the tile server shows no map, and the credit text does not show.

## Licences

| Item | Licence |
| --- | --- |
| Toybox code | The owner has not chosen a licence yet |
| Goose (compiler and runtime) | Apache 2.0 |
| Emscripten (emcc) | MIT and University of Illinois/NCSA |
| MakeHuman base mesh, skeleton and weights | CC0 |
| Toybox model kit (the models in `assets/catalogue.json` without a `mesh` file) | CC0, made for this project |
| Kenney and Poly Haven models (`assets/models/`) | CC0 1.0. Each model has its source page, author and licence in the catalogue and in `assets/ATTRIBUTION.md`. Both eval scenes use them. |
| OpenStreetMap footprints | ODbL. The scene shows "© OpenStreetMap contributors". A scene file that holds footprints holds ODbL data. Keep the credit with the data. |
| OneMap tiles | Singapore Open Data Licence, with the OneMap logo and "OneMap © Singapore Land Authority". Not stored. |
| DM Sans and Source Serif 4 fonts | SIL Open Font Licence 1.1 (`web/fonts/OFL-*.txt`) |
| ffmpeg | A separate program. Toybox runs it and does not include it. |
| Kokoro-82M model and voices | Apache 2.0. Downloaded at the first use. Not in the repo. |
| kokoro-js, phonemizer, Transformers.js | Apache 2.0. Installed at the first use. Not in the repo. phonemizer holds eSpeak NG, which has the GPL 3.0 licence. |
| ONNX Runtime | MIT. Installed at the first use. Not in the repo. |
| Voice files in `evals/out/voice/` | Made with Kokoro-82M (Apache 2.0) |

Excluded models: Polyfork, SimReady and Quaternius. Their licences do not fit this project.
