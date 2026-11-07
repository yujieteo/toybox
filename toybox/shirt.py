import math
from bisect import insort
from dataclasses import dataclass

from toybox.human import Body
from toybox.vec import Vec3

SEGMENTS = 32
NEIGHBORS = 4
TORSO = (
    (0.86, 0.205, 0.155),
    (0.98, 0.195, 0.155),
    (1.18, 0.22, 0.175),
    (1.30, 0.225, 0.145),
    (1.42, 0.18, 0.105),
    (1.44, 0.075, 0.065),
)


@dataclass(frozen=True)
class Ring:
    center: Vec3
    across: Vec3
    forward: Vec3


def weights_at(at: Vec3, source: Body) -> list[tuple[int, float]]:
    nearest: list[tuple[float, int]] = []
    for index, point in enumerate(source.points):
        insort(nearest, (math.dist(at, point), index))
        del nearest[NEIGHBORS:]
    weights: dict[int, float] = {}
    total = sum(1.0 / max(0.001, distance) ** 2 for distance, _ in nearest)
    for distance, index in nearest:
        factor = 1.0 / max(0.001, distance) ** 2 / total
        for bone, weight in source.weights[index]:
            weights[bone] = weights.get(bone, 0.0) + factor * weight
    return list(weights.items())


def tube(rings: list[Ring], source: Body, scale: float) -> Body:
    points: list[Vec3] = []
    weights: list[list[tuple[int, float]]] = []
    for ring in rings:
        for index in range(SEGMENTS):
            angle = index * math.tau / SEGMENTS
            p = tuple(
                ring.center[i] + ring.across[i] * math.cos(angle) + ring.forward[i] * math.sin(angle) for i in range(3)
            )
            at = (p[0], p[1], p[2])
            points.append((at[0] * scale, at[1] * scale, at[2] * scale))
            weights.append(weights_at(at, source))
    faces: list[tuple[int, int, int]] = []
    for row in range(len(rings) - 1):
        for index in range(SEGMENTS):
            a, b = row * SEGMENTS + index, row * SEGMENTS + (index + 1) % SEGMENTS
            faces.extend(((a, b, b + SEGMENTS), (a, b + SEGMENTS, a + SEGMENTS)))
    return Body(points, [0] * len(points), weights, faces)


def sleeve(side: float) -> list[Ring]:
    return [
        Ring((side * x, 0.015, z), (0.77 * radius, 0.0, side * 0.638 * radius), (0.0, radius, 0.0))
        for x, z, radius in ((0.10, 1.38, 0.035), (0.185, 1.36, 0.09), (0.245, 1.285, 0.081), (0.285, 1.225, 0.073))
    ]


def make_shirt(body: Body, scale: float) -> Body:
    indices = [i for i, region in enumerate(body.regions) if region == 1]
    source = Body([body.points[i] for i in indices], [], [body.weights[i] for i in indices], [])
    torso = [Ring((0.0, 0.02, z), (x, 0.0, 0.0), (0.0, y, 0.0)) for z, x, y in TORSO]
    shirt = tube(torso, source, scale)
    for side in (-1.0, 1.0):
        part = tube(sleeve(side), source, scale)
        offset = len(shirt.points)
        shirt.faces.extend((a + offset, c + offset, b + offset) for a, b, c in part.faces)
        shirt.points.extend(part.points)
        shirt.weights.extend(part.weights)
        shirt.regions.extend(part.regions)
    return shirt
