#!/usr/bin/env bash
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${root}" || exit 1

fail() {
  echo "$1"
  exit 1
}

need() {
  command -v "$1" > /dev/null || fail "$1 is missing: run nix develop"
}

has() {
  grep -q -- "$2" <<< "$1" || fail "expected [$2] in: $1"
}

blender_ready() {
  need blender
  need ffprobe
  need ffmpeg
  export PYTHONPATH="${root}"
  export TOYBOX_THREADS="${TOYBOX_THREADS:-4}"
}

probe() {
  local text
  text=$(blender -b --factory-startup -P toybox/probe.py -- "$1" 2> /dev/null)
  grep '^PROBE' <<< "${text}"
}

probe_value() {
  awk -F= -v k="PROBE $2" '$1 == k { print substr($0, length(k) + 2); exit }' <<< "$1"
}

stream_field() {
  ffprobe -v error -select_streams "$2" -show_entries "stream=$3" -of csv=p=0 "$1"
}

luma_spread() {
  local stats
  stats=$(ffmpeg -v error -i "$1" -vf signalstats,metadata=print:file=- -f null -)
  awk -F= '/YHIGH=/ { high = $2 } /YLOW=/ { low = $2 } END { print high - low }' <<< "${stats}"
}

expect() {
  [[ "$1" = "$2" ]] || fail "$3: expected [$2], got [$1]"
}
