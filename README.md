# Toybox

Toybox lets an agent build an animated 3D explainer scene. You talk to the agent in a chat page. The scene plays in a viewer next to the chat.

You can export two things:

- An MP4 video with text captions and credit lines.
- A `.toybox.json` scene file. Toybox opens this file again. The static viewer in `web/viewer.html` opens it too, with no server, no agent and no account.

A visitor to the static viewer can orbit the camera. The visitor can also move, scale, turn, flip, duplicate and delete objects, and save the changed file.

## Parts

| Folder | Content |
| --- | --- |
| `engine/` | The renderer, written in [Goose](https://aardappel.github.io/goose/). It compiles to C and then to WebAssembly with emcc. |
| `core/` | The scene schema, the checks, the model kit, the MCP server and the guides for the agent. |
| `app/serve.mjs` | The local daemon. It serves the page, runs the chat agent and renders pictures and videos in a headless browser. |
| `web/` | The chat page (`app.html`), the static viewer (`viewer.html`), the export code and the style. |
| `assets/` | The model catalogue and the person mesh. |
| `tools/people/` | The script that turns the MakeHuman CC0 body into the person mesh. |
| `docs/` | The design (`design.md`), the file format (`scene-format.md`) and the spike results (`spikes-1-2.md`). |
| `test/` | Tests. Run `node --test test/` |

## Build and run

1. Install the Goose compiler and emsdk. Then run `source emsdk_env.sh`.
2. Build the engine: `GOOSE=/path/to/goose engine/build.sh engine-build`
3. Start the daemon: `node app/serve.mjs --scene my.toybox.json --engine engine-build`
4. Open the address that the daemon prints. It has a secret token and works on 127.0.0.1 only.

The chat uses the `claude` command with only the Toybox MCP server. You need ffmpeg for the MP4 export. You need Google Chrome for pictures and videos.

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

- People differ only by colour, size and hair. The body shape is the same.
- Clothes are colour regions of the body. Feet slide a little when a person walks. A sitting person has no chair of its own.
- The shadow is a soft disc, not a shadow map.
- Kenney and Poly Haven model loaders do not exist yet. All models in the kit are built from boxes, cylinders, spheres and wedges, so they are our own CC0 work.
- OneMap tiles load live from the OneMap server. Toybox stores none of them. A browser that blocks the tile server shows no map, and the credit text does not show.

## Licences

| Item | Licence |
| --- | --- |
| Toybox code | See the licence file of this repository |
| Goose (compiler and runtime) | Apache 2.0 |
| Emscripten (emcc) | MIT and University of Illinois/NCSA |
| MakeHuman base mesh, skeleton and weights | CC0 |
| Toybox model kit (`assets/catalogue.json`) | CC0, made for this project |
| Kenney and Poly Haven models | CC0. Not in use yet. |
| OpenStreetMap footprints | ODbL. The scene shows "© OpenStreetMap contributors". A scene file that holds footprints holds ODbL data. Keep the credit with the data. |
| OneMap tiles | Singapore Open Data Licence, with the OneMap logo and "OneMap © Singapore Land Authority". Not stored. |
| DM Sans and Source Serif 4 fonts | SIL Open Font Licence 1.1 (`web/fonts/OFL-*.txt`) |
| ffmpeg | A separate program. Toybox runs it and does not include it. |

Excluded models: Polyfork, SimReady and Quaternius. Their licences do not fit this project.
