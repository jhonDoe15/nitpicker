import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { captureWorkingTree, resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readRenameMap } from '../../../core/diff/git/patches/project-moves.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { gradleTarget } from './gradle-wrapper/gradle-command.mjs';
import { condenseFailure } from './gradle-wrapper/failure-text.mjs';
import { runJavaDuplicates } from './metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin/kotlin-duplicates.mjs';
import { applyJavaPolicy } from './java-policy.mjs';
import { PROJECT_TOOL_CONFIGS } from './gradle-presets.mjs';
import { readJavaFindings } from './reporting/java-reports.mjs';
import { readReportModules } from './gradle-reports/report-modules.mjs';
import { runMavenPreset, MAVEN_REPORT_DIRECTORY } from '../maven/maven-build.mjs';
import { detectJavaBuild, INIT_SCRIPT } from '../builds/java-build.mjs';
import { moduleReport, readModuleFindings } from '../builds/java-modules.mjs';
import { kotlinGradleArguments } from './kotlin/kotlin-tools.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';

const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3500;

function kotlinProperties(projectRoot, { preset, kotlinFormatter, kotlinDetektConfig, snapshot }) {
  return preset === 'kotlin'
    ? kotlinGradleArguments(projectRoot, {
        formatter: kotlinFormatter,
        detektConfig: kotlinDetektConfig,
        snapshot,
      })
    : [];
}

export function baselineProperties({ snapshot, baselineRoot } = {}) {
  return snapshot === 'head' && baselineRoot !== undefined
    ? [`-Pnitpicker.baselineRoot=${baselineRoot}`]
    : [];
}

function toolConfigChoices(projectRoot, { toolPrecedence = {}, policyRoot } = {}) {
  return Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map(([tool, file]) => {
      const precedence = toolPrecedence[tool] ?? ['nitpicker'];
      const projectConfig = path.join(policyRoot ?? projectRoot, file);
      if (precedence.includes('project') && !existsSync(projectConfig)) {
        throw new Error(`"tools.${tool}.precedence" lists "project" but ${file} is missing`);
      }
      return [
        tool,
        {
          nitpicker: precedence.includes('nitpicker'),
          project: precedence.includes('project') ? projectConfig : undefined,
        },
      ];
    }),
  );
}

export function toolConfigProperties(projectRoot, policy = {}) {
  return Object.entries(toolConfigChoices(projectRoot, policy)).flatMap(([tool, choice]) => [
    ...(choice.project === undefined
      ? []
      : [`-Pnitpicker.${tool}.projectConfig=${choice.project}`]),
    ...(choice.nitpicker ? [] : [`-Pnitpicker.${tool}.nitpickerConfig=false`]),
  ]);
}

function runJavaPreset(
  projectRoot,
  { gradle, initScript = INIT_SCRIPT, policy = {}, reportBase } = {},
) {
  const target = gradleTarget({
    projectRoot,
    configured: gradle,
    args: [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      `-Pnitpicker.reportDir=${reportBase}`,
      ...kotlinProperties(projectRoot, policy),
      ...toolConfigProperties(projectRoot, policy),
      ...baselineProperties(policy),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  });
  const result = spawnSync(target.command, target.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: GRADLE_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = condenseFailure(
      result.stderr.trim() === '' ? result.stdout : result.stderr,
      MAX_FAILURE_LENGTH,
    );
    throw new Error(`Java preset failed in ${projectRoot}: ${detail || 'no diagnostic output'}`);
  }
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
    fileLimits: policy.fileLimits,
    exclude: policy.exclude,
    exceptions: policy.exceptions,
    testSeconds: policy.testSeconds,
    baseline: { snapshot: policy.snapshot, baselineRoot: policy.baselineRoot },
  };
}

function gradleFindings(projectRoot, options, reportBase) {
  const preset = options.policy?.preset ?? 'java';
  runJavaPreset(projectRoot, { ...options, reportBase });
  const report = readReportModules(reportBase, preset);
  runJavaDuplicates(projectRoot, { reportRoot: reportBase, manifest: report.manifest });
  if (preset === 'kotlin') {
    runKotlinDuplicates(projectRoot, { reportRoot: reportBase, manifest: report.manifest });
  }
  return readJavaFindings(projectRoot, { ...readOptions(options.policy), reportBase, report })
    .findings;
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
    runJavaDuplicates(moduleDir, { reportRoot: reportBase, manifest: report.manifest });
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
  return applyJavaPolicy(parseAnalyzerReport({ findings }, preset).findings, options.policy);
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
  const options = { gradle, maven, initScript, policy };
  function collectAt(sha) {
    return withTemporaryWorktree(repositoryRoot, sha, (worktreeRoot) =>
      collectJavaFindings(path.join(worktreeRoot, projectRelativePath), options),
    );
  }

  const baseFindings = collectAt(comparison.mergeBaseSha);
  const headFindings = collectAt(comparison.headSha);
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
  const failed =
    newEnforceable.length > 0 ||
    result.newFindings.some((finding) => finding.classification === 'tool-error');
  return { comparison, ...result, newEnforceable, failed };
}
