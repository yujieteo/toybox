#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

main() {
  local tmp
  tmp=$(mktemp -d)
  mkdir "${tmp}/bin"
  cp rules.conf "${tmp}/"
  cp bin/mdgrade "${tmp}/bin/"
  cp -R bin/awk "${tmp}/bin/"
  printf 'The cat sat on the mat. It was a big red cat.\n' > "${tmp}/easy.md"
  printf 'The implementation utilizes configuration infrastructure to facilitate organizational communication.\n' > "${tmp}/hard.md"
  (cd "${tmp}" && bin/mdgrade easy.md) || fail "easy prose failed"
  (cd "${tmp}" && bin/mdgrade hard.md > /dev/null) && fail "hard prose passed"
  echo OK
}

main
