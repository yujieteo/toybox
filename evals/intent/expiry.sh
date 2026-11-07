#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local got
  got=$(bin/expiry add 2026-11-30 3)
  [[ "${got}" = 2027-02-28 ]] || fail "three months after 2026-11-30 gave ${got}"
  got=$(bin/expiry add 2027-11-30 3)
  [[ "${got}" = 2028-02-29 ]] || fail "three months after 2027-11-30 gave ${got}"
  got=$(bin/expiry add 2026-11-06 3)
  [[ "${got}" = 2027-02-06 ]] || fail "three months after 2026-11-06 gave ${got}"
  echo OK
}

main
