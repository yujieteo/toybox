import math

import bpy
from bpy.types import Material, Object

from toybox.materials import make_surface
from toybox.solids import attach, box, cylinder, pivot, sphere
from toybox.vec import Vec3


def slat(name: str, root: Object, size: Vec3, at: Vec3, material: Material) -> Object:
    obj = box(name, size, (0.0, 0.0, 0.0), material, bevel=0.012)
    attach(obj, root, at)
    return obj


def add_bench(name: str, at: Vec3) -> Object:
    root = pivot(name, at)
    wood = make_surface("wood", (0.23, 0.095, 0.035), f"{name}.wood")
    steel = make_surface("metal", (0.065, 0.075, 0.08), f"{name}.steel")
    for index in range(5):
        _ = slat(f"{name}.seat.{index}", root, (1.65, 0.085, 0.045), (0.0, -0.19 + index * 0.095, 0.46), wood)
    for index in range(3):
        part = slat(
            f"{name}.back.{index}", root, (1.65, 0.045, 0.12), (0.0, -0.24 - index * 0.02, 0.64 + index * 0.15), wood
        )
        part.rotation_euler = (-0.13, 0.0, 0.0)
    for side in (-1.0, 1.0):
        x = side * 0.62
        _ = slat(f"{name}.rail.{side}", root, (0.055, 0.51, 0.065), (x, 0.0, 0.405), steel)
        _ = slat(f"{name}.upright.{side}", root, (0.05, 0.05, 0.57), (x, -0.28, 0.68), steel)
        for y in (-0.18, 0.18):
            _ = slat(f"{name}.leg.{side}.{y}", root, (0.055, 0.055, 0.38), (x, y, 0.215), steel)
            _ = slat(f"{name}.foot.{side}.{y}", root, (0.13, 0.1, 0.025), (x, y, 0.013), steel)
        for index in range(3):
            bolt = sphere(f"{name}.bolt.{side}.{index}", 0.009, (0.0, 0.0, 0.0), steel, (1.0, 0.4, 1.0))
            attach(bolt, root, (x, -0.211 - index * 0.02, 0.64 + index * 0.15))
    return root


def pot(name: str, root: Object, material: Material) -> None:
    rings = (
        (0.18, 0.02),
        (0.19, 0.06),
        (0.265, 0.51),
        (0.29, 0.52),
        (0.29, 0.57),
        (0.245, 0.57),
        (0.238, 0.50),
        (0.17, 0.08),
    )
    points = [
        (radius * math.cos(i * math.tau / 64), radius * math.sin(i * math.tau / 64), z)
        for radius, z in rings
        for i in range(64)
    ]
    faces = [
        (j * 64 + i, j * 64 + (i + 1) % 64, (j + 1) * 64 + (i + 1) % 64, (j + 1) * 64 + i)
        for j in range(len(rings) - 1)
        for i in range(64)
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(material)
    mesh.update()
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    attach(obj, root, (0.0, 0.0, 0.0))


def add_planter(name: str, at: Vec3) -> Object:
    root = pivot(name, at)
    clay = make_surface("concrete", (0.3, 0.105, 0.05), f"{name}.clay")
    soil = make_surface("asphalt", (0.035, 0.018, 0.008), f"{name}.soil")
    leaves = make_surface("skin", (0.035, 0.12, 0.025), f"{name}.leaf")
    pot(f"{name}.pot", root, clay)
    ground = cylinder(f"{name}.soil", 0.238, 0.018, (0.0, 0.0, 0.0), soil)
    attach(ground, root, (0.0, 0.0, 0.505))
    for index in range(13):
        angle = index * 2.4
        reach = 0.12 + (index % 3) * 0.035
        height = 0.76 + (index % 4) * 0.055
        stem = cylinder(f"{name}.stem.{index}", 0.005, math.hypot(reach, height - 0.51), (0.0, 0.0, 0.0), leaves)
        attach(stem, root, (reach * math.cos(angle) / 2.0, reach * math.sin(angle) / 2.0, (height + 0.51) / 2.0))
        stem.rotation_euler = (0.0, math.atan2(reach, height - 0.51), angle)
        blade = sphere(f"{name}.leaf.{index}", 1.0, (0.0, 0.0, 0.0), leaves, (0.045, 0.012, 0.24))
        attach(blade, root, (reach * math.cos(angle), reach * math.sin(angle), height))
        blade.rotation_euler = (0.4 + (index % 3) * 0.15, 0.0, angle)
    return root
