import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEffectivePom } from './configuration/effective-pom.mjs';
import { readReactor } from './maven-project.mjs';
import { moduleClasspaths, parseDependencyList } from './configuration/maven-classpaths.mjs';
import { missingLauncherVersions } from './maven-tests.mts';
import { usesConfigRetries } from '../../../shared/conventions/tool-precedence.mjs';
import {
  checkstyleIndentation,
  javaFormatterFlags,
  javaFormatterSettings,
} from '../adapters/style/java-style.mjs';
import { archunitTool, effectsTool, formatTool, resolveTools } from './maven-tools.mjs';
import { buildRunsArchRules } from './spring/arch-rules-gate.mts';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mts';
import { writeSpringRuleset } from '../adapters/spring/proxies/proxy-ruleset.mts';
import { MAVEN_PRESETS } from '../adapters/gradle-presets.mjs';
import { processorTool } from './errorprone/maven-errorprone.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { kotlinSetup } from './kotlin/kotlin-setup.mts';
import { pitHistoryOf } from '../builds/pit-history/pit-history.mts';
import { effectsOptions } from '../adapters/effects/effects-options.mjs';
import { dependencyFile } from './quick/maven-build-arguments.mjs';
import { analyzeModule, MAVEN_REPORT_DIRECTORY } from './module/maven-module.mts';
import { mavenScope } from './reactor/maven-scope.mjs';
import { reactorRootFor } from './reactor/reactor-root.mjs';
import { buildOrSkipTests, jacocoExecFiles, testReruns } from './quick/maven-test-phase.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import { type JavaPolicy, callUntyped } from '../adapters/typed/java-values.mts';
import {
  type Classpaths,
  type Dependency,
  type MavenModule,
  classpathsOf,
  dependencyOf,
  mavenModuleOf,
  scopeOf,
} from './typed/maven-values.mts';
import type {
  MavenRun,
  AnalyzeRequest,
  ToolsRequest,
  MavenPresetOptions,
  MavenPresetRun,
  Prepared,
  ReadModules,
  PrepareRequest,
} from './typed/maven-build-types.mts';

const REPORT_CLOCK_SKEW_MS = 2000;

function readClasspaths(
  work: string,
  module: MavenModule,
): Classpaths & { readonly dependencies: readonly Dependency[] } {
  const file = textOf(callUntyped(dependencyFile, work, module));
  const listed: unknown = parseDependencyList(readFileSync(file, 'utf8'));
  const dependencies = listOf(listed).map(dependencyOf);
  return { ...classpathsOf(callUntyped(moduleClasspaths, module, dependencies)), dependencies };
}

function guardProject(
  projectRoot: string,
  policy: JavaPolicy,
  modules: readonly MavenModule[],
): Readonly<Record<string, unknown>> {
  return {
    projectRoot,
    baselineRoot: policy.snapshot === 'head' ? policy.baselineRoot : undefined,
    reactor: modules.map((module) => module.coordinates),
  };
}

function staleOutputs(module: MavenModule): string[] {
  return [
    path.join(module.basedir, MAVEN_REPORT_DIRECTORY),
    ...textsOf(callUntyped(jacocoExecFiles, module)).filter((file) =>
      file.startsWith(`${module.buildDirectory}${path.sep}`),
    ),
  ];
}

function readModules(
  { projectRoot, mavenRoot, maven, spawn, timeoutMs }: MavenRun,
  { work, changedFiles }: { readonly work: string; readonly changedFiles: unknown },
): ReadModules {
  const pomRequest = { projectRoot: mavenRoot, maven, work, spawn, timeoutMs };
  const effectivePom = callUntyped(readEffectivePom, pomRequest);
  const reactor = listOf(callUntyped(readReactor, mavenRoot, effectivePom)).map(mavenModuleOf);
  const built = reactor.filter((module) => module.packaging !== 'pom');
  const scope = scopeOf(
    callUntyped(mavenScope, { modules: reactor, projectRoot, mavenRoot, changedFiles }),
  );
  const modules = scope.reported.filter((module) => module.packaging !== 'pom');
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
  return { modules, built, scope, effectivePom };
}

