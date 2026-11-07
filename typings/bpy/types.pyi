from collections.abc import Iterator, Sequence
from typing import final

import numpy as np
from bpy._anim_types import AnimationData as AnimationData
from bpy._anim_types import Camera as Camera
from bpy._anim_types import Constraints as Constraints
from bpy._scene_types import Collection as Collection
from bpy._scene_types import CyclesPreferences as CyclesPreferences
from bpy._scene_types import CyclesSettings as CyclesSettings
from bpy._scene_types import FreestyleLineStyle as FreestyleLineStyle
from bpy._scene_types import FreestyleSettings as FreestyleSettings
from bpy._scene_types import Image as Image
from bpy._scene_types import Scene as Scene
from bpy._scene_types import Strip as Strip
from bpy._scene_types import TextStrip as TextStrip
from bpy._scene_types import World as World
from bpy._rig_types import EditBone as EditBone, Pose, PoseBone as PoseBone, VertexGroups
from mathutils import Floats, Matrix, Quaternion, Vec3

def _coll_iter[T](self: Coll[T]) -> Iterator[T]: ...
def _coll_len[T](self: Coll[T]) -> int: ...
def _coll_contains[T](self: Coll[T], name: str) -> bool: ...
def _coll_getitem[T](self: Coll[T], key: str | int) -> T: ...
def _coll_get[T](self: Coll[T], name: str) -> T | None: ...
def _coll_new[T](self: Coll[T], name: str) -> T: ...
def _coll_remove[T](self: Coll[T], item: T) -> None: ...

@final
class Coll[T]:
    __iter__ = _coll_iter
    __len__ = _coll_len
    __contains__ = _coll_contains
    __getitem__ = _coll_getitem
    get = _coll_get
    new = _coll_new
    remove = _coll_remove

def _foreachcoll_iter[T](self: ForeachColl[T]) -> Iterator[T]: ...
def _foreachcoll_len[T](self: ForeachColl[T]) -> int: ...
def _foreachcoll_contains[T](self: ForeachColl[T], name: str) -> bool: ...
def _foreachcoll_getitem[T](self: ForeachColl[T], key: str | int) -> T: ...
def _foreachcoll_get[T](self: ForeachColl[T], name: str) -> T | None: ...
def _foreachcoll_new[T](self: ForeachColl[T], name: str) -> T: ...
def _foreachcoll_remove[T](self: ForeachColl[T], item: T) -> None: ...
def _foreachcoll_foreach_get[T](self: ForeachColl[T], attr: str, array: np.ndarray) -> None: ...
def _foreachcoll_foreach_set[T](self: ForeachColl[T], attr: str, array: np.ndarray | Sequence[float]) -> None: ...

@final
class ForeachColl[T]:
    __iter__ = _foreachcoll_iter
    __len__ = _foreachcoll_len
    __contains__ = _foreachcoll_contains
    __getitem__ = _foreachcoll_getitem
    get = _foreachcoll_get
    new = _foreachcoll_new
    remove = _foreachcoll_remove
    foreach_get = _foreachcoll_foreach_get
    foreach_set = _foreachcoll_foreach_set

class Depsgraph: ...

class ColorRampElement:
    color: Sequence[float]
    position: float

def _crelements_new(self: ColorRampElements, position: float) -> ColorRampElement: ...
def _crelements_iter(self: ColorRampElements) -> Iterator[ColorRampElement]: ...
def _crelements_len(self: ColorRampElements) -> int: ...
def _crelements_getitem(self: ColorRampElements, index: int) -> ColorRampElement: ...

@final
class ColorRampElements:
    new = _crelements_new
    __iter__ = _crelements_iter
    __len__ = _crelements_len
    __getitem__ = _crelements_getitem

class ColorRamp:
    elements: ColorRampElements
    interpolation: str

class NodeLink:
    from_node: Node
    from_socket: NodeSocket

class NodeSocket:
    name: str
    type: str
    is_linked: bool
    links: Sequence[NodeLink]
    default_value: float | Sequence[float]

def _nodesockets_iter(self: NodeSockets) -> Iterator[NodeSocket]: ...
def _nodesockets_getitem(self: NodeSockets, key: str | int) -> NodeSocket: ...

@final
class NodeSockets:
    __iter__ = _nodesockets_iter
    __getitem__ = _nodesockets_getitem

class Node:
    name: str
    bl_idname: str
    inputs: NodeSockets
    outputs: NodeSockets
    id_data: NodeTree
    node_tree: NodeTree
    operation: str
    blend_type: str
    data_type: str
    color_ramp: ColorRamp
    layer_name: str
    attribute_name: str
    clamp_factor: bool
    subsurface_method: str
    sky_type: str
    sun_elevation: float
    sun_rotation: float

def _nodes_new(self: Nodes, node_type: str) -> Node: ...
def _nodes_clear(self: Nodes) -> None: ...
def _nodes_getitem(self: Nodes, key: str) -> Node: ...

@final
class Nodes:
    new = _nodes_new
    clear = _nodes_clear
    __getitem__ = _nodes_getitem

def _nodelinks_new(self: NodeLinks, a: NodeSocket, b: NodeSocket) -> NodeLink: ...
def _nodelinks_remove(self: NodeLinks, link: NodeLink) -> None: ...

@final
class NodeLinks:
    new = _nodelinks_new
    remove = _nodelinks_remove

