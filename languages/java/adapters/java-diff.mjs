import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  testFailuresOf,
  unknownOnBaseFor,
} from '../../../core/diff/comparison/base-red/unknown-base.mjs';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { captureWorkingTree, resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readRemovesTests } from '../../../core/diff/git/patches/test-removal.mjs';
import { readRenameMap } from '../../../core/diff/git/patches/project-moves.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { runJavaDuplicates } from './metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin/kotlin-duplicates.mjs';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { javaRouteRule } from './java-policy.mjs';
import { withoutFollowedImports } from './imports/followed-imports.mjs';
import { withoutGeneratedSources } from './generated/generated-sources.mjs';
import { withoutOverlaps } from './overlaps/static-overlaps.mjs';
import { readOptions } from './options/java-read-options.mjs';
import { toolConfigChoices } from './tool-config/tool-config-choices.mjs';
import { readJavaFindings } from './reporting/java-reports.mjs';
import { withJavaColumns } from './reporting/columns/java-columns.mjs';
import { readReportModules } from './gradle-reports/report-modules.mjs';
import { runMavenPreset } from '../maven/maven-build.mjs';
import { MAVEN_REPORT_DIRECTORY } from '../maven/module/maven-module.mjs';
import { detectJavaBuild, INIT_SCRIPT } from '../builds/java-build.mjs';
import { mergedRoots, readModuleFindings } from '../builds/java-modules.mjs';
import { resolveKotlinRun } from './kotlin/kotlin-run.mjs';
import { runGradleStage } from './red-base/gradle-stage.mjs';
import {
  runOrNoteFailingTests,
  withRootSourceRoots,
  withTestsFailures,
} from './red-base/tests-failed.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';
import { withProjectSourceRules } from './regexes/regex-defects.mjs';
import { gradleBudget } from './gradle-wrapper/gradle-budget.mjs';
import { gradleStages } from './gradle-wrapper/gradle-stages.mjs';
import { gradleDesignFindings, mavenDesignFindings } from './design/design-modules.mjs';

const CLOCK_SLACK_MS = 2000;
const GRADLE_FLAGS = ['--console=plain', '--quiet', '--no-configuration-cache'];

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
  } = {},
) {
  const withKotlin = kotlinRun?.withArguments ?? ((run) => run([]));
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlin((kotlinArguments) => {
    const common = [
      ...GRADLE_FLAGS,
      ...(policy.snapshot === 'base' ? ['--continue'] : []),
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
    });
    const checkTests = testsFailedModules.length === 0;
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
  const { findings } = readJavaFindings(projectRoot, {
    ...readOptions(options.policy),
    formatAdvice: kotlinRun?.advice,
    reportBase,
    report,
  });
  return {
    findings: [...findings, ...gradleDesignFindings({ projectRoot, report, options, reportBase })],
    testsFailures: withRootSourceRoots(testsFailures, report.modules),
  };
}

function withGradleReports(projectRoot, options) {
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

function mavenFindings(projectRoot, options) {
  const { moduleDirs, testsFailures, formatAdvice } = runMavenPreset(projectRoot, {
    ...options,
    timeoutMs: options.budget?.mavenCommandTimeoutMs,
    configs: toolConfigChoices(projectRoot, options.policy),
  });
  const duplicates = {
    reportRoot: path.join(projectRoot, MAVEN_REPORT_DIRECTORY),
    manifest: mergedRoots(projectRoot, moduleDirs, MAVEN_REPORT_DIRECTORY),
    skippedFolders: options.policy?.duplicateSkippedFolders,
  };
  runJavaDuplicates(projectRoot, duplicates);
  if (options.policy?.preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, duplicates);
  }
  const findings = readModuleFindings(projectRoot, moduleDirs, {
    ...readOptions(options.policy),
    formatAdvice,
    reportDirectory: MAVEN_REPORT_DIRECTORY,
  });
  return {
    findings: [...findings, ...mavenDesignFindings(projectRoot, moduleDirs, options.policy)],
    testsFailures,
  };
}

export function collectJavaFindings(root, options = {}) {
  const projectRoot = path.resolve(root);
  const { findings, testsFailures } =
    detectJavaBuild(projectRoot) === 'maven'
      ? mavenFindings(projectRoot, options)
      : withGradleReports(projectRoot, options);
  const preset = options.policy?.preset ?? 'java';
  function readSource(file) {
    return sourceText(projectRoot, file);
  }
  const parsed = parseAnalyzerReport(
    {
      findings: withJavaColumns(findings, { projectRoot, policy: options.policy, readSource }),
    },
    preset,
  ).findings;
  const policed = applyFindingPolicy(
    withoutFollowedImports(
      withProjectSourceRules(withoutGeneratedSources(parsed, projectRoot), projectRoot),
      options.policy?.conventions,
      readSource,
    ),
    { ...options.policy, inventoryTool: preset, routeRule: javaRouteRule },
    options.resolveOverlaps ?? ((reported) => withoutOverlaps(reported, { readSource })),
  );
  return withTestsFailures(policed, preset, testsFailures);
}

function sourceText(projectRoot, file) {
  const absolute = path.join(projectRoot, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
}

function collectBothSnapshots({
  repositoryRoot,
  projectRelativePath,
  comparison,
  options,
  policy,
  warn,
}) {
  const head = { commitSha: comparison.headSha, warn };
  return withTemporaryWorktree(repositoryRoot, head, (headWorktree) => {
    const policyRoot = path.join(headWorktree, projectRelativePath);
    function collectIn(worktreeRoot, snapshot, extra = {}) {
      return collectJavaFindings(path.join(worktreeRoot, projectRelativePath), {
        ...options,
        policy: { ...policy, snapshot, policyRoot, ...extra },
      });
    }
    return withTemporaryWorktree(
      repositoryRoot,
      { commitSha: comparison.mergeBaseSha, warn },
      (baseWorktree) => {
        const collectedBase = collectIn(baseWorktree, 'base');
        const headFindings = collectIn(headWorktree, 'head', {
          baselineRoot: path.join(baseWorktree, projectRelativePath),
        });
        const notes = testFailuresOf({ findings: collectedBase });
        return {
          notes,
          baseFindings: collectedBase.filter((finding) => !notes.includes(finding)),
          headFindings,
        };
      },
    );
  });
}

function withEnforceable(outcome) {
  const newEnforceable = outcome.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  const failed =
    newEnforceable.length > 0 ||
    outcome.newFindings.some((finding) => finding.classification === 'tool-error');
  return { ...outcome, newEnforceable, failed };
}

export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  includeWorkingTree = false,
  gradle,
  maven,
  spawn,
  initScript,
  policy,
}) {
  const committed = resolveComparison(repositoryRoot, requestedBaseRef);
  const comparison = includeWorkingTree
    ? { ...committed, headSha: captureWorkingTree(repositoryRoot, committed.headSha) }
    : committed;
  const range = {
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  };
  const baseToHeadRenames = readRenameMap(range);
  const warnings = [];
  const { notes, baseFindings, headFindings } = collectBothSnapshots({
    repositoryRoot,
    projectRelativePath,
    comparison,
    options: { gradle, maven, spawn, initScript },
    policy,
    warn: (message) => warnings.push(message),
  });
  const touchedCode = {
    changedLines: readChangedLines(range),
    isStrictRule: isJavaTouchedRule,
    testsRemoved: readRemovesTests(range),
  };
  const result = compareFindings({
    baseFindings,
    headFindings,
    baseToHeadRenames,
    touchedCode,
    unknownOnBase: unknownOnBaseFor(notes, touchedCode),
  });
  return withEnforceable({ comparison, ...result, notes, warnings });
}
