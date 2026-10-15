import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { captureWorkingTree, resolveComparison } from '../../../core/diff/git/repository/git.mjs';
import { readChangedLines } from '../../../core/diff/git/patches/changed-lines.mjs';
import { readRenameMap } from '../../../core/diff/git/paths.mjs';
import { withTemporaryWorktree } from '../../../core/diff/git/repository/worktree.mjs';
import { gradleTarget } from './gradle-wrapper/gradle-command.mjs';
import { runJavaDuplicates } from './metrics/java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin/kotlin-duplicates.mjs';
import { applyJavaPolicy } from './java-policy.mjs';
import { PROJECT_TOOL_CONFIGS } from './gradle-presets.mjs';
import { readJavaFindings, requireGradleReports } from './reporting/java-reports.mjs';
import { kotlinGradleArguments } from './kotlin/kotlin-tools.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';

export const INIT_SCRIPT = path.resolve(import.meta.dirname, '../gradle/nitpicker.init.gradle');
const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function kotlinProperties(projectRoot, { preset, kotlinFormatter, kotlinDetektConfig, snapshot }) {
  return preset === 'kotlin'
    ? kotlinGradleArguments(projectRoot, {
        formatter: kotlinFormatter,
        detektConfig: kotlinDetektConfig,
        snapshot,
      })
    : [];
}

export function toolConfigProperties(projectRoot, { toolPrecedence = {}, policyRoot } = {}) {
  return [...PROJECT_TOOL_CONFIGS].flatMap(([tool, file]) => {
    const precedence = toolPrecedence[tool] ?? ['nitpicker'];
    const projectConfig = path.join(policyRoot ?? projectRoot, file);
    if (precedence.includes('project') && !existsSync(projectConfig)) {
      throw new Error(`"tools.${tool}.precedence" lists "project" but ${file} is missing`);
    }
    return [
      ...(precedence.includes('project')
        ? [`-Pnitpicker.${tool}.projectConfig=${projectConfig}`]
        : []),
      ...(precedence.includes('nitpicker') ? [] : [`-Pnitpicker.${tool}.nitpickerConfig=false`]),
    ];
  });
}

function runJavaPreset(projectRoot, { gradle, initScript = INIT_SCRIPT, policy = {} } = {}) {
  const target = gradleTarget({
    projectRoot,
    configured: gradle,
    args: [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
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
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`Java preset failed in ${projectRoot}: ${detail}`);
  }
}

export function collectJavaFindings(projectRoot, options = {}) {
  const preset = options.policy?.preset ?? 'java';
  runJavaPreset(projectRoot, options);
  requireGradleReports(projectRoot, preset);
  runJavaDuplicates(projectRoot);
  if (preset === 'kotlin') {
    runKotlinDuplicates(projectRoot);
  }
  const { findings } = parseAnalyzerReport(
    readJavaFindings(projectRoot, {
      crapLimit: options.policy?.crapLimit,
      preset,
      fileLimits: options.policy?.fileLimits,
      exclude: options.policy?.exclude,
      exceptions: options.policy?.exceptions,
    }),
    preset,
  );
  return applyJavaPolicy(findings, options.policy);
}

export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  includeWorkingTree = false,
  gradle,
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
  const options = { gradle, initScript, policy };
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
  return { comparison, ...result, newEnforceable, failed: newEnforceable.length > 0 };
}
