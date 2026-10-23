import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runMaven } from './maven-command.mjs';
import { runCheckstyle, runFormat, runSpotbugs, runPmd } from './maven-lint.mjs';
import { runGuards } from './guards/maven-guards.mjs';
import { runJdeps as runGuardJdeps } from './coupling/maven-jdeps.mjs';
import { lifecycleArgs, readReactor } from './maven-project.mjs';
import {
  moduleClasspaths,
  parseDependencyList,
  usesSpring,
} from './configuration/maven-classpaths.mjs';
import {
  archunitMatcher,
  collectTestResults,
  junitLauncherVersion,
  runJacocoReport,
  runPit,
} from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import { copyTestResults, requireTestngRun } from './results/maven-test-results.mjs';
import {
  archunitTool,
  formatTool,
  jacocoPlugin,
  MAVEN_PLUGINS,
  resolveTools,
} from './maven-tools.mjs';
import { runSpringArch } from './spring/maven-spring-arch.mjs';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mjs';
import { processorTool, runErrorProne } from './errorprone/maven-errorprone.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { runJdepsMetrics, runStructure } from './metrics/maven-metrics.mjs';
import { TEST_FAILURES_REPORT } from '../adapters/reporting/outcomes/test-results.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
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

function readEffectivePom({ projectRoot, maven, work, spawn }) {
  const output = path.join(work, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    spawn,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${output}`],
  });
  return readFileSync(output, 'utf8');
}

function dependencyFile(work, module) {
  const [groupId, artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

function buildAndTest({ projectRoot, maven, work, pinned, modules, spawn }) {
  runMaven({
    projectRoot,
    maven,
    spawn,
    args: [
      '--quiet',
      `${jacocoPlugin(pinned, modules)}:prepare-agent`,
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

function relativeRoots(module, roots) {
  return roots.map((root) => relativeTo(module.basedir, root));
}

function hasJar(classpath, jar) {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

export function moduleManifest({ module, classpaths, pinned }) {
  const spring = usesSpring(classpaths);
  return {
    versions: pinned,
    build: 'maven',
    sourceRoots: relativeRoots(module, module.sourceRoots),
    kotlinSourceRoots: relativeRoots(module, module.kotlinSourceRoots ?? []),
    testSourceRoots: relativeRoots(module, module.testSourceRoots),
    resourceRoots: relativeRoots(module, module.resourceRoots),
    spring,
    springArch: spring,
    guava: hasJar(classpaths.mainCompile, GUAVA_JAR),
    testGuava: hasJar(classpaths.testCompile, GUAVA_JAR),
    testAwaitility: hasJar(classpaths.testCompile, AWAITILITY_JAR),
    published: module.published,
    runsFailsafe: module.runsFailsafe,
  };
}

function readClasspaths(work, module) {
  const dependencies = parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8'));
  return { ...moduleClasspaths(module, dependencies), dependencies };
}

function readTestRuns({ module, reportDir, since, isArchunit, testRuntime }) {
  const results = collectTestResults({ module, reportDir, since, isArchunit });
  requireTestngRun({ module, since, isArchunit, testRuntime });
  copyTestResults({ module, reportDir, since, isArchunit });
  return results;
}

function withDeclaredSpring(manifest, declared) {
  const spring = declared === true || manifest.spring;
  return { ...manifest, spring, springArch: spring };
}

function analyzeSources(context, project) {
  const { module, reportDir, tools, classpaths, configs, pinned, style, spring, spawn } = context;
  runPmd({ module, reportDir, tools, classpaths, configs, spring, spawn });
  runSpotbugs({ module, reportDir, tools, spawn });
  runErrorProne({ module, reportDir, tools, classpaths, spawn });
  runFormat({ module, reportDir, tools, javaStyle: style.javaStyle, spawn });
  runCheckstyle({ module, reportDir, tools, configs, pinned, style, spawn });
  runStructure(module, reportDir, spawn);
  runJdepsMetrics(module, reportDir, spawn);
  runGuardJdeps(module, reportDir, spawn);
  runGuards({ module, reportDir, tools, classpaths, spawn }, project);
}

function analyzeTests(context, { ran, failedClasses }) {
  const { module, reportDir, tools, classpaths, pinned, since, spring, isArchunit } = context;
  const { springRoles, spawn } = context;
  runJacocoReport({
    ...{ module, reportDir, tools, since },
    execFiles: jacocoExecFiles(module),
    testsRan: ran,
    spawn,
  });
  const skipped = runPit({
    ...{ module, reportDir, tools, classpaths, isArchunit },
    excludedTestClasses: failedClasses,
    spawn,
  });
  runSpringArch({ module, reportDir, tools, classpaths, pinned, spring, springRoles, spawn });
  return skipped === undefined ? [] : [skipped];
}

function analyzeModule({ project, spring: declared, ...options }) {
  const { module, classpaths, since, pinned } = options;
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const manifest = withDeclaredSpring(moduleManifest({ module, classpaths, pinned }), declared);
  const context = { ...options, reportDir, isArchunit, spring: manifest.spring };
  const { testRuntime } = classpaths;
  const results = readTestRuns({ module, reportDir, since, isArchunit, testRuntime });
  analyzeSources(context, project);
  const skipped = analyzeTests(context, results);
  writeFileSync(
    path.join(reportDir, TEST_FAILURES_REPORT),
    JSON.stringify({
      failures: results.failures,
      excludedTestClasses: results.failedClasses,
      skipped,
    }),
  );
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

function readModules(run) {
  const modules = readReactor(run.projectRoot, readEffectivePom(run)).filter(
    (module) => module.packaging !== 'pom',
  );
  if (modules.length === 0) {
    throw new Error(
      `No Maven module under ${run.projectRoot} builds Java classes: every module has packaging pom`,
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

function extraTools({ modules, analyzed, policy, pinned }) {
  const spring = analyzed.some(({ classpaths }) => usesSpring(classpaths));
  return [
    ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
    ...formatTool(policy.javaStyle, pinned),
    ...archunitTool(spring, pinned),
  ];
}

export function runMavenPreset(projectRoot, { maven, policy = {}, configs, spawn }) {
  if (policy.preset === 'kotlin') {
    throw new Error(
      'The kotlin preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources',
    );
  }
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    const modules = readModules({ projectRoot, maven, work, spawn });
    const since = Date.now() - 2000;
    buildAndTest({ projectRoot, maven, work, pinned, modules, spawn });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveTools({
      projectRoot,
      maven,
      spawn,
      pinned,
      launcherVersions: missingLauncherVersions(analyzed),
      extraTools: extraTools({ modules, analyzed, policy, pinned }),
    });
    const project = guardProject(projectRoot, policy, modules);
    for (const { module, classpaths } of analyzed) {
      analyzeModule({
        module,
        classpaths,
        tools,
        pinned,
        configs,
        since,
        project,
        spawn,
        style: {
          javaStyle: policy.javaStyle,
          indentation: checkstyleIndentation(policy.conventions),
        },
        spring: policy.spring,
        springRoles: writeSpringRoles(policy.springRoles, work),
      });
    }
    return modules.map((module) => module.basedir);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function guardProject(projectRoot, policy, modules) {
  return {
    projectRoot,
    baselineRoot: policy.snapshot === 'head' ? policy.baselineRoot : undefined,
    reactor: modules.map((module) => module.coordinates),
  };
}
