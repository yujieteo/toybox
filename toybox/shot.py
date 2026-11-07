import importlib.util
from pathlib import Path
from typing import Protocol, final

from toybox.stage import Stage


def shot_signature(_module: "ShotModule", _stage: Stage, /) -> None: ...


@final
class ShotModule(Protocol):
    shot = shot_signature


def load_shot(path: Path) -> ShotModule:
    spec = importlib.util.spec_from_file_location(f"shot_{path.parent.name}", path)
    if spec is None or spec.loader is None:
        message = f"cannot load {path}"
        raise ImportError(message)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
