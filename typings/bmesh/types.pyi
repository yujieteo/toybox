from collections.abc import Iterator, Sequence
from typing import final

from bpy.types import Mesh
from mathutils import Floats, Vector

class BMLayerItem: ...

def _layerint_new(self: BMLayerInt, name: str) -> BMLayerItem: ...
def _layerint_getitem(self: BMLayerInt, name: str) -> BMLayerItem: ...

@final
class BMLayerInt:
    new = _layerint_new
    __getitem__ = _layerint_getitem

def _layerfloat_new(self: BMLayerFloat, name: str) -> BMLayerItem: ...
def _layerfloat_getitem(self: BMLayerFloat, name: str) -> BMLayerItem: ...

@final
class BMLayerFloat:
    new = _layerfloat_new
    __getitem__ = _layerfloat_getitem

def _layerfc_new(self: BMLayerFloatColor, name: str) -> BMLayerItem: ...
def _layerfc_getitem(self: BMLayerFloatColor, name: str) -> BMLayerItem: ...

@final
class BMLayerFloatColor:
    new = _layerfc_new
    __getitem__ = _layerfc_getitem

@final
class BMLayerCollection:
    int: BMLayerInt
    float: BMLayerFloat
    float_color: BMLayerFloatColor

def _vert_setitem(self: BMVert, layer: BMLayerItem, value: float) -> None: ...

@final
class BMVert:
    co: Vector
    index: int
    __setitem__ = _vert_setitem

def _vertseq_new(self: BMVertSeq, co: Floats = ...) -> BMVert: ...
def _vertseq_iter(self: BMVertSeq) -> Iterator[BMVert]: ...
def _vertseq_len(self: BMVertSeq) -> int: ...

@final
class BMVertSeq:
    layers: BMLayerCollection
    new = _vertseq_new
    __iter__ = _vertseq_iter
    __len__ = _vertseq_len

def _edge_calc_face_angle(self: BMEdge, fallback: float = ...) -> float: ...

@final
class BMEdge:
    is_boundary: bool
    smooth: bool
    link_faces: Sequence[BMFace]
    calc_face_angle = _edge_calc_face_angle

def _edgeseq_iter(self: BMEdgeSeq) -> Iterator[BMEdge]: ...

@final
class BMEdgeSeq:
    __iter__ = _edgeseq_iter

def _face_calc_area(self: BMFace) -> float: ...
def _face_calc_center_median(self: BMFace) -> Vector: ...
def _face_getitem(self: BMFace, layer: BMLayerItem) -> int: ...
def _face_setitem(self: BMFace, layer: BMLayerItem, value: int) -> None: ...
def _loop_setitem(self: BMLoop, layer: BMLayerItem, value: Sequence[float]) -> None: ...

@final
class BMLoop:
    __setitem__ = _loop_setitem

@final
class BMLoopSeq:
    layers: BMLayerCollection

@final
class BMFace:
    material_index: int
    loops: Sequence[BMLoop]
    normal: Vector
    verts: Sequence[BMVert]
    calc_area = _face_calc_area
    calc_center_median = _face_calc_center_median
    __getitem__ = _face_getitem
    __setitem__ = _face_setitem

def _faceseq_new(self: BMFaceSeq, verts: Sequence[BMVert]) -> BMFace: ...
def _faceseq_iter(self: BMFaceSeq) -> Iterator[BMFace]: ...
def _faceseq_len(self: BMFaceSeq) -> int: ...
def _faceseq_getitem(self: BMFaceSeq, key: slice) -> list[BMFace]: ...
def _faceseq_ensure_lookup_table(self: BMFaceSeq) -> None: ...

@final
class BMFaceSeq:
    layers: BMLayerCollection
    new = _faceseq_new
    ensure_lookup_table = _faceseq_ensure_lookup_table
    __iter__ = _faceseq_iter
    __len__ = _faceseq_len
    __getitem__ = _faceseq_getitem

def _bmesh_to_mesh(self: BMesh, mesh: Mesh) -> None: ...
def _bmesh_from_mesh(self: BMesh, mesh: Mesh) -> None: ...
def _bmesh_free(self: BMesh) -> None: ...
def _bmesh_normal_update(self: BMesh) -> None: ...

@final
class BMesh:
    verts: BMVertSeq
    edges: BMEdgeSeq
    faces: BMFaceSeq
    loops: BMLoopSeq
    normal_update = _bmesh_normal_update
    to_mesh = _bmesh_to_mesh
    from_mesh = _bmesh_from_mesh
    free = _bmesh_free
