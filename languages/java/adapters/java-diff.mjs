import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareFindings } from '../../../core/diff/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import {
  captureWorkingTree,
  readChangedLines,
  readRenameMap,
  resolveComparison,
} from '../../../core/diff/git.mjs';
import { withTemporaryWorktree } from '../../../core/diff/worktree.mjs';
import { gradleTarget } from './gradle-wrapper/gradle-command.mjs';
import { condenseFailure } from './gradle-wrapper/failure-text.mjs';
import { runJavaDuplicates } from './java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin-duplicates.mjs';
import { applyJavaPolicy } from './java-policy.mjs';
import { detectBuildTool } from '../maven/build-tool.mjs';
import { toolConfigChoices } from '../maven/context/tool-config.mjs';
import { runMavenPreset } from '../maven/maven-preset.mjs';
import { readJavaFindings } from './java-reports.mjs';
import { readReportModules } from './gradle-reports/report-modules.mjs';
import { kotlinGradleArguments } from './kotlin-tools.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';

export const INIT_SCRIPT = path.resolve(import.meta.dirname, '../gradle/nitpicker.init.gradle');
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

export function toolConfigProperties(projectRoot, options = {}) {
  return Object.entries(toolConfigChoices(projectRoot, options)).flatMap(([tool, choice]) => [
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

function runBuild(projectRoot, options) {
  if (detectBuildTool(projectRoot) === 'maven') {
    runMavenPreset(projectRoot, {
      maven: options.maven,
      policy: options.policy,
      reportBase: options.reportBase,
    });
    return;
  }
  runJavaPreset(projectRoot, options);
}

export function collectJavaFindings(projectRoot, options = {}) {
  const preset = options.policy?.preset ?? 'java';
  const reportBase = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reports-'));
  try {
    runBuild(projectRoot, { ...options, reportBase });
    const modules = readReportModules(reportBase, preset);
    runJavaDuplicates(projectRoot, { reportRoot: reportBase, manifest: modules.manifest });
    if (preset === 'kotlin') {
      runKotlinDuplicates(projectRoot, { reportRoot: reportBase, manifest: modules.manifest });
    }
    const { findings } = parseAnalyzerReport(
      readJavaFindings(projectRoot, {
        reportBase,
        crapLimit: options.policy?.crapLimit,
        preset,
        fileLimits: options.policy?.fileLimits,
        exclude: options.policy?.exclude,
        exceptions: options.policy?.exceptions,
      }),
      preset,
    );
    return applyJavaPolicy(findings, options.policy);
  } finally {
    rmSync(reportBase, { recursive: true, force: true });
  }
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
  const collectAt = (sha) =>
    withTemporaryWorktree(repositoryRoot, sha, (worktreeRoot) =>
      collectJavaFindings(path.join(worktreeRoot, projectRelativePath), options),
    );

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
  return { comparison, ...result, newEnforceable, failed: newEnforceable.length > 0 };
}
