import path from 'node:path';
import { copyJavaClasses } from './java-classes.mjs';
import { runDetekt } from './tools/kotlin-detekt.mjs';
import { relativeRoots } from '../module/module-paths.mjs';
import { runKotlinFormatter } from './tools/kotlin-format.mjs';
import { runKotlinPsi } from './tools/kotlin-programs.mjs';

const SERIALIZATION_JAR =
  /^(?:jackson-module-kotlin|kotlinx-serialization-(?:core|json)|moshi-kotlin).*\.jar$/u;
const JAVA_CLASSES = 'java-classes';
const JAVA_TEST_CLASSES = 'java-test-classes';

export function isKotlinModule(module) {
  return module.kotlin !== undefined;
}

function usesSerialization(classpaths) {
  return classpaths.mainRuntime.some((jar) => SERIALIZATION_JAR.test(path.basename(jar)));
}

function kotlinManifest(module, options, classpaths) {
  return {
    kotlin: true,
    kotlinSerialization: usesSerialization(classpaths),
    kotlinFormatter: options.formatter,
    kotlinSourceRoots: relativeRoots(module, module.kotlin.sourceRoots),
    kotlinTestSourceRoots: relativeRoots(module, module.kotlin.testSourceRoots),
  };
}

export function analyzeKotlinModule({ module, reportDir, tools, classpaths, pinned, options }) {
  if (options === undefined || !isKotlinModule(module)) {
    return { spotbugsModule: module, coverageModule: module, manifest: {} };
  }
  const javaClasses = path.join(reportDir, JAVA_CLASSES);
  const javaTestClasses = path.join(reportDir, JAVA_TEST_CLASSES);
  copyJavaClasses(module.outputDirectory, javaClasses);
  copyJavaClasses(module.testOutputDirectory, javaTestClasses);
  runDetekt({
    module,
    reportDir,
    tools,
    classpaths,
    javaClassDirectories: [javaClasses, javaTestClasses],
    options,
  });
  runKotlinFormatter({ module, reportDir, tools, options });
  runKotlinPsi({
    module,
    reportDir,
    tools,
    pinned,
    classes: options.psiClasses,
    spawn: options.spawn,
  });
  return {
    spotbugsModule: { ...module, outputDirectory: javaClasses },
    auxClasspath: [...classpaths.mainCompile, module.outputDirectory],
    coverageModule: {
      ...module,
      sourceRoots: [...new Set([...module.sourceRoots, ...module.kotlin.sourceRoots])],
    },
    manifest: kotlinManifest(module, options, classpaths),
  };
}
