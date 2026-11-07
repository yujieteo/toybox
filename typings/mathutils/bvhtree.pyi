from typing import final

from bpy.types import Depsgraph, Object
from mathutils import Vector


def _from_object(obj: Object, depsgraph: Depsgraph, *, deform: bool = True) -> BVHTree: ...
def _ray_cast(self: BVHTree, origin: Vector, direction: Vector, distance: float) -> tuple[Vector | None, Vector | None, int | None, float | None]: ...


@final
class BVHTree:
    FromObject = staticmethod(_from_object)
    ray_cast = _ray_cast
