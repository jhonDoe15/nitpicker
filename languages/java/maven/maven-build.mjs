import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEffectivePom } from './configuration/effective-pom.mjs';
import { runMaven, TEST_RERUNS_OFF } from './maven-command.mjs';
import { readReactor } from './maven-project.mjs';
import { moduleClasspaths, parseDependencyList } from './configuration/maven-classpaths.mjs';
import { missingLauncherVersions } from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import {
  archunitTool,
  effectsTool,
  formatTool,
  MAVEN_PLUGINS,
  resolveTools,
} from './maven-tools.mjs';
import { buildRunsArchRules, springAotSkip } from './spring/arch-rules-gate.mjs';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mjs';
import { writeSpringRuleset } from '../adapters/spring/proxies/proxy-ruleset.mjs';
import { MAVEN_PRESETS } from '../adapters/gradle-presets.mjs';
import { processorTool } from './errorprone/maven-errorprone.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { kotlinSetup } from './kotlin/kotlin-setup.mjs';
import { pitHistoryOf } from '../builds/pit-history/pit-history.mjs';
import { effectsOptions } from '../adapters/effects/effects-options.mjs';
import { analyzeModule, MAVEN_REPORT_DIRECTORY } from './module/maven-module.mjs';
import { isTestsTimeout, timedOutTests } from '../adapters/red-base/tests-failed.mjs';
import { buildGoals, jacocoExecFiles } from './quick/maven-test-phase.mjs';

const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
  '-Dktlint.skip=true',
  '-Ddetekt.skip=true',
];

function dependencyFile(work, module) {
  const [groupId, artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

export function buildAndTest({
  projectRoot,
  maven,
  work,
  pinned,
  modules,
  spawn,
  timeoutMs,
  quick,
}) {
  runMaven({
    projectRoot,
    maven,
    spawn,
    timeoutMs,
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
      ...TEST_RERUNS_OFF,
      ...PROJECT_CHECKS_OFF,
      ...springAotSkip(modules),
    ],
  });
}

function readClasspaths(work, module) {
  const dependencies = parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8'));
  return { ...moduleClasspaths(module, dependencies), dependencies };
}

function guardProject(projectRoot, policy, modules) {
  return {
    projectRoot,
    baselineRoot: policy.snapshot === 'head' ? policy.baselineRoot : undefined,
    reactor: modules.map((module) => module.coordinates),
  };
}

function staleOutputs(module) {
  return [
    path.join(module.basedir, MAVEN_REPORT_DIRECTORY),
    ...jacocoExecFiles(module).filter((file) =>
      file.startsWith(`${module.buildDirectory}${path.sep}`),
    ),
  ];
}

function readModules({ projectRoot, maven, work, spawn, timeoutMs }) {
  const effectivePom = readEffectivePom({ projectRoot, maven, work, spawn, timeoutMs });
  const modules = readReactor(projectRoot, effectivePom).filter(
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
  return { modules, effectivePom };
}

function buildOrSkipTests(run, { work, modules, policy }) {
  try {
    buildAndTest({ ...run, work, modules });
    return [];
  } catch (error) {
    if (!isTestsTimeout(error, policy)) {
      throw error;
    }
    buildAndTest({ ...run, quick: true, work, modules });
    return [timedOutTests(error.timedOut)];
  }
}

function analyzeAll({ analyzed, policy, kotlin, work, effectsOptions, ...shared }) {
  const style = {
    javaStyle: policy.javaStyle,
    indentation: checkstyleIndentation(policy.conventions),
  };
  const springRoles = writeSpringRoles(policy.springRoles, work);
  const springRules = writeSpringRuleset(shared.projectRoot, work);
  return analyzed
    .map(({ module, classpaths }) =>
      analyzeModule({
        ...shared,
        module,
        classpaths,
        style,
        pitHistory: pitHistoryOf(policy, shared.projectRoot),
        kotlinOptions: kotlin.options,
        spring: policy.spring,
        featureFolders: policy.featureFolders,
        springRoles,
        springRules,
        mutationScope: policy.mutationScope,
        effectsOptions,
      }),
    )
    .filter((failure) => failure !== undefined);
}

function extraTools({ modules, analyzed, policy, pinned, kotlin }) {
  return [
    ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
    ...formatTool(policy.javaStyle, pinned),
    ...kotlin.extraTools,
    ...archunitTool(buildRunsArchRules(policy, analyzed), pinned),
    ...effectsTool(pinned),
  ];
}

function resolveRunTools(run, { modules, analyzed, policy, kotlin }) {
  return resolveTools({
    ...run,
    launcherVersions: run.quick || run.mutationOff ? [] : missingLauncherVersions(analyzed),
    extraTools: extraTools({ modules, analyzed, policy, pinned: run.pinned, kotlin }),
  });
}

function assertMavenPreset(policy) {
  if (policy.preset !== undefined && !MAVEN_PRESETS.includes(policy.preset)) {
    throw new Error(
      `The ${policy.preset} preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources`,
    );
  }
}

export function runMavenPreset(
  projectRoot,
  { maven, policy = {}, configs, environment = {}, spawn, timeoutMs, pitDeadline },
) {
  assertMavenPreset(policy);
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  const run = {
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    pinned,
    quick: policy.quick === true,
    mutationOff: policy.mutationOff === true,
  };
  try {
    const { modules, effectivePom } = readModules({ ...run, work });
    const kotlin = kotlinSetup({ ...run, policy, modules, effectivePom, work, environment });
    const since = Date.now() - 2000;
    const timedOut = buildOrSkipTests(run, { work, modules, policy });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveRunTools(run, { modules, analyzed, policy, kotlin });
    const testsFailures = analyzeAll({
      ...run,
      testsSkipped: timedOut.length > 0,
      pitDeadline,
      analyzed,
      tools,
      configs,
      since,
      policy,
      kotlin,
      work,
      effectsOptions: effectsOptions(projectRoot),
      project: guardProject(projectRoot, policy, modules),
    });
    return {
      moduleDirs: modules.map((module) => module.basedir),
      testsFailures: [...testsFailures, ...timedOut],
      formatAdvice: kotlin.options?.advice,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
