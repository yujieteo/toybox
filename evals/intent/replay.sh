#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local tmp out
  tmp=$(mktemp -d)
  mkdir -p "${tmp}/evals/intent"
  cp -R bin rules.conf "${tmp}/"
  cp -R evals/lint evals/lint.tsv "${tmp}/evals/"
  git -C "${tmp}" init -q
  git -C "${tmp}" add -A
  git -C "${tmp}" -c user.name=eval -c user.email=eval@example.invalid commit -q -m base
  (cd "${tmp}" && bin/replay HEAD > /dev/null 2>&1) || fail "replay failed on unchanged code"
  sed -i.bak 's/"a loop with no bound"/"changed"/' "${tmp}/bin/awk/lang.awk"
  out=$(cd "${tmp}" && bin/replay HEAD 2>&1) && fail "replay missed a changed output: ${out}"
  has "${out}" "outputs differ"
  (cd "${tmp}" && bin/replay HEAD --accept > /dev/null 2>&1) || fail "--accept did not accept"
  echo OK
}

main
