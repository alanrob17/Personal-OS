#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

INSTALL_DEPS=false
for arg in "$@"; do
  case "$arg" in
    --install-deps)
      INSTALL_DEPS=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/build-deb.sh [--install-deps]

Builds the Personal OS .deb installer on Linux Mint / Ubuntu.

Options:
  --install-deps   Install required GTK3, WebKitGTK, and build packages via apt-get
  -h, --help       Show this help message
EOF
      exit 0
      ;;
    *)
      echo "Error: Unknown option '$arg'" >&2
      echo "Run './scripts/build-deb.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

OS_NAME="$(uname -s)"
if [[ "$OS_NAME" != "Linux" ]]; then
  echo "Error: .deb packaging requires Linux (detected: $OS_NAME)." >&2
  echo "Copy this repository to your Linux Mint PC and run ./scripts/build-deb.sh there." >&2
  exit 1
fi

APT_PACKAGES=(
  build-essential
  curl
  wget
  file
  libxdo-dev
  libssl-dev
  libayatana-appindicator3-dev
  librsvg2-dev
  libwebkit2gtk-4.1-dev
  pkg-config
)

if [[ "$INSTALL_DEPS" == true ]]; then
  if ! command -v sudo >/dev/null 2>&1 || ! command -v apt-get >/dev/null 2>&1; then
    echo "Error: --install-deps requires apt-get and sudo (Debian / Ubuntu / Linux Mint)." >&2
    exit 1
  fi
  echo "Installing Tauri v2 Linux build prerequisites..."
  sudo apt-get update
  sudo apt-get install -y "${APT_PACKAGES[@]}"
fi

check_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: Required command '$cmd' was not found." >&2
    echo "  $hint" >&2
    exit 1
  fi
}

check_cmd node "Install Node.js LTS (v20+): https://nodejs.org/ or via your package manager."
check_cmd npm "Install npm alongside Node.js."
check_cmd rustc "Install Rust (>= 1.87.0): curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh"
check_cmd cargo "Install Rust/Cargo (>= 1.87.0) via rustup."
check_cmd pkg-config "Install pkg-config: sudo apt install -y pkg-config (or run with --install-deps)"

RUSTC_VER="$(rustc --version | awk '{print $2}')"
MIN_RUST="1.87.0"
if [[ "$(printf '%s\n%s\n' "$MIN_RUST" "$RUSTC_VER" | sort -V | head -n1)" != "$MIN_RUST" ]]; then
  echo "Warning: rustc $RUSTC_VER detected, but Cargo.toml targets rust-version $MIN_RUST or newer." >&2
  echo "  If compilation fails, run: rustup update stable" >&2
fi

MISSING_LIBS=()
if ! pkg-config --exists webkit2gtk-4.1; then
  MISSING_LIBS+=("libwebkit2gtk-4.1-dev")
fi
if ! pkg-config --exists ayatana-appindicator3-0.1; then
  MISSING_LIBS+=("libayatana-appindicator3-dev")
fi
if ! pkg-config --exists gtk+-3.0; then
  MISSING_LIBS+=("libgtk-3-dev")
fi

if [[ ${#MISSING_LIBS[@]} -gt 0 ]]; then
  echo "Error: Missing required Linux GTK/WebKitGTK development libraries (${MISSING_LIBS[*]})." >&2
  echo "Install all prerequisites with:" >&2
  echo "  ./scripts/build-deb.sh --install-deps" >&2
  echo "Or manually:" >&2
  echo "  sudo apt-get update && sudo apt-get install -y ${APT_PACKAGES[*]}" >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "Installing npm devDependencies (@tauri-apps/cli)..."
  npm install
fi

echo "Building Personal OS .deb package..."
npm run build:deb

DEB_DIR="$ROOT_DIR/src-tauri/target/release/bundle/deb"
shopt -s nullglob
DEB_FILES=("$DEB_DIR"/*.deb)
shopt -u nullglob

if [[ ${#DEB_FILES[@]} -eq 0 ]]; then
  echo "Error: Build finished, but no .deb file was found in $DEB_DIR" >&2
  exit 1
fi

echo ""
echo "Success! Created .deb package:"
for deb in "${DEB_FILES[@]}"; do
  echo "  $deb"
  echo ""
  echo "Install on Linux Mint with:"
  echo "  sudo apt install \"$deb\""
done
