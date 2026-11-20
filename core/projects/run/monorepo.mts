import path from 'node:path';
import { outputRootFor } from '../../diff/reporting/reporters.mts';
import { inspectRepository } from '../plan/inspect.mts';
import { isGitWorkTree, memberProjectOf } from '../plan/member-root.mts';
import {
  clearStaleProjectReports,
  writeCombinedMachineReports,
} from '../report/combined-files.mts';
import { combinedSummary, exitCodeOf, writeCombinedReports } from '../report/combined-summary.mts';
import { renderPlan, renderSummary } from '../report/console.mts';
import { analyzersByProject, unlistedFolders } from './context.mts';
import {
  rejectPathScope,
  rejectWholeRunOptions,
  submoduleHint,
  undeclaredHint,
  unlistedHint,
} from './messages.mts';
import {
  comparisonOf,
  selectedPaths,
  selectionOf,
  submodulePaths,
  withRequestedAnalyzers,
} from './selection-plan.mts';
import { enclosingPlan, requestsProjects, singleMode } from './single-mode.mts';
import { clearReports, extrasOf, type RunContext } from './execution/project-rows.mts';
import { runRowsWithSharedBase } from './execution/shared-base.mts';
import type { ExitCode } from '../../cli-context.mts';
import type {
  Inspection,
  MonorepoCli,
  MonorepoPlan,
  PlanProject,
  ProjectRow,
  RunProject,
} from '../project-types.mts';
import { withInternalFrames } from '../../../shared/messages/crashes/internal-error.mts';

type Planned = { readonly plan: MonorepoPlan; readonly files: readonly string[] };
type Entry = { readonly cli: MonorepoCli; readonly currentProjectRoot: string };
type MonorepoResult = { readonly exitCode?: ExitCode; readonly extraCli?: object };

const memberOf: (plan: MonorepoPlan, directory: string | undefined) => PlanProject | undefined =
  memberProjectOf;

function noticesOf(plan: MonorepoPlan, changed: readonly string[], cli: MonorepoCli): string[] {
  const notices: string[] = [
    ...undeclaredHint(
      plan.undeclared,
      plan.projects.map(({ path: folder }) => folder),
    ),
    ...unlistedHint(unlistedFolders(plan, changed)),
    ...submoduleHint(submodulePaths(plan).filter((folder) => changed.includes(folder))),
  ];
  for (const notice of notices) {
    cli.stderr.write(`nitpicker: ${notice}\n`);
  }
  return notices;
}

type Finished = {
  readonly cli: MonorepoCli;
  readonly notices: readonly string[];
  readonly startedAt: number;
};

type Prepared = Omit<RunContext, 'cli' | 'runProject'> & {
  readonly rows: readonly ProjectRow[];
  readonly outside: readonly string[];
};

function prepare(plan: MonorepoPlan, cli: MonorepoCli): Prepared {
  const { all, outputRoot: given } = cli.options;
  const outputRoot = outputRootFor(plan.root, given, all ? 'snapshot' : 'diff');
  const selection = selectionOf(plan, cli);
  const analyzers = analyzersByProject(plan, cli, selectedPaths(selection.rows));
  clearStaleProjectReports({ outputRoot, plan, clearReports });
  clearReports(outputRoot);
  const rows = withRequestedAnalyzers(selection.rows, analyzers);
  return { outputRoot, analyzers, ...selection, rows };
}

type Finish = (results: readonly ProjectRow[]) => number;

function finisher(planned: Planned, prepared: Prepared, run: Finished): Finish {
  const { plan } = planned;
  const { outputRoot, outside } = prepared;
  const { cli, notices, startedAt } = run;
  return (results) => {
    const elapsedMs = Date.now() - startedAt;
    const summary = combinedSummary({ plan, results, outside, notices, elapsedMs });
    const text: string = renderSummary({
      summary,
      summaryPath: path.join(outputRoot, 'summary.json'),
      details: cli.options.details,
    });
    writeCombinedReports(outputRoot, summary, text);
    writeCombinedMachineReports({ outputRoot, plan });
    cli.stdout.write(text);
    return exitCodeOf(summary, cli.options);
  };
}

function execute(planned: Planned, cli: MonorepoCli, runProject: RunProject): ExitCode {
  const { plan } = planned;
  const startedAt = Date.now();
  const prepared = prepare(plan, cli);
  const { outputRoot, analyzers, comparison, outside, rows } = prepared;
  const notices = noticesOf(plan, comparison.changed, cli);
  cli.stdout.write(renderPlan({ plan, rows, outside, details: cli.options.details }));
  const finish = finisher(planned, prepared, { cli, notices, startedAt });
  const context = { cli, runProject, outputRoot, comparison, analyzers };
  const results = runRowsWithSharedBase(rows, context, plan.repositoryRoot);
  if (results instanceof Promise) {
    return finishedLater(results, finish, cli);
  }
  return finish(results);
}

async function finishedLater(
  results: Promise<readonly ProjectRow[]>,
  finish: Finish,
  cli: MonorepoCli,
): Promise<number> {
  try {
    return finish(await results);
  } catch (error) {
    cli.stderr.write(
      `nitpicker failed: ${withInternalFrames(error instanceof Error ? error.message : String(error), error)}\n`,
    );
    return 2;
  }
}

function runMember(
  planned: Planned & { readonly member: PlanProject },
  cli: MonorepoCli,
  runProject: RunProject,
): ExitCode {
  const { member } = planned;
  const comparison = comparisonOf(planned.plan, cli);
  const extras = extrasOf(member, { comparison, analyzers: new Map() });
  return runProject(cli.options, extras.cli);
}

function atTop(planned: Planned, entry: Entry, runProject: RunProject): ExitCode {
  const { cli, currentProjectRoot } = entry;
  rejectPathScope(planned.plan, cli.scope, cli.options);
  rejectWholeRunOptions(planned.plan, cli.options);
  const located = { ...cli, workingDirectory: cli.workingDirectory ?? currentProjectRoot };
  return execute(planned, located, runProject);
}

function aroundMember(
  inspection: Inspection,
  entry: Entry,
  runProject: RunProject,
): MonorepoResult {
  const { cli, currentProjectRoot } = entry;
  const enclosing = enclosingPlan(currentProjectRoot);
  if (enclosing === undefined) {
    return singleMode(inspection, cli);
  }
  return requestsProjects(cli)
    ? { exitCode: atTop(enclosing, entry, runProject) }
    : { exitCode: runMember(enclosing, cli, runProject) };
}

export function runMonorepo({
  cli,
  currentProjectRoot,
  runProject,
}: Entry & { readonly runProject: RunProject }): MonorepoResult {
  if (cli.singleProject === true || !isGitWorkTree(currentProjectRoot)) {
    return {};
  }
  const inspection = inspectRepository({ root: currentProjectRoot });
  const { plan, files } = inspection;
  if (plan === undefined) {
    return aroundMember(inspection, { cli, currentProjectRoot }, runProject);
  }
  const member =
    cli.currentProjectRoot === undefined ? memberOf(plan, cli.workingDirectory) : undefined;
  if (member !== undefined && !requestsProjects(cli)) {
    rejectPathScope(plan, cli.scope, cli.options);
    return { exitCode: runMember({ plan, files, member }, cli, runProject) };
  }
  return { exitCode: atTop({ plan, files }, { cli, currentProjectRoot }, runProject) };
}
