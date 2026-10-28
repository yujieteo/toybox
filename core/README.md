# Toybox core

This folder holds the Node side of Toybox. It has no npm dependencies. It needs Node 24. The voice is the only exception: `voice.mjs` installs its packages into `~/.cache/toybox/voice` at the first `make_voice`, not into the repo.

## Files

- `scene.mjs` creates, loads, saves and validates scene files. It also has `srt`, `objectBounds` and `contrast_ok`.
- `commands.mjs` holds one function for each tool and the `toolSpecs` list with JSON Schemas.
- `kit.mjs` builds `assets/catalogue.json` from box, cylinder, sphere and wedge parts.
- `geom.mjs` has the shared geometry maths.
- `mcp.mjs` is a stdio MCP server. `cli.mjs` runs the same tools from a shell. `session.mjs` loads the scene, runs a tool and saves.
- `osm.mjs` gets OpenStreetMap buildings and makes OneMap tile addresses.
- `narration.mjs` sets the beats of the narration, resolves cues and checks the narration and the facts.
- `voice.mjs` makes the voice files with Kokoro on this computer. `voice/` holds the package files of the voice (kokoro-js 1.2.1).
- `guide/` holds the how-to texts for an agent.

## Run

Start the MCP server:

    node core/mcp.mjs --scene /path/to/scene.toybox.json [--render-url http://127.0.0.1:PORT/render]

Run one tool from the shell:

    node core/cli.mjs place '{"model":"car-sedan","at":[0,0]}' --scene /tmp/s.toybox.json
    node core/cli.mjs validate --scene /tmp/s.toybox.json
    node core/cli.mjs guide overview --scene /tmp/s.toybox.json

Rebuild the catalogue after you change `kit.mjs`:

    node core/kit.mjs

## Test

    node --test test/

## Evals

    node evals/run.mjs

Each eval builds a scene only through the tool commands. It writes `evals/out/<name>.toybox.json` and `.srt`. The narrated eval also uses the voice files in `evals/out/voice/`. Run `node evals/narrated.mjs` to make them again. It prints the quality bars. The command exits with 1 when a bar fails.
