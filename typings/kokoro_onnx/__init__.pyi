from typing import final

from numpy import Ndarray

def _kokoro_init(self: Kokoro, model_path: str = ..., voices_path: str = ...) -> None: ...
def _kokoro_create(self: Kokoro, text: str, voice: str, speed: float, lang: str) -> tuple[Ndarray, int]: ...

@final
class Kokoro:
    __init__ = _kokoro_init
    create = _kokoro_create
