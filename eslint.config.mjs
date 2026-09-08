import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      ".next-e2e/**",
      ".next-hosted-verification/**",
      ".next-ci-verify/**",
      "coverage/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "apps/native/**",
      "packages/*/dist/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default config;
