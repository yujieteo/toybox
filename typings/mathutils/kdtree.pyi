from collections.abc import Sequence
from typing import final

from mathutils import Vector

def _kdtree_init(self: KDTree, size: int = ...) -> None: ...
def _kdtree_insert(self: KDTree, co: Vector, index: int) -> None: ...
def _kdtree_balance(self: KDTree) -> None: ...
def _kdtree_find_range(self: KDTree, co: Vector, radius: float) -> Sequence[tuple[Vector, int, float]]: ...

@final
class KDTree:
    __init__ = _kdtree_init
    insert = _kdtree_insert
    balance = _kdtree_balance
    find_range = _kdtree_find_range
