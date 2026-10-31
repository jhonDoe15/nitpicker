import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runMaven } from './maven-command.mjs';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from './maven-lint.mjs';
import { moduleClasspaths, parseDependencyList, readReactor } from './maven-project.mjs';
import { archunitMatcher, missingLauncherVersions } from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import { archunitTool, formatTool, MAVEN_PLUGINS, resolveTools } from './maven-tools.mjs';
import { ownSourceRoots } from '../adapters/red-base/tests-failed.mjs';
import { moduleManifest, writeManifest } from './manifest/maven-manifest.mjs';
import { runSpringArch } from './spring/maven-spring-arch.mjs';
import { buildRunsArchRules, withDeclaredSpring } from './spring/arch-rules-gate.mjs';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mjs';
import { MAVEN_PRESETS } from '../adapters/gradle-presets.mjs';
import { processorTool, runErrorProne } from './errorprone/maven-errorprone.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { runToolsConcurrently } from './parallel/concurrent-tools.mjs';
import { runJdeps, runStructure } from './parallel/module-metrics.mjs';
import {
  buildGoals,
  jacocoExecFiles,
  readTestRuns,
  runCoverageTools,
} from './quick/maven-test-phase.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const LINT_URL = new URL('maven-lint.mjs', import.meta.url).href;
const ERRORPRONE_URL = new URL('errorprone/maven-errorprone.mjs', import.meta.url).href;
const METRICS_URL = new URL('parallel/module-metrics.mjs', import.meta.url).href;
const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
];

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

function buildAndTest({ projectRoot, maven, work, pinned, modules, spawn, quick }) {
  runMaven({
    projectRoot,
    maven,
    spawn,
    args: [
      '--quiet',
      ...buildGoals({ quick, pinned, modules }),
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

function readClasspaths(work, module) {
  return moduleClasspaths(
    module,
    parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8')),
  );
}

function analyzeSources(options) {
  const { module, reportDir, classpaths, tools, pinned, configs, style, spring } = options;
  const { springArch, springRoles, spawn } = options;
  const tasks = [
    [runPmd, LINT_URL, { module, reportDir, tools, classpaths, configs, spring }],
    [runSpotbugs, LINT_URL, { module, reportDir, tools }],
    [runErrorProne, ERRORPRONE_URL, { module, reportDir, tools, classpaths }],
    [runFormat, LINT_URL, { module, reportDir, tools, javaStyle: style.javaStyle }],
    [runCheckstyle, LINT_URL, { module, reportDir, tools, configs, pinned, style }],
    [runStructure, METRICS_URL, { module, reportDir }],
    [runJdeps, METRICS_URL, { module, reportDir }],
  ].map(([run, url, toolOptions]) => ({ run, url, name: run.name, options: toolOptions }));
  runToolsConcurrently(tasks, { spawn, concurrent: options.quick === true });
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

function resolveRunTools({ projectRoot, maven, spawn, pinned, modules, analyzed, policy }) {
  const quick = policy.quick === true;
  return resolveTools({
    projectRoot,
    maven,
    spawn,
    pinned,
    launcherVersions: quick ? [] : missingLauncherVersions(analyzed),
    extraTools: extraTools({ modules, analyzed, policy, pinned }),
    quick,
  });
}

export function runMavenPreset(projectRoot, { maven, policy = {}, configs, spawn }) {
  const quick = policy.quick === true;
  if (policy.preset !== undefined && !MAVEN_PRESETS.includes(policy.preset)) {
    throw new Error(
      `The ${policy.preset} preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources`,
    );
  }
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    const modules = readModules({ projectRoot, maven, work, spawn });
    const since = Date.now() - 2000;
    buildAndTest({ projectRoot, maven, work, pinned, modules, spawn, quick });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveRunTools({ projectRoot, maven, spawn, pinned, modules, analyzed, policy });
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
        style,
        quick,
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
