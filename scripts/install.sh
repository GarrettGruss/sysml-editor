#!/bin/sh
# Installs the SysML Editor: the `sysml` CLI, the VS Code extension and the agent skills.
#   curl -fsSL https://github.com/GarrettGruss/sysml-editor/releases/latest/download/install.sh | sh
# Environment: SYSML_VERSION (default: latest release), SYSML_NO_EXTENSION=1, SYSML_NO_SKILLS=1,
#   SYSML_RELEASE_DIR=<dir> (use local release assets instead of downloading).
set -eu

REPO="GarrettGruss/sysml-editor"

die() { echo "install.sh: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js 22 or newer is required but 'node' was not found. Install it from https://nodejs.org/ and run this again."
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 22 ] || die "Node.js 22 or newer is required (found $(node -v)). Upgrade it from https://nodejs.org/ and run this again."
command -v npm >/dev/null 2>&1 || die "npm is required but was not found."

check_version() {
  printf '%s' "$SYSML_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' || die "invalid version '$SYSML_VERSION' (expected something like 0.3.0; are there any releases yet?)"
}
if [ -n "${SYSML_VERSION:-}" ]; then SYSML_VERSION=${SYSML_VERSION#v}; check_version; fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT TERM

if [ -n "${SYSML_RELEASE_DIR:-}" ]; then
  src="$SYSML_RELEASE_DIR"
  [ -f "$src/SHA256SUMS" ] || die "$src/SHA256SUMS not found"
else
  command -v curl >/dev/null 2>&1 || die "curl is required but was not found."
  if [ -z "${SYSML_VERSION:-}" ]; then
    url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") || die "cannot determine the latest release"
    SYSML_VERSION=${url##*/v}
  fi
  SYSML_VERSION=${SYSML_VERSION#v}
  check_version
  VERSION=$SYSML_VERSION
  base="https://github.com/$REPO/releases/download/v$VERSION"
  echo "Installing SysML Editor $VERSION"
  curl -fsSL -o "$work/SHA256SUMS" "$base/SHA256SUMS" || die "cannot download $base/SHA256SUMS"
  src="$work"
  for f in $(awk '{print $2}' "$work/SHA256SUMS" | grep -E '\.(tgz|vsix)$'); do
    curl -fsSL -o "$work/$f" "$base/$f" || die "cannot download $base/$f"
  done
fi

# Verify every listed package against SHA256SUMS.
if command -v sha256sum >/dev/null 2>&1; then sum="sha256sum"; else sum="shasum -a 256"; fi
for f in $(awk '{print $2}' "$src/SHA256SUMS" | grep -E '\.(tgz|vsix)$'); do
  expected=$(awk -v f="$f" '$2 == f {print $1}' "$src/SHA256SUMS")
  actual=$($sum "$src/$f" | awk '{print $1}')
  [ "$expected" = "$actual" ] || die "checksum mismatch for $f"
done

tgz=$(awk '{print $2}' "$src/SHA256SUMS" | grep -E '\.tgz$' | head -n 1)
vsix=$(awk '{print $2}' "$src/SHA256SUMS" | grep -E '\.vsix$' | head -n 1)
[ -n "$tgz" ] || die "no CLI package in SHA256SUMS"

npm install -g "$src/$tgz" || die "npm install -g failed (if this is a permissions error, configure an npm prefix you own)"

sysml_bin=sysml
if ! command -v sysml >/dev/null 2>&1; then
  sysml_bin="$(npm prefix -g)/bin/sysml"
  [ -x "$sysml_bin" ] || die "installed the CLI but cannot find the 'sysml' binary at $sysml_bin"
  echo "Note: 'sysml' is not on your PATH. Add $(dirname "$sysml_bin") to your PATH."
fi

ext="skipped"
if [ "${SYSML_NO_EXTENSION:-}" != "1" ] && [ -n "$vsix" ]; then
  if command -v code >/dev/null 2>&1; then
    if code --install-extension "$src/$vsix" --force; then
      ext="installed"
    else
      ext="FAILED"
      echo "Warning: 'code --install-extension' failed; the VS Code extension was not installed." >&2
    fi
  else
    keep="$HOME/$vsix"
    cp "$src/$vsix" "$keep"
    ext="not installed ('code' not found)"
    echo "'code' was not found. Install the extension later with:"
    echo "  code --install-extension $keep"
  fi
fi

skl="skipped"
if [ "${SYSML_NO_SKILLS:-}" != "1" ]; then
  if "$sysml_bin" skills -v; then skl="installed"; else skl="FAILED"; echo "Warning: installing the agent skills failed." >&2; fi
fi
echo "Summary: CLI installed; extension $ext; skills $skl."
echo "Run 'sysml -h' for help."
