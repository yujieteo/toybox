# Spikes 1 and 2: results

Machine: Apple M5, headless Google Chrome (stable) with ANGLE Metal (hardware WebGL2). Phone: not measured. Proof files are in `/Users/yj/src/firstmate/data/toybox-v2/spikes-1-2/`.

## Spike 1: MP4 export from the Goose wasm renderer

Result: pass. The path is Goose, C, emcc, WebGL2, then `VideoEncoder` (WebCodecs H.264) in the page, then small chunks to a node server, then ffmpeg burns the captions.

| Item | Number |
|---|---|
| Wasm size | 51 KB (25 KB gzip) |
| Render, 50 skinned people, 1080p | 7.9 ms per frame (GPU finished) |
| Render plus encode in page, 1080p | 6.3 ms per frame |
| 10 s clip, 300 frames, with captions | 7.0 to 8.0 s in total |
| 60 s clip, 1800 frames, with captions | 37.5 s in total (0.62 times real time) |
| Caption pass (ffmpeg re-encode) | 26 s of the 37.5 s for 60 s |
| Repeatability | Two 10 s runs: same 10 frame hashes and the same H.264 byte count (15,060,431) |
| Captions | `.srt` burned in, 60 s file has 1800 frames and 60.000 s |
| File size | 90 MB for 60 s at 12 Mbit/s |

Faults found and fixed in this spike:
1. Raw RGBA through `fetch` (8 MB a frame) took 481 ms a frame, about 15 s for 30 frames. Cause: `fetch` throughput in Chrome. Fix: encode in the page with WebCodecs. The same frame hashes came out of both paths.
2. Parallel chunk posts changed the order and lost 4 of 300 frames. Fix: post the chunks in sequence.
3. Goose reserves 2 GB of data stack with `mmap`. WebAssembly cannot do that. The program hung or trapped with "memory access out of bounds". Fix: compile with `-DGS_STACK_RESERVE=(16ull<<20)`.

## Spike 2: animated people

Result: pass on the desktop, unmeasured on a phone.

| Item | Number |
|---|---|
| Model | MakeHuman default base mesh, 13,380 vertices, 26,756 triangles, default skeleton (163 bones, collapsed to 20), default weights. The files say CC0. |
| People | 24 different (6 skin tones, clothes colours, height and width scale), 8 poses: stand, walk, run, wave, point, hands up, sit, bend |
| Skinning | GPU, 4 weights a vertex, 20 bone matrices as uniforms. Pose maths and blending are in Goose. |
| Crowd, 25 people, 1080p | 6.8 ms per frame |
| Crowd, 50 people, 1080p | 7.9 ms per frame (about 126 frames per second) |
| Crowd, 100 people, 1080p | 15.9 ms per frame |
| Crowd, 50 people, 360p | 3.6 ms per frame |
| Triangles per frame, 50 people | 2.7 million (two passes: outline and fill) |
| Mesh download | 963 KB raw, 467 KB gzip, one shape |

Known gaps (not hidden):
- The 24 people differ by colour and scale only. Real body variety needs the MakeHuman targets (macro modifiers). Not done.
- No hair, no eyes, no face texture. Faces are not readable in the crowd view. The owner asked for readable faces. This needs a decision.
- Clothes are colour regions by bone, not clothes geometry. The MakeHuman clothes (MHCLO) are CC0 but not tried.
- Feet slide on the ground. Poses are hand-written angles with no foot lock.
- Sit has no chair.
- The phone frame rate is not measured. 2.7 million triangles at 30 frames per second is 81 million triangles per second, which is likely too heavy for a middle phone.

## Reproduce

1. Fetch MakeHuman `base.obj`, `default.mhskel`, `default_weights.mhw` from github.com/makehumancommunity/makehuman (`makehuman/data`).
2. `python3 -I spikes/people/prep.py MHDIR OUTDIR` writes `mesh.bin` and `skel.json`.
3. `GOOSE=/path/to/goose spikes/export/build.sh BUILDDIR` (emsdk active). Copy `mesh.bin` and `skel.json` into BUILDDIR.
4. `node spikes/export/serve.mjs OUTDIR BUILDDIR`, then open `/?mode=codec&scene=1&seconds=10&fps=30&w=1920&h=1080&people=50&name=clip` in Chrome. Modes: `bench`, `export` (raw frames), `codec`. Scenes: 0 box people, 1 crowd, 2 pose sheet.
