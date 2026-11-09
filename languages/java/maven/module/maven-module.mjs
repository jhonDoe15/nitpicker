import path from 'node:path';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from '../maven-lint.mjs';
import { archunitMatcher, collectTestResults, runJacocoReport, runPit } from '../maven-tests.mjs';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mjs';
import { runSpringArch } from '../spring/maven-spring-arch.mjs';
import { withDeclaredSpring } from '../spring/arch-rules-gate.mjs';
import { moduleManifest, writeManifest } from '../manifest/maven-manifest.mjs';
import { ownSourceRoots } from '../../adapters/red-base/tests-failed.mjs';
import { moduleName } from '../../builds/test-failures.mjs';
import { runErrorProne } from '../errorprone/maven-errorprone.mjs';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mjs';
import { relativeTo } from './module-paths.mjs';
import { runGuards } from '../guards/maven-guards.mjs';
import { runJdepsMetrics, runStructure } from '../metrics/maven-metrics.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
export const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';

export function jacocoExecFiles(module) {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
}

function moduleNameOf(module, projectRoot) {
  return moduleName(relativeTo(projectRoot, module.basedir));
}

function readTestRuns(context) {
  const { module, reportDir, since, isArchunit, testRuntime, tolerateFailures } = context;
  const results = collectTestResults({
    module,
    reportDir,
    since,
    isArchunit,
    tolerateFailures,
    moduleName: moduleNameOf(module, context.projectRoot),
  });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return results;
}

function runCoverageTools(options) {
  const { module, reportDir, tools, classpaths, since, testsRan, isArchunit, spawn } = options;
  const execFiles = jacocoExecFiles(module);
  runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan, spawn });
  runPit({ module, reportDir, tools, classpaths, isArchunit, spawn, history: options.pitHistory });
}

function runArchitecture(options) {
  const { module, reportDir, tools, classpaths, pinned, springArch, springRoles, spawn } = options;
  runSpringArch({
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    archRules: springArch,
    springRoles,
    spawn,
  });
}

function runSourceTools(options) {
  const { module, reportDir, tools, classpaths, configs, pinned, kotlin, style, spawn } = options;
  const { springRules } = options;
  runPmd({
    module,
    reportDir,
    tools,
    classpaths,
    configs,
    spring: kotlin.spring,
    springRules,
    spawn,
  });
  runSpotbugs({
    module: kotlin.spotbugsModule,
    reportDir,
    tools,
    configs,
    auxClasspath: kotlin.auxClasspath,
    spawn,
  });
  runErrorProne({ module, reportDir, tools, classpaths, spawn });
  runFormat({ module, reportDir, tools, javaStyle: style.javaStyle, spawn });
  runCheckstyle({ module, reportDir, tools, configs, pinned, style, spawn });
}

function analyzeSources(options) {
  const { module, reportDir } = options;
  const kotlin = analyzeKotlinModule({ ...options, options: options.kotlinOptions });
  runSourceTools({ ...options, kotlin: { ...kotlin, spring: options.spring } });
  runStructure(module, reportDir, options.spawn);
  runJdepsMetrics(module, reportDir, options.spawn);
  runGuards({ ...options, module, reportDir }, options.project);
  runArchitecture({ ...options, module: kotlin.coverageModule });
  return kotlin;
}

export function analyzeModule(options) {
  const { module, classpaths, pinned } = options;
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const manifest = withDeclaredSpring(
    moduleManifest({ module, classpaths, pinned }),
    options.spring,
  );
  const { spring, springArch } = manifest;
  const { testsRan, failure } = readTestRuns({
    ...options,
    reportDir,
    isArchunit,
    testRuntime: classpaths.testRuntime,
  });
  const kotlin = analyzeSources({ ...options, reportDir, spring, springArch });
  if (failure === undefined) {
    runCoverageTools({
      ...options,
      module: kotlin.coverageModule,
      reportDir,
      testsRan,
      isArchunit,
    });
  }
  const written = { ...manifest, ...kotlin.manifest };
  writeManifest({ reportDir, manifest: written, testsFailed: failure !== undefined });
  return failure && { ...failure, roots: ownSourceRoots(written) };
}
