import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")).expo;
function manifest(paths: string[], verified = true) {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
    ${config.android.blockedPermissions.map((name: string) => `<uses-permission android:name="${name}" tools:node="remove"/>`).join("")}
    <application android:name=".MainApplication" android:allowBackup="false"><activity android:name=".MainActivity">
      <intent-filter android:autoVerify="${verified}">
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <category android:name="android.intent.category.DEFAULT"/>
        ${paths.map((path) => `<data android:scheme="https" android:host="www.peek-poke.com" android:pathPrefix="${path}"/>`).join("")}
      </intent-filter>
    </activity></application></manifest>`;
}
function runRelease(sourceManifest: string) {
  const root = mkdtempSync(join(tmpdir(), "peek-release-metadata-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "android/app/src/main"), { recursive: true });
    mkdirSync(join(root, "sdk/platform-tools"), { recursive: true });
    copyFileSync(join(appRoot, "scripts/run-android-release.sh"), join(root, "scripts/run-android-release.sh"));
    const validator = join(appRoot, "scripts/verify-android-release-manifest.js");
    if (existsSync(validator)) copyFileSync(validator, join(root, "scripts/verify-android-release-manifest.js"));
    copyFileSync(join(appRoot, "app.json"), join(root, "app.json"));
    writeFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), sourceManifest);
    writeFileSync(join(root, "android/gradlew"), "#!/bin/sh\necho BUILD_STARTED\n", { mode: 0o755 });
    writeFileSync(join(root, "sdk/platform-tools/adb"), "#!/bin/sh\necho INSTALL_STARTED\n", { mode: 0o755 });
    const result = spawnSync("bash", [join(root, "scripts/run-android-release.sh")], {
      encoding: "utf8", timeout: 15_000,
      env: { ...process.env, ANDROID_HOME: join(root, "sdk"), ANDROID_SDK_ROOT: join(root, "sdk"), NODE_PATH: join(appRoot, "../../node_modules") },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
describe("Android release metadata gate", () => {
  it("stops the real release command before building an obsolete invitation-only manifest", () => {
    const result = runRelease(manifest(["/invite/"]));
    expect(result.status).toBe(1);
    expect(result.output).toContain("metadata is missing or stale");
    expect(result.output).not.toContain("BUILD_STARTED");
    expect(result.output).not.toContain("INSTALL_STARTED");
  });
  it("accepts the configured narrow invitation and Plan filters", () => {
    const result = runRelease(manifest(["/invite/", "/plan/"]));
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("BUILD_STARTED");
    expect(result.output).toContain("INSTALL_STARTED");
  });
  it.each([
    manifest(["/invite/", "/plan/"], false),
    manifest(["/invite/", "/plan/", "/"]),
    manifest(["/invite/", "/plan/"]).replace('android:allowBackup="false"', 'android:allowBackup="true"'),
    manifest(["/invite/", "/plan/"]).replace('tools:node="remove"', ''),
    manifest(["/invite/", "/plan/"]).replace('</activity>', '<intent-filter><data android:scheme="exp+peek-poke"/></intent-filter></activity>'),
  ])("rejects missing verification, broader links, and development metadata", (source) => {
    const result = runRelease(source);
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("BUILD_STARTED");
  });
});
