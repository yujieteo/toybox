from typing import TypedDict, Unpack, final

from mathutils import Floats

class LightArgs(TypedDict):
    type: str
    location: Floats

def _objectops_shade_smooth(self: ObjectOps) -> None: ...
def _objectops_transform_apply(
    self: ObjectOps, *, location: bool = ..., rotation: bool = ..., scale: bool = ...
) -> None: ...
def _objectops_camera_add(self: ObjectOps, *, location: Floats = ...) -> None: ...
def _objectops_light_add(self: ObjectOps, **kw: Unpack[LightArgs]) -> None: ...

@final
class ObjectOps:
    shade_smooth = _objectops_shade_smooth
    transform_apply = _objectops_transform_apply
    camera_add = _objectops_camera_add
    light_add = _objectops_light_add

def _meshops_primitive_cylinder_add(
    self: MeshOps, *, vertices: int = ..., radius: float = ..., depth: float = ..., location: Floats = ...
) -> None: ...
def _meshops_primitive_cone_add(
    self: MeshOps,
    *,
    vertices: int = ...,
    radius1: float = ...,
    radius2: float = ...,
    depth: float = ...,
    location: Floats = ...,
) -> None: ...
def _meshops_primitive_uv_sphere_add(
    self: MeshOps, *, segments: int = ..., ring_count: int = ..., radius: float = ..., location: Floats = ...
) -> None: ...
def _meshops_primitive_cube_add(
    self: MeshOps, *, size: float = ..., location: Floats = ..., rotation: Floats = ...
) -> None: ...
def _meshops_primitive_plane_add(self: MeshOps, *, size: float = ..., location: Floats = ...) -> None: ...
def _meshops_primitive_torus_add(
    self: MeshOps,
    *,
    location: Floats = ...,
    rotation: Floats = ...,
    major_radius: float = ...,
    minor_radius: float = ...,
    major_segments: int = ...,
    minor_segments: int = ...,
) -> None: ...

@final
class MeshOps:
    primitive_cylinder_add = _meshops_primitive_cylinder_add
    primitive_cone_add = _meshops_primitive_cone_add
    primitive_uv_sphere_add = _meshops_primitive_uv_sphere_add
    primitive_cube_add = _meshops_primitive_cube_add
    primitive_plane_add = _meshops_primitive_plane_add
    primitive_torus_add = _meshops_primitive_torus_add

def _renderops_render(self: RenderOps, *, write_still: bool = ..., animation: bool = ..., scene: str = ...) -> None: ...

@final
class RenderOps:
    render = _renderops_render

def _wmops_read_factory_settings(self: WmOps, *, use_empty: bool = ...) -> None: ...
def _wmops_save_as_mainfile(self: WmOps, *, filepath: str, compress: bool = ...) -> None: ...
def _wmops_open_mainfile(self: WmOps, *, filepath: str) -> None: ...

@final
class WmOps:
    read_factory_settings = _wmops_read_factory_settings
    save_as_mainfile = _wmops_save_as_mainfile
    open_mainfile = _wmops_open_mainfile

class Ops:
    object: ObjectOps
    mesh: MeshOps
    render: RenderOps
    wm: WmOps
