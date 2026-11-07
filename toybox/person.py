from dataclasses import dataclass

from bpy.types import Material, Object, PoseBone

from toybox.clothes import dress_mesh
from toybox.human import make_human
from toybox.materials import make_surface
from toybox.shoes import dress_feet
from toybox.vec import Vec3


@dataclass(frozen=True)
class Outfit:
    shirt: tuple[float, float, float] = (0.24, 0.065, 0.04)
    trousers: tuple[float, float, float] = (0.12, 0.14, 0.25)
    skin: tuple[float, float, float] = (0.32, 0.14, 0.075)
    hair: tuple[float, float, float] = (0.018, 0.01, 0.006)
    height: float = 1.75


@dataclass(frozen=True)
class Limb:
    hip: PoseBone
    knee: PoseBone
    shoulder: PoseBone
    elbow: PoseBone
    foot: PoseBone
    side: float


@dataclass(frozen=True)
class Person:
    name: str
    root: Object
    left: Limb
    right: Limb
    scale: float


def dress(outfit: Outfit) -> list[Material]:
    return [
        make_surface("skin", outfit.skin, "skin"),
        make_surface("fabric", outfit.shirt, "shirt"),
        make_surface("fabric", outfit.trousers, "trousers"),
        make_surface("leather", (0.055, 0.035, 0.022), "shoes"),
        make_surface("hair", outfit.hair, "hair"),
        make_surface("eye", (0.65, 0.63, 0.57), "eye"),
        make_surface("skin", (0.26, 0.085, 0.065), "lips"),
        make_surface("eye", (0.075, 0.033, 0.012), "iris"),
        make_surface("eye", (0.003, 0.002, 0.001), "pupil"),
        make_surface("paint", (0.012, 0.015, 0.017), "soles"),
    ]


def make_limb(root: Object, side: str) -> Limb:
    bones = root.pose.bones
    return Limb(
        bones[f"upperleg01.{side}"],
        bones[f"lowerleg01.{side}"],
        bones[f"upperarm01.{side}"],
        bones[f"lowerarm01.{side}"],
        bones[f"foot.{side}"],
        -1.0 if side == "L" else 1.0,
    )


def make_person(name: str, at: Vec3, outfit: Outfit) -> Person:
    dress_materials = dress(outfit)
    root, _ = make_human(name, at, outfit.height, dress_materials)
    dress_mesh(root, outfit.height, dress_materials)
    dress_feet(root, outfit.height, dress_materials[3], dress_materials[9])
    person = Person(name, root, make_limb(root, "L"), make_limb(root, "R"), outfit.height / 1.75)
    relax(person)
    return person


def relax(person: Person) -> None:
    for limb in (person.left, person.right):
        limb.shoulder.rotation_euler = (0.0, 0.0, limb.side * 0.60)
        limb.elbow.rotation_euler = (0.10, 0.0, 0.0)
    person.root.pose.bones["head"].rotation_euler = (0.018, 0.0, 0.0)
