from typing import final, overload

from numpy import ndarray

type Shape = int | tuple[int, ...]

@overload
def _generator_normal(self: Generator) -> float: ...
@overload
def _generator_normal(self: Generator, *, size: Shape) -> ndarray: ...
@overload
def _generator_uniform(self: Generator, low: float = ..., high: float = ...) -> float: ...
@overload
def _generator_uniform(self: Generator, low: float, high: float, size: Shape) -> ndarray: ...
@overload
def _generator_integers(self: Generator, low: int, high: int | None = ...) -> int: ...
@overload
def _generator_integers(self: Generator, low: int, high: int | None, size: Shape) -> ndarray: ...
def _generator_permutation(self: Generator, n: int) -> ndarray: ...

@final
class Generator:
    normal = _generator_normal
    uniform = _generator_uniform
    integers = _generator_integers
    permutation = _generator_permutation

def default_rng(seed: int | None = ...) -> Generator: ...
