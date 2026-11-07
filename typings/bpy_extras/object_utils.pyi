from bpy.types import Object, Scene
from mathutils import Vector

def world_to_camera_view(scene: Scene, obj: Object, coord: Vector) -> Vector: ...
