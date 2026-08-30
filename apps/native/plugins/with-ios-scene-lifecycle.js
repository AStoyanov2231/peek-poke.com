const fs = require("node:fs/promises");
const path = require("node:path");
const { withDangerousMod, withInfoPlist } = require("@expo/config-plugins");

const SCENE_APP_DELEGATE = `

  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
  }
`;

const SCENE_DELEGATE = `

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let appWindow = appDelegate.window else { return }

    appWindow.windowScene = windowScene
    window = appWindow
  }
}
`;

function withIOSSceneLifecycle(config) {
  config = withInfoPlist(config, (infoPlistConfig) => {
    const plist = infoPlistConfig.modResults;
    plist.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return infoPlistConfig;
  });

  return withDangerousMod(config, ["ios", async (dangerousConfig) => {
    const sourceRoot = dangerousConfig.modRequest.platformProjectRoot;
    const appDelegatePath = path.join(sourceRoot, "PeekPoke", "AppDelegate.swift");
    const sceneDelegatePath = path.join(sourceRoot, "PeekPoke", "SceneDelegate.swift");
    let appDelegate = await fs.readFile(appDelegatePath, "utf8");
    let hasStandaloneSceneDelegate = false;

    try {
      await fs.access(sceneDelegatePath);
      hasStandaloneSceneDelegate = true;
    } catch {
      // Older generated projects keep SceneDelegate in AppDelegate.swift.
    }

    if (!appDelegate.includes("configurationForConnecting connectingSceneSession")) {
      const marker = "\n  // Linking API";
      appDelegate = appDelegate.replace(marker, `${SCENE_APP_DELEGATE}${marker}`);
    }

    if (!hasStandaloneSceneDelegate && !appDelegate.includes("final class SceneDelegate:")) {
      appDelegate = `${appDelegate.trimEnd()}${SCENE_DELEGATE}`;
    }

    await fs.writeFile(appDelegatePath, appDelegate);
    return dangerousConfig;
  }]);
}

module.exports = withIOSSceneLifecycle;
