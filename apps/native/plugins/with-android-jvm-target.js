const { withProjectBuildGradle } = require("@expo/config-plugins");

const START = "// @generated begin peekpoke-android-jvm-target";
const END = "// @generated end peekpoke-android-jvm-target";
const BLOCK = `${START}

subprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
  }
  tasks.withType(JavaCompile).configureEach {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

${END}`;

function withAndroidJvmTarget(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== "groovy") {
      throw new Error("Peek & Poke Android JVM target plugin requires Groovy Gradle files.");
    }

    const contents = gradleConfig.modResults.contents;
    const start = contents.indexOf(START);
    const end = contents.indexOf(END);

    if (start !== -1 && end !== -1) {
      gradleConfig.modResults.contents =
        contents.slice(0, start) + BLOCK + contents.slice(end + END.length);
    } else {
      gradleConfig.modResults.contents = `${contents.trimEnd()}\n\n${BLOCK}\n`;
    }

    return gradleConfig;
  });
}

module.exports = withAndroidJvmTarget;
