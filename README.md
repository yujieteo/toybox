# Toybox

Toybox makes narrated explainer videos. You ask Claude Code in this project. You get an MP4 and a Blender file.

It is a Python kit that runs inside Blender. Each video is one short shot script and one narration file.
Blender builds the scene, lights it with Cycles path tracing, renders it and cuts the video with the voice and the captions.

The old Toybox, with the chat page, the viewer and the Goose renderer, is kept at the tag `pre-rebuild`.
Run `git checkout pre-rebuild` to read it. This version starts again from the blueprint at https://github.com/yujieteo/blueprint.

## Make a video

```sh
nix develop
python -m toybox make videos/NAME
```

That runs the voice step and then renders two files: `out/NAME/NAME-landscape.mp4` (1920x1080) and `out/NAME/NAME-portrait.mp4` (1080x1920).
Both have 24 frames a second. The `.blend` files sit beside them.

Parts of the command:

- `python -m toybox voice DIR` makes the voice and `timing.tsv` from `DIR/narration.txt`.
- `python -m toybox render DIR` renders. Options: `--format landscape|portrait|both`, `--quality draft|preview|final`, `--device cpu|metal|cuda|optix`, `--still FRAME`, `--first N`, `--last N`.
- `python -m toybox make DIR` runs both at final quality.

A shot script looks like `evals/shots/tiny/shot.py`. The `make-video` skill says how to write one.

## The kit

| File | What it holds |
| --- | --- |
| `toybox/stage.py` | The functions a shot script calls: sky, floor, boxes, people, camera. |
| `toybox/materials.py` | Surfaces with procedural textures: concrete, tile, brick, metal, wood, glass, fabric. |
| `toybox/human.py`, `toybox/person.py`, `toybox/clothes.py`, `toybox/shirt.py`, `toybox/shoes.py` | A human body on 20 bones, with skin, eyes, hair, clothes and shoes. |
| `toybox/gait.py`, `toybox/idle.py` | Walk, wave, breathe and shift weight, with keyframes. |
| `toybox/props.py` | A wood slat bench with steel legs, and a clay pot with soil and leaves. |
| `toybox/camera.py`, `toybox/light.py` | A camera with depth of field, a physical sky and area lights. |
| `toybox/edit.py` | The video editor: the scene, the voice and the captions in one timeline. |
| `toybox/blend.py`, `toybox/cli.py` | The Blender entry and the command. |
| `toybox/voice_env.py`, `toybox/voice_run.py` | The voice step. |

People start with relaxed arms. Use `idle_pose(stage, person, start, duration)` while a person stands still.
It keys the chest, head, arms and hips for breath and a slow weight shift. Do not use it at the same time as a walk or wave.
Use `add_bench(name, at)` and `add_planter(name, at)` from `toybox.stage` for props with parts, not just boxes.
Each prop has one root, so a shot can move or turn the whole prop.
See `evals/shots/lifelike/shot.py` for a six-second shot with a person and both props.
Run `python -m toybox render evals/shots/lifelike --quality preview --format both` to see it.

A box keeps its origin at the point you give it. Its size is baked into the mesh, so moves and turns use that point.

Use `camera_cut(stage, frame, position, look_at)` for a hard cut.
The camera and its aim hold still up to the cut frame, then jump to the new pose.
Use `camera_move` for a smooth move.

All motion is keyframes. There are no drivers and no handlers.
Each format keeps the same width of view. The tall video shows more above and below.

## The voice

The voice is Kokoro-82M, voice `af_heart`, through kokoro-onnx on the CPU. It needs no account.
The first run makes a Python environment in `~/.cache/toybox/voice` and downloads about 350 MB of models.
Set `TOYBOX_HOME` to use another folder.

## Render time

Cycles runs on the CPU unless you choose a device. The `draft` quality is a quarter size with 8 samples. The `final` quality is full size with 256 samples, denoising and motion blur.

## Devices

Cycles on the CPU is the path that has run. It is the one on the Linux desktop.
The Apple Silicon Mac we checked does not have Blender installed. Its GPU is an Apple M5 with 8 cores that reports Metal 4.
Cycles on Metal has never run on it, so `--device metal` is untested. Nothing was installed on it.

## Assets

`assets/people/` holds the person: a body mesh of 13,736 points with up to 4 bone weights per point, and the skeleton.
It comes from the MakeHuman base mesh, default skeleton and weights, which are CC0 1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>).
CC0 does not need credit. We credit the MakeHuman community (<https://static.makehumancommunity.org>) to thank them.
The files are `body.bin` (little-endian: two integers, 15 floats a point, then 16-bit triangle indices) and `skel.tsv` (name, parent, head position).
The source has regions for skin, clothes, hair and eyes.
The kit keeps the skin and eyes. It adds dark pupils, a loose shirt, trouser and hair shells, and shaped shoes.
The shirt is a new mesh with the body's bone weights. The kit cuts the trouser cuffs and hairline, then adds edge depth.
The shirt hangs clear of the chest and waist. Shoes have a smooth toe and a sole, not painted toes.
The skin has soft scatter and fine pores. The cloth has a fine weave, not deep bumps.
These are made shapes and textures, not scans. There are no face photos or cloth physics.

## The gate

`./gate` runs every check: the rules in `rules.conf`, the reading grade of the Markdown, shellcheck, ruff, basedpyright in `all` mode and the evals in `evals/`.
The evals render short draft clips in both formats and read the saved Blender files back.
`typings/` holds type stubs for Blender and the packages. The rules scanner reads them like any other Python.
Ruff has a few per-file ignores in `pyproject.toml`: process launches in `toybox/cli.py` and `toybox/voice_env.py`, and shot and probe scripts that Blender loads by path.

## What was kept from the blueprint

Kept: the rules and the gate, the evals, `bin/replay`, `bin/bench`, `bin/ab`, `bin/modeleval` and the skills `vision`, `question-requirements`, `prove-change` and `ste100`.
Dropped: the Go, TypeScript and Rust tools, the hot-file runs, `bin/new`, the `start` skill and every design skill. Toybox has no screen.

## Expiry

`EXPIRY` holds a date three months after creation. A late date prints a warning. It never stops the gate.
