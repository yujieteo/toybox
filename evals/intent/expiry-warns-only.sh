#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local tmp out rc
  tmp=$(mktemp -d)
  mkdir "${tmp}/bin"
  cp bin/expiry "${tmp}/bin/expiry"
  echo 2026-01-01 > "${tmp}/EXPIRY"
  out=$(EXPIRY_TODAY=2026-11-06 "${tmp}/bin/expiry" check 2>&1)
  rc=$?
  [[ "${rc}" -eq 0 ]] || fail "an expired project exited with ${rc}"
  has "${out}" "Rethink the playbook"
  rm "${tmp}/EXPIRY"
  "${tmp}/bin/expiry" check > /dev/null 2>&1 || fail "a missing EXPIRY file blocked"
  echo OK
}

main
