#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

small() {
  local value
  value=$(probe_value "$1" "$2")
  [[ -n "${value}" ]] || fail "missing $2"
  awk -v n="${value}" -v limit="$3" 'BEGIN { exit !(n <= limit) }' || fail "$2: ${value} exceeds $3"
}

main() {
  local text report name breath shift parts
  blender_ready
  text=$(blender -b --factory-startup --threads "${TOYBOX_THREADS:-4}" -P evals/probes/lifelike.py 2> /dev/null)
  report=$(grep '^PROBE' <<< "${text}")
  for name in shirt trousers; do
    small "${report}" "${name}_seam" 0.003
    small "${report}" "${name}_weights" 0.00001
  done
  small "${report}" idle_foot_drift 0.003
  breath=$(probe_value "${report}" breath)
  shift=$(probe_value "${report}" shift)
  awk -v b="${breath}" -v s="${shift}" \
    'BEGIN { exit !(b > 0.005 && s > 0.01) }' || fail "no breath or weight shift: ${report}"
  for name in bench planter; do
    parts=$(probe_value "${report}" "${name}_parts")
    [[ "${parts}" -gt 1 ]] || fail "${name} is just one shape"
    small "${report}" "${name}_move_error" 0.00001
  done
  echo OK
}

main
