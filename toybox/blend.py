import sys

import bpy

from toybox.edit import Cut, assemble
from toybox.formats import FORMATS, QUALITIES, Render
from toybox.jobs import Job, parse_job
from toybox.shot import load_shot
from toybox.stage import Stage, make_stage
from toybox.timing import read_timing, silent_timing


def build(job: Job) -> Stage:
    fmt = FORMATS[job.format]
    table = job.out / "voice" / "timing.tsv"
    timing = read_timing(table, fmt.fps) if table.exists() else silent_timing(fmt.fps)
    stage = make_stage(Render(fmt, QUALITIES[job.quality], job.device), timing)
    load_shot(job.shot).shot(stage)
    return stage


def render_still(stage: Stage, job: Job) -> None:
    stage.scene.frame_set(job.still)
    stage.scene.render.filepath = str(job.out / f"still-{job.format}.png")
    bpy.ops.render.render(write_still=True)


def render_video(stage: Stage, job: Job) -> None:
    last = job.last or stage.scene.frame_end
    path = job.out / f"{job.shot.parent.name}-{job.format}.mp4"
    edit = assemble(
        stage.scene,
        stage.timing,
        job.out / "voice",
        Render(stage.fmt, QUALITIES[job.quality], job.device),
        Cut(job.first, last, path),
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix(".blend")), compress=True)
    bpy.context.window.scene = edit
    bpy.ops.render.render(animation=True, scene=edit.name)


def main() -> None:
    job = parse_job(sys.argv)
    job.out.mkdir(parents=True, exist_ok=True)
    stage = build(job)
    if job.still:
        render_still(stage, job)
    else:
        render_video(stage, job)


if __name__ == "__main__":
    main()
