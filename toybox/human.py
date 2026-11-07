import math
from array import array
from dataclasses import dataclass
from pathlib import Path

import bpy
from bpy.types import EditBone, Material, Object

from toybox.vec import Vec3

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "people"
ROW = 15
BODY_HEIGHT = 1.7
DOWN_BONES = ("upperarm", "lowerarm", "wrist", "upperleg", "lowerleg", "foot")
SHORT_BONE = 0.08
IRIS = 7
SHOES = 3
SHIRT = 1
COVERED_SHOULDER = 1.29
COVERED_TORSO = 0.22
PUPIL_RADIUS = 0.0033


@dataclass(frozen=True)
class Body:
    points: list[Vec3]
    regions: list[int]
    weights: list[list[tuple[int, float]]]
    faces: list[tuple[int, int, int]]


@dataclass(frozen=True)
class Joint:
    name: str
    parent: int
    head: Vec3


def place(p: tuple[float, float, float], scale: float) -> Vec3:
    return (-p[0] * scale, p[2] * scale, p[1] * scale)


def read_body(scale: float) -> Body:
    data = (ASSETS / "body.bin").read_bytes()
    header = array("I")
    header.frombytes(data[:8])
    count = header[0]
    floats = array("f")
    floats.frombytes(data[8 : 8 + count * ROW * 4])
    rows = [floats[i * ROW : (i + 1) * ROW] for i in range(count)]
    tris = array("H")
    tris.frombytes(data[8 + count * ROW * 4 :])
    faces = [(tris[i], tris[i + 1], tris[i + 2]) for i in range(0, len(tris), 3)]
    return Body(
        [place((r[0], r[1], r[2]), scale) for r in rows],
        [int(r[6]) for r in rows],
        [[(int(r[7 + k]), r[11 + k]) for k in range(4) if r[11 + k] > 0.0] for r in rows],
        faces,
    )


def read_joints(scale: float) -> list[Joint]:
    joints: list[Joint] = []
    for line in (ASSETS / "skel.tsv").read_text().splitlines():
        name, parent, x, y, z = line.split("\t")
        joints.append(Joint(name, int(parent), place((float(x), float(y), float(z)), scale)))
    return joints


def bone_length(joints: list[Joint], index: int) -> float:
    for other in joints:
        if other.parent == index and not joints[index].name.startswith("clavicle"):
            return max(SHORT_BONE, abs(other.head[2] - joints[index].head[2]))
    return SHORT_BONE


def is_down(name: str) -> bool:
    return any(name.startswith(prefix) for prefix in DOWN_BONES)


def build_bones(rig: Object, joints: list[Joint]) -> None:
    bpy.ops.object.mode_set(mode="EDIT")
    edit = rig.data.edit_bones
    for default in list(edit):
        edit.remove(default)
    made: list[EditBone] = []
    for index, joint in enumerate(joints):
        bone = edit.new(joint.name)
        reach = bone_length(joints, index) * (-1.0 if is_down(joint.name) else 1.0)
        bone.head = joint.head
        bone.tail = (joint.head[0], joint.head[1], joint.head[2] + reach)
        bone.parent = made[joint.parent] if joint.parent >= 0 else None
        made.append(bone)
    bpy.ops.object.mode_set(mode="OBJECT")


def make_rig(name: str, at: Vec3, joints: list[Joint]) -> Object:
    bpy.ops.object.armature_add(location=at)
    rig = bpy.context.object
    rig.name = name
    build_bones(rig, joints)
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    return rig


def majority(regions: list[int]) -> int:
    return regions[1] if regions[1] == regions[2] else regions[0]


def make_mesh(name: str, body: Body, joints: list[Joint], materials: list[Material]) -> Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(body.points, [], body.faces)
    for material in materials:
        mesh.materials.append(material)
    mesh.update()
    mesh.shade_smooth()
    for face, tri in zip(mesh.polygons, body.faces, strict=True):
        face.material_index = majority([body.regions[v] for v in tri])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    groups = [obj.vertex_groups.new(name=joint.name) for joint in joints]
    for vertex, weights in enumerate(body.weights):
        for bone, weight in weights:
            groups[bone].add([vertex], weight, "ADD")
    return obj


def under_shirt(body: Body, tri: tuple[int, int, int], scale: float) -> bool:
    if majority([body.regions[i] for i in tri]) != SHIRT:
        return False
    x = sum(body.points[i][0] for i in tri) / 3.0 / scale
    z = sum(body.points[i][2] for i in tri) / 3.0 / scale
    return abs(x) < COVERED_TORSO or z > COVERED_SHOULDER


def bare_body(body: Body, scale: float) -> Body:
    regions: list[int] = []
    points: list[Vec3] = []
    for point, source in zip(body.points, body.regions, strict=True):
        region = 0 if source in (1, 2, 4) else source
        if source == IRIS and math.hypot(abs(point[0] / scale) - 0.0314, point[2] / scale - 1.5768) < PUPIL_RADIUS:
            region = 8
        regions.append(region)
        points.append((point[0], point[1] - 0.0045 * scale, point[2]) if source in (5, IRIS) else point)
    faces = [
        tri
        for tri in body.faces
        if not all(body.regions[i] == SHOES for i in tri) and not under_shirt(body, tri, scale)
    ]
    return Body(points, regions, body.weights, faces)


def brows(scale: float) -> Body:
    points: list[Vec3] = []
    faces: list[tuple[int, int, int]] = []
    for side in (-1.0, 1.0):
        offset = len(points)
        for step in range(13):
            t = step / 12.0
            radius = 0.0003 + 0.002 * math.sin(math.pi * t)
            for ring in range(6):
                angle = ring * math.tau / 6.0
                points.append(
                    (
                        side * (0.014 + 0.04 * t) * scale,
                        (0.156 - 0.027 * t + radius * math.cos(angle)) * scale,
                        (1.606 + 0.007 * math.sin(math.pi * t) - 0.004 * t + radius * math.sin(angle)) * scale,
                    )
                )
        for step in range(12):
            for ring in range(6):
                a = offset + step * 6 + ring
                b = offset + step * 6 + (ring + 1) % 6
                faces.extend(((a, b, b + 6), (a, b + 6, a + 6)))
    return Body(points, [4] * len(points), [[(5, 1.0)] for _ in points], faces)


def bind(obj: Object, rig: Object) -> None:
    obj.parent = rig
    modifier = obj.modifiers.new("rig", "ARMATURE")
    modifier.object = rig


def make_human(name: str, at: Vec3, height: float, materials: list[Material]) -> tuple[Object, Object]:
    scale = height / BODY_HEIGHT
    joints = read_joints(scale)
    rig = make_rig(name, at, joints)
    skin = make_mesh(f"{name}.body", bare_body(read_body(scale), scale), joints, materials)
    bind(skin, rig)
    bind(make_mesh(f"{name}.brows", brows(scale), joints, materials), rig)
    return rig, skin
