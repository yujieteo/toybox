# Vision

Toybox exists so that a person can ask for an explainer video and get one.
It serves one author. The author asks Claude Code in this project.
It owns exactly one thing: a kit that turns a short script into a rendered, narrated video.

## What you get

- You ask for a topic. You get an MP4 and a Blender file.
- The video is realistic. It has textures, soft shadows and path-traced light.
- The video has a voice and captions. The voice runs on your own computer.
- The same shot makes a wide video and a tall video for phones.

## How it works

- Blender does all of it. It builds the scene, lights it, renders it and cuts the video.
- Each video is one short shot script and one narration file.
- The script is Python. It uses the kit. It does not touch the render settings.
- Motion uses keyframes only. There are no drivers and no handlers. A render gives the same frames each time.
- The narration sets the timing. The voice is Kokoro. The captions follow the voice.
- The render is slow on purpose. Quality comes before speed.

## Rules

- Python for everything. Shell only for the gate.
- Every type is checked. Every rule in `rules.conf` stays on.
- Tests are evals. Model evals run only when the author asks.
- Less code is better. A new feature must delete something or earn its place.

## Scope

- No chat page. No web viewer. No server. No MCP server.
- No scene file format. The Blender file is the scene.
- No toy look. No flat colours and no outlines.
- No video of a real person. No faces from photos.
- Toybox does not make slides, charts or interfaces.

## A change fits when

- It makes a video look more real or read more clearly.
- It makes the kit smaller or its output more repeatable.
- It keeps the gate green with every rule on.

## A change should be resisted when

- It adds a screen, a service or a second language.
- It adds a setting that a shot script can already say in code.
- It trades repeatable frames for a faster render.
