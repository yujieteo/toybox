from collections.abc import Sequence
from typing import final

from bpy.types import Coll
from mathutils import Matrix, Vector, Vec3

def _bone_keyframe_insert(self: PoseBone, data_path: str, *, frame: float) -> None: ...

@final
class PoseBone:
    name: str
    rotation_mode: str
    rotation_euler: Vec3
    head: Vector
    matrix: Matrix
    keyframe_insert = _bone_keyframe_insert

@final
class EditBone:
    name: str
    head: Vec3
    tail: Vec3
    roll: float
    parent: EditBone | None
    use_connect: bool

@final
class Pose:
    bones: Coll[PoseBone]

def _group_add(self: VertexGroup, index: Sequence[int], weight: float, kind: str) -> None: ...

@final
class VertexGroup:
    add = _group_add

def _groups_new(self: VertexGroups, *, name: str) -> VertexGroup: ...

@final
class VertexGroups:
    new = _groups_new
