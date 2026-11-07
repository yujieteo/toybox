#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local dir
  blender_ready
  dir=$(mktemp -d)/no-voice
  mkdir -p "${dir}"
  cp evals/shots/tiny/shot.py "${dir}/"
  rm -rf out/no-voice
  if python3 -m toybox render "${dir}" --format landscape --quality draft --still 90 > /dev/null 2>&1; then
    fail "a shot with no voice timing raised in Blender, but the render said it passed"
  fi
  [[ ! -e out/no-voice/still-landscape.png ]] || fail "the failed shot still wrote a picture"
  rm -rf "$(dirname "${dir}")" out/no-voice
  echo OK
}

main
