import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from toybox import voice_env
from toybox.formats import FORMATS, QUALITIES
from toybox.say import say

MIN_WORDS = 2
ROOT = Path(__file__).resolve().parent.parent
USAGE = (
    "usage: python -m toybox voice VIDEO_DIR\n"
    "       python -m toybox render VIDEO_DIR [--format landscape|portrait|both] [--quality draft|preview|final]\n"
    "                                    [--device cpu|metal|cuda|optix] [--still FRAME] [--first N] [--last N]\n"
    "       python -m toybox make VIDEO_DIR\n"
)


@dataclass(frozen=True)
class Request:
    command: str
    name: str
    options: dict[str, str]


def parse(argv: list[str]) -> Request | None:
    if len(argv) < MIN_WORDS or argv[0] not in ("voice", "render", "make") or len(argv) % 2 != 0:
        return None
    options = dict(zip(argv[2::2], argv[3::2], strict=True))
    return Request(argv[0], argv[1], options)


def blender_command(extra: list[str]) -> list[str]:
    blender = os.environ.get("BLENDER", "blender")
    threads = os.environ.get("TOYBOX_THREADS", "0")
    return [
        blender,
        "-b",
        "--factory-startup",
        "--threads",
        threads,
        "--python-exit-code",
        "1",
        "-P",
        str(ROOT / "toybox" / "blend.py"),
        "--",
        *extra,
    ]


def run_blender(extra: list[str]) -> int:
    env = {**os.environ, "PYTHONPATH": str(ROOT)}
    return subprocess.run(blender_command(extra), env=env, check=False).returncode


def render_args(request: Request, fmt: str) -> list[str]:
    shot = Path(request.name) / "shot.py"
    out = ROOT / "out" / Path(request.name).name
    args = ["--shot", str(shot), "--out", str(out), "--format", fmt]
    for flag in ("--quality", "--device", "--still", "--first", "--last"):
        if flag in request.options:
            args += [flag, request.options[flag]]
    return args


def render(request: Request) -> int:
    chosen = request.options.get("--format", "both")
    names = list(FORMATS) if chosen == "both" else [chosen]
    if any(name not in FORMATS for name in names) or request.options.get("--quality", "final") not in QUALITIES:
        say(USAGE)
        return 2
    codes = [run_blender(render_args(request, name)) for name in names]
    return max(codes)


def voice(request: Request) -> int:
    narration = Path(request.name) / "narration.txt"
    return voice_env.run(narration, ROOT / "out" / Path(request.name).name / "voice")


def make(request: Request) -> int:
    code = voice(request)
    return code or render(Request("render", request.name, {"--quality": "final", **request.options}))


def main() -> int:
    request = parse(sys.argv[1:])
    if request is None:
        say(USAGE)
        return 2
    if request.command == "voice":
        return voice(request)
    return render(request) if request.command == "render" else make(request)
