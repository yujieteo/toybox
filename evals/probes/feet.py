import bpy
from bpy.types import Object

from toybox.formats import FORMATS, QUALITIES, Render
from toybox.say import show
from toybox.stage import add_person, make_stage, walk_path
from toybox.timing import silent_timing

SPEED = 1.3
CONTACT = 0.095


def foot_x(rig: Object, bone: str) -> tuple[float, float]:
    posed = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
    placed = posed.matrix_world @ posed.pose.bones[bone].head
    return float(placed[0]), float(placed[2])


def planted_speeds(feet: tuple[str, str], rig: Object, first: int, last: int, fps: int) -> list[float]:
    speeds: list[float] = []
    scene = bpy.context.scene
    scene.frame_set(first)
    before = [foot_x(rig, foot) for foot in feet]
    for frame in range(first + 1, last):
        scene.frame_set(frame)
        now = [foot_x(rig, foot) for foot in feet]
        speeds.extend(
            abs(now[i][0] - before[i][0]) * fps for i in range(2) if now[i][1] < CONTACT and before[i][1] < CONTACT
        )
        before = now
    return speeds


def main() -> None:
    fmt = FORMATS["landscape"]
    stage = make_stage(Render(fmt, QUALITIES["draft"], "cpu"), silent_timing(fmt.fps))
    person = add_person("ana", (0.0, 0.0, 0.0))
    end = walk_path(stage, person, ((0.0, 0.0), (12.0, 0.0)), 1, SPEED)
    speeds = planted_speeds(("foot.L", "foot.R"), person.root, 30, end - 30, fmt.fps)
    show(f"PROBE walk_speed={SPEED}")
    show(f"PROBE planted_samples={len(speeds)}")
    show(f"PROBE planted_mean={sum(speeds) / max(1, len(speeds)):.3f}")


if __name__ == "__main__":
    main()
