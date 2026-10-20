import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { captureWorkingTree, resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readRenameMap } from '../../../core/diff/git/patches/project-moves.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { gradleTarget } from './gradle-wrapper/gradle-command.mjs';
import { runGradle } from './gradle-wrapper/gradle-process.mjs';
import { withGradleLog } from './gradle-wrapper/diagnostics/failure-log.mjs';
import { condenseFailure } from './gradle-wrapper/diagnostics/failure-text.mjs';
import { runJavaDuplicates } from './metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin/kotlin-duplicates.mjs';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { withoutFollowedImports } from './imports/followed-imports.mjs';
import { withoutOverlaps } from './overlaps/static-overlaps.mjs';
import { toolConfigChoices, toolConfigProperties } from './tool-config/tool-config-choices.mjs';
import { readJavaFindings } from './reporting/java-reports.mjs';
import { readReportModules } from './gradle-reports/report-modules.mjs';
import { failingTestsOf } from './gradle-reports/failing-tests.mjs';
import { runMavenPreset, MAVEN_REPORT_DIRECTORY } from '../maven/maven-build.mjs';
import { detectJavaBuild, INIT_SCRIPT } from '../builds/java-build.mjs';
import { moduleReport, readModuleFindings } from '../builds/java-modules.mjs';
import { resolveKotlinRun } from './kotlin/kotlin-run.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';
import { markLombokGeneratedCode } from './generated-code/lombok-config.mjs';
import { withProjectEnumPredicates } from './review-rules/enum-predicates.mjs';
import { javaStyleProperties } from './style/java-style.mjs';
import { gradleBudget } from './gradle-wrapper/gradle-budget.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3500;
const CLOCK_SLACK_MS = 2000;
const CHECKSTYLE_EXPORT = 'checkstyle-nitpicker.xml';

function assertSucceeded(result, projectRoot, { reportBase, since }) {
  if (result.error === undefined && result.status === 0) {
    return;
  }
  const detail = condenseFailure(
    result.stderr?.trim() ? result.stderr : (result.stdout ?? ''),
    MAX_FAILURE_LENGTH,
  );
  const failure =
    result.error ??
    failingTestsOf(projectRoot, { reportBase, since }) ??
    new Error(`Java preset failed in ${projectRoot}: ${detail || 'no diagnostic output'}`);
  throw withGradleLog(failure, result);
}

function exportArguments(common, { initScript, directory, policy }) {
  mkdirSync(directory, { recursive: true });
  return [
    ...common,
    ...javaStyleProperties(policy),
    `-Pnitpicker.checkstyle.exportConfig=${path.join(directory, CHECKSTYLE_EXPORT)}`,
    '-I',
    initScript,
    'nitpickerCheckstyleConfig',
  ];
}

function runJavaPreset(
  projectRoot,
  {
    gradle,
    initScript = INIT_SCRIPT,
    policy = {},
    reportBase,
    kotlinRun,
    budget = gradleBudget(),
  } = {},
) {
  const withKotlin = kotlinRun?.withArguments ?? ((run) => run([]));
  const directory = path.join(reportBase, 'tool-config');
  const since = Date.now() - CLOCK_SLACK_MS;
  const layersCheckstyle = toolConfigChoices(projectRoot, policy).checkstyle.project !== undefined;
  withKotlin((kotlinArguments) => {
    const common = [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      `-Pnitpicker.reportDir=${reportBase}`,
      ...kotlinArguments,
    ];
    const checkstyleBase = path.join(directory, CHECKSTYLE_EXPORT);
    const stages = [
      ...(layersCheckstyle
        ? [() => exportArguments(common, { initScript, directory, policy })]
        : []),
      () => [
        ...common,
        ...toolConfigProperties(projectRoot, policy, { directory, checkstyleBase }),
        ...javaStyleProperties(policy),
        '-I',
        initScript,
        'nitpickerJava',
      ],
    ];
    for (const stage of stages) {
      const target = gradleTarget({ projectRoot, configured: gradle, args: stage() });
      const result = runGradle(target.command, target.args, {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        shell: target.shell,
        timeout: budget.commandTimeoutMs,
      });
      assertSucceeded(result, projectRoot, { reportBase, since });
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
    baseline: { snapshot: policy.snapshot, baselineRoot: policy.baselineRoot },
  };
}

function gradleFindings(projectRoot, options, reportBase) {
  const preset = options.policy?.preset ?? 'java';
  const kotlinRun = resolveKotlinRun(projectRoot, options.policy);
  runJavaPreset(projectRoot, { ...options, reportBase, kotlinRun });
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
  return readJavaFindings(projectRoot, {
    ...readOptions(options.policy),
    formatAdvice: kotlinRun?.advice,
    reportBase,
    report,
  }).findings;
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
  const moduleDirs = runMavenPreset(projectRoot, {
    maven: options.maven,
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
  return readModuleFindings(projectRoot, moduleDirs, {
    ...readOptions(options.policy),
    reportDirectory: MAVEN_REPORT_DIRECTORY,
  });
}

export function collectJavaFindings(root, options = {}) {
  const projectRoot = path.resolve(root);
  const findings =
    detectJavaBuild(projectRoot) === 'maven'
      ? mavenFindings(projectRoot, options)
      : withGradleReports(projectRoot, options);
  const preset = options.policy?.preset ?? 'java';
  function readSource(file) {
    return sourceText(projectRoot, file);
  }
  return applyFindingPolicy(
    withoutFollowedImports(
      withProjectEnumPredicates(parseAnalyzerReport({ findings }, preset).findings, projectRoot),
      options.policy?.conventions,
      readSource,
    ),
    { ...options.policy, inventoryTool: preset },
    (reported) => withoutOverlaps(reported, { readSource }),
  );
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
      const projectRoot = path.join(worktreeRoot, projectRelativePath);
      markLombokGeneratedCode(projectRoot);
      return collectJavaFindings(projectRoot, {
        ...options,
        policy: { ...policy, snapshot, policyRoot },
      });
    }
    const headFindings = collectIn(headWorktree, 'head');
    const baseFindings = withTemporaryWorktree(
      repositoryRoot,
      comparison.mergeBaseSha,
      (baseWorktree) => collectIn(baseWorktree, 'base'),
    );
    return { baseFindings, headFindings };
  });
}

export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  includeWorkingTree = false,
  gradle,
  maven,
  initScript,
  policy,
}) {
  const committed = resolveComparison(repositoryRoot, requestedBaseRef);
  const comparison = includeWorkingTree
    ? { ...committed, headSha: captureWorkingTree(repositoryRoot, committed.headSha) }
    : committed;
  const baseToHeadRenames = readRenameMap({
    repositoryRoot,
    mergeBaseSha: comparison.mergeBaseSha,
    headSha: comparison.headSha,
    projectRelativePath,
  });
  const { baseFindings, headFindings } = collectBothSnapshots({
    repositoryRoot,
    projectRelativePath,
    comparison,
    options: { gradle, maven, initScript },
    policy,
  });
  const touchedCode = {
    changedLines: readChangedLines({
      repositoryRoot,
      mergeBaseSha: comparison.mergeBaseSha,
      headSha: comparison.headSha,
      projectRelativePath,
    }),
    isStrictRule: isJavaTouchedRule,
  };
  const result = compareFindings({ baseFindings, headFindings, baseToHeadRenames, touchedCode });
  const newEnforceable = result.newFindings.filter(
    (finding) => finding.classification === 'enforceable',
  );
  return { comparison, ...result, newEnforceable, failed: newEnforceable.length > 0 };
}
