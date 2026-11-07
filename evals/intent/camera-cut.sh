#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local text report error distance
  blender_ready
  text=$(blender -b --factory-startup --threads "${TOYBOX_THREADS}" -P evals/probes/camera_cut.py 2>&1)
  report=$(grep '^PROBE' <<< "${text}")
  error=$(probe_value "${report}" cut_error)
  distance=$(probe_value "${report}" move_distance)
  [[ -n "${error}" && -n "${distance}" ]] || fail "no camera pose readings: ${text}"
  awk -v e="${error}" 'BEGIN { exit !(e < 0.00001) }' || fail "camera cut drift: ${error}"
  awk -v d="${distance}" 'BEGIN { exit !(d > 0.1) }' || fail "camera move stopped: ${distance}"
  echo OK
}

main
