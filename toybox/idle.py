import math

from toybox.anim import key_location, key_rotation, key_scale
from toybox.person import Person


def idle(person: Person, start: int, seconds: float, fps: int) -> int:
    end = start + round(seconds * fps)
    bones = person.root.pose.bones
    count = max(1, math.ceil(seconds * 8.0))
    for index in range(count + 1):
        frame = round(start + (end - start) * index / count)
        time = (frame - start) / fps
        breath = math.sin(time * math.tau / 3.8)
        shift = math.sin(time * math.tau / 7.0)
        key_location(bones["root"], frame, (0.01 * shift * person.scale, 0.0, 0.0))
        key_rotation(bones["spine03"], frame, (0.012 * breath, 0.0, -0.018 * shift))
        key_scale(bones["spine01"], frame, (1.0 + 0.009 * breath, 1.0 + 0.006 * breath, 1.0))
        key_rotation(bones["head"], frame, (0.018 + 0.008 * breath, 0.025 * shift, 0.01 * shift))
        for limb in (person.left, person.right):
            key_rotation(limb.hip, frame, (0.0, 0.0, 0.012 * shift))
            key_rotation(limb.shoulder, frame, (0.025 * breath, 0.0, limb.side * (0.60 + 0.012 * shift)))
            key_rotation(limb.elbow, frame, (0.10 + 0.02 * breath, 0.0, 0.0))
    return end
