from dataclasses import dataclass
from pathlib import Path

GAP_SECONDS = 0.45
TAIL_SECONDS = 1.5
LEAD_SECONDS = 0.5


@dataclass(frozen=True)
class Line:
    start: float
    end: float
    wav: str
    text: str


@dataclass(frozen=True)
class Timing:
    lines: tuple[Line, ...]
    fps: int


def total_frames(timing: Timing) -> int:
    last = timing.lines[-1].end if timing.lines else 0.0
    return round((last + TAIL_SECONDS) * timing.fps)


def frame_of(timing: Timing, seconds: float) -> int:
    return 1 + round(seconds * timing.fps)


def start_frame(timing: Timing, index: int) -> int:
    return frame_of(timing, timing.lines[index].start)


def end_frame(timing: Timing, index: int) -> int:
    return frame_of(timing, timing.lines[index].end)


def line_row(line: Line) -> str:
    return f"{line.start:.3f}\t{line.end:.3f}\t{line.wav}\t{line.text}"


def write_timing(path: Path, lines: tuple[Line, ...]) -> None:
    _ = path.write_text("\n".join(line_row(line) for line in lines) + "\n", encoding="utf-8")


def parse_row(row: str) -> Line:
    start, end, wav, text = row.split("\t", 3)
    return Line(float(start), float(end), wav, text)


def read_timing(path: Path, fps: int) -> Timing:
    rows = [row for row in path.read_text(encoding="utf-8").splitlines() if row]
    return Timing(tuple(parse_row(row) for row in rows), fps)


def silent_timing(fps: int) -> Timing:
    return Timing((), fps)


def schedule(durations: tuple[float, ...], wavs: tuple[str, ...], texts: tuple[str, ...]) -> tuple[Line, ...]:
    lines: list[Line] = []
    clock = LEAD_SECONDS
    for duration, wav, text in zip(durations, wavs, texts, strict=True):
        lines.append(Line(clock, clock + duration, wav, text))
        clock += duration + GAP_SECONDS
    return tuple(lines)
