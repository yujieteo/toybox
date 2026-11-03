# Before and after evidence: video render bugs

This folder holds the before and after pictures for the branch `agent/video-render-bugs-5b642f591751`.

- Before: commit `76239da` on `main`, the last commit before this branch.
- After: the head commit of this branch.

The export and engine runs used the engine build from the branch sources. The export runs used headless Google Chrome on the maker laptop.

| File | Shows | How we made it |
| --- | --- | --- |
| `duration-before.png` | The video runs 1.5 s past the narration. The frame at 7.2 s has no caption. | A scene with 3 new sentences. Pre-fix code kept the stand-in duration of 8.008 s after `make_voice` gave 6.49 s of real content: 240 frames at 8.000 s. |
| `duration-after.png` | The video ends with the narration. The last frame at 6.5 s shows the last caption. | The same commands on the fixed code: 195 frames at 6.500 s. |
| `engine-before.png` | A person on a staircase has no shadow, and the walls behind the subject are cut away. | `hometeamns` scene at t=35.4 s, 960x540, engine from commit `76239da`. |
| `engine-after.png` | The person has a shadow on the staircase. The walls behind the subject are visible. | The same frame, engine from this branch. The shadow now sits at the object base. The cutaway hides only walls between the camera and the target. |
| `outline-before.png` | The outline of a person is about 3 pixels wide at 1080p, and it is thicker across than down. | Crop of a person, engine from commit `76239da`. |
| `outline-after.png` | The outline is 1.2 pixels wide at 1080p, in both directions and at each resolution. | The same crop, engine from this branch. |
| `map-before.png` | A map scene has no map at frame 0. The ground is the plain backdrop. | A local OneMap tile server with a 1.2 s delay, pre-fix code. The first frame with tiles was frame 239. |
| `map-after.png` | The map is in frame 0. The OneMap credit is in frame 0. | The same tile server and scene, code from this branch. The export waits for the tiles before it captures a frame. |

The map test used a local tile server. The orange tile image and the red logo box are the test server output, not OneMap content.

## Reproduce

1. Build the engine with the script: `GOOSE=/path/to/goose engine/build.sh engine-build`. You need emsdk for the C build.
2. Run the tests: `bun test test/`.
3. Start the daemon: `bun app/serve.ts --scene evals/out/narrated.toybox.json --engine engine-build --out out`.
4. Export the scene: `curl -X POST 'http://127.0.0.1:8820/api/export?token=TOKEN' -H 'content-type: application/json' -d '{"name":"clip"}'`.
5. For the engine pictures, render a frame with `POST /api/render` at t=35.4 for the `evals/out/hometeamns.toybox.json` scene.
