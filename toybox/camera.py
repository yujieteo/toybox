from dataclasses import dataclass

import bpy
from bpy.types import Object, Scene

from toybox.anim import key_location
from toybox.solids import pivot
from toybox.vec import Vec3


@dataclass(frozen=True)
class Rig:
    camera: Object
    target: Object


def make_rig(scene: Scene, lens: float, fstop: float) -> Rig:
    data = bpy.data.cameras.new("camera")
    data.lens = lens
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = 36.0
    data.dof.use_dof = True
    data.dof.aperture_fstop = fstop
    camera = bpy.data.objects.new("camera", data)
    scene.collection.objects.link(camera)
    target = pivot("camera.target", (0.0, 0.0, 1.0))
    data.dof.focus_object = target
    track = camera.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = camera
    return Rig(camera, target)


def cut_location(obj: Object, frame: int, location: Vec3) -> None:
    key_location(obj, frame, location, "CONSTANT")
    animation = obj.animation_data
    if animation is None or animation.action is None:
        msg = "Camera cut has no keyed action"
        raise RuntimeError(msg)
    for axis in range(3):
        curve = animation.action.fcurve_ensure_for_datablock(obj, "location", index=axis)
        for point in curve.keyframe_points:
            if point.co[0] == frame:
                point.interpolation = "CONSTANT"


def cut(rig: Rig, frame: int, position: Vec3, look_at: Vec3) -> None:
    cut_location(rig.camera, frame, position)
    cut_location(rig.target, frame, look_at)


def move(rig: Rig, frame: int, position: Vec3, look_at: Vec3, kind: str = "SINE") -> None:
    key_location(rig.camera, frame, position, kind)
    key_location(rig.target, frame, look_at, kind)
