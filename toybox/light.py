import math

import bpy
from bpy.types import Object, Scene

from toybox.materials import join
from toybox.vec import Vec3


def sky(scene: Scene, elevation: float, rotation: float, strength: float) -> None:
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    texture = tree.nodes.new("ShaderNodeTexSky")
    texture.sky_type = "MULTIPLE_SCATTERING"
    texture.sun_elevation = math.radians(elevation)
    texture.sun_rotation = math.radians(rotation)
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = strength
    out = tree.nodes.new("ShaderNodeOutputWorld")
    join(tree, texture.outputs["Color"], background.inputs["Color"])
    join(tree, background.outputs["Background"], out.inputs["Surface"])
    scene.world = world


def ambient(scene: Scene, color: Vec3, strength: float) -> None:
    world = bpy.data.worlds.new("ambient")
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (*color, 1.0)
    background.inputs["Strength"].default_value = strength
    out = tree.nodes.new("ShaderNodeOutputWorld")
    join(tree, background.outputs["Background"], out.inputs["Surface"])
    scene.world = world


def area(scene: Scene, name: str, at: Vec3, power: float, size: float) -> Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.size = size
    lamp = bpy.data.objects.new(name, data)
    scene.collection.objects.link(lamp)
    lamp.location = at
    lamp.rotation_euler = (math.pi, 0.0, 0.0)
    return lamp
