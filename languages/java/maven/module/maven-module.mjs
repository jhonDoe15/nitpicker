import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from '../maven-lint.mjs';
import { archunitMatcher, collectTestResults, runJacocoReport, runPit } from '../maven-tests.mjs';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mjs';
import { runSpringArch } from '../spring/maven-spring-arch.mjs';
import { usesSpring } from '../maven-project.mjs';
import { runErrorProne } from '../errorprone/maven-errorprone.mjs';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mjs';
import { relativeRoots, relativeTo } from './module-paths.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writeJdepsReports } from '../../builds/jdeps-reports.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
export const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const AWAITILITY_JAR = /^awaitility-\d.*\.jar$/u;

export function jacocoExecFiles(module) {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
}

function runStructure(module, reportDir, spawn) {
  const roots = module.sourceRoots
    .filter((root) => existsSync(root))
    .map((root) => relativeTo(module.basedir, root));
  runJava({
    tool: 'StructureMetrics',
    args: [
      path.join(GRADLE_DIRECTORY, 'StructureMetrics.java'),
      path.join(reportDir, 'structure.json'),
      path.join(reportDir, 'classes.json'),
      module.basedir,
      ...roots,
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
    spawn,
  });
}

function runJdeps(module, reportDir, spawn) {
  writeJdepsReports({
    command: javaCommand('jdeps'),
    cwd: module.basedir,
    mainDirectory: module.outputDirectory,
    testDirectory: module.testOutputDirectory,
    reportDir,
    spawn,
  });
}

function hasJar(classpath, jar) {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

function kotlinOnlyRoots(module) {
  return (module.kotlin?.sourceRoots ?? []).filter((root) => !module.sourceRoots.includes(root));
}

export function moduleManifest({ module, classpaths, pinned, spring }) {
  const springModule = spring === true || usesSpring(classpaths);
  return {
    versions: pinned,
    build: 'maven',
    sourceRoots: relativeRoots(module, module.sourceRoots),
    kotlinSourceRoots: relativeRoots(module, kotlinOnlyRoots(module)),
    testSourceRoots: relativeRoots(module, module.testSourceRoots),
    resourceRoots: relativeRoots(module, module.resourceRoots),
    spring: springModule,
    springArch: springModule,
    guava: hasJar(classpaths.mainCompile, GUAVA_JAR),
    testGuava: hasJar(classpaths.testCompile, GUAVA_JAR),
    testAwaitility: hasJar(classpaths.testCompile, AWAITILITY_JAR),
    published: module.published,
    runsFailsafe: module.runsFailsafe,
  };
}

function readTestRuns({ module, reportDir, since, isArchunit, testRuntime }) {
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return testsRan;
}

function runCoverage(options) {
  const { module, reportDir, tools, classpaths, pinned, since, testsRan, spring, spawn } = options;
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const execFiles = jacocoExecFiles(module);
  runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan, spawn });
  runPit({ module, reportDir, tools, classpaths, isArchunit, spawn });
  runSpringArch({ module, reportDir, tools, classpaths, pinned, spring, spawn });
}

function runSourceTools(options) {
  const { module, reportDir, tools, classpaths, configs, pinned, kotlin, style, spawn } = options;
  runPmd({ module, reportDir, tools, classpaths, configs, spring: kotlin.spring, spawn });
  runSpotbugs({
    module: kotlin.spotbugsModule,
    reportDir,
    tools,
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
  runJdeps(module, reportDir, options.spawn);
  return kotlin;
}

export function analyzeModule(options) {
  const { module, classpaths, pinned, since } = options;
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const manifest = moduleManifest({ module, classpaths, pinned, spring: options.spring });
  const { spring } = manifest;
  const testsRan = readTestRuns({
    module,
    reportDir,
    since,
    isArchunit,
    testRuntime: classpaths.testRuntime,
  });
  const kotlin = analyzeSources({ ...options, reportDir, spring });
  runCoverage({ ...options, module: kotlin.coverageModule, reportDir, spring, testsRan });
  writeFileSync(
    path.join(reportDir, 'manifest.json'),
    JSON.stringify({ ...manifest, ...kotlin.manifest }),
  );
}
