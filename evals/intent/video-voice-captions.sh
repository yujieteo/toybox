#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

render_clip() {
  python3 -m toybox render evals/shots/tiny --format "$1" --quality draft --first 1 --last 30 > /dev/null 2>&1 || fail "$1 video failed"
}

check_streams() {
  local file="out/tiny/tiny-$1.mp4" video voice frames
  video=$(stream_field "${file}" v:0 codec_name)
  voice=$(stream_field "${file}" a:0 codec_name)
  frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "${file}")
  expect "${video} ${voice} ${frames}" "h264 aac 30" "$1 streams"
}

check_captions() {
  local report=$1 start text frame
  while IFS=$'\t' read -r start _ _ text; do
    frame=$(awk -v s="${start}" 'BEGIN { printf "%d", s * 24 + 1.5 }')
    has "${report}" "PROBE caption=${frame}|${text}"
  done < out/tiny/voice/timing.tsv
}

check_format() {
  local report engine size fps drivers handlers animated voices
  render_clip "$1"
  check_streams "$1"
  report=$(probe "out/tiny/tiny-$1.blend")
  engine=$(probe_value "${report}" engine)
  size=$(probe_value "${report}" size)
  fps=$(probe_value "${report}" fps)
  drivers=$(probe_value "${report}" drivers)
  handlers=$(probe_value "${report}" handlers)
  animated=$(probe_value "${report}" animated)
  voices=$(grep -c '^PROBE voice=' <<< "${report}")
  expect "${engine} ${size} ${fps} ${drivers} ${handlers} ${voices}" "CYCLES $2 24 0 0 2" "$1 blend"
  [[ "${animated}" -gt 5 ]] || fail "$1: the shot is not keyframed"
  check_captions "${report}"
}

main() {
  blender_ready
  python3 -m toybox voice evals/shots/tiny > /dev/null 2>&1 || fail "the voice step failed"
  check_format landscape 1920x1080
  check_format portrait 1080x1920
  echo OK
}

main
