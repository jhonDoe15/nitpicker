import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEffectivePom } from './configuration/effective-pom.mjs';
import { readReactor } from './maven-project.mjs';
import { moduleClasspaths, parseDependencyList } from './configuration/maven-classpaths.mts';
import { missingLauncherVersions } from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import { archunitTool, formatTool, resolveTools } from './maven-tools.mjs';
import { buildRunsArchRules } from './spring/arch-rules-gate.mts';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mjs';
import { writeSpringRuleset } from '../adapters/spring/proxies/proxy-ruleset.mts';
import { MAVEN_PRESETS } from '../adapters/gradle-presets.mjs';
import { processorTool } from './errorprone/maven-errorprone.mts';
import { readPinnedTools } from '../builds/java-build.mjs';
import { kotlinSetup } from './kotlin/kotlin-setup.mjs';
import { pitHistoryOf } from '../builds/pit-history/pit-history.mjs';
import { analyzeModule, MAVEN_REPORT_DIRECTORY } from './module/maven-module.mts';
import { buildOrSkipTests, jacocoExecFiles } from './quick/maven-test-phase.mts';
import { fieldOf, listOf, textsOf } from '../../../shared/values/readers.mts';
import {
  type JavaEnvironment,
  type JavaPolicy,
  callUntyped,
} from '../adapters/typed/java-values.mts';
import {
  type Classpaths,
  type Dependency,
  type MavenModule,
  mavenModuleOf,
} from './typed/maven-values.mts';

type MavenRun = {
  readonly projectRoot: string;
  readonly maven: string | undefined;
  readonly spawn: unknown;
  readonly timeoutMs: number | undefined;
  readonly pinned: unknown;
  readonly quick: boolean;
};
type AnalyzedModule = {
  readonly module: MavenModule;
  readonly classpaths: Classpaths;
};
type AnalyzeRequest = MavenRun & {
  readonly analyzed: readonly AnalyzedModule[];
  readonly policy: JavaPolicy;
  readonly kotlin: unknown;
  readonly work: string;
  readonly pitDeadline: number | undefined;
  readonly tools: unknown;
  readonly configs: unknown;
  readonly since: number;
  readonly project: unknown;
  readonly testsSkipped: boolean;
};
type ToolsRequest = {
  readonly modules: readonly MavenModule[];
  readonly analyzed: readonly AnalyzedModule[];
  readonly policy: JavaPolicy;
  readonly pinned: unknown;
  readonly kotlin: unknown;
};
type MavenPresetOptions = {
  readonly maven?: string | undefined;
  readonly policy?: JavaPolicy | undefined;
  readonly configs?: unknown;
  readonly environment?: JavaEnvironment | undefined;
  readonly spawn?: unknown;
  readonly timeoutMs?: number | undefined;
  readonly pitDeadline?: number | undefined;
};
type MavenPresetRun = {
  readonly moduleDirs: string[];
  readonly testsFailures: unknown[];
  readonly formatAdvice: unknown;
};

const CLOCK_SLACK_MS = 2000;

function dependencyFile(work: string, module: MavenModule): string {
  const [groupId = '', artifactId = ''] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

function readClasspaths(
  work: string,
  module: MavenModule,
): Classpaths & { readonly dependencies: readonly Dependency[] } {
  const dependencies = parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8'));
  return { ...moduleClasspaths(module, dependencies), dependencies };
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

function readModules({
  projectRoot,
  maven,
  work,
  spawn,
  timeoutMs,
}: MavenRun & { readonly work: string }): {
  readonly modules: MavenModule[];
  readonly effectivePom: unknown;
} {
  const effectivePom = callUntyped(readEffectivePom, {
    projectRoot,
    maven,
    work,
    spawn,
    timeoutMs,
  });
  const modules = listOf(callUntyped(readReactor, projectRoot, effectivePom))
    .map(mavenModuleOf)
    .filter((module) => module.packaging !== 'pom');
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

function analyzeAll({ analyzed, policy, kotlin, work, ...shared }: AnalyzeRequest): unknown[] {
  const indentation: unknown = checkstyleIndentation(policy.conventions);
  const style = { javaStyle: policy.javaStyle, indentation };
  const springRoles: unknown = writeSpringRoles(policy['springRoles'], work);
  const springRules: unknown = writeSpringRuleset(shared.projectRoot, work);
  return analyzed
    .map(({ module, classpaths }) =>
      analyzeModule({
        ...shared,
        module,
        classpaths,
        style,
        pitHistory: pitHistoryOf(policy, shared.projectRoot),
        kotlinOptions: fieldOf(kotlin, 'options'),
        spring: policy['spring'],
        featureFolders: policy['featureFolders'],
        springRoles,
        springRules,
        mutationScope: policy['mutationScope'],
      }),
    )
    .filter((failure) => failure !== undefined);
}

function extraTools({ modules, analyzed, policy, pinned, kotlin }: ToolsRequest): unknown[] {
  return [
    ...modules
      .map((module): unknown => processorTool(module['compiler']))
      .filter((tool) => tool !== undefined),
    ...listOf(callUntyped(formatTool, policy.javaStyle, pinned)),
    ...listOf(fieldOf(kotlin, 'extraTools')),
    ...listOf(callUntyped(archunitTool, buildRunsArchRules(policy, analyzed), pinned)),
  ];
}

function assertMavenPreset(preset: string | undefined): void {
  if (preset !== undefined && !MAVEN_PRESETS.includes(preset)) {
    throw new Error(
      `The ${preset} preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources`,
    );
  }
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
  const pinned: unknown = readPinnedTools();
  const run = { projectRoot, maven, spawn, timeoutMs, pinned, quick: policy.quick === true };
  const { modules, effectivePom } = readModules({ ...run, work });
  const setup = { ...run, policy, modules, effectivePom, work, environment };
  const kotlin = callUntyped(kotlinSetup, setup);
  const since = Date.now() - CLOCK_SLACK_MS;
  const timedOut = buildOrSkipTests({ ...run, work, modules }, policy);
  const analyzed = modules.map((module) => ({
    module,
    classpaths: readClasspaths(work, module),
  }));
  const tools = callUntyped(resolveTools, {
    ...run,
    launcherVersions: run.quick ? [] : missingLauncherVersions(analyzed),
    extraTools: extraTools({ modules, analyzed, policy, pinned, kotlin }),
  });
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
    project: guardProject(projectRoot, policy, modules),
  });
  return {
    moduleDirs: modules.map((module) => module.basedir),
    testsFailures: [...testsFailures, ...timedOut],
    formatAdvice: fieldOf(fieldOf(kotlin, 'options'), 'advice'),
  };
}

export function runMavenPreset(projectRoot: string, options: MavenPresetOptions): MavenPresetRun {
  assertMavenPreset(options.policy?.preset);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    return presetInWork(projectRoot, options, work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
