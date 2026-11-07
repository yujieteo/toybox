import bpy
from bpy.types import Material, Object

from toybox.vec import Vec3


def finish(obj: Object, name: str, material: Material, bevel: float) -> Object:
    obj.name = name
    obj.data.materials.append(material)
    if bevel > 0.0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return obj


def box(name: str, size: Vec3, at: Vec3, material: Material, bevel: float = 0.01) -> Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=at)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material, bevel)


def cylinder(name: str, radius: float, depth: float, at: Vec3, material: Material) -> Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=at)
    bpy.ops.object.shade_smooth()
    return finish(bpy.context.object, name, material, 0.0)


def sphere(name: str, radius: float, at: Vec3, material: Material, squash: Vec3 = (1.0, 1.0, 1.0)) -> Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=at)
    obj = bpy.context.object
    obj.scale = squash
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth()
    return finish(obj, name, material, 0.0)


def plane(name: str, size: float, at: Vec3, material: Material) -> Object:
    bpy.ops.mesh.primitive_plane_add(size=size, location=at)
    return finish(bpy.context.object, name, material, 0.0)


def pivot(name: str, at: Vec3, parent: Object | None = None) -> Object:
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    empty.location = at
    empty.parent = parent
    return empty


def attach(part: Object, parent: Object, at: Vec3) -> None:
    part.parent = parent
    part.location = at
