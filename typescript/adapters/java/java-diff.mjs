import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { compareFindings } from '../../core/diff/compare.mjs';
import { parseAnalyzerReport } from '../../core/diff/finding-schema.mjs';
import {
  captureWorkingTree,
  readChangedLines,
  readRenameMap,
  resolveComparison,
} from '../../core/diff/git.mjs';
import { withTemporaryWorktree } from '../../core/diff/worktree.mjs';
import { runJavaDuplicates } from './java-duplicates.mjs';
import { readJavaFindings } from './java-reports.mjs';
import { isJavaTouchedRule } from './touched-rules.mjs';

// Runs the Java preset (java/nitpicker.init.gradle) on a project and compares base with head.

export const INIT_SCRIPT = path.resolve(import.meta.dirname, '../../java/nitpicker.init.gradle');
const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

/** Runs the preset's Gradle task in `projectRoot`; reports land in `<projectRoot>/build/nitpicker`. */
export function runJavaPreset(projectRoot, { gradle = 'gradle', initScript = INIT_SCRIPT } = {}) {
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', '-I', initScript, 'nitpickerJava'],
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

/** Runs the preset and returns the validated findings of one snapshot. */
export function collectJavaFindings(projectRoot, options) {
  runJavaPreset(projectRoot, options);
  runJavaDuplicates(projectRoot);
  return parseAnalyzerReport(readJavaFindings(projectRoot), 'java').findings;
}

/**
 * Compares the merge base of `requestedBaseRef` with HEAD (or the working tree). `failed` is true
 * when the head has new enforceable findings.
 */
export function runJavaDiff({
  repositoryRoot,
  projectRelativePath = '.',
  requestedBaseRef,
  includeWorkingTree = false,
  gradle,
  initScript,
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
  const options = { gradle, initScript };
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
