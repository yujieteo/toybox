#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

mean_luma() {
  local stats
  stats=$(ffmpeg -v error -i "$1" -vf signalstats,metadata=print:file=- -f null -)
  awk -F= '/YAVG=/ { print int($2) }' <<< "${stats}"
}

main() {
  local still=out/lamp/still.png mean
  blender_ready
  mkdir -p out/lamp
  blender -b --factory-startup -P evals/probes/lamp.py -- "${PWD}/${still}" > /dev/null 2>&1 || fail "lamp still failed"
  mean=$(mean_luma "${still}")
  [[ "${mean:-0}" -gt 40 ]] || fail "a lamp above the floor leaves it dark: mean luma ${mean}"
  echo OK
}

main
