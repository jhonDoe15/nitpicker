import path from 'node:path';
import { runFormat } from '../format/maven-format.mjs';
import { runCheckstyle, runPmd, runSpotbugs } from '../maven-lint.mjs';
import { archunitMatcher } from '../maven-tests.mjs';
import { runSpringArch } from '../spring/maven-spring-arch.mjs';
import { withDeclaredSpring, withFeatureFolders } from '../spring/arch-rules-gate.mjs';
import { moduleManifest, usesReactor, writeManifest } from '../manifest/maven-manifest.mjs';
import { ownSourceRoots } from '../../adapters/red-base/tests-failed.mjs';
import { runErrorProne } from '../errorprone/maven-errorprone.mjs';
import { parserJava, sourceLevel } from '../errorprone/maven-jdk.mjs';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mjs';
import { runGuards } from '../guards/maven-guards.mjs';
import { runToolsConcurrently } from '../parallel/concurrent-tools.mjs';
import { runJdeps, runStructure } from '../parallel/module-metrics.mjs';
import { readTestRuns, runCoverageTools } from '../quick/maven-test-phase.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const LINT_URL = new URL('../maven-lint.mjs', import.meta.url).href;
const FORMAT_URL = new URL('../format/maven-format.mjs', import.meta.url).href;
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

function sourceTask(tool, url, options) {
  return { run: tool, url, name: tool.name, options };
}

function runSourceTools(options) {
  const { module, reportDir, tools, classpaths, configs, pinned, kotlin, style } = options;
  const base = { module, reportDir, tools, configs, timeoutMs: options.timeoutMs };
  const tasks = [
    sourceTask(runPmd, LINT_URL, {
      ...base,
      classpaths,
      spring: kotlin.spring,
      springRules: options.springRules,
      reactor: options.reactor,
    }),
    sourceTask(runSpotbugs, LINT_URL, {
      ...base,
      module: kotlin.spotbugsModule,
      auxClasspath: kotlin.auxClasspath,
    }),
    sourceTask(runErrorProne, ERRORPRONE_URL, { ...base, classpaths }),
    sourceTask(runFormat, FORMAT_URL, { ...base, javaStyle: style.javaStyle }),
    sourceTask(runCheckstyle, LINT_URL, { ...base, pinned, style }),
    sourceTask(runStructure, METRICS_URL, base),
    sourceTask(runJdeps, METRICS_URL, base),
  ];
  runToolsConcurrently(tasks, { spawn: options.spawn });
}

function analyzeSources(options) {
  const kotlin = analyzeKotlinModule({ ...options, options: options.kotlinOptions });
  runSourceTools({ ...options, kotlin: { ...kotlin, spring: options.spring } });
  runGuards(options, options.project);
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
  const written = {
    ...manifest,
    ...kotlin.manifest,
    sourceJava: parserJava({ level: sourceLevel(module.compiler) }),
  };
  writeManifest({ reportDir, manifest: written, testsFailed: failure !== undefined });
  return failure && { ...failure, roots: ownSourceRoots(written) };
}
