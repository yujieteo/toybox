from dataclasses import dataclass

import bpy
from bpy.types import Material, Node, NodeSocket, NodeTree

from toybox.vec import Vec3

PATTERNS = ("plain", "noise", "bricks", "grain")


@dataclass(frozen=True)
class Surface:
    name: str
    color: tuple[float, float, float]
    roughness: float
    metallic: float = 0.0
    pattern: str = "noise"
    scale: float = 30.0
    bump: float = 0.3
    variation: float = 0.12
    glass: bool = False
    skin: bool = False


SURFACES = {
    "concrete": Surface("concrete", (0.52, 0.52, 0.5), 0.85, scale=40.0, bump=0.5),
    "asphalt": Surface("asphalt", (0.07, 0.07, 0.075), 0.92, scale=160.0, bump=0.8),
    "tile": Surface("tile", (0.78, 0.78, 0.74), 0.25, pattern="bricks", scale=3.0, bump=0.15),
    "brick": Surface("brick", (0.45, 0.16, 0.1), 0.8, pattern="bricks", scale=4.0, bump=0.6, variation=0.25),
    "metal": Surface("metal", (0.72, 0.74, 0.78), 0.32, metallic=1.0, scale=300.0, bump=0.05),
    "paint": Surface("paint", (0.6, 0.6, 0.6), 0.4, pattern="plain", bump=0.0, variation=0.0),
    "wood": Surface("wood", (0.4, 0.24, 0.12), 0.55, pattern="grain", scale=6.0, bump=0.2, variation=0.3),
    "fabric": Surface("fabric", (0.3, 0.3, 0.35), 0.92, scale=400.0, bump=0.6, variation=0.08),
    "grass": Surface("grass", (0.12, 0.3, 0.06), 0.9, scale=250.0, bump=1.0, variation=0.3),
    "skin": Surface("skin", (0.75, 0.5, 0.38), 0.55, pattern="plain", bump=0.0, variation=0.0, skin=True),
    "glass": Surface("glass", (0.9, 0.95, 1.0), 0.03, pattern="plain", bump=0.0, variation=0.0, glass=True),
}


def tinted(spec: Surface, color: Vec3 | None) -> tuple[float, float, float]:
    if color is None:
        return spec.color
    return (color[0], color[1], color[2])


def join(tree: NodeTree, source: NodeSocket, target: NodeSocket) -> None:
    _ = tree.links.new(source, target)


def linked(tree: NodeTree, kind: str, **inputs: float) -> Node:
    node = tree.nodes.new(kind)
    for name, value in inputs.items():
        node.inputs[name.replace("_", " ")].default_value = value
    return node


def pattern_node(tree: NodeTree, spec: Surface) -> Node:
    coords = tree.nodes.new("ShaderNodeTexCoord")
    if spec.pattern == "bricks":
        tex = linked(tree, "ShaderNodeTexBrick", Scale=spec.scale, Mortar_Size=0.015, Mortar_Smooth=0.1)
    elif spec.pattern == "grain":
        tex = linked(tree, "ShaderNodeTexWave", Scale=spec.scale, Distortion=8.0, Detail=4.0)
    else:
        tex = linked(tree, "ShaderNodeTexNoise", Scale=spec.scale, Detail=8.0, Roughness=0.6)
    join(tree, coords.outputs["Object"], tex.inputs["Vector"])
    return tex


def shade_color(tree: NodeTree, spec: Surface, base: tuple[float, float, float], tex: Node) -> Node:
    scaled = tree.nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    scaled.inputs[1].default_value = spec.variation
    join(tree, tex.outputs["Fac"], scaled.inputs[0])
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*base, 1.0)
    mix.inputs["B"].default_value = (base[0] * 0.3, base[1] * 0.3, base[2] * 0.3, 1.0)
    join(tree, scaled.outputs["Value"], mix.inputs["Factor"])
    return mix


def surface_nodes(tree: NodeTree, spec: Surface, base: tuple[float, float, float]) -> Node:
    bsdf = linked(tree, "ShaderNodeBsdfPrincipled", Roughness=spec.roughness, Metallic=spec.metallic)
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    if spec.glass:
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        bsdf.inputs["IOR"].default_value = 1.45
    if spec.skin:
        bsdf.inputs["Subsurface Weight"].default_value = 0.25
        bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
    if spec.pattern != "plain":
        decorate(tree, spec, bsdf, base)
    return bsdf


def decorate(tree: NodeTree, spec: Surface, bsdf: Node, base: tuple[float, float, float]) -> None:
    tex = pattern_node(tree, spec)
    if spec.variation > 0.0:
        mix = shade_color(tree, spec, base, tex)
        join(tree, mix.outputs["Result"], bsdf.inputs["Base Color"])
    if spec.bump > 0.0:
        bump = linked(tree, "ShaderNodeBump", Strength=spec.bump, Distance=0.02)
        join(tree, tex.outputs["Fac"], bump.inputs["Height"])
        join(tree, bump.outputs["Normal"], bsdf.inputs["Normal"])


def make_surface(kind: str, color: Vec3 | None = None, name: str = "") -> Material:
    spec = SURFACES[kind]
    material = bpy.data.materials.new(name or kind)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = surface_nodes(tree, spec, tinted(spec, color))
    join(tree, bsdf.outputs["BSDF"], out.inputs["Surface"])
    return material
