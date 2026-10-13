import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
import { runJavaDuplicates } from './java-duplicates.mjs';
import { runKotlinDuplicates } from './kotlin-duplicates.mjs';
import { applyJavaPolicy, PROJECT_TOOL_CONFIGS } from './java-policy.mjs';
import { readJavaFindings, requireGradleReports } from './java-reports.mjs';
import { kotlinGradleArguments } from './kotlin-tools.mjs';
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
      throw new Error(
        `"tools.${tool}.precedence" includes "project", but the project has no ${file}. Add the file or remove "project"`,
      );
    }
    return [
      ...(precedence.includes('project')
        ? [`-Pnitpicker.${tool}.projectConfig=${projectConfig}`]
        : []),
      ...(precedence.includes('nitpicker') ? [] : [`-Pnitpicker.${tool}.nitpickerConfig=false`]),
    ];
  });
}

function runJavaPreset(
  projectRoot,
  { gradle = 'gradle', initScript = INIT_SCRIPT, policy = {} } = {},
) {
  const result = spawnSync(
    gradle,
    [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      ...kotlinProperties(projectRoot, policy),
      ...toolConfigProperties(projectRoot, policy),
      '-I',
      initScript,
      'nitpickerJava',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: GRADLE_TIMEOUT_MS,
    },
  );
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
    readJavaFindings(projectRoot, { crapLimit: options.policy?.crapLimit, preset }),
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
