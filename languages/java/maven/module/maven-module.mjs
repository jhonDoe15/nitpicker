import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from '../maven-lint.mjs';
import { archunitMatcher, collectTestResults, runJacocoReport, runPit } from '../maven-tests.mjs';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mjs';
import { runErrorProne } from '../errorprone/maven-errorprone.mjs';
import { analyzeKotlinModule } from '../kotlin/kotlin-module.mjs';
import { relativeRoots, relativeTo } from '../kotlin/tools/kotlin-files.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writeJdepsReports } from '../../builds/jdeps-reports.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
export const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;
const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const AWAITILITY_JAR = /^awaitility-\d.*\.jar$/u;

export function jacocoExecFiles(module) {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
}

function runStructure(module, reportDir) {
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
  });
}

function runJdeps(module, reportDir) {
  writeJdepsReports({
    command: javaCommand('jdeps'),
    cwd: module.basedir,
    mainDirectory: module.outputDirectory,
    testDirectory: module.testOutputDirectory,
    reportDir,
  });
}

function hasJar(classpath, jar) {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

function writeManifest({ module, reportDir, pinned, spring, classpaths, kotlinManifest }) {
  writeFileSync(
    path.join(reportDir, 'manifest.json'),
    JSON.stringify({
      versions: pinned,
      build: 'maven',
      sourceRoots: relativeRoots(module, module.sourceRoots),
      testSourceRoots: relativeRoots(module, module.testSourceRoots),
      resourceRoots: relativeRoots(module, module.resourceRoots),
      spring,
      guava: hasJar(classpaths.mainCompile, GUAVA_JAR),
      testGuava: hasJar(classpaths.testCompile, GUAVA_JAR),
      testAwaitility: hasJar(classpaths.testCompile, AWAITILITY_JAR),
      published: module.published,
      ...kotlinManifest,
    }),
  );
}

function readTestRuns({ module, reportDir, since, isArchunit, testRuntime }) {
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return testsRan;
}

function runSourceTools({ module, reportDir, tools, classpaths, configs, pinned, kotlin, style }) {
  runPmd({ module, reportDir, tools, classpaths, configs, spring: kotlin.spring });
  runSpotbugs({
    module: kotlin.spotbugsModule,
    reportDir,
    tools,
    auxClasspath: kotlin.auxClasspath,
  });
  runErrorProne({ module, reportDir, tools, classpaths });
  runFormat({ module, reportDir, tools, javaStyle: style.javaStyle });
  runCheckstyle({ module, reportDir, tools, configs, pinned, style });
}

export function analyzeModule({
  module,
  classpaths,
  tools,
  pinned,
  configs,
  since,
  style,
  kotlinOptions,
}) {
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const spring = classpaths.mainCompile.some((entry) => SPRING_JAR.test(path.basename(entry)));
  const testRuntime = classpaths.testRuntime;
  const testsRan = readTestRuns({ module, reportDir, since, isArchunit, testRuntime });
  const kotlin = analyzeKotlinModule({
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    options: kotlinOptions,
    spring,
  });
  runSourceTools({
    module,
    reportDir,
    tools,
    classpaths,
    configs,
    pinned,
    kotlin: { ...kotlin, spring },
    style,
  });
  runStructure(module, reportDir);
  runJdeps(module, reportDir);
  runJacocoReport({
    module: kotlin.coverageModule,
    reportDir,
    tools,
    execFiles: jacocoExecFiles(module),
    since,
    testsRan,
  });
  runPit({ module: kotlin.coverageModule, reportDir, tools, classpaths, isArchunit });
  writeManifest({ module, reportDir, pinned, spring, classpaths, kotlinManifest: kotlin.manifest });
}
