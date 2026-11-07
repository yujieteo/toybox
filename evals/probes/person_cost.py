import bpy

from toybox.formats import FORMATS, QUALITIES, Render
from toybox.say import show
from toybox.stage import add_person, make_stage
from toybox.timing import silent_timing


def main() -> None:
    fmt = FORMATS["landscape"]
    _ = make_stage(Render(fmt, QUALITIES["draft"], "cpu"), silent_timing(fmt.fps))
    person = add_person("ana", (0.0, 0.0, 0.0))
    bpy.context.view_layer.update()
    show(f"PROBE person={person.name}")
    show(f"PROBE objects={len(bpy.data.objects)}")


if __name__ == "__main__":
    main()
