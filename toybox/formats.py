from dataclasses import dataclass


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    fps: int
    portrait: bool


@dataclass(frozen=True)
class Quality:
    name: str
    samples: int
    percent: int
    denoise: bool
    motion_blur: bool


FORMATS = {
    "landscape": Format("landscape", 1920, 1080, 24, portrait=False),
    "portrait": Format("portrait", 1080, 1920, 24, portrait=True),
}

QUALITIES = {
    "draft": Quality("draft", 8, 25, denoise=False, motion_blur=False),
    "preview": Quality("preview", 48, 50, denoise=True, motion_blur=False),
    "final": Quality("final", 256, 100, denoise=True, motion_blur=True),
}


@dataclass(frozen=True)
class Render:
    fmt: Format
    quality: Quality
    device: str
