from dataclasses import dataclass

import bpy
from bpy.types import Object, Scene

from toybox import camera, gait, light
from toybox.formats import Format, Render
from toybox.grade import apply_grade
from toybox.materials import make_surface
from toybox.person import Outfit, Person, make_person
from toybox.solids import box, cylinder, plane, sphere
from toybox.timing import Timing, end_frame, start_frame, total_frames
from toybox.vec import Vec3


def use_device(scene: Scene, device: str) -> None:
    scene.cycles.device = "CPU" if device == "cpu" else "GPU"
    if device == "cpu":
        return
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = device.upper()
    prefs.get_devices()
    for entry in prefs.devices:
        entry.use = True


def configure(scene: Scene, render: Render, last_frame: int) -> None:
    out = scene.render
    out.engine = "CYCLES"
    out.resolution_x = render.fmt.width
    out.resolution_y = render.fmt.height
    out.resolution_percentage = render.quality.percent
    out.fps = render.fmt.fps
    out.use_motion_blur = render.quality.motion_blur
    scene.cycles.samples = render.quality.samples
    scene.cycles.use_denoising = render.quality.denoise
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.cycles.max_bounces = 6
    apply_grade(scene)
    scene.frame_start = 1
    scene.frame_end = last_frame
    use_device(scene, render.device)


@dataclass(frozen=True)
class Stage:
    scene: Scene
    fmt: Format
    timing: Timing
    rig: camera.Rig


def make_stage(render: Render, timing: Timing) -> Stage:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure(scene, render, total_frames(timing))
    return Stage(scene, render.fmt, timing, camera.make_rig(scene, 35.0, 2.8))


def line_start(stage: Stage, line: int) -> int:
    return start_frame(stage.timing, line)


def line_end(stage: Stage, line: int) -> int:
    return end_frame(stage.timing, line)


def seconds(stage: Stage, amount: float) -> int:
    return round(amount * stage.fmt.fps)


def extend(stage: Stage, frames: int) -> None:
    stage.scene.frame_end = max(frames, stage.scene.frame_end)


def set_sky(stage: Stage, elevation: float = 35.0, rotation: float = 120.0, strength: float = 1.0) -> None:
    light.sky(stage.scene, elevation, rotation, strength)


def set_indoor(stage: Stage, color: Vec3 = (0.8, 0.85, 1.0), strength: float = 0.3) -> None:
    light.ambient(stage.scene, color, strength)


def add_lamp(stage: Stage, name: str, at: Vec3, power: float = 800.0, size: float = 1.5) -> Object:
    return light.area(stage.scene, name, at, power, size)


def add_floor(surface: str = "concrete", size: float = 60.0, color: Vec3 | None = None) -> Object:
    return plane("floor", size, (0.0, 0.0, 0.0), make_surface(surface, color))


def add_box(name: str, size: Vec3, at: Vec3, surface: str = "paint", color: Vec3 | None = None) -> Object:
    return box(name, size, at, make_surface(surface, color))


def add_cylinder(name: str, radius: float, height: float, at: Vec3, surface: str = "metal") -> Object:
    return cylinder(name, radius, height, at, make_surface(surface))


def add_sphere(name: str, radius: float, at: Vec3, surface: str = "paint") -> Object:
    return sphere(name, radius, at, make_surface(surface))


def add_person(name: str, at: Vec3, outfit: Outfit | None = None) -> Person:
    return make_person(name, at, outfit or Outfit())


def walk_path(
    stage: Stage, person: Person, path: tuple[tuple[float, float], ...], start: int, speed: float = 1.3
) -> int:
    return gait.walk(person, path, start, speed, stage.fmt.fps)


def wave_hand(stage: Stage, person: Person, start: int, duration: float = 2.0) -> int:
    return gait.wave(person, start, duration, stage.fmt.fps)


def turn_to(person: Person, frame: int, degrees: float) -> None:
    gait.face(person, frame, degrees)


def camera_cut(stage: Stage, frame: int, position: Vec3, look_at: Vec3) -> None:
    camera.cut(stage.rig, frame, position, look_at)


def camera_move(stage: Stage, frame: int, position: Vec3, look_at: Vec3) -> None:
    camera.move(stage.rig, frame, position, look_at)
