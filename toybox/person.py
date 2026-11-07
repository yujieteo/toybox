from dataclasses import dataclass

from bpy.types import Material, Object, PoseBone

from toybox.human import make_human
from toybox.materials import make_surface
from toybox.vec import Vec3


@dataclass(frozen=True)
class Outfit:
    shirt: tuple[float, float, float] = (0.7, 0.12, 0.12)
    trousers: tuple[float, float, float] = (0.12, 0.14, 0.25)
    skin: tuple[float, float, float] = (0.46, 0.28, 0.2)
    hair: tuple[float, float, float] = (0.04, 0.03, 0.02)
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
        make_surface("paint", (0.05, 0.05, 0.05), "shoes"),
        make_surface("fabric", outfit.hair, "hair"),
        make_surface("paint", (0.9, 0.9, 0.88), "eye"),
        make_surface("skin", (0.62, 0.3, 0.28), "lips"),
        make_surface("paint", (0.12, 0.08, 0.05), "iris"),
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
    root, _ = make_human(name, at, outfit.height, dress(outfit))
    return Person(name, root, make_limb(root, "L"), make_limb(root, "R"), outfit.height / 1.75)
