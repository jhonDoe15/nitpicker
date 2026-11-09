import path from 'node:path';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from '../maven-lint.mjs';
import { archunitMatcher } from '../maven-tests.mjs';
import { runSpringArch } from '../spring/maven-spring-arch.mjs';
import { withDeclaredSpring, withFeatureFolders } from '../spring/arch-rules-gate.mjs';
import { moduleManifest, usesReactor, writeManifest } from '../manifest/maven-manifest.mjs';
import { ownSourceRoots } from '../../adapters/red-base/tests-failed.mjs';
import { runErrorProne } from '../errorprone/maven-errorprone.mjs';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mjs';
import { runToolsConcurrently } from '../parallel/concurrent-tools.mjs';
import { runJdeps, runStructure } from '../parallel/module-metrics.mjs';
import { readTestRuns, runCoverageTools } from '../quick/maven-test-phase.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const LINT_URL = new URL('../maven-lint.mjs', import.meta.url).href;
const ERRORPRONE_URL = new URL('../errorprone/maven-errorprone.mjs', import.meta.url).href;
const METRICS_URL = new URL('../parallel/module-metrics.mjs', import.meta.url).href;

function runArchitecture(options) {
  const { module, reportDir, tools, classpaths, pinned, springArch, springRoles } = options;
  runSpringArch({
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    archRules: springArch,
    springRoles,
    spawn: options.spawn,
    timeoutMs: options.timeoutMs,
  });
}

function sourceTask(tool, url, toolOptions, shared) {
  return { run: tool, url, name: tool.name, options: { ...toolOptions, ...shared } };
}

function runSourceTools(options) {
  const { module, reportDir, tools, classpaths, configs, pinned, kotlin, style } = options;
  const run = { timeoutMs: options.timeoutMs };
  const tasks = [
    sourceTask(
      runPmd,
      LINT_URL,
      {
        module,
        reportDir,
        tools,
        classpaths,
        configs,
        spring: kotlin.spring,
        springRules: options.springRules,
        reactor: options.reactor,
      },
      run,
    ),
    sourceTask(
      runSpotbugs,
      LINT_URL,
      {
        module: kotlin.spotbugsModule,
        reportDir,
        tools,
        configs,
        auxClasspath: kotlin.auxClasspath,
      },
      run,
    ),
    sourceTask(
      runErrorProne,
      ERRORPRONE_URL,
      { module, reportDir, tools, classpaths, configs },
      run,
    ),
    sourceTask(runFormat, LINT_URL, { module, reportDir, tools, javaStyle: style.javaStyle }, run),
    sourceTask(runCheckstyle, LINT_URL, { module, reportDir, tools, configs, pinned, style }, run),
    sourceTask(runStructure, METRICS_URL, { module, reportDir }, run),
    sourceTask(runJdeps, METRICS_URL, { module, reportDir }, run),
  ];
  runToolsConcurrently(tasks, { spawn: options.spawn, concurrent: options.quick === true });
}

function analyzeSources(options) {
  const kotlin = analyzeKotlinModule({ ...options, options: options.kotlinOptions });
  runSourceTools({ ...options, kotlin: { ...kotlin, spring: options.spring } });
  runArchitecture({ ...options, module: kotlin.coverageModule });
  return kotlin;
}

export function analyzeModule(options) {
  const { module, classpaths, pinned } = options;
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const manifest = withFeatureFolders(
    withDeclaredSpring(moduleManifest({ module, classpaths, pinned }), options.spring),
    options.featureFolders,
  );
  const { spring, springArch } = manifest;
  const { testsRan, failure } = readTestRuns({
    ...options,
    reportDir,
    isArchunit,
    testRuntime: classpaths.testRuntime,
  });
  const reactor = usesReactor(classpaths);
  const kotlin = analyzeSources({ ...options, reportDir, spring, springArch, reactor });
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
