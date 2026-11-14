import path from 'node:path';
import {
  archunitPatterns,
  collectArchunitResults,
  collectTestResults,
  runJacocoReport,
} from '../maven-tests.mjs';
import { runPit } from '../pit/maven-pit.mts';
import { runMaven, TEST_RERUNS_OFF } from '../maven-command.mjs';
import { springAotSkip } from '../spring/arch-rules-gate.mts';
import { isTestsTimeout, timedOutTests } from '../../adapters/red-base/tests-failed.mts';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mts';
import { lifecycleArgs } from '../maven-project.mjs';
import { MAVEN_PLUGINS, jacocoPlugin } from '../maven-tools.mjs';
import { relativeTo } from '../module/module-paths.mjs';
import { moduleName } from '../../builds/test-failures.mjs';
import { type JavaPolicy, callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type MavenModule, mavenModuleOf } from '../typed/maven-values.mts';

type BuildRequest = {
  readonly projectRoot: string;
  readonly maven: string | undefined;
  readonly spawn: unknown;
  readonly timeoutMs: number | undefined;
  readonly pinned: unknown;
  readonly quick: boolean;
  readonly work: string;
  readonly modules: readonly MavenModule[];
};
type PhaseOptions = Readonly<Record<string, unknown>>;
type GoalRequest = {
  readonly quick: boolean;
  readonly pinned: unknown;
  readonly modules: readonly unknown[];
};
type TestRuns = { readonly testsRan: unknown; readonly failure: unknown };

const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';

function archunitTestFilter(modules: readonly unknown[]): string {
  const patterns = modules.flatMap((module) =>
    textsOf(callUntyped(archunitPatterns, fieldOf(module, 'archunitIncludes'))),
  );
  return [...new Set(patterns.map((pattern) => pattern.replace(/\.class$/u, '')))].join(',');
}

export function buildGoals({ quick, pinned, modules }: GoalRequest): string[] {
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
  return moduleName(relativeTo(projectRoot, module.basedir));
}

const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
  '-Dktlint.skip=true',
  '-Ddetekt.skip=true',
];

export function readTestRuns(context: PhaseOptions): TestRuns {
  const { module, reportDir, since, isArchunit, testRuntime } = context;
  if (context['quick'] === true || context['testsSkipped'] === true) {
    callUntyped(collectArchunitResults, { module, reportDir, since, isArchunit });
    return { testsRan: false, failure: undefined };
  }
  const results = callUntyped(collectTestResults, {
    module,
    reportDir,
    since,
    isArchunit,
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
}: BuildRequest): void {
  callUntyped(runMaven, {
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    args: [
      '--quiet',
      ...textsOf(callUntyped(buildGoals, { quick, pinned, modules })),
      `${textOf(MAVEN_PLUGINS.dependency)}:list`,
      `-DoutputFile=${path.join(work, 'dependencies', `\${project.groupId}`, `\${project.artifactId}.txt`)}`,
      '-DoutputAbsoluteArtifactFilename=true',
      '-DappendOutput=false',
      '-Dmaven.test.failure.ignore=true',
      '-DskipTests=false',
      '-Dmaven.test.skip=false',
      ...TEST_RERUNS_OFF,
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
