import path from 'node:path';
import {
  clearSnapshotReports,
  renderSnapshotConsoleSummary,
  writeSnapshotReports,
  renderRuleFilterSection as renderSnapshotRuleFilterSection,
} from '../snapshot/reporters.mts';
import { analyzerRunOptions, selectAnalyzers } from '../diff/execution/run-analyzers.mts';
import { withNamedTemporaryWorktree } from '../diff/git/repository/worktree.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from '../../languages/typescript/adapters/static-checks/dependencies.mts';
import { PACKAGE_ROOT } from '../tooling/tool-resolution.mjs';
import { type QualitySnapshot, runQualitySnapshot } from '../snapshot/run-snapshot.mts';
import {
  colorEnabled as untypedColorEnabled,
  displayPath as untypedDisplayPath,
} from '../../shared/messages/terminal/terminal-text.mjs';
import { realpathSync } from 'node:fs';
import { runGit } from '../diff/git/repository/command.mjs';
import { writeGithubOutput } from '../diff/reporting/github/emit.mts';
import { captureWorkingTree } from '../diff/git/repository/git.mjs';
import { runProfileSummary } from '../quick/summary.mts';
import { outputRootFor } from '../diff/reporting/reporters.mts';
import { assertHasCommit } from '../diff/git/repository/base-ref.mts';
import { runStamp as untypedRunStamp } from '../diff/reporting/run-stamp/run-stamp.mjs';
import { partialRunField, partialRunOf } from '../diff/reporting/partial-run/partial-run.mts';
import { failingHeadTests as failingTestsOf } from '../diff/reporting/failing-tests/failing-tests.mts';
import { snapshotJson } from '../diff/reporting/json-output/json-output.mts';
import type { TextOutput } from '../cli-context.mts';
import type { ProfiledAnalyzer } from '../../shared/values/analyzers.mts';
import { appendAll } from '../../shared/lists/lists.mts';
import { fieldOf, numberOr, objectOf, textOf } from '../../shared/values/readers.mts';
import { projectHeader } from './comparison/outcome.mts';
import { finishSnapshotResume, snapshotResume } from '../diff/cache/resume/snapshot-resume.mts';
import type { LabelFilter } from '../labels/taxonomy.mts';

const displayPath: (absolutePath: string) => string = untypedDisplayPath;
const colorEnabled: (stream: unknown, environment: NodeJS.ProcessEnv) => boolean =
  untypedColorEnabled;

type SnapshotCli = {
  readonly options: {
    readonly analyzerNames: readonly string[];
    readonly ruleFilters: readonly string[];
    readonly details: boolean;
    readonly staged: boolean;
    readonly outputRoot?: string;
    readonly cache: boolean;
  };
  readonly currentProjectRoot: string;
  readonly currentFolder?: string | undefined;
  readonly analyzers: readonly ProfiledAnalyzer[];
  readonly quick: unknown;
  readonly captureHead?: unknown;
  readonly headPolicy: unknown;
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
  readonly jsonOutput?: TextOutput | undefined;
  readonly environment: NodeJS.ProcessEnv;
  readonly runTasks: unknown;
  readonly scope: unknown;
  readonly labels?: LabelFilter | undefined;
  readonly setupErrors: readonly object[];
  readonly additionalToolErrors?: readonly unknown[];
};

type SnapshotReport = QualitySnapshot & { text?: unknown };

type Capture = (repositoryRoot: string, headSha: string) => unknown;

type WorktreeRun = {
  readonly snapshotRoot: string;
  readonly selectedAnalyzers: readonly unknown[];
  readonly currentProjectRoot: string;
  readonly headPolicy: unknown;
  readonly scope: unknown;
  readonly setupErrors: readonly object[];
};

const inWorktree: (
  repositoryRoot: string,
  snapshot: {
    readonly commitSha: unknown;
    readonly directoryName: string;
    readonly warn: (message: string) => unknown;
  },
  operation: (worktreeRoot: string) => SnapshotReport,
) => SnapshotReport = withNamedTemporaryWorktree;
const runStampOf: (request: {
  readonly projectRoot: string;
  readonly outputRoot: string;
}) => object = untypedRunStamp;
const capturedTree: Capture = captureWorkingTree;
const prepareDependencies: (options: {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: unknown;
}) => unknown = prepareSnapshotDependencies;

function isCapture(value: unknown): value is Capture {
  return typeof value === 'function';
}

function stderrWarning(stderr: TextOutput): (message: string) => unknown {
  return (message) => stderr.write(`nitpicker: ${message}\n`);
}

