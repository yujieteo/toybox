import math

from bpy.types import Material, Object

from toybox.human import BODY_HEIGHT, Body, Joint, bind, make_mesh, read_joints

UPPER = ((0.25, 0.115), (0.55, 0.11), (0.85, 0.09), (1.0, 0.045), (1.0, 0.022))
SOLE = ((1.0, 0.022), (1.0, 0.005))
SEGMENTS = 32


def footwear(joints: list[Joint], scale: float, rings: tuple[tuple[float, float], ...]) -> Body:
    points: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    weights: list[list[tuple[int, float]]] = []
    for bone, joint in enumerate(joints):
        if not joint.name.startswith("foot."):
            continue
        offset = len(points)
        for radius, z in rings:
            for i in range(SEGMENTS):
                angle = i * math.tau / SEGMENTS
                points.append(
                    (
                        joint.head[0] + radius * 0.065 * math.cos(angle) * scale,
                        (0.065 + radius * 0.135 * math.sin(angle)) * scale,
                        z * scale,
                    )
                )
                weights.append([(bone, 1.0)])
        for row in range(len(rings) - 1):
            for i in range(SEGMENTS):
                a = offset + row * SEGMENTS + i
                b = offset + row * SEGMENTS + (i + 1) % SEGMENTS
                faces.extend(((a, b + SEGMENTS, b), (a, a + SEGMENTS, b + SEGMENTS)))
        bottom = offset + (len(rings) - 1) * SEGMENTS
        for i in range(1, SEGMENTS - 1):
            faces.extend(((offset, offset + i, offset + i + 1), (bottom, bottom + i + 1, bottom + i)))
    return Body(points, [0] * len(points), weights, faces)


def dress_feet(rig: Object, height: float, upper: Material, sole: Material) -> None:
    scale = height / BODY_HEIGHT
    joints = read_joints(scale)
    for kind, rings, material in (("shoes", UPPER, upper), ("soles", SOLE, sole)):
        mesh = make_mesh(f"{rig.name}.{kind}", footwear(joints, scale, rings), joints, [material])
        bind(mesh, rig)
