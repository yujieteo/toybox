import sys

import bpy
from bpy.types import TextStrip

from toybox.say import show


def count_drivers() -> int:
    total = 0
    for obj in bpy.data.objects:
        if obj.animation_data is not None:
            total += len(obj.animation_data.drivers)
    return total


def count_animated() -> int:
    return sum(1 for obj in bpy.data.objects if obj.animation_data is not None)


def show_strips() -> None:
    for strip in bpy.data.scenes["edit"].sequence_editor.strips:
        if isinstance(strip, TextStrip):
            show(f"PROBE caption={strip.frame_final_start}|{strip.text}")
        elif strip.type == "SOUND":
            show(f"PROBE voice={strip.frame_final_start}")


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
    edit = bpy.data.scenes["edit"]
    handlers = len(bpy.app.handlers.frame_change_pre) + len(bpy.app.handlers.frame_change_post)
    show(f"PROBE engine={bpy.data.scenes['Scene'].render.engine}")
    show(f"PROBE drivers={count_drivers()}")
    show(f"PROBE handlers={handlers}")
    show(f"PROBE animated={count_animated()}")
    show(f"PROBE size={edit.render.resolution_x}x{edit.render.resolution_y}")
    show(f"PROBE fps={edit.render.fps}")
    show_strips()


if __name__ == "__main__":
    main()
