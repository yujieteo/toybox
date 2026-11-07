#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  blender_ready
  blender -b -t 1 --factory-startup --python-exit-code 1 -P evals/probes/box_origin.py || fail "box origin, slide or turn failed"
  echo OK
}

main
