from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Job:
    shot: Path
    out: Path
    format: str
    quality: str
    device: str
    still: int
    first: int
    last: int


def parse_job(argv: list[str]) -> Job:
    words = argv[argv.index("--") + 1 :] if "--" in argv else argv
    pairs = dict(zip(words[0::2], words[1::2], strict=True))
    return Job(
        shot=Path(pairs["--shot"]),
        out=Path(pairs["--out"]),
        format=pairs.get("--format", "landscape"),
        quality=pairs.get("--quality", "draft"),
        device=pairs.get("--device", "cpu"),
        still=int(pairs.get("--still", "0")),
        first=int(pairs.get("--first", "1")),
        last=int(pairs.get("--last", "0")),
    )
