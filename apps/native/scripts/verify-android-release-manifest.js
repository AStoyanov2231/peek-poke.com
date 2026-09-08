const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { AndroidConfig } = require("@expo/config-plugins");

function sortedRecords(records) {
  return records.map((record) => JSON.stringify(Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  ))).sort();
}

function assertAndroidReleaseManifest(manifest, config) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  if (application.$["android:allowBackup"] !== "false") {
    throw new Error("Android backups must remain disabled");
  }
  for (const permission of config.android.blockedPermissions ?? []) {
    const declarations = manifest.manifest["uses-permission"]?.filter(
      (entry) => entry.$["android:name"] === permission,
    ) ?? [];
    if (declarations.length !== 1 || declarations[0].$["tools:node"] !== "remove") {
      throw new Error(`Blocked permission must be removed: ${permission}`);
    }
  }

  const filters = activity["intent-filter"] ?? [];
  if (filters.some((filter) => filter.data?.some((entry) =>
    entry.$["android:scheme"]?.startsWith("exp+"),
  ))) {
    throw new Error("A development-client scheme remains in the release manifest");
  }
  const expected = (config.android.intentFilters ?? []).flatMap((filter) => {
    if (filter.action !== "VIEW" || !filter.autoVerify) return [];
    return filter.data ?? [];
  });
  const actual = filters.flatMap((filter) => {
    const data = filter.data ?? [];
    if (!data.some((entry) => ["http", "https"].includes(entry.$["android:scheme"]))) return [];
    const actions = filter.action?.map((entry) => entry.$["android:name"]) ?? [];
    const categories = filter.category?.map((entry) => entry.$["android:name"]) ?? [];
    if (filter.$?.["android:autoVerify"] !== "true"
      || !actions.includes("android.intent.action.VIEW")
      || !categories.includes("android.intent.category.BROWSABLE")
      || !categories.includes("android.intent.category.DEFAULT")) {
      throw new Error("Public links require verified VIEW, BROWSABLE, and DEFAULT intent filters");
    }
    return data.map((entry) => Object.fromEntries(Object.entries(entry.$).map(
      ([key, value]) => [key.replace(/^android:/, ""), value],
    )));
  });
  if (expected.length === 0 || JSON.stringify(sortedRecords(actual)) !== JSON.stringify(sortedRecords(expected))) {
    throw new Error("Generated public links do not match app.json; regenerate the Android project");
  }
}

async function verifyAndroidReleaseManifest(manifestPath, configPath) {
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
  const config = JSON.parse(await readFile(configPath, "utf8")).expo;
  assertAndroidReleaseManifest(manifest, config);
}

if (require.main === module) {
  const appRoot = path.resolve(__dirname, "..");
  verifyAndroidReleaseManifest(
    process.argv[2] ?? path.join(appRoot, "android/app/src/main/AndroidManifest.xml"),
    process.argv[3] ?? path.join(appRoot, "app.json"),
  ).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { assertAndroidReleaseManifest, verifyAndroidReleaseManifest };
