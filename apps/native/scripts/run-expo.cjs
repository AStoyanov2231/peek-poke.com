const path = require("node:path");
const { spawnSync } = require("node:child_process");

const nativeDirectory = path.resolve(__dirname, "..");
const nativeNodeModules = path.join(nativeDirectory, "node_modules");
const existingNodePath = process.env.NODE_PATH
  ? process.env.NODE_PATH.split(path.delimiter)
  : [];
const nodePath = [nativeNodeModules, ...existingNodePath]
  .filter(Boolean)
  .join(path.delimiter);
const expoCli = require.resolve("expo/bin/cli", { paths: [nativeDirectory] });

const result = spawnSync(process.execPath, [expoCli, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    NODE_PATH: nodePath,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
