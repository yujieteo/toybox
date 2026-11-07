# Agents

Toybox makes narrated explainer videos in Blender. You are asked in this project. You make an MP4 and a Blender file.

1. Read VISION.md first. It says what Toybox is and is not.
2. Run `./gate` before you say you are done. Never turn a check off.
3. Less code is better. Delete before you add.
4. No comments. Make the code say it. Allowed: a shebang, a source credit, a build directive.
5. Python only, strict under basedpyright. A class holds data. Functions live at module level. No function values, no callbacks.
6. Max 350 lines a file, 35 lines a function.
7. Animate with keyframes only. No drivers. No handlers.
8. No native tests. Tests are evals in `evals/`.
9. To make a video, use the `make-video` skill.
10. Prove a change with the `prove-change` skill. Model evals cost money: run them only when the author asks.
11. Markdown must grade under 4.0. Use short words.
12. `EXPIRY` is a date three months out. A late date only warns. Rethink the playbook, or rebuild.
