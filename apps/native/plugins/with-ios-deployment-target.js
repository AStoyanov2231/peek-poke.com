const { withPodfile } = require("@expo/config-plugins");

const DEPLOYMENT_TARGET = "16.4";
const START = "# @generated begin peekpoke-ios-deployment-target";
const END = "# @generated end peekpoke-ios-deployment-target";
const BLOCK = `${START}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${DEPLOYMENT_TARGET}'
      end
    end
${END}`;

function withIosDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;
    const start = contents.indexOf(START);
    const end = contents.indexOf(END);

    if (start !== -1 && end !== -1) {
      podfileConfig.modResults.contents =
        contents.slice(0, start) + BLOCK + contents.slice(end + END.length);
      return podfileConfig;
    }

    const postInstallEnd = /(^  post_install do \|installer\|[\s\S]*?)(^  end\nend\s*$)/m;
    if (!postInstallEnd.test(contents)) {
      throw new Error("Peek & Poke iOS deployment target plugin could not find post_install.");
    }

    podfileConfig.modResults.contents = contents.replace(
      postInstallEnd,
      `$1${BLOCK}\n$2`
    );
    return podfileConfig;
  });
}

module.exports = withIosDeploymentTarget;
