import expoConfig from "eslint-config-expo/flat.js";

export default [
  ...expoConfig,
  {
    files: ["app.config.js", "scripts/**/*.{js,cjs}", "plugins/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { __dirname: "readonly" },
    },
  },
  {
    ignores: [
      ".expo/**",
      "android/**",
      "ios/**",
      "node_modules/**",
    ],
  },
];
