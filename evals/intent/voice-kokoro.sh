#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local rate chans rows first gap_start first_end
  need python3
  need ffprobe
  python3 -m toybox voice evals/shots/tiny > /dev/null 2>&1 || fail "the voice step failed"
  rate=$(stream_field out/tiny/voice/00.wav a:0 sample_rate)
  chans=$(stream_field out/tiny/voice/00.wav a:0 channels)
  expect "${rate} ${chans}" "24000 1" "voice format"
  rows=$(awk 'END { print NR }' out/tiny/voice/timing.tsv)
  expect "${rows}" 2 "timing rows"
  first=$(awk -F'\t' 'NR == 1 { print $2 - $1 }' out/tiny/voice/timing.tsv)
  first_end=$(awk -F'\t' 'NR == 1 { print $2 }' out/tiny/voice/timing.tsv)
  gap_start=$(awk -F'\t' 'NR == 2 { print $1 }' out/tiny/voice/timing.tsv)
  awk -v d="${first}" 'BEGIN { exit !(d > 1.0) }' || fail "the first spoken line is too short: ${first} s"
  awk -v s="${gap_start}" -v e="${first_end}" 'BEGIN { exit !(s > e) }' || fail "lines overlap"
  echo OK
}

main
