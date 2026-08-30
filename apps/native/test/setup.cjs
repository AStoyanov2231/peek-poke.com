const reactNativePath = require.resolve("react-native");

require.cache[reactNativePath] = {
  exports: {
    StyleSheet: {
      flatten(style) {
        return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
      },
    },
  },
  filename: reactNativePath,
  id: reactNativePath,
  loaded: true,
  path: reactNativePath,
};
