#!/usr/bin/env bash
set -euo pipefail

# Conservative local-development maintenance. It removes only stale disposable
# state and never touches active compiler caches, Pods, Metro, or current SDKs.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN="${PEEKPOKE_MAINTENANCE_DRY_RUN:-0}"
KEEP_AVDS="${PEEKPOKE_KEEP_AVDS:-Pixel_6 Medium_Phone}"
KEEP_DEVICE_SUPPORT="${PEEKPOKE_KEEP_DEVICE_SUPPORT:-2}"
PREVIEW_DAYS="${PEEKPOKE_PREVIEW_DAYS:-30}"
BUILD_OUTPUT_DAYS="${PEEKPOKE_BUILD_OUTPUT_DAYS:-14}"
AVD_DAYS="${PEEKPOKE_AVD_DAYS:-30}"

log() { printf '[peek-poke-maintenance] %s\n' "$*"; }

keep_avd() {
  local candidate="$1"
  for retained in $KEEP_AVDS; do
    [[ "$candidate" == "$retained" ]] && return 0
  done
  return 1
}

if pgrep -f '(^|/)(gradle|gradlew|java).*org.gradle' >/dev/null 2>&1 || \
   pgrep -f '(^|/)(xcodebuild|Xcode|Simulator)' >/dev/null 2>&1; then
  log 'Active native tooling detected; skipping maintenance.'
  exit 0
fi

remove_path() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  if [[ "$DRY_RUN" == "1" ]]; then
    log "Would remove $path"
  else
    log "Removing $path"
    rm -rf -- "$path"
  fi
}

log "Repository: $ROOT_DIR"

# Keep the named test AVDs and recently used emulator data. An AVD is
# disposable device state, not a compiler cache. Override PEEKPOKE_KEEP_AVDS
# with a space-separated list when the device matrix changes.
AVD_ROOT="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
if [[ -d "$AVD_ROOT" ]]; then
  for avd in "$AVD_ROOT"/*.avd; do
    [[ -d "$avd" ]] || continue
    name="$(basename "$avd" .avd)"
    keep_avd "$name" && continue
    if [[ "$(find "$avd" -maxdepth 1 -type f -mtime "+$AVD_DAYS" -print -quit)" == "" ]]; then
      continue
    fi
    remove_path "$avd"
    ini="$AVD_ROOT/$name.ini"
    remove_path "$ini"
  done
fi

# Preview simulator data is safe to age out when Xcode is closed. The process
# guard above prevents deleting data while previews or Simulator may be active.
PREVIEWS="$HOME/Library/Developer/Xcode/UserData/Previews"
if [[ -d "$PREVIEWS" ]]; then
  while IFS= read -r -d '' path; do
    remove_path "$path"
  done < <(find "$PREVIEWS" -mindepth 1 -maxdepth 1 -type d -mtime "+$PREVIEW_DAYS" -print0)
fi

# Keep the newest DeviceSupport directories, which covers the current device
# and one recent fallback runtime. Never touch the active Xcode installation.
DEVICE_SUPPORT="$HOME/Library/Developer/Xcode/iOS DeviceSupport"
if [[ -d "$DEVICE_SUPPORT" ]]; then
  count=0
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if (( count >= KEEP_DEVICE_SUPPORT )); then
      remove_path "$path"
    fi
    count=$((count + 1))
  done < <(find "$DEVICE_SUPPORT" -mindepth 1 -maxdepth 1 -type d -print | sort -r)
fi

# Release APKs and symbol bundles are reproducible outputs. Keep incremental
# intermediates and only age out old final artifacts after native tools stop.
OUTPUTS="$ROOT_DIR/apps/native/android/app/build/outputs"
if [[ -d "$OUTPUTS" ]]; then
  while IFS= read -r -d '' path; do
    remove_path "$path"
  done < <(find "$OUTPUTS" -type f -mtime "+$BUILD_OUTPUT_DAYS" \( -name '*.apk' -o -name '*.aab' -o -name '*.zip' \) -print0)
fi

log 'Maintenance complete. Gradle, Metro, Pods, DerivedData, SDKs, and active build intermediates were preserved.'
