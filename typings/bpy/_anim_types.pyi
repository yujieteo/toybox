from typing import final

from bpy.types import DataBase, Object

def _drivers_len(self: Drivers) -> int: ...

@final
class Drivers:
    __len__ = _drivers_len

@final
class AnimationData:
    drivers: Drivers

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
