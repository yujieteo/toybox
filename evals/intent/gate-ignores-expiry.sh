#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local gate_text
  gate_text=$(cat gate)
  has "${gate_text}" "bin/expiry check"
  grep -q 'step "[^"]*expiry' gate && fail "expiry must not be a gate step"
  echo OK
}

main
