import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJavaDuplicates } from '../metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mjs';
import { readOptions } from '../options/java-read-options.mjs';
import { readJavaFindings } from './java-reports.mjs';
import { readNotAffected, readReportModules } from '../gradle-reports/report-modules.mjs';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { resolveKotlinRun } from '../kotlin/kotlin-run.mjs';
import { runGradleStage } from '../red-base/gradle-stage.mjs';
import { runOrNoteFailingTests, withRootSourceRoots } from '../red-base/tests-failed.mjs';
import { gradleBudget } from '../gradle-wrapper/gradle-budget.mjs';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mjs';
import { gradleDesignFindings } from '../design/design-modules.mjs';

const CLOCK_SLACK_MS = 2000;
const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache', '--continue'];

export function lintBaselineProperties({ snapshot, baselineRoot } = {}) {
  return snapshot === 'head' && baselineRoot !== undefined
    ? [`-Pnitpicker.lintBaseline=${baselineRoot}`]
    : [];
}

function runJavaPreset(
  projectRoot,
  {
    gradle,
    spawn,
    initScript = INIT_SCRIPT,
    policy = {},
    reportBase,
    kotlinRun,
    budget = gradleBudget(),
    testsFailedModules = [],
    testsSkipped = false,
  } = {},
) {
  const withKotlin = kotlinRun?.withArguments ?? ((run) => run([]));
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlin((kotlinArguments) => {
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
      budget,
    });
    const checkTests = testsFailedModules.length === 0 && !testsSkipped;
    const options = { projectRoot, gradle, budget, reportBase, since, checkTests, policy, spawn };
    for (const stage of stages) {
      runGradleStage({ args: stage(), ...options });
    }
  });
}

function withoutReportBase(error, reportBase) {
  return error instanceof Error && error.message.includes(reportBase)
    ? new Error(error.message.replaceAll(reportBase, '<report directory>'), { cause: error })
    : error;
}

function gradleFindings(projectRoot, options, reportBase) {
  const preset = options.policy?.preset ?? 'java';
  const kotlinRun = resolveKotlinRun(projectRoot, options.policy);
  const testsFailures = runOrNoteFailingTests(runJavaPreset, projectRoot, {
    ...options,
    reportBase,
    kotlinRun,
  });
  const report = readReportModules(reportBase, preset);
  const duplicates = {
    reportRoot: reportBase,
    manifest: report.manifest,
    skippedFolders: options.policy?.duplicateSkippedFolders,
  };
  runJavaDuplicates(projectRoot, duplicates);
  if (preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  const { findings, imports } = readJavaFindings(projectRoot, {
    ...readOptions(options.policy),
    formatAdvice: kotlinRun?.advice,
    reportBase,
    report,
  });
  return {
    findings: [...findings, ...gradleDesignFindings({ projectRoot, report, options, reportBase })],
    imports,
    testsFailures: withRootSourceRoots(testsFailures, report.modules),
    notAffected: readNotAffected(reportBase),
  };
}

export function withGradleReports(projectRoot, options) {
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
