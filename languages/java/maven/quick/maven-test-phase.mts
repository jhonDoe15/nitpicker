import path from 'node:path';
import {
  archunitPatterns,
  collectArchunitResults,
  collectTestResults,
  runJacocoReport,
} from '../maven-tests.mjs';
import { runPit } from '../pit/maven-pit.mjs';
import { copyTestResults, requireTestngRun } from '../results/maven-test-results.mjs';
import { lifecycleArgs } from '../maven-project.mjs';
import { jacocoPlugin } from '../maven-tools.mjs';
import { relativeTo } from '../module/module-paths.mjs';
import { moduleName } from '../../builds/test-failures.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type MavenModule, mavenModuleOf } from '../typed/maven-values.mts';

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

export function readTestRuns(context: PhaseOptions): TestRuns {
  const { module, reportDir, since, isArchunit, testRuntime, tolerateFailures } = context;
  if (context['quick'] === true) {
    callUntyped(collectArchunitResults, { module, reportDir, since, isArchunit });
    return { testsRan: false, failure: undefined };
  }
  const results = callUntyped(collectTestResults, {
    module,
    reportDir,
    since,
    isArchunit,
    tolerateFailures,
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
