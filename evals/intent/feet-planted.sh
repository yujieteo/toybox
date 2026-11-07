#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local text report mean speed samples
  blender_ready
  text=$(blender -b --factory-startup -P evals/probes/feet.py 2> /dev/null)
  report=$(grep '^PROBE' <<< "${text}")
  mean=$(probe_value "${report}" planted_mean)
  speed=$(probe_value "${report}" walk_speed)
  samples=$(probe_value "${report}" planted_samples)
  [[ "${samples:-0}" -gt 20 ]] || fail "too few planted frames: ${report}"
  awk -v m="${mean}" -v v="${speed}" 'BEGIN { exit !(m < 0.5 * v) }' || fail "feet slide: planted foot speed ${mean}"
  echo OK
}

main
