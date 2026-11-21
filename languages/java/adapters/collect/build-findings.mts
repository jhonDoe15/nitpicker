import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJavaDuplicates } from '../metrics/java-duplicates.mts';
import { runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mts';
import { readOptions } from '../options/java-read-options.mts';
import { toolConfigChoices } from '../tool-config/tool-config-choices.mts';
import { readJavaFindings } from '../reporting/java-reports.mts';
import { readNotAffected } from '../gradle-reports/report-modules.mts';
import { runMavenPreset } from '../../maven/maven-build.mts';
import { failedModuleFindings } from '../../maven/reactor/failed-modules.mts';
import { MAVEN_REPORT_DIRECTORY } from '../../maven/module/maven-module.mts';
import { detectJavaBuild, INIT_SCRIPT } from '../../builds/java-build.mts';
import { mergedRoots, readModuleReport } from '../../builds/java-modules.mts';
import { resolveKotlinRun } from '../kotlin/kotlin-run.mts';
import { runGradleStage } from '../red-base/gradle-stage.mts';
import { failingTestsUnlessStopped, withRootSourceRoots } from '../red-base/tests-failed.mts';
import { gradleBudget } from '../gradle-wrapper/gradle-budget.mts';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mts';
import { gradleWorkerArguments } from '../gradle-wrapper/memory/gradle-memory.mts';
import { gradleDesignFindings, mavenDesignFindings } from '../design/design-modules.mts';
import { type JavaPolicy, callUntyped, findingsOf } from '../typed/java-values.mts';
import { type JavaReport, type JavaRunOptions, budgetOf } from '../typed/java-run-options.mts';
import { fieldOf, optionalText } from '../../../../shared/values/readers.mts';
import { stopReuseAhead } from '../../builds/reuse-ahead/reuse-ahead.mts';
import { startGradleReuse, startMavenReuse } from '../../builds/reuse-ahead/reuse-start.mts';
import { openGradleHosts } from '../../builds/host/gradle/gradle-hosts.mts';
import {
  type FailedToolRecord,
  failedToolRecord,
  skippedModuleFindings,
} from '../gradle-wrapper/partial/failed-tool-tasks.mts';
import { checkedModules } from './checked-modules.mts';

type KotlinArgumentsRun = (kotlinArguments: readonly string[]) => void;
type PresetRun = JavaRunOptions & {
  readonly reportBase: string;
  readonly kotlinRun?: unknown;
  readonly testsFailedModules?: readonly string[];
  readonly testsSkipped: boolean;
  readonly failedTools?: FailedToolRecord;
};

const CLOCK_SLACK_MS = 2000;
const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache', '--continue'];

export function lintBaselineProperties({ snapshot, baselineRoot }: JavaPolicy = {}): string[] {
  return snapshot === 'head' && baselineRoot !== undefined
    ? [`-Pnitpicker.lintBaseline=${baselineRoot}`]
    : [];
}

function withKotlinArguments(kotlinRun: unknown, run: KotlinArgumentsRun): void {
  const withArguments = fieldOf(kotlinRun, 'withArguments');
  if (typeof withArguments === 'function') {
    callUntyped(withArguments, run);
    return;
  }
  run([]);
}

function withGradleHosts(
  request: Parameters<typeof openGradleHosts>[0],
  run: (hostArguments: readonly string[]) => void,
): void {
  const hosts = openGradleHosts(request);
  try {
    run(hosts.arguments);
  } finally {
    hosts.stop();
  }
}

function commonArguments(
  projectRoot: string,
  { environment, reportBase, policy }: Pick<PresetRun, 'environment' | 'reportBase' | 'policy'>,
  [hostArguments, kotlinArguments]: readonly [readonly string[], readonly string[]],
): string[] {
  return [
    ...GRADLE_FLAGS,
    ...gradleWorkerArguments(projectRoot, environment ?? {}),
    `-Pnitpicker.reportDir=${reportBase}`,
    `-Pnitpicker.node=${process.execPath}`,
    ...hostArguments,
    ...lintBaselineProperties(policy),
    ...kotlinArguments,
  ];
}

function runJavaPreset(
  projectRoot: string,
  {
    gradle,
    spawn,
    initScript = INIT_SCRIPT,
    policy = {},
    reportBase,
    kotlinRun,
    budget = budgetOf(gradleBudget()),
    testsFailedModules = [],
    testsSkipped,
    environment,
    failedTools,
    warn = { write: () => undefined },
  }: PresetRun,
): void {
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlinArguments(kotlinRun, (kotlinArguments) => {
    withGradleHosts({ timeoutMs: budget.commandTimeoutMs ?? 0, warn }, (hostArguments) => {
      const common = commonArguments(projectRoot, { environment, reportBase, policy }, [
        hostArguments,
        kotlinArguments,
      ]);
      const stages = gradleStages(common, {
        projectRoot,
        initScript,
        policy,
        directory: path.join(reportBase, 'tool-config'),
        testsFailedModules,
        testsSkipped,
        budget,
      });
      const checkTests = testsFailedModules.length === 0 && !testsSkipped;
      const run = { gradle, budget, reportBase, policy, spawn, environment, failedTools };
      for (const stage of stages) {
        runGradleStage({ args: stage(), checkTests, projectRoot, since, ...run });
      }
    });
  });
}

function withoutReportBase(error: unknown, reportBase: string): unknown {
  return error instanceof Error && error.message.includes(reportBase)
    ? new Error(error.message.replaceAll(reportBase, '<report directory>'), { cause: error })
    : error;
}

function testsFailuresOrStopped(
  projectRoot: string,
  options: Omit<PresetRun, 'testsFailedModules' | 'testsSkipped'> & {
    readonly failedTools: FailedToolRecord;
  },
): ReturnType<typeof failingTestsUnlessStopped> {
  try {
    return failingTestsUnlessStopped({
      run: runJavaPreset,
      projectRoot,
      options,
      stopped: (error) => options.failedTools.noteStopped(error),
    });
  } catch (error) {
    if (!options.failedTools.noteStopped(error)) {
      throw error;
    }
    return [];
  }
}

function gradleFindings(
  projectRoot: string,
  options: JavaRunOptions,
  reportBase: string,
): JavaReport {
  const preset = options.policy?.preset ?? 'java';
  const kotlinRun: unknown = resolveKotlinRun(projectRoot, options.policy);
  const record = failedToolRecord();
  const testsFailures = testsFailuresOrStopped(projectRoot, {
    ...options,
    reportBase,
    kotlinRun,
    failedTools: record,
  });
  const failedTools = record.current();
  const report = checkedModules(failedTools, { reportBase, preset, projectRoot });
  startGradleReuse(projectRoot, report, options.policy);
  const duplicates = {
    reportRoot: reportBase,
    manifest: fieldOf(report, 'manifest'),
    skippedFolders: options.policy?.duplicateSkippedFolders,
    environment: options.environment,
  };
  callUntyped(runJavaDuplicates, projectRoot, duplicates);
  if (preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  const read: unknown = readJavaFindings(projectRoot, {
    ...readOptions(options.policy),
    formatAdvice: fieldOf(kotlinRun, 'advice'),
    reportBase,
    report,
  });
  const design = gradleDesignFindings({ projectRoot, report, options, reportBase });
  return {
    findings: [
      ...findingsOf(fieldOf(read, 'findings')),
      ...design,
      ...skippedModuleFindings(report.skipped, failedTools),
    ],
    imports: fieldOf(read, 'imports'),
    testsFailures: withRootSourceRoots(testsFailures, report.modules),
    notAffected: readNotAffected(reportBase),
  };
}

function withGradleReports(projectRoot: string, options: JavaRunOptions): JavaReport {
  const reportBase =
    options.reportDirectory ?? mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reports-'));
  try {
    return gradleFindings(projectRoot, options, reportBase);
  } catch (error) {
    throw withoutReportBase(error, reportBase);
  } finally {
    if (options.reportDirectory === undefined) {
      rmSync(reportBase, { recursive: true, force: true });
    }
  }
}

function mavenFindings(projectRoot: string, options: JavaRunOptions): JavaReport {
  const run = runMavenPreset(projectRoot, {
    ...options,
    timeoutMs: options.budget?.mavenCommandTimeoutMs,
    pitDeadline: options.budget?.pitDeadlineMs,
    configs: {
      ...toolConfigChoices(projectRoot, options.policy),
      generated: { analyze: options.policy?.analyzeGeneratedSources === true },
    },
    onModules: (modules) => {
      startMavenReuse(projectRoot, modules, options.policy);
    },
  });
  const { moduleDirs } = run;
  const manifest = mergedRoots(projectRoot, moduleDirs, MAVEN_REPORT_DIRECTORY);
  const duplicates = {
    reportRoot: path.join(projectRoot, MAVEN_REPORT_DIRECTORY),
    manifest,
    skippedFolders: options.policy?.duplicateSkippedFolders,
    environment: options.environment,
  };
  callUntyped(runJavaDuplicates, projectRoot, duplicates);
  if (options.policy?.preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  const read = readModuleReport(projectRoot, moduleDirs, {
    ...readOptions(options.policy),
    formatAdvice: run.formatAdvice,
    reportDirectory: MAVEN_REPORT_DIRECTORY,
  });
  const design = mavenDesignFindings(projectRoot, moduleDirs, options);
  return {
    findings: [
      ...read.findings,
      ...design,
      ...failedModuleFindings(run.failedModules, projectRoot),
    ],
    imports: read.imports,
    testsFailures: run.testsFailures,
    notAffected: run.notAffected,
  };
}

export function buildFindings(projectRoot: string, options: JavaRunOptions): JavaReport {
  try {
    return detectJavaBuild(projectRoot, optionalText(options.policy?.['buildTool'])) === 'maven'
      ? mavenFindings(projectRoot, options)
      : withGradleReports(projectRoot, options);
  } finally {
    stopReuseAhead();
  }
}
