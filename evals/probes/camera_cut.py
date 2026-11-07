import bpy
from mathutils import Vector

from toybox.formats import FORMATS, QUALITIES, Render
from toybox.say import show
from toybox.stage import Stage, camera_cut, camera_move, make_stage
from toybox.timing import silent_timing
from toybox.vec import Vec3


def new_stage() -> Stage:
    fmt = FORMATS["landscape"]
    return make_stage(Render(fmt, QUALITIES["draft"], "cpu"), silent_timing(fmt.fps))


def pose_error(stage: Stage, frame: int, position: Vec3, target: Vec3) -> float:
    stage.scene.frame_set(frame)
    camera_error = (Vector(stage.rig.camera.location) - Vector(position)).length
    target_error = (Vector(stage.rig.target.location) - Vector(target)).length
    return max(camera_error, target_error)


def cut_error() -> float:
    stage = new_stage()
    first = (-4.0, -9.0, 3.0)
    second = (4.0, -7.0, 2.0)
    first_target = (-1.0, 0.0, 1.0)
    second_target = (1.0, 0.0, 0.5)
    camera_cut(stage, 145, first, first_target)
    camera_cut(stage, 1, first, first_target)
    camera_cut(stage, 73, second, second_target)
    errors = [pose_error(stage, frame, first, first_target) for frame in (1, 37, 72, 145, 170)]
    errors.extend(pose_error(stage, frame, second, second_target) for frame in (73, 109, 144))
    camera_cut(stage, 73, first, second_target)
    errors.append(pose_error(stage, 72, first, first_target))
    errors.append(pose_error(stage, 109, first, second_target))
    return max(errors)


def move_distance() -> float:
    stage = new_stage()
    first = (-4.0, -9.0, 3.0)
    second = (4.0, -7.0, 2.0)
    target = (0.0, 0.0, 1.0)
    camera_move(stage, 1, first, target)
    camera_move(stage, 73, second, target)
    stage.scene.frame_set(37)
    position = Vector(stage.rig.camera.location)
    return min((position - Vector(first)).length, (position - Vector(second)).length)


def main() -> None:
    show("SOURCE camera_cut holds its prior pose until the cut frame; camera_move still moves")
    error = cut_error()
    distance = move_distance()
    show(f"PROBE cut_error={error}")
    show(f"PROBE move_distance={distance}")
    bpy.ops.wm.read_factory_settings(use_empty=True)


if __name__ == "__main__":
    main()
