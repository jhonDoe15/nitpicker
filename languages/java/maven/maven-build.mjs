import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { javaCommand, runJava, runMaven } from './maven-command.mjs';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from './maven-lint.mjs';
import {
  lifecycleArgs,
  moduleClasspaths,
  parseDependencyList,
  readReactor,
} from './maven-project.mjs';
import {
  archunitMatcher,
  collectTestResults,
  junitLauncherVersion,
  runJacocoReport,
  runPit,
} from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import { copyTestResults, requireTestngRun } from './results/maven-test-results.mjs';
import { formatTool, jacocoPlugin, MAVEN_PLUGINS, resolveTools } from './maven-tools.mjs';
import { processorTool, runErrorProne } from './errorprone/maven-errorprone.mjs';
import { GRADLE_DIRECTORY, readPinnedTools } from '../builds/java-build.mjs';
import { writeJdepsReports } from '../builds/jdeps-reports.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;
const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const AWAITILITY_JAR = /^awaitility-\d.*\.jar$/u;
const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
];

function relativeTo(basedir, file) {
  return path.relative(basedir, file).replaceAll('\\', '/');
}

function readEffectivePom(projectRoot, maven, work) {
  const output = path.join(work, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${output}`],
  });
  return readFileSync(output, 'utf8');
}

function dependencyFile(work, module) {
  const [groupId, artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

function buildAndTest({ projectRoot, maven, work, pinned, modules }) {
  runMaven({
    projectRoot,
    maven,
    args: [
      '--quiet',
      `${jacocoPlugin(pinned)}:prepare-agent`,
      `-Djacoco.destFile=\${project.build.directory}/${OWN_JACOCO_EXEC}`,
      ...lifecycleArgs(modules),
      `${MAVEN_PLUGINS.dependency}:list`,
      `-DoutputFile=${path.join(work, 'dependencies', '${project.groupId}', '${project.artifactId}.txt')}`,
      '-DoutputAbsoluteArtifactFilename=true',
      '-DappendOutput=false',
      '-Dmaven.test.failure.ignore=true',
      '-DskipTests=false',
      '-Dmaven.test.skip=false',
      ...PROJECT_CHECKS_OFF,
    ],
  });
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

function relativeRoots(module, roots) {
  return roots.map((root) => relativeTo(module.basedir, root));
}

function hasJar(classpath, jar) {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

export function moduleManifest({ module, classpaths, pinned }) {
  return {
    versions: pinned,
    build: 'maven',
    sourceRoots: relativeRoots(module, module.sourceRoots),
    kotlinSourceRoots: relativeRoots(module, module.kotlinSourceRoots ?? []),
    testSourceRoots: relativeRoots(module, module.testSourceRoots),
    resourceRoots: relativeRoots(module, module.resourceRoots),
    spring: hasJar(classpaths.mainCompile, SPRING_JAR),
    guava: hasJar(classpaths.mainCompile, GUAVA_JAR),
    testGuava: hasJar(classpaths.testCompile, GUAVA_JAR),
    testAwaitility: hasJar(classpaths.testCompile, AWAITILITY_JAR),
    published: module.published,
  };
}

function readClasspaths(work, module) {
  return moduleClasspaths(
    module,
    parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8')),
  );
}

function readTestRuns({ module, reportDir, since, isArchunit, testRuntime }) {
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return testsRan;
}

function analyzeModule({
  module,
  classpaths,
  tools,
  pinned,
  configs,
  since,
  style,
  spring: declared,
}) {
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const detected = moduleManifest({ module, classpaths, pinned });
  const manifest = { ...detected, spring: declared === true || detected.spring };
  const testRuntime = classpaths.testRuntime;
  const testsRan = readTestRuns({ module, reportDir, since, isArchunit, testRuntime });
  runPmd({ module, reportDir, tools, classpaths, configs, spring: manifest.spring });
  runSpotbugs({ module, reportDir, tools });
  runErrorProne({ module, reportDir, tools, classpaths });
  runFormat({ module, reportDir, tools, javaStyle: style.javaStyle });
  runCheckstyle({ module, reportDir, tools, configs, pinned, style });
  runStructure(module, reportDir);
  runJdeps(module, reportDir);
  runJacocoReport({
    module,
    reportDir,
    tools,
    execFiles: jacocoExecFiles(module),
    since,
    testsRan,
  });
  runPit({ module, reportDir, tools, classpaths, isArchunit });
  writeFileSync(path.join(reportDir, 'manifest.json'), JSON.stringify(manifest));
}

function jacocoExecFiles(module) {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
}

function staleOutputs(module) {
  return [
    path.join(module.basedir, MAVEN_REPORT_DIRECTORY),
    ...jacocoExecFiles(module).filter((file) =>
      file.startsWith(`${module.buildDirectory}${path.sep}`),
    ),
  ];
}

function readModules(projectRoot, maven, work) {
  const modules = readReactor(projectRoot, readEffectivePom(projectRoot, maven, work)).filter(
    (module) => module.packaging !== 'pom',
  );
  if (modules.length === 0) {
    throw new Error(
      `No Maven module under ${projectRoot} builds Java classes: every module has packaging pom`,
    );
  }
  for (const file of modules.flatMap(staleOutputs)) {
    rmSync(file, { recursive: true, force: true });
  }
  for (const module of modules) {
    mkdirSync(path.join(module.basedir, MAVEN_REPORT_DIRECTORY), { recursive: true });
  }
  return modules;
}

function missingLauncherVersions(analyzed) {
  const versions = analyzed.map(({ classpaths }) => junitLauncherVersion(classpaths.testRuntime));
  return [...new Set(versions.filter((version) => version !== undefined))];
}

export function runMavenPreset(projectRoot, { maven, policy = {}, configs }) {
  if (policy.preset === 'kotlin') {
    throw new Error(
      'The kotlin preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources',
    );
  }
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    const modules = readModules(projectRoot, maven, work);
    const since = Date.now() - 2000;
    buildAndTest({ projectRoot, maven, work, pinned, modules });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveTools({
      projectRoot,
      maven,
      pinned,
      launcherVersions: missingLauncherVersions(analyzed),
      extraTools: [
        ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
        ...formatTool(policy.javaStyle, pinned),
      ],
    });
    for (const { module, classpaths } of analyzed) {
      analyzeModule({
        module,
        classpaths,
        tools,
        pinned,
        configs,
        since,
        style: {
          javaStyle: policy.javaStyle,
          indentation: checkstyleIndentation(policy.conventions),
        },
        spring: policy.spring,
      });
    }
    return modules.map((module) => module.basedir);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
