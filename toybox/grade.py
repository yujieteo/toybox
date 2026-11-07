from bpy.types import Scene


def apply_grade(scene: Scene) -> None:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -2.2
