#!/usr/bin/env bash
# Tag the version in core/version.mjs and make the GitHub release with its CHANGELOG.md section.
# Run from a clean main that has the release commit: scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(sed -n "s/^export const VERSION = '\(.*\)';$/\1/p" core/version.mjs)
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "No X.Y.Z version in core/version.mjs" >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo "The worktree is not clean" >&2; exit 1; }
[[ $(git branch --show-current) == main ]] || { echo "Release from main" >&2; exit 1; }
notes=$(awk -v h="## [$version]" 'index($0, h) == 1 { on = 1; next } on && /^## \[/ { exit } on' CHANGELOG.md)
[[ -n ${notes//[[:space:]]/} ]] || { echo "CHANGELOG.md has no section for $version" >&2; exit 1; }
git tag -a "v$version" -m "Toybox $version"
git push origin "v$version"
gh release create "v$version" --title "Toybox $version" --notes "$notes" --verify-tag