function analyzeAll({
  analyzed,
  policy,
  kotlin,
  work,
  effectsOptions: moduleEffects,
  ...shared
}: AnalyzeRequest): unknown[] {
  const indentation: unknown = checkstyleIndentation(policy.conventions);
  const formatterFlags: unknown = javaFormatterFlags(policy.conventions);
  const style = { javaStyle: policy.javaStyle, indentation, formatterFlags };
  const springRoles: unknown = writeSpringRoles(policy['springRoles'], work);
  const springRules: unknown = writeSpringRuleset(shared.projectRoot, work);
  return analyzed
    .map(({ module, classpaths }) =>
      analyzeModule({
        ...shared,
        module,
        classpaths,
        style,
        retriesPass: usesConfigRetries(policy['toolPrecedence']),
        pitHistory: pitHistoryOf(policy, shared.projectRoot),
        kotlinOptions: fieldOf(kotlin, 'options'),
        spring: policy['spring'],
        featureFolders: policy['featureFolders'],
        springRoles,
        springRules,
        mutationScope: policy['mutationScope'],
        effectsOptions: moduleEffects,
      }),
    )
    .filter((failure) => failure !== undefined);
}

function formatterVersion(policy: JavaPolicy): unknown {
  return fieldOf(javaFormatterSettings(policy.conventions), 'version');
}

function extraTools({ modules, analyzed, policy, pinned, kotlin }: ToolsRequest): unknown[] {
  return [
    ...modules
      .map((module): unknown => processorTool(module['compiler']))
      .filter((tool) => tool !== undefined),
    ...listOf(callUntyped(formatTool, policy.javaStyle, pinned, formatterVersion(policy))),
    ...listOf(fieldOf(kotlin, 'extraTools')),
    ...listOf(callUntyped(archunitTool, buildRunsArchRules(policy, analyzed), pinned)),
    ...listOf(callUntyped(effectsTool, pinned)),
  ];
}

function requireMavenPreset(preset: string | undefined): void {
  if (preset !== undefined && !MAVEN_PRESETS.includes(preset)) {
    throw new Error(
      `The ${preset} preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources`,
    );
  }
}

function presetTools(run: MavenRun, request: ToolsRequest): unknown {
  return callUntyped(resolveTools, {
    ...run,
    projectRoot: run.mavenRoot,
    launcherVersions: run.quick || run.mutationOff ? [] : missingLauncherVersions(request.analyzed),
    extraTools: extraTools(request),
  });
}

function prepare(run: MavenRun, { policy, environment, configs, work }: PrepareRequest): Prepared {
  const { modules, built, scope, effectivePom } = readModules(run, {
    work,
    changedFiles: policy['changedFiles'],
  });
  const setup = { ...run, policy, modules: built, effectivePom, work, environment };
  const kotlin = callUntyped(kotlinSetup, setup);
  const since = Date.now() - REPORT_CLOCK_SKEW_MS;
  const build = { ...run, projectRoot: run.mavenRoot, selection: scope.selection, work };
  const timedOut = buildOrSkipTests(
    { ...build, modules: built, reruns: testReruns(configs) },
    policy,
  );
  const analyzed = modules.map((module) => ({ module, classpaths: readClasspaths(work, module) }));
  const tools = presetTools(run, { modules, analyzed, policy, pinned: run.pinned, kotlin });
  return { modules, built, scope, kotlin, since, analyzed, tools, timedOut };
}

function presetInWork(
  projectRoot: string,
  {
    maven,
    policy = {},
    configs,
    environment = {},
    spawn,
    timeoutMs,
    pitDeadline,
  }: MavenPresetOptions,
  work: string,
): MavenPresetRun {
  const other = policy.snapshot === 'base' ? policy.policyRoot : policy.baselineRoot;
  const run: MavenRun = {
    projectRoot,
    mavenRoot: textOf(callUntyped(reactorRootFor, projectRoot, other)),
    maven,
    spawn,
    timeoutMs,
    pinned: readPinnedTools(),
    quick: policy.quick === true,
    mutationOff: policy['mutationOff'] === true,
  };
  const { modules, built, scope, kotlin, timedOut, ...prepared } = prepare(run, {
    policy,
    environment,
    configs,
    work,
  });
  const testsFailures = analyzeAll({
    ...run,
    ...prepared,
    testsSkipped: timedOut.length > 0,
    pitDeadline,
    configs,
    policy,
    kotlin,
    work,
    effectsOptions: effectsOptions(projectRoot),
    project: guardProject(projectRoot, policy, built),
  });
  return {
    moduleDirs: modules.map((module) => module.basedir),
    testsFailures: [...testsFailures, ...timedOut],
    formatAdvice: fieldOf(fieldOf(kotlin, 'options'), 'advice'),
    notAffected: scope.notAffected,
  };
}

export function runMavenPreset(projectRoot: string, options: MavenPresetOptions): MavenPresetRun {
  requireMavenPreset(options.policy?.preset);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    return presetInWork(projectRoot, options, work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
