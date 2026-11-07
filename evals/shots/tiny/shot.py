from toybox.person import Outfit
from toybox.stage import (
    Stage,
    add_box,
    add_floor,
    add_person,
    camera_cut,
    camera_move,
    line_start,
    set_sky,
    turn_to,
    walk_path,
    wave_hand,
)


def shot(stage: Stage) -> None:
    set_sky(stage, elevation=40.0)
    _ = add_floor("asphalt", 40.0)
    _ = add_box("wall", (14.0, 0.4, 3.0), (0.0, 4.0, 1.5), "brick")
    _ = add_box("kerb", (14.0, 0.5, 0.15), (0.0, 1.8, 0.075), "concrete")
    ana = add_person("ana", (-3.0, 0.0, 0.0), Outfit(shirt=(0.1, 0.35, 0.6)))
    ben = add_person("ben", (3.0, 0.0, 0.0), Outfit(shirt=(0.8, 0.4, 0.1), height=1.82))
    turn_to(ben, 1, 90.0)
    camera_cut(stage, 1, (0.0, -6.5, 1.5), (0.0, 0.0, 1.2))
    arrive = walk_path(stage, ana, ((-3.0, 0.0), (-0.8, 0.0)), line_start(stage, 0))
    camera_move(stage, arrive, (0.5, -5.0, 1.4), (-0.4, 0.0, 1.3))
    _ = wave_hand(stage, ben, line_start(stage, 1))
