import math

import bpy
from bpy.types import Object
from mathutils import Vector

from toybox.clothes import shell
from toybox.formats import FORMATS, QUALITIES, Render
from toybox.human import Body, read_body
from toybox.say import show
from toybox.stage import add_bench, add_person, add_planter, idle_pose, make_stage
from toybox.timing import silent_timing

SOURCE = "People look alive: clean clothing edges, breathing, weight shift and richer props"
EDGE_DEGREE = 2


def boundary_loops(body: Body) -> list[list[int]]:
    edges: dict[tuple[int, int], int] = {}
    for a, b, c in body.faces:
        for first, last in ((a, b), (b, c), (c, a)):
            edge = (min(first, last), max(first, last))
            edges[edge] = edges.get(edge, 0) + 1
    neighbors: dict[int, list[int]] = {}
    for (a, b), count in edges.items():
        if count == 1:
            neighbors.setdefault(a, []).append(b)
            neighbors.setdefault(b, []).append(a)
    remaining = set(neighbors)
    loops: list[list[int]] = []
    for first in sorted(neighbors):
        if first not in remaining:
            continue
        loop: list[int] = []
        previous, current = -1, first
        for _ in range(len(neighbors)):
            if current not in remaining or len(neighbors[current]) != EDGE_DEGREE:
                return []
            remaining.remove(current)
            loop.append(current)
            a, b = neighbors[current]
            after = a if a != previous else b
            if after == first:
                break
            previous, current = current, after
        loops.append(loop)
    return loops


def seam_error(body: Body) -> float:
    loops = boundary_loops(body)
    if not loops:
        return float("inf")
    error = 0.0
    for loop in loops:
        origin = Vector(body.points[loop[0]])
        along = Vector(body.points[loop[1]]) - origin
        across = Vector(body.points[loop[len(loop) // 3]]) - origin
        normal = along.cross(across).normalized()
        error = max(error, *(abs((Vector(body.points[i]) - origin).dot(normal)) for i in loop))
    return error


def cloth_metrics() -> None:
    source = read_body(1.0)
    for kind in ("shirt", "trousers"):
        body = shell(source, kind, 1.0)
        error = seam_error(body)
        weights = max(abs(1.0 - sum(w for _, w in weights)) for weights in body.weights)
        show(f"PROBE {kind}_seam={error:.6f}")
        show(f"PROBE {kind}_weights={weights:.6f}")


def feet(rig: Object) -> list[tuple[float, float, float]]:
    posed = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
    result: list[tuple[float, float, float]] = []
    for name in ("foot.L", "foot.R"):
        point = posed.matrix_world @ posed.pose.bones[name].head
        result.append((point[0], point[1], point[2]))
    return result


def motion_metrics() -> None:
    fmt = FORMATS["landscape"]
    stage = make_stage(Render(fmt, QUALITIES["draft"], "cpu"), silent_timing(fmt.fps))
    person = add_person("ana", (0.0, 0.0, 0.0))
    end = idle_pose(stage, person, 1, 6.0)
    stage.scene.frame_set(1)
    before = feet(person.root)
    drift = 0.0
    breath: list[float] = []
    shift: list[float] = []
    for frame in range(1, end + 1):
        stage.scene.frame_set(frame)
        drift = max(drift, *(math.dist(a, b) for a, b in zip(before, feet(person.root), strict=True)))
        breath.append(float(person.root.pose.bones["spine01"].scale[0]))
        shift.append(float(person.root.pose.bones["root"].location[0]))
    show(f"PROBE breath={max(breath) - min(breath):.6f}")
    show(f"PROBE shift={max(shift) - min(shift):.6f}")
    show(f"PROBE idle_foot_drift={drift:.6f}")


def prop_metrics() -> None:
    bench = add_bench("bench", (1.0, 0.0, 0.0))
    planter = add_planter("planter", (-1.0, 0.0, 0.0))
    for root in (bench, planter):
        parts = [obj for obj in bpy.data.objects if obj.parent == root]
        show(f"PROBE {root.name}_parts={len(parts)}")
        bpy.context.view_layer.update()
        before = [obj.matrix_world.translation.copy() for obj in parts]
        root.location = (3.0, 2.0, 1.0)
        bpy.context.view_layer.update()
        delta = (3.0 - (1.0 if root == bench else -1.0), 2.0, 1.0)
        error = max(
            math.dist(tuple(obj.matrix_world.translation[i] - old[i] for i in range(3)), delta)
            for obj, old in zip(parts, before, strict=True)
        )
        show(f"PROBE {root.name}_move_error={error:.6f}")


def main() -> None:
    show(f"PROBE intent={SOURCE}")
    cloth_metrics()
    motion_metrics()
    prop_metrics()


if __name__ == "__main__":
    main()
