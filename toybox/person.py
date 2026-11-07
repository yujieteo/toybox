from dataclasses import dataclass

from bpy.types import Material, Object

from toybox.materials import make_surface
from toybox.solids import attach, box, cylinder, pivot, sphere
from toybox.vec import Vec3


@dataclass(frozen=True)
class Outfit:
    shirt: tuple[float, float, float] = (0.7, 0.12, 0.12)
    trousers: tuple[float, float, float] = (0.12, 0.14, 0.25)
    skin: tuple[float, float, float] = (0.75, 0.5, 0.38)
    hair: tuple[float, float, float] = (0.04, 0.03, 0.02)
    height: float = 1.75


@dataclass(frozen=True)
class Limb:
    hip: Object
    knee: Object
    shoulder: Object
    elbow: Object


@dataclass(frozen=True)
class Person:
    name: str
    root: Object
    left: Limb
    right: Limb
    scale: float


@dataclass(frozen=True)
class Cloth:
    shirt: Material
    trousers: Material
    skin: Material
    hair: Material
    shoe: Material


def dress(outfit: Outfit) -> Cloth:
    return Cloth(
        shirt=make_surface("fabric", outfit.shirt),
        trousers=make_surface("fabric", outfit.trousers),
        skin=make_surface("skin", outfit.skin),
        hair=make_surface("fabric", outfit.hair),
        shoe=make_surface("paint", (0.05, 0.05, 0.05)),
    )


def make_limb(name: str, side: float, root: Object, cloth: Cloth, s: float) -> Limb:
    hip = pivot(f"{name}.hip", (side * 0.1 * s, 0.0, 0.92 * s), root)
    attach(cylinder(f"{name}.thigh", 0.07 * s, 0.44 * s, (0, 0, 0), cloth.trousers), hip, (0, 0, -0.22 * s))
    knee = pivot(f"{name}.knee", (0.0, 0.0, -0.44 * s), hip)
    attach(cylinder(f"{name}.shin", 0.055 * s, 0.44 * s, (0, 0, 0), cloth.trousers), knee, (0, 0, -0.22 * s))
    attach(
        box(f"{name}.foot", (0.1 * s, 0.26 * s, 0.07 * s), (0, 0, 0), cloth.shoe, 0.02), knee, (0, 0.05 * s, -0.445 * s)
    )
    shoulder = pivot(f"{name}.shoulder", (side * 0.23 * s, 0.0, 1.45 * s), root)
    attach(cylinder(f"{name}.arm", 0.045 * s, 0.3 * s, (0, 0, 0), cloth.shirt), shoulder, (0, 0, -0.15 * s))
    elbow = pivot(f"{name}.elbow", (0.0, 0.0, -0.3 * s), shoulder)
    attach(cylinder(f"{name}.forearm", 0.04 * s, 0.28 * s, (0, 0, 0), cloth.skin), elbow, (0, 0, -0.14 * s))
    attach(sphere(f"{name}.hand", 0.045 * s, (0, 0, 0), cloth.skin), elbow, (0, 0, -0.3 * s))
    return Limb(hip, knee, shoulder, elbow)


def make_person(name: str, at: Vec3, outfit: Outfit) -> Person:
    s = outfit.height / 1.75
    cloth = dress(outfit)
    root = pivot(name, at)
    attach(box(f"{name}.pelvis", (0.34 * s, 0.2 * s, 0.2 * s), (0, 0, 0), cloth.trousers, 0.04), root, (0, 0, 0.95 * s))
    attach(box(f"{name}.torso", (0.4 * s, 0.22 * s, 0.56 * s), (0, 0, 0), cloth.shirt, 0.05), root, (0, 0, 1.2 * s))
    attach(cylinder(f"{name}.neck", 0.05 * s, 0.1 * s, (0, 0, 0), cloth.skin), root, (0, 0, 1.52 * s))
    attach(sphere(f"{name}.head", 0.11 * s, (0, 0, 0), cloth.skin, (0.9, 1.0, 1.15)), root, (0, 0, 1.64 * s))
    attach(sphere(f"{name}.hair", 0.115 * s, (0, 0, 0), cloth.hair, (0.92, 1.0, 1.0)), root, (0, -0.015 * s, 1.68 * s))
    return Person(
        name, root, make_limb(f"{name}.L", -1.0, root, cloth, s), make_limb(f"{name}.R", 1.0, root, cloth, s), s
    )
