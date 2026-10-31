import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
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
  missingLauncherVersions,
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
import { ownSourceRoots } from '../adapters/red-base/tests-failed.mjs';
import { moduleManifest, relativeTo, writeManifest } from './manifest/maven-manifest.mjs';
import { runSpringArch } from './spring/maven-spring-arch.mjs';
import { buildRunsArchRules, withDeclaredSpring } from './spring/arch-rules-gate.mjs';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mjs';
import { MAVEN_PRESETS } from '../adapters/gradle-presets.mjs';
import { processorTool, runErrorProne } from './errorprone/maven-errorprone.mjs';
import { GRADLE_DIRECTORY, readPinnedTools } from '../builds/java-build.mjs';
import { writeJdepsReports } from '../builds/jdeps-reports.mjs';
import { moduleName } from '../builds/test-failures.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
];

function readEffectivePom({ projectRoot, maven, work, spawn, timeoutMs }) {
  const output = path.join(work, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${output}`],
  });
  return readFileSync(output, 'utf8');
}

function dependencyFile(work, module) {
  const [groupId, artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

function buildAndTest({ projectRoot, maven, work, pinned, modules, spawn, timeoutMs }) {
  runMaven({
    projectRoot,
    maven,
    spawn,
    timeoutMs,
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

function runStructure(module, reportDir, { spawn, timeoutMs }) {
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
    timeoutMs,
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

function readClasspaths(work, module) {
  return moduleClasspaths(
    module,
    parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8')),
  );
}

function moduleNameOf(module, projectRoot) {
  return moduleName(path.relative(projectRoot, module.basedir).replaceAll('\\', '/'));
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

function analyzeSources(options) {
  const { module, reportDir, classpaths, tools, pinned, configs, style, spring } = options;
  const { springArch, springRoles, spawn, timeoutMs } = options;
  const run = { spawn, timeoutMs };
  runPmd({ module, reportDir, tools, classpaths, configs, spring, ...run });
  runSpotbugs({ module, reportDir, tools, ...run });
  runErrorProne({ module, reportDir, tools, classpaths, ...run });
  runFormat({ module, reportDir, tools, javaStyle: style.javaStyle, ...run });
  runCheckstyle({ module, reportDir, tools, configs, pinned, style, ...run });
  runStructure(module, reportDir, run);
  runJdeps(module, reportDir, spawn);
  runSpringArch({
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    archRules: springArch,
    springRoles,
    ...run,
  });
}

function runCoverageTools(options) {
  const { module, reportDir, tools, classpaths, since, testsRan, isArchunit } = options;
  const run = { spawn: options.spawn, timeoutMs: options.timeoutMs };
  const execFiles = jacocoExecFiles(module);
  runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan, ...run });
  runPit({ module, reportDir, tools, classpaths, isArchunit, ...run });
}

function analyzeModule(options) {
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
  analyzeSources({ ...options, reportDir, spring, springArch });
  if (failure === undefined) {
    runCoverageTools({ ...options, reportDir, testsRan, isArchunit });
  }
  writeManifest({ reportDir, manifest, testsFailed: failure !== undefined });
  return failure && { ...failure, roots: ownSourceRoots(manifest) };
}

function analyzeModules({ analyzed, ...shared }) {
  return analyzed
    .map(({ module, classpaths }) => analyzeModule({ ...shared, module, classpaths }))
    .filter((failure) => failure !== undefined);
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

function extraTools({ modules, analyzed, policy, pinned }) {
  return [
    ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
    ...formatTool(policy.javaStyle, pinned),
    ...archunitTool(buildRunsArchRules(policy, analyzed), pinned),
  ];
}

export function runMavenPreset(projectRoot, { maven, policy = {}, configs, spawn, timeoutMs }) {
  if (policy.preset !== undefined && !MAVEN_PRESETS.includes(policy.preset)) {
    throw new Error(
      `The ${policy.preset} preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources`,
    );
  }
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    const modules = readModules({ projectRoot, maven, work, spawn, timeoutMs });
    const since = Date.now() - 2000;
    buildAndTest({ projectRoot, maven, work, pinned, modules, spawn, timeoutMs });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveTools({
      projectRoot,
      maven,
      spawn,
      timeoutMs,
      pinned,
      launcherVersions: missingLauncherVersions(analyzed),
      extraTools: extraTools({ modules, analyzed, policy, pinned }),
    });
    const style = {
      javaStyle: policy.javaStyle,
      indentation: checkstyleIndentation(policy.conventions),
    };
    return {
      moduleDirs: modules.map((module) => module.basedir),
      testsFailures: analyzeModules({
        analyzed,
        tools,
        pinned,
        configs,
        since,
        spawn,
        timeoutMs,
        style,
        tolerateFailures: policy.snapshot === 'base',
        projectRoot,
        spring: policy.spring,
        springRoles: writeSpringRoles(policy.springRoles, work),
      }),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