def _interface_new_socket(self: Interface, name: str, *, in_out: str, socket_type: str) -> object: ...

@final
class Interface:
    new_socket = _interface_new_socket

def _nodetree_get_output_node(self: NodeTree, target: str) -> Node | None: ...

@final
class NodeTree:
    nodes: Nodes
    links: NodeLinks
    interface: Interface
    get_output_node = _nodetree_get_output_node

def _material_get(self: Material, key: str) -> object: ...
def _material_setitem(self: Material, key: str, value: int) -> None: ...

@final
class Material:
    name: str
    use_nodes: bool
    node_tree: NodeTree
    line_color: Sequence[float]
    get = _material_get
    __setitem__ = _material_setitem

class MaterialSlot:
    material: Material

def _materiallist_append(self: MaterialList, material: Material) -> None: ...

@final
class MaterialList:
    append = _materiallist_append

class Modifier:
    width: float
    harden_normals: bool
    segments: int
    operation: str
    solver: str
    object: Object
    material_mode: str
    limit_method: str
    angle_limit: float
    levels: int
    render_levels: int
    mode: str
    voxel_size: float
    use_smooth_shade: bool
    factor: float
    iterations: int
    use_clamp_overlap: bool

def _modifiers_new(self: Modifiers, name: str, modifier_type: str) -> Modifier: ...

@final
class Modifiers:
    new = _modifiers_new

class BezierPoint:
    co: Floats
    handle_left_type: str
    handle_right_type: str
    radius: float

def _bezierpoints_add(self: BezierPoints, count: int) -> None: ...
def _bezierpoints_iter(self: BezierPoints) -> Iterator[BezierPoint]: ...

@final
class BezierPoints:
    add = _bezierpoints_add
    __iter__ = _bezierpoints_iter

class Spline:
    use_cyclic_u: bool
    bezier_points: BezierPoints

def _splines_new(self: Splines, spline_type: str) -> Spline: ...

@final
class Splines:
    new = _splines_new

class Polygon:
    use_smooth: bool
    material_index: int

class Vertex:
    co: Sequence[float]

def _data_shade_smooth(self: DataBase) -> None: ...
def _data_set_sharp_from_angle(self: DataBase, *, angle: float) -> None: ...

class DataBase:
    edit_bones: Coll[EditBone]
    materials: MaterialList
    type: str
    ortho_scale: float
    lens: float
    energy: float
    size: float
    angle: float
    use_shadow: bool
    dimensions: str
    bevel_depth: float
    bevel_resolution: int
    resolution_u: int
    splines: Splines

class AttributeValue:
    value: float

class Attribute:
    data: ForeachColl[AttributeValue]

def _attributes_new(self: Attributes, name: str, attr_type: str, domain: str) -> Attribute: ...

@final
class Attributes:
    new = _attributes_new

class ColorAttribute:
    data: Sequence[ColorAttributeValue]

class ColorAttributeValue:
    color: Sequence[float]

def _mesh_calc_loop_triangles(self: Mesh) -> None: ...
def _mesh_from_pydata(
    self: Mesh, vertices: Sequence[Sequence[float]], edges: Sequence[Sequence[int]], faces: Sequence[Sequence[int]]
) -> None: ...
def _mesh_update(self: Mesh) -> None: ...

@final
class Mesh(DataBase):
    polygons: ForeachColl[Polygon]
    attributes: Attributes
    vertices: ForeachColl[Vertex]
    edges: Coll[object]
    loops: ForeachColl[object]
    loop_triangles: ForeachColl[object]
    color_attributes: Coll[ColorAttribute]
    calc_loop_triangles = _mesh_calc_loop_triangles
    from_pydata = _mesh_from_pydata
    update = _mesh_update
    shade_smooth = _data_shade_smooth
    set_sharp_from_angle = _data_set_sharp_from_angle

@final
class Curve(DataBase):
    use_fill_caps: bool
    shade_smooth = _data_shade_smooth
    set_sharp_from_angle = _data_set_sharp_from_angle

@final
class Light(DataBase):
    shade_smooth = _data_shade_smooth
    set_sharp_from_angle = _data_set_sharp_from_angle

@final
class Armature(DataBase): ...

type ObjectData = Mesh | Curve | Light | Camera | Armature

def _object_keyframe_insert(self: Object, data_path: str, *, frame: float) -> None: ...
def _object_evaluated_get(self: Object, depsgraph: Depsgraph) -> Object: ...
def _object_to_mesh(self: Object) -> Mesh: ...
def _object_to_mesh_clear(self: Object) -> None: ...

@final
class Object:
    name: str
    type: str
    data: ObjectData
    matrix_world: Matrix
    bound_box: Sequence[Sequence[float]]
    scale: Vec3
    rotation_mode: str
    parent: Object | None
    display_type: str
    rotation_quaternion: Quaternion
    rotation_euler: Vec3
    modifiers: Modifiers
    material_slots: Sequence[MaterialSlot]
    is_shadow_catcher: bool
    hide_viewport: bool
    hide_render: bool
    visible_shadow: bool
    visible_glossy: bool
    location: Vec3
    color: Sequence[float]
    animation_data: AnimationData | None
    constraints: Constraints
    pose: Pose
    vertex_groups: VertexGroups
    keyframe_insert = _object_keyframe_insert
    evaluated_get = _object_evaluated_get
    to_mesh = _object_to_mesh
    to_mesh_clear = _object_to_mesh_clear
