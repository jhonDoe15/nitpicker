import path from 'node:path';
import {
  archunitPatterns,
  collectArchunitResults,
  collectTestResults,
  runJacocoReport,
} from '../maven-tests.mts';
import { runPit } from '../pit/maven-pit.mts';
import { runMaven, TEST_RERUNS_OFF, testRerunArguments } from '../maven-command.mjs';
import { springAotSkip } from '../spring/arch-rules-gate.mts';
import { isTestsTimeout, timedOutTests } from '../../adapters/red-base/tests-failed.mts';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mts';
import { lifecycleArgs } from '../maven-project.mts';
import { jacocoPlugin } from '../maven-tools.mjs';
import { relativeTo } from '../module/module-paths.mts';
import { moduleName } from '../../builds/test-failures.mjs';
import { type JavaPolicy, callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type MavenModule, mavenModuleOf } from '../typed/maven-values.mts';
import {
  dependencyListArguments,
  PROJECT_CHECKS_OFF,
  usesArchunit,
} from './maven-build-arguments.mts';

type BuildRequest = {
  readonly projectRoot: string;
  readonly maven: string | undefined;
  readonly spawn: unknown;
  readonly timeoutMs: number | undefined;
  readonly pinned: unknown;
  readonly quick: boolean;
  readonly work: string;
  readonly modules: readonly MavenModule[];
  readonly reruns?: readonly string[] | undefined;
  readonly selection?: readonly string[] | undefined;
};
type PhaseOptions = Readonly<Record<string, unknown>>;
type GoalRequest = {
  readonly quick: boolean;
  readonly pinned: unknown;
  readonly modules: readonly unknown[];
};
type TestRuns = { readonly testsRan: unknown; readonly failure: unknown };

const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const SKIP_TESTS = '-DskipTests';

function archunitTestFilter(modules: readonly unknown[]): string {
  const patterns = modules.flatMap((module) =>
    textsOf(callUntyped(archunitPatterns, fieldOf(module, 'archunitIncludes'))),
  );
  return [...new Set(patterns.map((pattern) => pattern.replace(/\.class$/u, '')))].join(',');
}

export function buildGoals({ quick, pinned, modules }: GoalRequest): string[] {
  if (quick && !usesArchunit(modules)) {
    return ['test', SKIP_TESTS];
  }
  if (quick) {
    return [
      'test',
      `-Dtest=${archunitTestFilter(modules)}`,
      '-Dsurefire.failIfNoSpecifiedTests=false',
      '-DfailIfNoSpecifiedTests=false',
      '-DfailIfNoTests=false',
    ];
  }
  return [
    `${textOf(callUntyped(jacocoPlugin, pinned, modules))}:prepare-agent`,
    `-Djacoco.destFile=\${project.build.directory}/${OWN_JACOCO_EXEC}`,
    ...textsOf(callUntyped(lifecycleArgs, modules)),
  ];
}

export function jacocoExecFiles(module: MavenModule): string[] {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...textsOf(module['jacocoDestFiles'])];
}

function moduleNameOf(module: MavenModule, projectRoot: unknown): unknown {
  return moduleName(relativeTo(textOf(projectRoot), module.basedir));
}

export function readTestRuns(context: PhaseOptions): TestRuns {
  const { module, reportDir, since, isArchunit, testRuntime } = context;
  const retriesPass = context['retriesPass'];
  if (context['quick'] === true || context['testsSkipped'] === true) {
    callUntyped(collectArchunitResults, { module, reportDir, since, isArchunit });
    return { testsRan: false, failure: undefined };
  }
  const results = callUntyped(collectTestResults, {
    module,
    reportDir,
    since,
    isArchunit,
    retriesPass,
    moduleName: moduleNameOf(mavenModuleOf(module), context['projectRoot']),
  });
  callUntyped(requireTestngRun, { module, since, isArchunit, testRuntime });
  callUntyped(copyTestResults, { module, reportDir, since, isArchunit });
  return { testsRan: fieldOf(results, 'testsRan'), failure: fieldOf(results, 'failure') };
}

export function runCoverageTools(options: PhaseOptions): void {
  const { module, reportDir, tools, classpaths, since, testsRan, isArchunit, configs } = options;
  if (options['quick'] === true) {
    return;
  }
  const run = { spawn: options['spawn'], timeoutMs: options['timeoutMs'] };
  const execFiles = jacocoExecFiles(mavenModuleOf(module));
  callUntyped(runJacocoReport, { module, reportDir, tools, execFiles, since, testsRan, ...run });
  const history = options['pitHistory'];
  const scope = { projectRoot: options['projectRoot'], mutationScope: options['mutationScope'] };
  if (options['mutationOff'] === true) {
    return;
  }
  callUntyped(runPit, {
    ...{ module, reportDir, tools, classpaths, isArchunit, configs, history, scope, ...run },
    deadline: options['pitDeadline'],
  });
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
  selection = [],
  reruns = textsOf(TEST_RERUNS_OFF),
}: BuildRequest): void {
  const goals = textsOf(callUntyped(buildGoals, { quick, pinned, modules }));
  callUntyped(runMaven, {
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    args: [
      '--quiet',
      ...selection,
      ...goals,
      ...textsOf(callUntyped(dependencyListArguments, work)),
      '-Dmaven.test.failure.ignore=true',
      ...(goals.includes(SKIP_TESTS) ? [] : ['-DskipTests=false']),
      '-Dmaven.test.skip=false',
      ...reruns,
      ...PROJECT_CHECKS_OFF,
      ...textsOf(callUntyped(springAotSkip, modules)),
    ],
  });
}

export function buildOrSkipTests(build: BuildRequest, policy: JavaPolicy): unknown[] {
  try {
    buildAndTest(build);
    return [];
  } catch (error) {
    if (!isTestsTimeout(error, policy)) {
      throw error;
    }
    buildAndTest({ ...build, quick: true });
    return [timedOutTests(fieldOf(error, 'timedOut'))];
  }
}

export function testReruns(configs: unknown): string[] {
  const values = fieldOf(fieldOf(configs, 'tests'), 'arguments');
  return textsOf(callUntyped(testRerunArguments, values));
}
