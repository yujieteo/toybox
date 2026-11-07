import math
from dataclasses import dataclass

from toybox.anim import key_location, key_rotation
from toybox.person import Limb, Person

SAMPLES_PER_CYCLE = 12
TURN_SECONDS = 0.35
SETTLE_SECONDS = 0.25
KNEE_BEND = 0.9
ARM_BEND = 0.3
LEG_LENGTH = 0.834
MAX_SWING = 0.62
ADDUCT = 0.5


@dataclass(frozen=True)
class Walk:
    start: int
    end: int
    steps: tuple[tuple[float, float, int], ...]


def swing(speed: float, cadence: float, scale: float) -> float:
    return min(MAX_SWING, speed / (2.0 * cadence * LEG_LENGTH * scale))


def triangle(angle: float) -> float:
    return math.asin(math.sin(angle)) * 2.0 / math.pi


def key_limb(limb: Limb, frame: float, phase: float, amplitude: float, side: float) -> None:
    angle = 2.0 * math.pi * phase + (math.pi if side > 0 else 0.0)
    forward = amplitude * triangle(angle)
    bend = -KNEE_BEND * max(0.0, math.cos(angle))
    key_rotation(limb.hip, round(frame), (forward, 0, 0), "LINEAR")
    key_rotation(limb.knee, round(frame), (bend, 0, 0), "LINEAR")
    key_rotation(limb.shoulder, round(frame), (-0.9 * forward, 0, limb.side * ADDUCT), "LINEAR")
    key_rotation(limb.elbow, round(frame), (ARM_BEND + 0.2 * abs(forward), 0, 0), "LINEAR")


def rest_pose(person: Person, frame: int) -> None:
    for limb in (person.left, person.right):
        key_limb(limb, frame, 0.0, 0.0, 1.0)


def gait_keys(person: Person, first: int, last: int, speed: float, fps: int) -> None:
    cadence = 1.9
    cycle_frames = fps / (cadence / 2.0)
    amplitude = swing(speed, cadence, person.scale)
    count = max(1, round((last - first) / cycle_frames * SAMPLES_PER_CYCLE))
    for index in range(count + 1):
        frame = first + (last - first) * index / count
        phase = (frame - first) / cycle_frames
        key_limb(person.left, frame, phase, amplitude, -1.0)
        key_limb(person.right, frame, phase, amplitude, 1.0)


def heading_of(dx: float, dy: float) -> float:
    return math.atan2(dy, dx) - math.pi / 2.0


def unwrap(previous: float, angle: float) -> float:
    turns = round((previous - angle) / (2.0 * math.pi))
    return angle + turns * 2.0 * math.pi


def plan_route(path: tuple[tuple[float, float], ...], start: int, speed: float, fps: int) -> Walk:
    steps: list[tuple[float, float, int]] = []
    frame = float(start)
    for index, (x, y) in enumerate(path):
        if index > 0:
            frame += math.dist(path[index - 1], (x, y)) / speed * fps
        steps.append((x, y, round(frame)))
    return Walk(start, steps[-1][2], tuple(steps))


def key_root(person: Person, walk: Walk, fps: int) -> None:
    z = float(person.root.location[2])
    turn = round(TURN_SECONDS * fps)
    heading = float(person.root.rotation_euler[2])
    for index, (x, y, frame) in enumerate(walk.steps):
        key_location(person.root, frame, (x, y, z), "LINEAR")
        if index == 0:
            continue
        px, py, pframe = walk.steps[index - 1]
        heading = unwrap(heading, heading_of(x - px, y - py))
        key_rotation(person.root, min(pframe + turn, frame), (0, 0, heading))
        key_rotation(person.root, frame, (0, 0, heading))


def walk(person: Person, path: tuple[tuple[float, float], ...], start: int, speed: float, fps: int) -> int:
    route = plan_route(path, start, speed, fps)
    settle = round(SETTLE_SECONDS * fps)
    key_location(person.root, start, (path[0][0], path[0][1], float(person.root.location[2])), "LINEAR")
    key_rotation(person.root, start, (0.0, 0.0, float(person.root.rotation_euler[2])), "LINEAR")
    rest_pose(person, start)
    gait_keys(person, start + settle, route.end - settle, speed, fps)
    rest_pose(person, route.end)
    key_root(person, route, fps)
    return route.end


def wave(person: Person, start: int, seconds: float, fps: int) -> int:
    arm = person.right
    lift = round(0.4 * fps)
    end = start + round(seconds * fps)
    key_rotation(arm.shoulder, start, (0, 0, arm.side * ADDUCT))
    key_rotation(arm.shoulder, start + lift, (2.7, 0, 0.25))
    key_rotation(arm.shoulder, end - lift, (2.7, 0, 0.25))
    key_rotation(arm.shoulder, end, (0, 0, arm.side * ADDUCT))
    beats = max(2, round(seconds * 2.5))
    for beat in range(beats + 1):
        frame = start + lift + (end - start - 2 * lift) * beat / beats
        key_rotation(arm.elbow, round(frame), (0.6 + 0.5 * (beat % 2), 0, 0))
    return end


def face(person: Person, frame: int, degrees: float) -> None:
    key_rotation(person.root, frame, (0, 0, math.radians(degrees)))
