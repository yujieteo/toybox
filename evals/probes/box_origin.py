import math

import bpy
from bpy.types import Object
from mathutils import Vector

from toybox.say import show
from toybox.solids import box
from toybox.vec import Vec3

TOLERANCE = 0.00001


def near(actual: Vector | Vec3, expected: Vector | Vec3, fact: str) -> None:
    error = (Vector(actual) - Vector(expected)).length
    if error > TOLERANCE:
        msg = f"Box pivot request: {fact}: got {tuple(actual)}, expected {expected}"
        raise ValueError(msg)


def center(obj: Object) -> Vector:
    points = [Vector(corner) for corner in obj.bound_box]
    total = Vector((0.0, 0.0, 0.0))
    for point in points:
        total += point
    return obj.matrix_world @ (total / len(points))


def dimensions(obj: Object) -> Vector:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return Vector(tuple(max(p[axis] for p in points) - min(p[axis] for p in points) for axis in range(3)))


def main() -> None:
    size = (1.2, 0.25, 2.0)
    at = (2.0, 0.0, 1.0)
    material = bpy.data.materials.new("door.paint")
    door = box("sliding-door", size, at, material, bevel=0.0)
    bpy.context.view_layer.update()
    near(door.location, at, "origin")
    near(door.scale, (1.0, 1.0, 1.0), "scale is baked")
    near(dimensions(door), size, "door dimensions")
    near(center(door), at, "initial mesh center")
    for frame, position, angle in ((1, at, 0.0), (24, (3.5, 0.0, 1.0), math.pi / 2)):
        door.location = position
        door.rotation_euler = (0.0, 0.0, angle)
        _ = door.keyframe_insert("location", frame=frame)
        _ = door.keyframe_insert("rotation_euler", frame=frame)
    for frame in (1, 12, 24):
        bpy.context.scene.frame_set(frame)
        near(center(door), door.location, "keyed mesh stays on its pivot")
    near(dimensions(door), (size[1], size[0], size[2]), "quarter-turn dimensions")
    show("PROBE box origin, baked scale, slide and turn passed")


if __name__ == "__main__":
    main()
