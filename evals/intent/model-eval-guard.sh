#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local out rc
  out=$(bin/modeleval run 2>&1)
  rc=$?
  [[ "${rc}" -eq 3 ]] || fail "run without the flag exited ${rc}"
  has "${out}" "spends your plan"
  MODEL_EVAL_BLOCK=1 bin/modeleval run --captain-requested > /dev/null 2>&1
  [[ "$?" -eq 3 ]] || fail "the gate setting did not block a model eval"
  out=$(bin/modeleval plan)
  has "${out}" "nothing is spent"
  echo OK
}

main
