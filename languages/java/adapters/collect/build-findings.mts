import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJavaDuplicates } from '../metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mjs';
import { readOptions } from '../options/java-read-options.mts';
import { toolConfigChoices } from '../tool-config/tool-config-choices.mts';
import { readJavaFindings } from '../reporting/java-reports.mts';
import { readReportModules } from '../gradle-reports/report-modules.mts';
import { runMavenPreset } from '../../maven/maven-build.mts';
import { MAVEN_REPORT_DIRECTORY } from '../../maven/module/maven-module.mts';
import { detectJavaBuild, INIT_SCRIPT } from '../../builds/java-build.mjs';
import { mergedRoots, readModuleReport } from '../../builds/java-modules.mts';
import { resolveKotlinRun } from '../kotlin/kotlin-run.mjs';
import { runGradleStage } from '../red-base/gradle-stage.mts';
import { runOrNoteFailingTests, withRootSourceRoots } from '../red-base/tests-failed.mts';
import { gradleBudget } from '../gradle-wrapper/gradle-budget.mjs';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mts';
import { gradleDesignFindings, mavenDesignFindings } from '../design/design-modules.mts';
import { type JavaPolicy, callUntyped, findingsOf } from '../typed/java-values.mts';
import { type JavaReport, type JavaRunOptions, budgetOf } from '../typed/java-run-options.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

type KotlinArgumentsRun = (kotlinArguments: readonly string[]) => void;
type PresetRun = JavaRunOptions & {
  readonly reportBase: string;
  readonly kotlinRun?: unknown;
  readonly testsFailedModules?: readonly string[];
  readonly testsSkipped: boolean;
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
  }: PresetRun,
): void {
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlinArguments(kotlinRun, (kotlinArguments) => {
    const common = [
      ...GRADLE_FLAGS,
      `-Pnitpicker.reportDir=${reportBase}`,
      `-Pnitpicker.node=${process.execPath}`,
      ...lintBaselineProperties(policy),
      ...kotlinArguments,
    ];
    const stages = gradleStages(common, {
      projectRoot,
      initScript,
      policy,
      directory: path.join(reportBase, 'tool-config'),
      testsFailedModules,
      testsSkipped,
    });
    const checkTests = testsFailedModules.length === 0 && !testsSkipped;
    const options = { projectRoot, gradle, budget, reportBase, since, checkTests, policy, spawn };
    for (const stage of stages) {
      runGradleStage({ args: stage(), ...options });
    }
  });
}

function withoutReportBase(error: unknown, reportBase: string): unknown {
  return error instanceof Error && error.message.includes(reportBase)
    ? new Error(error.message.replaceAll(reportBase, '<report directory>'), { cause: error })
    : error;
}

function gradleFindings(
  projectRoot: string,
  options: JavaRunOptions,
  reportBase: string,
): JavaReport {
  const preset = options.policy?.preset ?? 'java';
  const kotlinRun: unknown = resolveKotlinRun(projectRoot, options.policy);
  const testsFailures = runOrNoteFailingTests(runJavaPreset, projectRoot, {
    ...options,
    reportBase,
    kotlinRun,
  });
  const report: unknown = readReportModules(reportBase, preset);
  const duplicates = {
    reportRoot: reportBase,
    manifest: fieldOf(report, 'manifest'),
    skippedFolders: options.policy?.duplicateSkippedFolders,
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
    findings: [...findingsOf(fieldOf(read, 'findings')), ...design],
    imports: fieldOf(read, 'imports'),
    testsFailures: withRootSourceRoots(testsFailures, fieldOf(report, 'modules')),
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
    configs: toolConfigChoices(projectRoot, options.policy),
  });
  const { moduleDirs } = run;
  const manifest = mergedRoots(projectRoot, moduleDirs, MAVEN_REPORT_DIRECTORY);
  const duplicates = {
    reportRoot: path.join(projectRoot, MAVEN_REPORT_DIRECTORY),
    manifest,
    skippedFolders: options.policy?.duplicateSkippedFolders,
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
  const design = mavenDesignFindings(projectRoot, moduleDirs, options.policy);
  return {
    findings: [...read.findings, ...design],
    imports: read.imports,
    testsFailures: run.testsFailures,
  };
}

export function buildFindings(projectRoot: string, options: JavaRunOptions): JavaReport {
  return detectJavaBuild(projectRoot) === 'maven'
    ? mavenFindings(projectRoot, options)
    : withGradleReports(projectRoot, options);
}
