import bpy
from bpy.types import Object, PoseBone

from toybox.vec import Vec3

EASES = ("LINEAR", "BEZIER", "SINE", "CUBIC")


def ease(kind: str) -> None:
    bpy.context.preferences.edit.keyframe_new_interpolation_type = kind


def key_location(obj: Object | PoseBone, frame: int, location: Vec3, kind: str = "BEZIER") -> None:
    ease(kind)
    obj.location = location
    obj.keyframe_insert("location", frame=frame)


def key_rotation(obj: Object | PoseBone, frame: int, euler: Vec3, kind: str = "BEZIER") -> None:
    ease(kind)
    obj.rotation_euler = euler
    obj.keyframe_insert("rotation_euler", frame=frame)


def key_scale(obj: Object | PoseBone, frame: int, scale: Vec3, kind: str = "BEZIER") -> None:
    ease(kind)
    obj.scale = scale
    obj.keyframe_insert("scale", frame=frame)


def key_visible(obj: Object, frame: int, *, visible: bool) -> None:
    ease("CONSTANT")
    obj.hide_render = not visible
    obj.hide_viewport = not visible
    obj.keyframe_insert("hide_render", frame=frame)
    obj.keyframe_insert("hide_viewport", frame=frame)
