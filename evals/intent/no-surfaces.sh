#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local tracked bad
  tracked=$(git ls-files -co --exclude-standard)
  tracked=$(grep -Ev '^(evals/lint|\.claude)/' <<< "${tracked}" || true)
  bad=$(grep -E '\.(ts|tsx|js|mjs|jsx|html|goose|c|h|wasm)$|\.toybox\.json$|^(web|app|engine|core)/' <<< "${tracked}" || true)
  [[ -z "${bad}" ]] || fail "the old surfaces are back: ${bad}"
  [[ -f VISION.md ]] || fail "VISION.md is missing"
  echo OK
}

main
