import os
import sys
import wave
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

from toybox.timing import Line, schedule, write_timing

VOICE = "af_heart"
RATE = 24000


def write_wav(path: Path, samples: "np.ndarray", rate: int) -> None:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(pcm.tobytes())


def speak(narration: Path, out: Path) -> tuple[Line, ...]:
    models = Path(os.environ["TOYBOX_MODELS"])
    engine = Kokoro(str(models / "kokoro.onnx"), str(models / "voices.bin"))
    texts = tuple(row.strip() for row in narration.read_text(encoding="utf-8").splitlines() if row.strip())
    out.mkdir(parents=True, exist_ok=True)
    durations: list[float] = []
    names: list[str] = []
    for index, text in enumerate(texts):
        samples, rate = engine.create(text, voice=VOICE, speed=1.0, lang="en-us")
        names.append(f"{index:02d}.wav")
        write_wav(out / names[-1], samples, rate)
        durations.append(len(samples) / rate)
    return schedule(tuple(durations), tuple(names), texts)


def main() -> int:
    narration, out = Path(sys.argv[1]), Path(sys.argv[2])
    write_timing(out / "timing.tsv", speak(narration, out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
