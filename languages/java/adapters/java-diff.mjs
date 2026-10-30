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
import { toolConfigChoices } from './tool-config/tool-config-choices.mjs';
import { readJavaFindings } from './reporting/java-reports.mjs';
import { withJavaColumns } from './reporting/columns/java-columns.mjs';
import { readReportModules } from './gradle-reports/report-modules.mjs';
import { runMavenPreset, MAVEN_REPORT_DIRECTORY } from '../maven/maven-build.mjs';
import { detectJavaBuild, INIT_SCRIPT } from '../builds/java-build.mjs';
import { moduleReport, readModuleFindings } from '../builds/java-modules.mjs';
import { resolveKotlinRun } from './kotlin/kotlin-run.mjs';
import { runGradleStage } from './red-base/gradle-stage.mjs';
import {
  runOrNoteFailingTests,
  withRootSourceRoots,
  withTestsFailures,
} from './red-base/tests-failed.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';
import { withProjectEnumPredicates } from './review-rules/enum-predicates.mjs';
import { gradleBudget } from './gradle-wrapper/gradle-budget.mjs';
import { gradleStages } from './gradle-wrapper/gradle-stages.mjs';

const CLOCK_SLACK_MS = 2000;

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
  const directory = path.join(reportBase, 'tool-config');
  const since = Date.now() - CLOCK_SLACK_MS;
  withKotlin((kotlinArguments) => {
    const common = [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      ...(policy.snapshot === 'base' ? ['--continue'] : []),
      `-Pnitpicker.reportDir=${reportBase}`,
      ...kotlinArguments,
    ];
    const stages = gradleStages(common, {
      projectRoot,
      initScript,
      policy,
      directory,
      testsFailedModules,
    });
    for (const stage of stages) {
      runGradleStage({ args: stage(), projectRoot, gradle, budget, reportBase, since, spawn });
    }
  });
}

function withoutReportBase(error, reportBase) {
  return error instanceof Error && error.message.includes(reportBase)
    ? new Error(error.message.replaceAll(reportBase, '<report directory>'), { cause: error })
    : error;
}

function readOptions(policy = {}) {
  return {
    crapLimit: policy.crapLimit,
    preset: policy.preset ?? 'java',
    conventions: policy.conventions,
    fileLimits: policy.fileLimits,
    exclude: policy.exclude,
    exceptions: policy.exceptions,
    testSeconds: policy.testSeconds,
    testConsoleAllow: policy.testConsoleAllow,
    javaStyle: policy.javaStyle,
    baselineRoot: policy.baselineRoot,
    baselineMovesFile: policy.baselineMovesFile,
    baseline: { snapshot: policy.snapshot, baselineRoot: policy.baselineRoot },
  };
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
  return {
    findings: readJavaFindings(projectRoot, {
      ...readOptions(options.policy),
      formatAdvice: kotlinRun?.advice,
      reportBase,
      report,
    }).findings,
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
  const { moduleDirs, testsFailures } = runMavenPreset(projectRoot, {
    maven: options.maven,
    spawn: options.spawn,
    policy: options.policy,
    configs: toolConfigChoices(projectRoot, options.policy),
  });
  for (const moduleDir of moduleDirs) {
    const { reportBase, report } = moduleReport(moduleDir, MAVEN_REPORT_DIRECTORY);
    runJavaDuplicates(moduleDir, {
      reportRoot: reportBase,
      manifest: report.manifest,
      skippedFolders: options.policy?.duplicateSkippedFolders,
    });
  }
  return {
    findings: readModuleFindings(projectRoot, moduleDirs, {
      ...readOptions(options.policy),
      reportDirectory: MAVEN_REPORT_DIRECTORY,
    }),
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
      withProjectEnumPredicates(withoutGeneratedSources(parsed, projectRoot), projectRoot),
      options.policy?.conventions,
      readSource,
    ),
    { ...options.policy, inventoryTool: preset, routeRule: javaRouteRule },
    (reported) => withoutOverlaps(reported, { readSource }),
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
}) {
  return withTemporaryWorktree(repositoryRoot, comparison.headSha, (headWorktree) => {
    const policyRoot = path.join(headWorktree, projectRelativePath);
    function collectIn(worktreeRoot, snapshot) {
      return collectJavaFindings(path.join(worktreeRoot, projectRelativePath), {
        ...options,
        policy: { ...policy, snapshot, policyRoot },
      });
    }
    const headFindings = collectIn(headWorktree, 'head');
    const collectedBase = withTemporaryWorktree(
      repositoryRoot,
      comparison.mergeBaseSha,
      (baseWorktree) => collectIn(baseWorktree, 'base'),
    );
    const notes = testFailuresOf({ findings: collectedBase });
    return {
      notes,
      baseFindings: collectedBase.filter((finding) => !notes.includes(finding)),
      headFindings,
    };
  });
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
  const { notes, baseFindings, headFindings } = collectBothSnapshots({
    repositoryRoot,
    projectRelativePath,
    comparison,
    options: { gradle, maven, spawn, initScript },
    policy,
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
  const newEnforceable = result.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  return { comparison, ...result, notes, newEnforceable, failed: newEnforceable.length > 0 };
}
