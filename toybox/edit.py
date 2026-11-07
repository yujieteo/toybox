from dataclasses import dataclass
from pathlib import Path

import bpy
from bpy.types import Scene

from toybox.formats import Format, Quality, Render
from toybox.grade import apply_grade
from toybox.timing import Timing, end_frame, start_frame


@dataclass(frozen=True)
class Cut:
    first: int
    last: int
    path: Path


def text_layout(fmt: Format) -> tuple[float, float]:
    size = min(fmt.width, fmt.height) * 0.05
    return size, (0.2 if fmt.portrait else 0.1)


def caption_strips(edit: Scene, timing: Timing, fmt: Format) -> None:
    strips = edit.sequence_editor.strips
    size, lift = text_layout(fmt)
    for index, line in enumerate(timing.lines):
        first = start_frame(timing, index)
        strip = strips.new_effect(f"caption.{index}", "TEXT", 3, first, length=end_frame(timing, index) - first + 1)
        strip.text = line.text
        strip.font_size = size
        strip.location = (0.5, lift)
        strip.anchor_x = "CENTER"
        strip.anchor_y = "BOTTOM"
        strip.wrap_width = 0.86
        strip.use_box = True
        strip.box_color = (0.0, 0.0, 0.0, 0.55)
        strip.box_margin = 0.012


def voice_strips(edit: Scene, timing: Timing, voice_dir: Path) -> None:
    strips = edit.sequence_editor.strips
    for index, line in enumerate(timing.lines):
        strips.new_sound(f"voice.{index}", str(voice_dir / line.wav), 2, start_frame(timing, index))


def encode_settings(edit: Scene, quality: Quality, path: Path) -> None:
    render = edit.render
    render.image_settings.media_type = "VIDEO"
    render.image_settings.file_format = "FFMPEG"
    render.ffmpeg.format = "MPEG4"
    render.ffmpeg.codec = "H264"
    render.ffmpeg.constant_rate_factor = "LOWEST" if quality.name == "draft" else "HIGH"
    render.ffmpeg.audio_codec = "AAC"
    render.ffmpeg.audio_bitrate = 192
    render.ffmpeg.audio_channels = "STEREO"
    edit.render.ffmpeg.audio_mixrate = 48000
    render.filepath = str(path)


def assemble(main: Scene, timing: Timing, voice_dir: Path, render: Render, cut: Cut) -> Scene:
    fmt, quality = render.fmt, render.quality
    edit = bpy.data.scenes.new("edit")
    edit.render.resolution_x = fmt.width
    edit.render.resolution_y = fmt.height
    edit.render.resolution_percentage = quality.percent
    edit.render.fps = fmt.fps
    apply_grade(edit)
    edit.frame_start = cut.first
    edit.frame_end = cut.last
    _ = edit.sequence_editor_create()
    scene_strip = edit.sequence_editor.strips.new_scene("view", main, 1, 1)
    scene_strip.scene_camera = main.camera
    caption_strips(edit, timing, fmt)
    voice_strips(edit, timing, voice_dir)
    encode_settings(edit, quality, cut.path)
    return edit
