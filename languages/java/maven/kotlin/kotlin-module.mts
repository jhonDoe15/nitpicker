import path from 'node:path';
import { copyJavaClasses } from './java-classes.mts';
import { runDetekt } from './tools/kotlin-detekt.mts';
import { relativeRoots } from '../module/module-paths.mts';
import { runKotlinFormatter } from './tools/kotlin-format.mts';
import { runKotlinPsi } from './tools/kotlin-programs.mts';

import type {
  KotlinClasspaths,
  KotlinModule,
  KotlinOptions,
  ToolClasspaths,
  ProjectModule,
} from '../typed/kotlin-types.mts';
import type { KotlinPinned } from './tools/kotlin-dependencies.mts';

type RuntimeClasspaths = KotlinClasspaths & { readonly mainRuntime: readonly string[] };
type KotlinAnalysis = {
  readonly spotbugsModule: ProjectModule;
  readonly coverageModule: ProjectModule;
  readonly auxClasspath?: string[];
  readonly manifest: Readonly<Record<string, unknown>>;
};

const SERIALIZATION_JAR =
  /^(?:jackson-module-kotlin|kotlinx-serialization-(?:core|json)|moshi-kotlin).*\.jar$/u;
const JAVA_CLASSES = 'java-classes';
const JAVA_TEST_CLASSES = 'java-test-classes';

export function isKotlinModule(module: ProjectModule): module is KotlinModule {
  return module.kotlin !== undefined;
}

function usesSerialization(classpaths: RuntimeClasspaths): boolean {
  return classpaths.mainRuntime.some((jar) => SERIALIZATION_JAR.test(path.basename(jar)));
}

export function kotlinManifest(
  module: KotlinModule,
  options: Pick<KotlinOptions, 'formatter'>,
  classpaths: RuntimeClasspaths,
): Readonly<Record<string, unknown>> {
  return {
    kotlin: true,
    kotlinSerialization: usesSerialization(classpaths),
    kotlinFormatter: options.formatter,
    kotlinAllOpen: module.kotlin.allOpen,
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
}: {
  readonly module: ProjectModule;
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly classpaths: RuntimeClasspaths;
  readonly pinned: KotlinPinned;
  readonly options: KotlinOptions | undefined;
}): KotlinAnalysis {
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
    timeoutMs: options.timeoutMs,
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
