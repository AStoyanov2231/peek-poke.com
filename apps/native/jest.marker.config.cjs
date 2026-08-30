const platform = process.env.NATIVE_TEST_PLATFORM;

if (platform && platform !== "ios" && platform !== "android") {
  throw new Error(`Unsupported NATIVE_TEST_PLATFORM: ${platform}`);
}

const platforms = platform ? [platform] : ["ios", "android"];

module.exports = {
  watchman: false,
  projects: platforms.map((target) => ({
    displayName: target,
    preset: `jest-expo/${target}`,
    rootDir: __dirname,
    testMatch: [
      "<rootDir>/test/error-recovery-pressability.test.tsx",
      "<rootDir>/test/owner-display-name-editor-pressability.test.tsx",
      "<rootDir>/test/admin-report-actions-pressability.test.tsx",
      "<rootDir>/test/profile-convergence-platform.marker.ts",
      "<rootDir>/test/read-receipt-recovery-pressability.test.tsx",
      "<rootDir>/test/inbox-data-recovery-pressability.test.tsx",
      "<rootDir>/test/account-deletion-recovery.marker.ts",
    ],
  })),
};
