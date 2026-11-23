import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEffectivePom } from './configuration/effective-pom.mts';
import { readReactor } from './maven-project.mts';
import { moduleClasspaths, parseDependencyList } from './configuration/maven-classpaths.mts';
import { missingLauncherVersions } from './maven-tests.mts';
import { usesConfigRetries } from '../../../shared/conventions/tool-precedence.mts';
import {
  checkstyleIndentation,
  javaFormatterFlags,
  javaFormatterSettings,
} from '../adapters/style/java-style.mts';
import { archunitTool, effectsTool, formatTool, resolveTools } from './maven-tools.mts';
import { buildRunsArchRules } from './spring/arch-rules-gate.mts';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mts';
import { writeSpringRuleset } from '../adapters/spring/proxies/proxy-ruleset.mts';
import { MAVEN_PRESETS } from '../adapters/gradle-presets.mts';
import { withProcessorTools } from './processors/processor-tools.mts';
import { removeQuietly } from '../builds/cleanup/remove-quietly.mts';
import { readPinnedTools } from '../builds/java-build.mts';
import { kotlinSetup } from './kotlin/kotlin-setup.mts';
import { pitHistoryOf } from '../builds/pit-history/pit-history.mts';
import { effectsOptions } from '../adapters/effects/effects-options.mts';
import { dependencyFile } from './quick/maven-build-arguments.mts';
import { analyzeModule, MAVEN_REPORT_DIRECTORY } from './module/maven-module.mts';
import { startJavaToolHosts } from './programs/tool-host-program.mts';
import { mavenScope } from './reactor/maven-scope.mts';
import { reactorRootFor } from './reactor/reactor-root.mts';
import { buildOrSkipTests, jacocoExecFiles, testReruns } from './quick/maven-test-phase.mts';
import { type FailedModule, failedModules } from './reactor/failed-modules.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import {
  type JavaEnvironment,
  type JavaPolicy,
  callUntyped,
} from '../adapters/typed/java-values.mts';
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

function extraTools({ analyzed, policy, pinned, kotlin }: ToolsRequest): unknown[] {
  const version = fieldOf(javaFormatterSettings(policy.conventions), 'version');
  return [
    ...listOf(callUntyped(formatTool, policy.javaStyle, pinned, version)),
    ...listOf(fieldOf(kotlin, 'extraTools')),
    ...listOf(
      callUntyped(archunitTool, pinned, { runsRules: buildRunsArchRules(policy, analyzed) }),
    ),
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

function presetTools(
  run: MavenRun & { readonly environment: JavaEnvironment | undefined },
  request: ToolsRequest,
): { readonly tools: unknown; readonly processorFailures: unknown } {
  const projectRoot = run.mavenRoot;
  const base = callUntyped(resolveTools, {
    ...run,
    projectRoot,
    launcherVersions: run.quick || run.mutationOff ? [] : missingLauncherVersions(request.analyzed),
    extraTools: extraTools(request),
  });
  const raw = callUntyped(withProcessorTools, base, { ...run, ...request, projectRoot });
  const tools = fieldOf(raw, 'tools');
  return { tools, processorFailures: fieldOf(raw, 'processorFailures') };
}

function buildReactor(
  build: Parameters<typeof buildOrSkipTests>[0],
  { policy, reported }: { readonly policy: JavaPolicy; readonly reported: readonly MavenModule[] },
): { readonly timedOut: unknown[]; readonly failed: readonly FailedModule[] } {
  try {
    return { timedOut: buildOrSkipTests(build, policy), failed: [] };
  } catch (error) {
    const failed = failedModules(error, { work: build.work, modules: reported });
    if (failed === undefined) {
      throw error;
    }
    return { timedOut: [], failed };
  }
}

function prepare(
  run: MavenRun,
  { policy, environment, configs, work, onModules }: PrepareRequest,
): Prepared {
  const { modules, built, scope, effectivePom } = readModules(run, {
    work,
    changedFiles: policy['changedFiles'],
  });
  onModules?.(modules);
  const setup = { ...run, policy, modules: built, effectivePom, work, environment };
  const kotlin = callUntyped(kotlinSetup, setup);
  const since = Date.now() - REPORT_CLOCK_SKEW_MS;
  const build = { ...run, projectRoot: run.mavenRoot, selection: scope.selection, work };
  const { timedOut, failed } = buildReactor(
    { ...build, modules: built, reruns: testReruns(configs) },
    { policy, reported: modules },
  );
  const failedModules = new Set(failed.map((entry) => entry.module));
  const checked = modules.filter((module) => !failedModules.has(module));
  const analyzed = checked.map((module) => ({ module, classpaths: readClasspaths(work, module) }));
  const resolved = presetTools(
    { ...run, environment },
    { modules: checked, analyzed, policy, pinned: run.pinned, kotlin, effectivePom },
  );
  return { modules: checked, built, scope, kotlin, since, analyzed, ...resolved, timedOut, failed };
}

function mavenRunOf(
  projectRoot: string,
  { maven, policy = {}, spawn, timeoutMs }: MavenPresetOptions,
): MavenRun {
  const other = policy.snapshot === 'base' ? policy.policyRoot : policy.baselineRoot;
  return {
    projectRoot,
    mavenRoot: textOf(callUntyped(reactorRootFor, projectRoot, other)),
    maven,
    spawn,
    timeoutMs,
    pinned: readPinnedTools(),
    quick: policy.quick === true,
    mutationOff: policy['mutationOff'] === true,
  };
}

function presetInWork(
  projectRoot: string,
  options: MavenPresetOptions,
  work: string,
): MavenPresetRun {
  const { policy = {}, configs, environment = {}, pitDeadline, onModules } = options;
  const run = mavenRunOf(projectRoot, options);
  const request = { policy, environment, configs, work, onModules };
  const { modules, built, scope, kotlin, timedOut, failed, ...prepared } = prepare(run, request);
  const hosts = startJavaToolHosts({
    work,
    modules: modules.length,
    tools: prepared.tools,
    pinned: run.pinned,
    warn: options.warn ?? { write: () => undefined },
  });
  let testsFailures: unknown[];
  try {
    testsFailures = analyzeAll({
      ...run,
      ...prepared,
      testsSkipped: timedOut.length > 0,
      pitDeadline,
      environment,
      configs,
      policy,
      kotlin,
      work,
      effectsOptions: effectsOptions(projectRoot),
      project: guardProject(projectRoot, policy, built),
    });
  } finally {
    hosts?.stop();
  }
  return {
    moduleDirs: modules.map((module) => module.basedir),
    testsFailures: [...testsFailures, ...timedOut],
    formatAdvice: fieldOf(fieldOf(kotlin, 'options'), 'advice'),
    notAffected: scope.notAffected,
    failedModules: failed,
  };
}

export function runMavenPreset(projectRoot: string, options: MavenPresetOptions): MavenPresetRun {
  requireMavenPreset(options.policy?.preset);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    return presetInWork(projectRoot, options, work);
  } finally {
    removeQuietly(work, options.warn);
  }
}
