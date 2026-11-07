from mathutils import Vector

from toybox.stage import (
    Stage,
    add_bench,
    add_floor,
    add_lamp,
    add_person,
    add_planter,
    camera_cut,
    extend,
    idle_pose,
    set_indoor,
)


def shot(stage: Stage) -> None:
    set_indoor(stage, (0.72, 0.78, 0.9), 0.8)
    key_light = add_lamp(stage, "key", (1.5, 3.0, 4.5), 2200.0, 4.0)
    rim_light = add_lamp(stage, "rim", (-2.0, -1.0, 3.0), 1400.0, 3.0)
    for lamp in (key_light, rim_light):
        lamp.rotation_mode = "QUATERNION"
        lamp.rotation_quaternion = (Vector((0.0, 0.0, 1.0)) - Vector(lamp.location)).to_track_quat("-Z", "Y")
    _ = add_floor("concrete", 200.0, (0.2, 0.23, 0.25))
    person = add_person("ana", (0.0, 0.0, 0.0))
    _ = add_bench("bench", (-1.5, -0.4, 0.0))
    _ = add_planter("planter", (1.0, -0.4, 0.0))
    extend(stage, idle_pose(stage, person, 1, 6.0))
    camera_cut(stage, 1, (2.8, 5.5, 2.4), (-0.25, 0.0, 0.9))
