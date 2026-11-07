import os
import subprocess
import urllib.request
import venv
from pathlib import Path

from toybox.say import say

BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
FILES = {"kokoro.onnx": "kokoro-v1.0.onnx", "voices.bin": "voices-v1.0.bin"}
PACKAGES = ("kokoro-onnx==0.6.1",)
ROOT = Path(__file__).resolve().parent.parent


def home() -> Path:
    return Path(os.environ.get("TOYBOX_HOME", str(Path.home() / ".cache" / "toybox" / "voice")))


def ensure_environment(target: Path) -> Path:
    python = target / "venv" / "bin" / "python"
    if not python.exists():
        venv.create(target / "venv", with_pip=True)
        _ = subprocess.run([str(python), "-m", "pip", "install", "--quiet", *PACKAGES], check=True)
    return python


def ensure_models(target: Path) -> None:
    for local, remote in FILES.items():
        path = target / local
        if not path.exists():
            partial = path.with_suffix(".part")
            _ = urllib.request.urlretrieve(f"{BASE}/{remote}", partial)
            _ = partial.rename(path)


def run(narration: Path, out: Path) -> int:
    target = home()
    target.mkdir(parents=True, exist_ok=True)
    python = ensure_environment(target)
    ensure_models(target)
    env = {**os.environ, "PYTHONPATH": str(ROOT), "TOYBOX_MODELS": str(target)}
    command = [str(python), "-m", "toybox.voice_run", str(narration), str(out)]
    say(f"voice: {narration} -> {out}")
    return subprocess.run(command, env=env, check=False).returncode
