#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == "Darwin" ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
  JAVA_HOME="$(/usr/libexec/java_home -v 21)"
  export JAVA_HOME
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PEEKPOKE_DEV_ARM64_ONLY=1
export ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a
# Keep Metro on emulator/device loopback. Expo configures adb reverse for the
# selected port, and the Development Build network policy intentionally does
# not allow cleartext access to arbitrary LAN hosts.
export REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1

exec node "$APP_DIR/scripts/run-expo.cjs" run:android "$@"
