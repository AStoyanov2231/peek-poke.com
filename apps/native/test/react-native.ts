const platform = process.env.NATIVE_TEST_PLATFORM === "ios" ? "ios" : "android";

export const Platform = {
  OS: platform,
  select<T>(specifics: { ios?: T; android?: T; default?: T }) {
    return specifics[platform] ?? specifics.default;
  },
};

export const Linking = {
  openURL: async () => undefined,
};

export const Alert = {
  alert: () => undefined,
};

export const AppState = {
  currentState: "active",
  addEventListener: () => ({ remove: () => undefined }),
};
