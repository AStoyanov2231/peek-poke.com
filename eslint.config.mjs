import nextConfig from "eslint-config-next";

export default [
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
      "out/**",
      "build/**",
      "next-env.d.ts",
      "apps/native/**",
      "packages/*/dist/**",
    ],
  },
];
