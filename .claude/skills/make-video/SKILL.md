---
name: make-video
description: Make a narrated explainer video with the Toybox kit. Use when the author asks for a video on any topic. Gives the MP4 and the Blender file.
user-invocable: true
---

# Make a video

1. Run `question-requirements` on the topic. Keep the video short and the steps few.
2. Make the folder `videos/NAME/`.
3. Write `narration.txt`. One short sentence on each line. Each line is one caption.
4. Write `shot.py`. It has one function, `def shot(stage: Stage) -> None`. See `evals/shots/tiny/shot.py`.
   - Import from `toybox.stage`. Build the set. Add people. Time each move to a narration line with `line_start`.
   - Move the camera with `camera_cut` and `camera_move`. Keep the subject large in the frame.
   - Use real surfaces: concrete, tile, brick, metal, wood, glass, fabric.
5. Run `python -m toybox voice videos/NAME`.
6. Look at a still first: `python -m toybox render videos/NAME --quality preview --still 120 --format landscape`.
7. Render: `python -m toybox render videos/NAME --format both --quality final`.
8. Hand over `out/NAME/NAME-landscape.mp4`, `out/NAME/NAME-portrait.mp4` and the `.blend` files.

Cycles runs on the CPU unless you pass `--device metal` or `--device cuda`. Draft clips are quick. Final clips are slow.
Run `./gate` before you say you are done.
