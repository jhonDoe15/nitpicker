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
  usesSpring,
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
import {
  archunitTool,
  formatTool,
  jacocoPlugin,
  MAVEN_PLUGINS,
  resolveTools,
} from './maven-tools.mjs';
import {
  moduleManifest,
  relativeTo,
  withDeclaredSpring,
  writeManifest,
} from './manifest/maven-manifest.mjs';
import { runSpringArch } from './spring/maven-spring-arch.mjs';
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

function runStaticAnalysis(context) {
  const { module, reportDir, tools, classpaths, configs, pinned, style, spring } = context;
  runPmd({ module, reportDir, tools, classpaths, configs, spring });
  runSpotbugs({ module, reportDir, tools });
  runErrorProne({ module, reportDir, tools, classpaths });
  runFormat({ module, reportDir, tools, javaStyle: style.javaStyle });
  runCheckstyle({ module, reportDir, tools, configs, pinned, style });
  runStructure(module, reportDir);
  runJdeps(module, reportDir);
  runSpringArch({ module, reportDir, tools, classpaths, pinned, spring });
}

function runCoverageTools(context) {
  const { module, reportDir, tools, classpaths, since, testsRan, isArchunit } = context;
  const execFiles = jacocoExecFiles(module);
  runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan });
  runPit({ module, reportDir, tools, classpaths, isArchunit });
}

function analyzeModule(context) {
  const { module, classpaths, pinned } = context;
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const manifest = withDeclaredSpring(
    moduleManifest({ module, classpaths, pinned }),
    context.spring,
  );
  const { spring } = manifest;
  const { testsRan, failure } = readTestRuns({
    ...context,
    module,
    reportDir,
    isArchunit,
    testRuntime: classpaths.testRuntime,
  });
  runStaticAnalysis({ ...context, reportDir, spring });
  if (failure === undefined) {
    runCoverageTools({ ...context, reportDir, testsRan, isArchunit });
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

function resolveAnalysisTools({ projectRoot, maven, pinned, modules, analyzed, policy }) {
  return resolveTools({
    projectRoot,
    maven,
    pinned,
    launcherVersions: missingLauncherVersions(analyzed),
    extraTools: [
      ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
      ...formatTool(policy.javaStyle, pinned),
      ...archunitTool(
        analyzed.some(({ classpaths }) => usesSpring(classpaths)),
        pinned,
      ),
    ],
  });
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
    const tools = resolveAnalysisTools({ projectRoot, maven, pinned, modules, analyzed, policy });
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
        style,
        tolerateFailures: policy.snapshot === 'base',
        projectRoot,
        spring: policy.spring,
      }),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
