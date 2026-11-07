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
    upright: bool = False


SURFACES = {
    "concrete": Surface("concrete", (0.52, 0.52, 0.5), 0.85, scale=40.0, bump=0.5),
    "asphalt": Surface("asphalt", (0.07, 0.07, 0.075), 0.92, scale=160.0, bump=0.8),
    "tile": Surface("tile", (0.78, 0.78, 0.74), 0.25, pattern="bricks", scale=3.0, bump=0.15),
    "brick": Surface(
        "brick", (0.45, 0.16, 0.1), 0.8, pattern="bricks", scale=1.5, bump=0.6, variation=0.25, upright=True
    ),
    "metal": Surface("metal", (0.72, 0.74, 0.78), 0.32, metallic=1.0, scale=300.0, bump=0.05),
    "paint": Surface("paint", (0.6, 0.6, 0.6), 0.4, pattern="plain", bump=0.0, variation=0.0),
    "wood": Surface("wood", (0.4, 0.24, 0.12), 0.55, pattern="grain", scale=6.0, bump=0.2, variation=0.3),
    "fabric": Surface("fabric", (0.3, 0.3, 0.35), 0.92, scale=400.0, bump=0.6, variation=0.08),
    "grass": Surface("grass", (0.12, 0.3, 0.06), 0.9, scale=250.0, bump=1.0, variation=0.3),
    "skin": Surface("skin", (0.46, 0.28, 0.2), 0.55, pattern="plain", bump=0.0, variation=0.0, skin=True),
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


def wall_coords(tree: NodeTree, coords: Node, spec: Surface) -> NodeSocket:
    if spec.pattern != "bricks" or not spec.upright:
        return coords.outputs["Object"]
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    along = tree.nodes.new("ShaderNodeMath")
    along.operation = "ADD"
    join(tree, coords.outputs["Object"], split.inputs["Vector"])
    join(tree, split.outputs["X"], along.inputs[0])
    join(tree, split.outputs["Y"], along.inputs[1])
    combine = tree.nodes.new("ShaderNodeCombineXYZ")
    join(tree, along.outputs["Value"], combine.inputs["X"])
    join(tree, split.outputs["Z"], combine.inputs["Y"])
    return combine.outputs["Vector"]


def pattern_node(tree: NodeTree, spec: Surface, base: tuple[float, float, float]) -> Node:
    coords = tree.nodes.new("ShaderNodeTexCoord")
    if spec.pattern == "bricks":
        tex = linked(tree, "ShaderNodeTexBrick", Scale=spec.scale, Mortar_Size=0.02, Mortar_Smooth=0.15, Bias=0.0)
        tex.inputs["Color1"].default_value = (*base, 1.0)
        tex.inputs["Color2"].default_value = (base[0] * 0.7, base[1] * 0.7, base[2] * 0.7, 1.0)
        tex.inputs["Mortar"].default_value = (0.55, 0.53, 0.5, 1.0)
    elif spec.pattern == "grain":
        tex = linked(tree, "ShaderNodeTexWave", Scale=spec.scale, Distortion=8.0, Detail=4.0)
    else:
        tex = linked(tree, "ShaderNodeTexNoise", Scale=spec.scale, Detail=8.0, Roughness=0.6)
    join(tree, wall_coords(tree, coords, spec), tex.inputs["Vector"])
    return tex


def grime_node(tree: NodeTree, spec: Surface) -> Node:
    coords = tree.nodes.new("ShaderNodeTexCoord")
    noise = linked(tree, "ShaderNodeTexNoise", Scale=2.2 + spec.scale * 0.02, Detail=10.0, Roughness=0.7)
    join(tree, coords.outputs["Object"], noise.inputs["Vector"])
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.45, 0.43, 0.4, 1.0)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    join(tree, noise.outputs["Fac"], ramp.inputs["Fac"])
    return ramp


def weathered(tree: NodeTree, spec: Surface, tex: Node, base: tuple[float, float, float]) -> Node:
    source = tex.outputs["Color"] if spec.pattern == "bricks" else None
    scaled = tree.nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    scaled.inputs[1].default_value = spec.variation
    join(tree, tex.outputs["Fac"], scaled.inputs[0])
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*base, 1.0)
    mix.inputs["B"].default_value = (base[0] * 0.3, base[1] * 0.3, base[2] * 0.3, 1.0)
    join(tree, scaled.outputs["Value"], mix.inputs["Factor"])
    if source is not None:
        join(tree, source, mix.inputs["A"])
        mix.inputs["Factor"].default_value = 0.0
    return mix


def dirt(tree: NodeTree, color: Node, grime: Node) -> Node:
    layer = tree.nodes.new("ShaderNodeMix")
    layer.data_type = "RGBA"
    layer.blend_type = "MULTIPLY"
    layer.inputs["Factor"].default_value = 0.8
    join(tree, color.outputs["Result"], layer.inputs["A"])
    join(tree, grime.outputs["Color"], layer.inputs["B"])
    return layer


def roughness_from(tree: NodeTree, spec: Surface, grime: Node) -> Node:
    ranged = tree.nodes.new("ShaderNodeMapRange")
    ranged.inputs["To Min"].default_value = max(0.0, spec.roughness * 0.65)
    ranged.inputs["To Max"].default_value = min(1.0, spec.roughness * 1.25)
    join(tree, grime.outputs["Color"], ranged.inputs["Value"])
    return ranged


def surface_nodes(tree: NodeTree, spec: Surface, base: tuple[float, float, float]) -> Node:
    bsdf = linked(tree, "ShaderNodeBsdfPrincipled", Roughness=spec.roughness, Metallic=spec.metallic)
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    if spec.glass:
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        bsdf.inputs["IOR"].default_value = 1.45
    if spec.skin:
        bsdf.inputs["Subsurface Weight"].default_value = 0.0
        bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
    if spec.pattern != "plain":
        decorate(tree, spec, bsdf, base)
    return bsdf


def decorate(tree: NodeTree, spec: Surface, bsdf: Node, base: tuple[float, float, float]) -> None:
    tex = pattern_node(tree, spec, base)
    grime = grime_node(tree, spec)
    color = dirt(tree, weathered(tree, spec, tex, base), grime)
    join(tree, color.outputs["Result"], bsdf.inputs["Base Color"])
    join(tree, roughness_from(tree, spec, grime).outputs["Result"], bsdf.inputs["Roughness"])
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
