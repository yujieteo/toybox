from collections.abc import Sequence
from typing import final

from mathutils import Vector

from bpy.types import DataBase, Object

def _drivers_len(self: Drivers) -> int: ...

@final
class Drivers:
    __len__ = _drivers_len

class Keyframe:
    co: Vector
    interpolation: str

class FCurve:
    keyframe_points: Sequence[Keyframe]

def _action_fcurve_ensure_for_datablock(
    self: Action, datablock: Object, data_path: str, *, index: int = ...
) -> FCurve: ...

@final
class Action:
    fcurve_ensure_for_datablock = _action_fcurve_ensure_for_datablock

@final
class AnimationData:
    drivers: Drivers
    action: Action | None

class Constraint:
    target: Object
    track_axis: str
    up_axis: str

def _constraints_new(self: Constraints, constraint_type: str) -> Constraint: ...

@final
class Constraints:
    new = _constraints_new

class CameraDOF:
    use_dof: bool
    aperture_fstop: float
    focus_object: Object

@final
class Camera(DataBase):
    sensor_fit: str
    sensor_width: float
    dof: CameraDOF
