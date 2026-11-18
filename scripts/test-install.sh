#!/bin/sh
# Clean-install test: builds both packages, runs install.sh against local files with a throwaway HOME.
set -eu
cd "$(dirname "$0")/.."
root=$(pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
rm -f ./*.vsix cli/*.tgz

npm run package
npm run check:vsix
mkdir -p "$tmp/release"
(cd cli && npm pack --pack-destination "$tmp/release" >/dev/null)
cp ./*.vsix "$tmp/release/"
(cd "$tmp/release" && sha256sum ./*.tgz ./*.vsix | sed 's# \./# #' > SHA256SUMS)

mkdir -p "$tmp/home" "$tmp/prefix"
HOME="$tmp/home" NPM_CONFIG_PREFIX="$tmp/prefix" PATH="$tmp/prefix/bin:$PATH" \
  SYSML_RELEASE_DIR="$tmp/release" SYSML_NO_EXTENSION=1 sh scripts/install.sh

export PATH="$tmp/prefix/bin:$PATH"
v=$(HOME="$tmp/home" sysml -V)
want=$(node -p "require('$root/package.json').version")
[ "$v" = "$want" ] || { echo "version mismatch: $v != $want" >&2; exit 1; }
for s in sysml-modeling sysml-tutor sysml-ui-testing; do
  [ -f "$tmp/home/.claude/skills/$s/SKILL.md" ] || { echo "missing skill $s" >&2; exit 1; }
  cmp "$root/src/skills/$s/SKILL.md" "$tmp/home/.claude/skills/$s/SKILL.md"
done
echo "install test passed"
