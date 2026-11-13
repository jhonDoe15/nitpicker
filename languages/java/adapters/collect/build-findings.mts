import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJavaDuplicates } from '../metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mjs';
import { readOptions } from '../options/java-read-options.mts';
import { toolConfigChoices } from '../tool-config/tool-config-choices.mjs';
import { readJavaFindings } from '../reporting/java-reports.mjs';
import { readReportModules } from '../gradle-reports/report-modules.mjs';
import { runMavenPreset } from '../../maven/maven-build.mjs';
import { MAVEN_REPORT_DIRECTORY } from '../../maven/module/maven-module.mjs';
import { detectJavaBuild, INIT_SCRIPT } from '../../builds/java-build.mjs';
import { mergedRoots, readModuleReport } from '../../builds/java-modules.mjs';
import { resolveKotlinRun } from '../kotlin/kotlin-run.mjs';
import { runGradleStage } from '../red-base/gradle-stage.mjs';
import { runOrNoteFailingTests, withRootSourceRoots } from '../red-base/tests-failed.mjs';
import { gradleBudget } from '../gradle-wrapper/gradle-budget.mjs';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mjs';
import { gradleDesignFindings, mavenDesignFindings } from '../design/design-modules.mjs';
import { type JavaPolicy, callUntyped, findingsOf } from '../typed/java-values.mts';
import type { JavaReport, JavaRunOptions } from '../typed/java-run-options.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';

type KotlinArgumentsRun = (kotlinArguments: readonly string[]) => void;
type PresetRun = JavaRunOptions & {
  readonly reportBase: string;
  readonly kotlinRun?: unknown;
  readonly testsFailedModules?: readonly string[];
};

const CLOCK_SLACK_MS = 2000;
const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache'];

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
    budget = gradleBudget(),
    testsFailedModules = [],
  }: PresetRun,
): void {
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlinArguments(kotlinRun, (kotlinArguments) => {
    const common = [
      ...GRADLE_FLAGS,
      ...(policy.snapshot === 'base' ? ['--continue'] : []),
      `-Pnitpicker.reportDir=${reportBase}`,
      `-Pnitpicker.node=${process.execPath}`,
      ...lintBaselineProperties(policy),
      ...kotlinArguments,
    ];
    const stages = callUntyped(gradleStages, common, {
      projectRoot,
      initScript,
      policy,
      directory: path.join(reportBase, 'tool-config'),
      testsFailedModules,
    });
    const checkTests = testsFailedModules.length === 0;
    const options = { projectRoot, gradle, budget, reportBase, since, checkTests, policy, spawn };
    for (const stage of listOf(stages)) {
      runGradleStage({
        args: typeof stage === 'function' ? callUntyped(stage) : undefined,
        ...options,
      });
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
  const testsFailures = callUntyped(runOrNoteFailingTests, runJavaPreset, projectRoot, {
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
  const design: unknown = gradleDesignFindings({ projectRoot, report, options, reportBase });
  return {
    findings: [...findingsOf(fieldOf(read, 'findings')), ...findingsOf(design)],
    imports: fieldOf(read, 'imports'),
    testsFailures: callUntyped(withRootSourceRoots, testsFailures, fieldOf(report, 'modules')),
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
  const configs: unknown = toolConfigChoices(projectRoot, options.policy);
  const run = callUntyped(runMavenPreset, projectRoot, {
    ...options,
    timeoutMs: options.budget?.mavenCommandTimeoutMs,
    pitDeadline: options.budget?.pitDeadlineMs,
    configs,
  });
  const moduleDirs = fieldOf(run, 'moduleDirs');
  const manifest: unknown = mergedRoots(projectRoot, moduleDirs, MAVEN_REPORT_DIRECTORY);
  const duplicates = {
    reportRoot: path.join(projectRoot, MAVEN_REPORT_DIRECTORY),
    manifest,
    skippedFolders: options.policy?.duplicateSkippedFolders,
  };
  callUntyped(runJavaDuplicates, projectRoot, duplicates);
  if (options.policy?.preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  const read: unknown = readModuleReport(projectRoot, moduleDirs, {
    ...readOptions(options.policy),
    formatAdvice: fieldOf(run, 'formatAdvice'),
    reportDirectory: MAVEN_REPORT_DIRECTORY,
  });
  const design: unknown = mavenDesignFindings(projectRoot, moduleDirs, options.policy);
  return {
    findings: [...findingsOf(fieldOf(read, 'findings')), ...findingsOf(design)],
    imports: fieldOf(read, 'imports'),
    testsFailures: fieldOf(run, 'testsFailures'),
  };
}

export function buildFindings(projectRoot: string, options: JavaRunOptions): JavaReport {
  return detectJavaBuild(projectRoot) === 'maven'
    ? mavenFindings(projectRoot, options)
    : withGradleReports(projectRoot, options);
}
