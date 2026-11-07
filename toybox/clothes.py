import math
from dataclasses import dataclass

from bpy.types import Material, Object

from toybox.human import BODY_HEIGHT, Body, Face, Joint, bind, make_mesh, read_body, read_joints
from toybox.shirt import make_shirt
from toybox.vec import Vec3

MIN_HORIZONTAL = 0.1


@dataclass(frozen=True)
class Point:
    at: Vec3
    weights: list[tuple[int, float]]


def normals(body: Body) -> list[Vec3]:
    sums = [[0.0, 0.0, 0.0] for _ in body.points]
    for face in body.faces:
        a, b, c = face[:3]
        u = tuple(body.points[b][i] - body.points[a][i] for i in range(3))
        v = tuple(body.points[c][i] - body.points[a][i] for i in range(3))
        cross = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        for index in face:
            for axis in range(3):
                sums[index][axis] += cross[axis]
    return [
        (n[0] / max(1e-9, math.hypot(*n)), n[1] / max(1e-9, math.hypot(*n)), n[2] / max(1e-9, math.hypot(*n)))
        for n in sums
    ]


def border(at: Vec3, kind: str) -> float:
    _, y, z = at
    if kind == "trousers":
        return min(z - 0.11, 0.91 - z)
    return z - (1.555 + 0.065 * max(0.0, min(1.0, (y + 0.015) / 0.14)))


def between(a: Point, b: Point, t: float) -> Point:
    weights: dict[int, float] = {}
    for bone, weight in a.weights:
        weights[bone] = weight * (1.0 - t)
    for bone, weight in b.weights:
        weights[bone] = weights.get(bone, 0.0) + weight * t
    return Point(
        (a.at[0] + t * (b.at[0] - a.at[0]), a.at[1] + t * (b.at[1] - a.at[1]), a.at[2] + t * (b.at[2] - a.at[2])),
        list(weights.items()),
    )


def cut_at(a: Point, b: Point, kind: str) -> Point:
    low, high = 0.0, 1.0
    start = border(a.at, kind)
    for _ in range(20):
        mid = (low + high) / 2.0
        at = (
            a.at[0] + mid * (b.at[0] - a.at[0]),
            a.at[1] + mid * (b.at[1] - a.at[1]),
            a.at[2] + mid * (b.at[2] - a.at[2]),
        )
        if (border(at, kind) >= 0.0) == (start >= 0.0):
            low = mid
        else:
            high = mid
    return between(a, b, (low + high) / 2.0)


def clip(points: list[Point], kind: str) -> list[Point]:
    result: list[Point] = []
    for i, point in enumerate(points):
        before = points[i - 1]
        a, b = border(before.at, kind), border(point.at, kind)
        if (a >= 0.0) != (b >= 0.0):
            result.append(cut_at(before, point, kind))
        if b >= 0.0:
            result.append(point)
    return result


def hair_clumps(body: Body, scale: float) -> Body:
    directions = normals(body)
    for index in range(0, len(body.points), 2):
        at, normal = body.points[index], directions[index]
        reach = math.hypot(normal[0], normal[1])
        u = (-normal[1] / reach, normal[0] / reach, 0.0) if reach > MIN_HORIZONTAL else (1.0, 0.0, 0.0)
        v = (
            normal[1] * u[2] - normal[2] * u[1],
            normal[2] * u[0] - normal[0] * u[2],
            normal[0] * u[1] - normal[1] * u[0],
        )
        offset = len(body.points)
        for ring in range(4):
            angle = ring * math.pi / 2.0
            p = tuple(at[i] + 0.0003 * scale * (u[i] * math.cos(angle) + v[i] * math.sin(angle)) for i in range(3))
            body.points.append((p[0], p[1], p[2]))
        length = (0.002 + 0.001 * math.sin(index * 2.4)) * scale
        body.points.append((at[0] + normal[0] * length, at[1] + normal[1] * length, at[2] + normal[2] * length))
        body.weights.extend([body.weights[index]] * 5)
        body.regions.extend([0] * 5)
        body.faces.extend((offset + ring, offset + (ring + 1) % 4, offset + 4) for ring in range(4))
    return body


def shell(body: Body, kind: str, scale: float) -> Body:
    if kind == "shirt":
        return make_shirt(body, scale)
    directions = normals(body)
    offset = 0.006 if kind == "hair" else 0.012
    source = [
        Point((p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset), w)
        for p, n, w in zip(body.points, directions, body.weights, strict=True)
    ]
    points: list[Point] = []
    faces: list[Face] = []
    seen: dict[Vec3, int] = {}
    for tri in body.faces:
        if kind == "hair" and any(body.regions[i] not in (0, 4) for i in tri):
            continue
        polygon = clip([source[i] for i in tri], kind)
        indices: list[int] = []
        for point in polygon:
            position = (round(point.at[0], 7), round(point.at[1], 7), round(point.at[2], 7))
            if position not in seen:
                seen[position] = len(points)
                points.append(point)
            indices.append(seen[position])
        faces.extend((indices[0], indices[i], indices[i + 1]) for i in range(1, len(indices) - 1))
    made = Body(
        [(p.at[0] * scale, p.at[1] * scale, p.at[2] * scale) for p in points],
        [0] * len(points),
        [p.weights for p in points],
        faces,
    )
    return hair_clumps(made, scale) if kind == "hair" else made


def garment(rig: Object, body: Body, joints: list[Joint], kind: str, material: Material) -> None:
    obj = make_mesh(f"{rig.name}.{kind}", body, joints, [material])
    if kind == "shirt":
        smooth = obj.modifiers.new("cloth", "SUBSURF")
        smooth.levels = 1
        smooth.render_levels = 1
    bind(obj, rig)
    if kind == "hair":
        return
    edge = obj.modifiers.new("sewn edge", "SOLIDIFY")
    edge.thickness = 0.003
    edge.offset = -1.0


def dress_mesh(rig: Object, height: float, materials: list[Material]) -> None:
    scale = height / BODY_HEIGHT
    body = read_body(1.0)
    joints = read_joints(scale)
    for kind, material in zip(("shirt", "trousers", "hair"), (materials[1], materials[2], materials[4]), strict=True):
        garment(rig, shell(body, kind, scale), joints, kind, material)
