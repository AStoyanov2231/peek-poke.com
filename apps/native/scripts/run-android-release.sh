#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$APP_DIR/android"
LOCAL_PROPERTIES="$ANDROID_DIR/local.properties"
SOURCE_MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"

if [[ "$(uname -s)" == "Darwin" ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
  export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
fi

REACT_NATIVE_ARCHITECTURES="${REACT_NATIVE_ARCHITECTURES:-armeabi-v7a,arm64-v8a,x86,x86_64}"
export EAS_BUILD_PROFILE="${EAS_BUILD_PROFILE:-production}"
export NODE_ENV="${NODE_ENV:-production}"

if [[ -f "$LOCAL_PROPERTIES" ]]; then
  SDK_DIR="$(sed -n 's/^sdk.dir=//p' "$LOCAL_PROPERTIES")"
else
  SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
fi

if [[ -z "$SDK_DIR" || ! -d "$SDK_DIR" ]]; then
  echo "Android SDK not found. Set ANDROID_SDK_ROOT or ANDROID_HOME." >&2
  exit 1
fi

ADB="$SDK_DIR/platform-tools/adb"

if [[ ! -x "$ADB" ]]; then
  echo "Android adb not found at $ADB" >&2
  exit 1
fi

# Native config changes require one explicit production-profile prebuild before
# Release validation. Do not prebuild on every invocation: Expo may regenerate
# the Android directory and discard useful app-local incremental outputs.
if [[ ! -f "$SOURCE_MANIFEST" ]] ||
   grep -Fq 'android:scheme="exp+peek-poke"' "$SOURCE_MANIFEST" ||
   ! grep -Fq 'android:allowBackup="false"' "$SOURCE_MANIFEST" ||
   ! grep -Fq 'android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"' "$SOURCE_MANIFEST" ||
   ! grep -Fq 'android.permission.USE_BIOMETRIC" tools:node="remove"' "$SOURCE_MANIFEST" ||
   ! grep -Fq 'android.permission.USE_FINGERPRINT" tools:node="remove"' "$SOURCE_MANIFEST"; then
  echo "Android production metadata is missing or stale." >&2
  echo "After a native config change run:" >&2
  echo "  EAS_BUILD_PROFILE=production NODE_ENV=production npm run prebuild -- --platform android --no-install" >&2
  exit 1
fi

cd "$ANDROID_DIR"
./gradlew app:assembleRelease -x lint -x test --configure-on-demand --build-cache \
  -PreactNativeArchitectures="$REACT_NATIVE_ARCHITECTURES" \
  -Dorg.gradle.jvmargs="-Xmx3072m -XX:MaxMetaspaceSize=1024m"
# Push first instead of streaming the APK through Package Manager. Streaming a
# large all-ABI Release artifact can leave an emulator transport unresponsive.
"$ADB" install --no-streaming -r app/build/outputs/apk/release/app-release.apk
"$ADB" shell monkey -p com.peekpoke.app -c android.intent.category.LAUNCHER 1 >/dev/null
