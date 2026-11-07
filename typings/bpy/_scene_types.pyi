from collections.abc import Iterator, Sequence
from typing import final

import numpy as np
from bpy.types import NodeTree, Object

class ColorModifier:
    material_attribute: str
    blend: str
    influence: float

def _colormodifiers_new(self: ColorModifiers, name: str, modifier_type: str) -> ColorModifier: ...

@final
class ColorModifiers:
    new = _colormodifiers_new

class FreestyleLineStyle:
    color: Sequence[float]
    thickness: float
    thickness_position: str
    caps: str
    use_chaining: bool
    chaining: str
    use_same_object: bool
    color_modifiers: ColorModifiers

class LineSet:
    select_by_visibility: bool
    visibility: str
    select_by_edge_types: bool
    edge_type_combination: str
    select_by_collection: bool
    collection: Collection
    collection_negation: str
    linestyle: FreestyleLineStyle

def _linesets_new(self: LineSets, name: str) -> LineSet: ...
def _linesets_remove(self: LineSets, lineset: LineSet) -> None: ...
def _linesets_iter(self: LineSets) -> Iterator[LineSet]: ...

@final
class LineSets:
    new = _linesets_new
    remove = _linesets_remove
    __iter__ = _linesets_iter

class FreestyleSettings:
    mode: str
    use_smoothness: bool
    crease_angle: float
    use_culling: bool
    as_render_pass: bool
    linesets: LineSets

def _viewlayer_update(self: ViewLayer) -> None: ...

@final
class ViewLayer:
    use_freestyle: bool
    freestyle_settings: FreestyleSettings
    update = _viewlayer_update

def _collectionobjects_link(self: CollectionObjects, obj: Object) -> None: ...
def _collectionobjects_contains(self: CollectionObjects, name: str) -> bool: ...
def _collectionobjects_len(self: CollectionObjects) -> int: ...

@final
class CollectionObjects:
    link = _collectionobjects_link
    __contains__ = _collectionobjects_contains
    __len__ = _collectionobjects_len

def _collectionchildren_link(self: CollectionChildren, collection: Collection) -> None: ...
def _collectionchildren_contains(self: CollectionChildren, name: str) -> bool: ...

@final
class CollectionChildren:
    link = _collectionchildren_link
    __contains__ = _collectionchildren_contains

class Collection:
    name: str
    objects: CollectionObjects
    children: CollectionChildren

def _sceneobjects_iter(self: SceneObjects) -> Iterator[Object]: ...
def _sceneobjects_contains(self: SceneObjects, name: str) -> bool: ...
def _sceneobjects_getitem(self: SceneObjects, name: str) -> Object: ...
def _sceneobjects_get(self: SceneObjects, name: str) -> Object | None: ...

@final
class SceneObjects:
    __iter__ = _sceneobjects_iter
    __contains__ = _sceneobjects_contains
    __getitem__ = _sceneobjects_getitem
    get = _sceneobjects_get

class ImageSettings:
    media_type: str
    file_format: str

class FFmpegSettings:
    format: str
    codec: str
    constant_rate_factor: str
    audio_codec: str
    audio_bitrate: int
    audio_channels: str
    audio_mixrate: int

class RenderSettings:
    image_settings: ImageSettings
    ffmpeg: FFmpegSettings
    fps: int
    resolution_percentage: int
    use_motion_blur: bool
    engine: str
    resolution_x: int
    resolution_y: int
    film_transparent: bool
    filepath: str
    filter_size: float
    use_freestyle: bool
    line_thickness_mode: str
    line_thickness: float

class CyclesSettings:
    device: str
    film_transparent_glass: bool
    samples: int
    use_denoising: bool
    seed: int
    use_animated_seed: bool
    use_adaptive_sampling: bool
    adaptive_threshold: float
    max_bounces: int
    diffuse_bounces: int
    glossy_bounces: int
    transmission_bounces: int
    volume_bounces: int
    transparent_max_bounces: int
    caustics_reflective: bool
    caustics_refractive: bool
    sample_clamp_indirect: float
    blur_glossy: float

class ViewSettings:
    view_transform: str
    look: str
    exposure: float
    gamma: float

class World:
    use_nodes: bool
    node_tree: NodeTree

class Strip:
    name: str
    type: str
    frame_final_start: int
    frame_final_end: int

class SceneStrip(Strip):
    scene_camera: Object

class TextStrip(Strip):
    text: str
    font_size: float
    location: Sequence[float]
    anchor_x: str
    anchor_y: str
    wrap_width: float
    use_box: bool
    box_color: Sequence[float]
    box_margin: float

def _strips_new_scene(self: Strips, name: str, scene: Scene, channel: int, frame_start: int) -> SceneStrip: ...
def _strips_new_sound(self: Strips, name: str, filepath: str, channel: int, frame_start: int) -> None: ...
def _strips_iter(self: Strips) -> Iterator[Strip]: ...
def _strips_new_effect(
    self: Strips, name: str, strip_type: str, channel: int, frame_start: int, *, length: int
) -> TextStrip: ...

@final
class Strips:
    new_scene = _strips_new_scene
    new_sound = _strips_new_sound
    __iter__ = _strips_iter
    new_effect = _strips_new_effect

class SequenceEditor:
    strips: Strips

def _scene_sequence_editor_create(self: Scene) -> SequenceEditor: ...
def _scene_frame_set(self: Scene, frame: int) -> None: ...

@final
class Scene:
    sequence_editor: SequenceEditor
    sequence_editor_create = _scene_sequence_editor_create
    frame_set = _scene_frame_set
    frame_start: int
    frame_end: int
    name: str
    camera: Object
    render: RenderSettings
    cycles: CyclesSettings
    view_settings: ViewSettings
    world: World
    objects: SceneObjects
    collection: Collection
    view_layers: Sequence[ViewLayer]

class CyclesDevice:
    name: str
    type: str
    use: bool

def _cyclespreferences_refresh_devices(self: CyclesPreferences) -> None: ...
def _cyclespreferences_get_devices(self: CyclesPreferences) -> None: ...

@final
class CyclesPreferences:
    compute_device_type: str
    devices: Sequence[CyclesDevice]
    refresh_devices = _cyclespreferences_refresh_devices
    get_devices = _cyclespreferences_get_devices

def _pixelbuffer_foreach_get(self: PixelBuffer, array: np.ndarray) -> None: ...
def _pixelbuffer_foreach_set(self: PixelBuffer, array: np.ndarray) -> None: ...

@final
class PixelBuffer:
    foreach_get = _pixelbuffer_foreach_get
    foreach_set = _pixelbuffer_foreach_set

def _image_save(self: Image) -> None: ...

@final
class Image:
    size: tuple[int, int]
    pixels: PixelBuffer
    filepath_raw: str
    file_format: str
    save = _image_save
