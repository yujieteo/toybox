#!/usr/bin/env bash
. "$(dirname "$0")/../lib.sh"

project() {
  local dir=$1
  mkdir -p "${dir}/bin" "${dir}/src" "${dir}/extra"
  cp rules.conf "${dir}/"
  cp -R bin/awk "${dir}/bin/"
  cp bin/rules bin/suppress.re "${dir}/bin/"
  printf '{"include": ["src/**/*.ts"], "exclude": []}\n' > "${dir}/tsconfig.json"
  printf '[tool.basedpyright]\ninclude = ["src"]\nexclude = []\n' > "${dir}/pyproject.toml"
  printf 'export const a: number = 1;\n' > "${dir}/src/a.ts"
  printf 'export const b: number = 2;\n' > "${dir}/extra/b.ts"
  printf 'A = 1\n' > "${dir}/extra/c.py"
  printf 'A = 1\n' > "${dir}/src/d.py"
  git -C "${dir}" init -q
  git -C "${dir}" add -A
}

main() {
  local dir out
  need jq
  dir=$(mktemp -d)/p
  project "${dir}"
  out=$(cd "${dir}" && bin/rules) && fail "files outside the checker lists passed"
  has "${out}" "extra/b.ts:1: typecover"
  has "${out}" "extra/c.py:1: typecover"
  [[ "${out}" != *"src/a.ts"* ]] || fail "a covered ts file was flagged: ${out}"
  [[ "${out}" != *"src/d.py"* ]] || fail "a covered py file was flagged: ${out}"
  echo OK
}

main
