import path from 'node:path';
import {
  clearSnapshotReports,
  writeSnapshotReports,
  renderRuleFilterSection as renderSnapshotRuleFilterSection,
} from '../snapshot/reporters.mjs';
import { selectAnalyzers } from '../diff/execution/run-analyzers.mjs';
import { withTemporaryWorktree } from '../diff/git/repository/worktree.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../languages/typescript/adapters/static-checks/dependencies.mjs';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { runQualitySnapshot } from '../snapshot/run-snapshot.mjs';
import { realpathSync } from 'node:fs';
import { runGit } from '../diff/git/repository/command.mjs';
import { writeGithubOutput } from '../diff/reporting/github/emit.mjs';
import { captureWorkingTree } from '../diff/git/repository/git.mjs';
import { outputRootFor } from '../diff/reporting/reporters.mjs';

function stderrWarning(stderr) {
  return (message) => stderr.write(`nitpicker: ${message}\n`);
}

export function runSnapshotCli({
  options,
  currentProjectRoot,
  analyzers,
  headPolicy,
  stdout,
  stderr,
  environment,
  runTasks,
  scope,
}) {
  const outputRoot = outputRootFor(currentProjectRoot, options.outputRoot, 'snapshot');
  clearSnapshotReports(outputRoot);
  const selectedAnalyzers = selectAnalyzers(analyzers, options.analyzerNames);
  if (selectedAnalyzers.length === 0) {
    throw new Error('No quality analyzers are configured.');
  }

  const { repositoryRoot, relativeProjectPath, capturedSha } = captureSnapshot(currentProjectRoot);
  const snapshot = { commitSha: capturedSha, warn: stderrWarning(stderr) };
  const report = withTemporaryWorktree(repositoryRoot, snapshot, (worktreeRoot) =>
    runInSnapshotWorktree({
      snapshotRoot: path.join(worktreeRoot, relativeProjectPath),
      selectedAnalyzers,
      currentProjectRoot,
      headPolicy,
      runTasks,
      scope,
    }),
  );
  report.text = writeSnapshotReports(outputRoot, report, {
    projectPath: relativeProjectPath,
    repositoryRoot,
  });
  stdout.write(report.text);
  stdout.write(renderSnapshotRuleFilterSection(report, options.ruleFilters));
  writeGithubOutput({
    kind: 'snapshot',
    report,
    projectRoot: currentProjectRoot,
    environment,
    stdout,
    stderr,
  });
  if (report.summary.enforceableFindings > 0) {
    return 1;
  }
  return report.summary.overallStatus === 'tool-error' ? 2 : 0;
}

function runInSnapshotWorktree({
  snapshotRoot,
  selectedAnalyzers,
  currentProjectRoot,
  headPolicy,
  runTasks,
  scope,
}) {
  const needsDependencies = selectedAnalyzers.some((analyzer) => analyzer.requiresDependencies);
  const dependencies = needsDependencies
    ? prepareSnapshotDependencies({
        projectRoot: snapshotRoot,
        liveProjectRoot: currentProjectRoot,
        toolRoot: PACKAGE_ROOT,
      })
    : undefined;
  try {
    return runQualitySnapshot({
      analyzers: selectedAnalyzers,
      projectRoot: snapshotRoot,
      policyRoot: snapshotRoot,
      toolRoot: PACKAGE_ROOT,
      liveProjectRoot: currentProjectRoot,
      headPolicy,
      runTasks,
      scope,
    });
  } finally {
    removeSnapshotDependencies(dependencies);
  }
}

function captureSnapshot(currentProjectRoot) {
  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const relativeProjectPath = path.relative(repositoryRoot, currentProjectRoot) || '.';
  const headSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  const capturedSha = captureWorkingTree(repositoryRoot, headSha);
  return { repositoryRoot, relativeProjectPath, capturedSha };
}
