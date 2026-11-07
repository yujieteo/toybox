#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

render_still() {
  python3 -m toybox render evals/shots/tiny --format "$1" --quality draft --still 90 > /dev/null 2>&1 || fail "$1 still failed"
}

main() {
  local size spread name
  blender_ready
  python3 -m toybox voice evals/shots/tiny > /dev/null 2>&1 || fail "the voice step failed"
  for name in landscape portrait; do
    render_still "${name}"
    size=$(stream_field "out/tiny/still-${name}.png" v:0 width,height)
    spread=$(luma_spread "out/tiny/still-${name}.png")
    [[ "${spread%.*}" -gt 25 ]] || fail "the ${name} still is nearly flat: luma spread ${spread}"
    [[ "${name}" = landscape ]] && expect "${size}" "480,270" "landscape draft size"
    [[ "${name}" = portrait ]] && expect "${size}" "270,480" "portrait draft size"
  done
  echo OK
}

main
