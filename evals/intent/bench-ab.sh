#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

make_side() {
  local dir=$1 nap=$2
  mkdir -p "${dir}/bin" "${dir}/evals/bench"
  cp bin/bench "${dir}/bin/bench"
  printf 'cmd="sleep %s"\nruns=10\nunits=1\n' "${nap}" > "${dir}/evals/bench/nap.bench"
}

verdict_for() {
  local base=$1 cur=$2 out
  mkdir -p "${cur}/bin" "${cur}/evals"
  cp bin/ab "${cur}/bin/ab"
  out=$("${cur}/bin/ab" nap --dir "${base}")
  echo "${out}"
}

main() {
  local tmp out
  tmp=$(mktemp -d)
  out=$(BENCH_RUNS=3 bin/bench rules-py)
  for m in latency_ms throughput_per_s error_rate max_rss_kb bytes_out_per_run gpu_mem_mb; do has "${out}" "${m}"; done
  make_side "${tmp}/fast" 0.02
  make_side "${tmp}/slow" 0.06
  make_side "${tmp}/same" 0.02
  local verdict
  verdict=$(verdict_for "${tmp}/fast" "${tmp}/slow")
  has "${verdict}" "verdict: worse"
  verdict=$(verdict_for "${tmp}/slow" "${tmp}/fast")
  has "${verdict}" "verdict: better"
  verdict=$(verdict_for "${tmp}/fast" "${tmp}/same")
  has "${verdict}" "verdict: no difference"
  echo OK
}

main
