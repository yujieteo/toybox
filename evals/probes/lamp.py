import sys

import bpy

from toybox.formats import FORMATS, QUALITIES, Render
from toybox.stage import add_floor, add_lamp, camera_cut, make_stage, set_indoor
from toybox.timing import silent_timing


def main() -> None:
    fmt = FORMATS["landscape"]
    stage = make_stage(Render(fmt, QUALITIES["draft"], "cpu"), silent_timing(fmt.fps))
    set_indoor(stage, strength=0.0)
    _ = add_floor("concrete", 20.0)
    _ = add_lamp(stage, "ceiling", (0.0, 0.0, 3.0))
    camera_cut(stage, 1, (0.0, -6.0, 1.6), (0.0, 0.0, 0.0))
    stage.scene.render.filepath = sys.argv[sys.argv.index("--") + 1]
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
