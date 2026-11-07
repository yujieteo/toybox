from collections.abc import Iterator
from typing import final

from bpy import types as types
from bpy._ops import Ops
from bpy._scene_types import Collection, CyclesPreferences, FreestyleLineStyle, Image, Scene, ViewLayer, World
from bpy.types import Camera, Coll, Curve, Depsgraph, Light, Material, Mesh, NodeTree, Object, ObjectData

def _curves_new(self: _Curves, name: str, curve_type: str) -> Curve: ...

def _curves_iter(self: _Curves) -> Iterator[Curve]: ...
def _curves_len(self: _Curves) -> int: ...
def _curves_contains(self: _Curves, name: str) -> bool: ...
def _curves_getitem(self: _Curves, key: str | int) -> Curve: ...
def _curves_get(self: _Curves, name: str) -> Curve | None: ...
def _curves_remove(self: _Curves, item: Curve) -> None: ...

@final
class _Curves:
    __iter__ = _curves_iter
    __len__ = _curves_len
    __contains__ = _curves_contains
    __getitem__ = _curves_getitem
    get = _curves_get
    remove = _curves_remove
    new = _curves_new

def _objects_new(self: _Objects, name: str, object_data: ObjectData | None) -> Object: ...

def _objects_iter(self: _Objects) -> Iterator[Object]: ...
def _objects_len(self: _Objects) -> int: ...
def _objects_contains(self: _Objects, name: str) -> bool: ...
def _objects_getitem(self: _Objects, key: str | int) -> Object: ...
def _objects_get(self: _Objects, name: str) -> Object | None: ...
def _objects_remove(self: _Objects, item: Object) -> None: ...

@final
class _Objects:
    __iter__ = _objects_iter
    __len__ = _objects_len
    __contains__ = _objects_contains
    __getitem__ = _objects_getitem
    get = _objects_get
    remove = _objects_remove
    new = _objects_new

def _nodegroups_new(self: _NodeGroups, name: str, tree_type: str) -> NodeTree: ...

def _nodegroups_iter(self: _NodeGroups) -> Iterator[NodeTree]: ...
def _nodegroups_len(self: _NodeGroups) -> int: ...
def _nodegroups_contains(self: _NodeGroups, name: str) -> bool: ...
def _nodegroups_getitem(self: _NodeGroups, key: str | int) -> NodeTree: ...
def _nodegroups_get(self: _NodeGroups, name: str) -> NodeTree | None: ...
def _nodegroups_remove(self: _NodeGroups, item: NodeTree) -> None: ...

@final
class _NodeGroups:
    __iter__ = _nodegroups_iter
    __len__ = _nodegroups_len
    __contains__ = _nodegroups_contains
    __getitem__ = _nodegroups_getitem
    get = _nodegroups_get
    remove = _nodegroups_remove
    new = _nodegroups_new

def _images_load(self: _Images, filepath: str, *, check_existing: bool = ...) -> Image: ...
def _images_new(self: _Images, name: str, width: int, height: int, *, alpha: bool = ...) -> Image: ...

def _images_iter(self: _Images) -> Iterator[Image]: ...
def _images_len(self: _Images) -> int: ...
def _images_contains(self: _Images, name: str) -> bool: ...
def _images_getitem(self: _Images, key: str | int) -> Image: ...
def _images_get(self: _Images, name: str) -> Image | None: ...
def _images_remove(self: _Images, item: Image) -> None: ...

@final
class _Images:
    __iter__ = _images_iter
    __len__ = _images_len
    __contains__ = _images_contains
    __getitem__ = _images_getitem
    get = _images_get
    remove = _images_remove
    load = _images_load
    new = _images_new

class _Addon:
    preferences: CyclesPreferences

def _addons_getitem(self: _Addons, name: str) -> _Addon: ...

@final
class _Addons:
    __getitem__ = _addons_getitem

class _Preferences:
    addons: _Addons
    edit: _KeyframeEdit

def _lights_new(self: _Lights, name: str, light_type: str) -> Light: ...

@final
class _Lights:
    new = _lights_new

def _scenes_new(self: _Scenes, name: str) -> Scene: ...
def _scenes_getitem(self: _Scenes, name: str) -> Scene: ...

@final
class _Scenes:
    new = _scenes_new
    __getitem__ = _scenes_getitem

class _Window:
    scene: Scene

class _KeyframeEdit:
    keyframe_new_interpolation_type: str

class _Handlers:
    frame_change_pre: list[object]
    frame_change_post: list[object]

@final
class _App:
    handlers: _Handlers

app: _App

def _context_evaluated_depsgraph_get(self: _Context) -> Depsgraph: ...

@final
class _Context:
    object: Object
    scene: Scene
    window: _Window
    collection: Collection
    view_layer: ViewLayer
    preferences: _Preferences
    evaluated_depsgraph_get = _context_evaluated_depsgraph_get

class _Data:
    materials: Coll[Material]
    meshes: Coll[Mesh]
    worlds: Coll[World]
    collections: Coll[Collection]
    linestyles: Coll[FreestyleLineStyle]
    curves: _Curves
    objects: _Objects
    node_groups: _NodeGroups
    images: _Images
    scenes: _Scenes
    cameras: Coll[Camera]
    lights: _Lights

data: _Data

context: _Context

ops: Ops
