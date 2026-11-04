# Toybox core

This folder holds the server side of Toybox.

It runs with Bun and has no runtime npm dependencies. The voice is the only exception. `voice.ts` installs its packages into `~/.cache/toybox/voice` at the first `make_voice`, not into the repo.

## Files

- `scene.ts` creates, loads, saves and validates scene files. It also has `srt`, `objectBounds` and `contrast_ok`.
- `commands.ts` holds one function for each tool and the `toolSpecs` list with JSON Schemas.
- `kit.ts` builds `assets/catalogue.json` from box, cylinder, sphere and wedge parts.
- `geom.ts` has the shared geometry maths.
- `mcp.ts` is a stdio MCP server. `cli.ts` runs the same tools from a shell. `session.ts` loads the scene, runs a tool and saves.
- `osm.ts` gets OpenStreetMap buildings and makes OneMap tile addresses.
- `narration.ts` sets the beats of the narration, resolves cues and checks the narration and the facts.
- `voice.ts` makes the voice files with Kokoro on this computer. `voice/` holds the package files of the voice (kokoro-js 1.2.1).
- `guide/` holds the how-to texts for an agent.

## Run

Start the MCP server:

```sh
bun core/mcp.ts --scene /path/to/scene.toybox.json [--render-url http://127.0.0.1:PORT/render]
```

Run one tool from the shell:

```sh
bun core/cli.ts place '{"model":"car-sedan","at":[0,0]}' --scene /tmp/s.toybox.json
bun core/cli.ts validate --scene /tmp/s.toybox.json
bun core/cli.ts guide overview --scene /tmp/s.toybox.json
```

Rebuild the catalogue after you change `kit.ts`:

```sh
bun core/kit.ts
```

## Test

```sh
bun test test/
```

## Evals

```sh
bun evals/run.ts
```

Each eval builds a scene only through the tool commands. It writes `evals/out/<name>.toybox.json` and `.srt`. The narrated eval also uses the voice files in `evals/out/voice/`. Run `bun evals/narrated.ts` to make them again. It prints the quality bars. The command exits with 1 when a bar fails.
