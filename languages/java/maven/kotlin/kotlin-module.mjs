import path from 'node:path';
import { copyJavaClasses } from './kotlin-classes.mjs';
import { runDetekt } from './tools/kotlin-detekt.mjs';
import { relativeTo } from './tools/kotlin-files.mjs';
import { runKotlinFormatter } from './tools/kotlin-format.mjs';
import { runKotlinMetrics, runKotlinSyntax } from './tools/kotlin-programs.mjs';

const JAVA_CLASSES = 'java-classes';

export function isKotlinModule(module) {
  return module.kotlin !== undefined;
}

function relativeRoots(module, roots) {
  return roots.map((root) => relativeTo(module.basedir, root));
}

function kotlinManifest(module, options) {
  return {
    kotlin: true,
    kotlinFormatter: options.formatter,
    kotlinSourceRoots: relativeRoots(module, module.kotlin.sourceRoots),
    kotlinTestSourceRoots: relativeRoots(module, module.kotlin.testSourceRoots),
  };
}

export function analyzeKotlinModule({
  module,
  reportDir,
  tools,
  classpaths,
  pinned,
  options,
  spring,
}) {
  if (options === undefined || !isKotlinModule(module)) {
    return { spotbugsModule: module, coverageModule: module, manifest: {} };
  }
  const javaClasses = path.join(reportDir, JAVA_CLASSES);
  copyJavaClasses(module.outputDirectory, javaClasses);
  runDetekt({ module, reportDir, tools, classpaths, javaClassDirectory: javaClasses, options });
  runKotlinFormatter({ module, reportDir, tools, options });
  runKotlinMetrics({ module, reportDir, tools, pinned });
  if (spring) {
    runKotlinSyntax({ module, reportDir, tools, pinned });
  }
  return {
    spotbugsModule: { ...module, outputDirectory: javaClasses },
    auxClasspath: [...classpaths.mainCompile, module.outputDirectory],
    coverageModule: {
      ...module,
      sourceRoots: [...new Set([...module.sourceRoots, ...module.kotlin.sourceRoots])],
    },
    manifest: kotlinManifest(module, options),
  };
}
