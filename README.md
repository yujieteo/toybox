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
| `toybox/person.py`, `toybox/gait.py` | A jointed person and a walk cycle with planted feet. |
| `toybox/camera.py`, `toybox/light.py` | A camera with depth of field, a physical sky and area lights. |
| `toybox/edit.py` | The video editor: the scene, the voice and the captions in one timeline. |
| `toybox/blend.py`, `toybox/cli.py` | The Blender entry and the command. |
| `toybox/voice_env.py`, `toybox/voice_run.py` | The voice step. |

All motion is keyframes. There are no drivers and no handlers.
Each format keeps the same width of view. The tall video shows more above and below.

## The voice

The voice is Kokoro-82M, voice `af_heart`, through kokoro-onnx on the CPU. It needs no account.
The first run makes a Python environment in `~/.cache/toybox/voice` and downloads about 350 MB of models.
Set `TOYBOX_HOME` to use another folder.

## Render time

Cycles runs on the CPU unless you choose a device. The `draft` quality is a quarter size with 8 samples. The `final` quality is full size with 256 samples, denoising and motion blur.

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