export function runSnapshotCli(cli: SnapshotCli): number {
  const { options, currentProjectRoot, analyzers, headPolicy, runTasks, scope } = cli;
  const { setupErrors } = cli;
  const outputRoot = textOf(outputRootFor(currentProjectRoot, options.outputRoot, 'snapshot'));
  const selectedAnalyzers = selectAnalyzers(analyzers, options.analyzerNames);
  if (selectedAnalyzers.length === 0) {
    throw new Error('No quality analyzers are configured.');
  }
  clearSnapshotReports(outputRoot);
  const stamp = runStampOf({ projectRoot: currentProjectRoot, outputRoot });

  const { repositoryRoot, relativeProjectPath, capturedSha, snapshot, resume } = capturedRun(
    cli,
    selectedAnalyzers,
  );
  const report = inWorktree(repositoryRoot, snapshot, (worktreeRoot) =>
    runInSnapshotWorktree(
      {
        snapshotRoot: path.join(worktreeRoot, relativeProjectPath),
        selectedAnalyzers,
        currentProjectRoot,
        headPolicy,
        scope,
        setupErrors,
      },
      {
        ...analyzerRunOptions({ outputRoot, runTasks }),
        labels: cli.labels,
        resume,
      },
    ),
  );
  addToolErrors(report, cli.additionalToolErrors ?? []);
  Object.assign(
    report.summary,
    { headSha: capturedSha },
    stamp,
    partialRunField(partialRunOf(options.analyzerNames, analyzers, selectedAnalyzers)),
    runProfileSummary({ quick: cli.quick, staged: options.staged }),
    { projectPath: relativeProjectPath.split(path.sep).join('/') },
  );
  writeAndFinish(report, { outputRoot, relativeProjectPath, repositoryRoot, resume });
  return writeSnapshotOutcome(cli, report, outputRoot);
}

function capturedRun(cli: SnapshotCli, selectedAnalyzers: readonly unknown[]) {
  const captured = captureSnapshot(
    cli.currentProjectRoot,
    isCapture(cli.captureHead) ? cli.captureHead : capturedTree,
  );
  const { repositoryRoot, relativeProjectPath, capturedSha } = captured;
  return {
    ...captured,
    snapshot: { commitSha: capturedSha, directoryName: 'head', warn: stderrWarning(cli.stderr) },
    resume: snapshotResume({
      ...cli,
      repositoryRoot,
      relativeProjectPath,
      capturedSha: textOf(capturedSha),
      analyzers: selectedAnalyzers,
    }),
  };
}

function writeAndFinish(
  report: SnapshotReport,
  place: {
    readonly outputRoot: string;
    readonly relativeProjectPath: string;
    readonly repositoryRoot: string;
    readonly resume: unknown;
  },
): void {
  report.text = writeSnapshotReports(place.outputRoot, report, {
    projectPath: place.relativeProjectPath,
    repositoryRoot: place.repositoryRoot,
  });
  finishSnapshotResume(place.resume, report.toolErrors);
}

function addToolErrors(report: SnapshotReport, errors: readonly unknown[]): void {
  if (errors.length === 0) {
    return;
  }
  const existing = report.toolErrors.splice(0);
  const added = errors.map((error) => ({ ...objectOf(error), path: '' }));
  appendAll(appendAll(report.toolErrors, added), existing);
  Object.assign(report.summary, { overallStatus: 'tool-error' });
}

function writeSnapshotOutcome(
  cli: SnapshotCli,
  report: SnapshotReport,
  outputRoot: string,
): number {
  const { stdout, jsonOutput } = cli;
  if (jsonOutput === undefined) {
    stdout.write(projectHeader(cli.currentFolder, cli.currentProjectRoot));
    stdout.write(
      renderSnapshotConsoleSummary(report, {
        diagnosticsPath: displayPath(path.join(outputRoot, 'report.txt')),
        color: colorEnabled(stdout, cli.environment),
        details: cli.options.details,
        projectRoot: cli.currentProjectRoot,
      }),
    );
  }
  stdout.write(textOf(renderSnapshotRuleFilterSection(report, cli.options.ruleFilters)));
  writeGithubOutput({
    kind: 'snapshot',
    report,
    projectRoot: cli.currentProjectRoot,
    environment: cli.environment,
    stdout,
    stderr: cli.stderr,
  });
  const exitCode = snapshotExitCode(report);
  jsonOutput?.write(textOf(snapshotJson({ report, outputRoot, exitCode })));
  return exitCode;
}

function snapshotExitCode({ summary, toolErrors }: SnapshotReport): number {
  if (
    numberOr(fieldOf(summary, 'enforceableFindings'), 0) > 0 ||
    failingTestsOf(toolErrors).length > 0
  ) {
    return 1;
  }
  return fieldOf(summary, 'overallStatus') === 'tool-error' ? 2 : 0;
}

function runInSnapshotWorktree(
  {
    snapshotRoot,
    selectedAnalyzers,
    currentProjectRoot,
    headPolicy,
    scope,
    setupErrors,
  }: WorktreeRun,
  execution: object,
): SnapshotReport {
  const needsDependencies = selectedAnalyzers.some(
    (analyzer) => fieldOf(analyzer, 'requiresDependencies') === true,
  );
  const dependencies = needsDependencies
    ? prepareDependencies({
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
      headPolicy: objectOf(headPolicy),
      scope,
      setupErrors,
      ...execution,
    });
  } finally {
    removeSnapshotDependencies(dependencies);
  }
}

function captureSnapshot(
  currentProjectRoot: string,
  capture: Capture,
): {
  readonly repositoryRoot: string;
  readonly relativeProjectPath: string;
  readonly capturedSha: unknown;
} {
  const repositoryRoot = realpathSync(
    runGit(currentProjectRoot, ['rev-parse', '--show-toplevel']).trim(),
  );
  const relativeProjectPath = path.relative(repositoryRoot, currentProjectRoot) || '.';
  assertHasCommit(repositoryRoot);
  const headSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  const capturedSha = capture(repositoryRoot, headSha);
  return { repositoryRoot, relativeProjectPath, capturedSha };
}
