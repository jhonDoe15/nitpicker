import path from 'node:path';
import { policyAcceptance } from '../../command/policy-review/policy-acceptance.mts';
import { clearDiffReports, outputRootFor } from '../../diff/reporting/reporters.mts';
import { clearSnapshotReports } from '../../snapshot/reporters.mts';
import { inspectRepository } from '../plan/inspect.mjs';
import { isGitWorkTree, memberProjectOf } from '../plan/member-root.mjs';
import { reportFolder } from '../plan/project-entry.mjs';
import {
  asProjectLoosenings,
  projectSetLoosenings,
  repositoryPolicy,
} from '../policy/project-set.mts';
import { reappearedProjects } from '../policy/reappeared.mjs';
import {
  clearStaleProjectReports,
  writeCombinedMachineReports,
} from '../report/combined-files.mts';
import { combinedSummary, exitCodeOf, writeCombinedReports } from '../report/combined-summary.mjs';
import { projectHeading, renderPlan, renderSummary } from '../report/console.mjs';
import { outcomeOf, writeFailureReport } from '../report/outcome.mjs';
import { analyzersByProject, unlistedFolders } from './context.mts';
import {
  rejectPathScope,
  rejectWholeRunOptions,
  submoduleHint,
  undeclaredHint,
  unlistedHint,
} from './messages.mjs';
import { comparisonOf, selectionOf, submodulePaths } from './selection-plan.mts';
import { enclosingPlan, requestsProjects, singleMode } from './single-mode.mts';
import type { ExitCode } from '../../cli-context.mts';
import type {
  Comparison,
  MonorepoCli,
  MonorepoPlan,
  PlanProject,
  ProjectCli,
  ProjectOutcome,
  ProjectRow,
  RepositoryPolicy,
  RunProject,
} from '../project-types.mts';
import type { Loosening } from '../policy/project-set.mts';

type Analyzers = ReadonlyMap<string, readonly string[]>;
type RunContext = {
  readonly cli: MonorepoCli;
  readonly runProject: RunProject;
  readonly outputRoot: string;
  readonly comparison: Comparison;
  readonly analyzers: Analyzers;
};
type Extras = { readonly options: object; readonly cli: ProjectCli };
type Planned = { readonly plan: MonorepoPlan; readonly files: readonly string[] };
type Inspection = {
  readonly files: readonly string[];
  readonly undeclared?: readonly unknown[];
  readonly plan?: MonorepoPlan;
};
type Entry = { readonly cli: MonorepoCli; readonly currentProjectRoot: string };
type MonorepoResult = { readonly exitCode?: ExitCode; readonly extraCli?: object };

const inspect: (query: {
  readonly root: string;
  readonly repositoryRoot: string | undefined;
}) => Inspection = inspectRepository;
const memberOf: (plan: MonorepoPlan, directory: string | undefined) => PlanProject | undefined =
  memberProjectOf;

function clearReports(reportRoot: string): void {
  clearDiffReports(reportRoot);
  clearSnapshotReports(reportRoot);
}

function runSelected(
  project: PlanProject,
  { cli, runProject }: RunContext,
  { reportRoot, extras }: { readonly reportRoot: string; readonly extras: Extras },
): ProjectOutcome {
  cli.stdout.write(projectHeading(project));
  clearReports(reportRoot);
  try {
    const options = { ...cli.options, ...extras.options, outputRoot: reportRoot };
    const exitCode = runProject(options, extras.cli);
    return outcomeOf({ exitCode, reportRoot, error: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cli.stderr.write(`nitpicker failed in ${project.path}: ${message}\n`);
    writeFailureReport(reportRoot, project.path, message);
    return outcomeOf({ exitCode: 2, reportRoot, error: message });
  }
}

function extrasOf(
  project: PlanProject,
  { comparison, analyzers }: Pick<RunContext, 'comparison' | 'analyzers'>,
): Extras {
  const baseProject = comparison.basePlan?.projects.find(
    ({ path: folder }) => folder === project.path,
  );
  const names = analyzers.get(project.path);
  return {
    options: names === undefined ? {} : { analyzerNames: names },
    cli: {
      currentProjectRoot: project.absolute,
      configOverlay: project.overlay,
      singleProject: true,
      sharedBase: comparison.base,
      baseConfigOverlay: baseProject?.overlay,
    },
  };
}

function runRow(row: ProjectRow, context: RunContext): ProjectRow {
  const reportRoot = path.join(context.outputRoot, reportFolder(row.project.path));
  if (!row.selection.selected) {
    clearReports(reportRoot);
    return row;
  }
  const own = extrasOf(row.project, context);
  const extras = { ...own, cli: { ...own.cli, currentFolder: undefined } };
  return { ...row, outcome: runSelected(row.project, context, { reportRoot, extras }) };
}

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

function headProjectSet({ plan, files }: Planned, comparison: Comparison): Loosening[] {
  return projectSetLoosenings({
    basePlan: comparison.basePlan,
    headPlan: plan,
    root: plan.root,
    headFiles: files,
    reappeared: reappearedProjects({ plan, basePlan: comparison.basePlan, comparison }),
  });
}

function repositoryOf(
  planned: Planned,
  comparison: Comparison,
  cli: MonorepoCli,
): RepositoryPolicy | undefined {
  const loosenings = headProjectSet(planned, comparison);
  const { acceptPolicyChange } = policyAcceptance(cli.options, cli.environment, cli.interactive);
  return repositoryPolicy({
    loosenings,
    root: planned.plan.root,
    acceptedDigest: acceptPolicyChange,
    toolErrors: comparison.toolErrors ?? [],
  });
}

type Prepared = Omit<RunContext, 'cli' | 'runProject'> & {
  readonly rows: readonly ProjectRow[];
  readonly outside: unknown;
};

function prepare(plan: MonorepoPlan, cli: MonorepoCli): Prepared {
  const { all, outputRoot: given } = cli.options;
  const outputRoot = outputRootFor(plan.root, given, all ? 'snapshot' : 'diff');
  const analyzers = analyzersByProject(plan, cli);
  clearStaleProjectReports({ outputRoot, plan, clearReports });
  clearReports(outputRoot);
  return { outputRoot, analyzers, ...selectionOf(plan, cli, analyzers) };
}

function execute(planned: Planned, cli: MonorepoCli, runProject: RunProject): ExitCode {
  const { plan } = planned;
  const startedAt = Date.now();
  const { outputRoot, analyzers, comparison, outside, rows } = prepare(plan, cli);
  const notices = noticesOf(plan, comparison.changed, cli);
  cli.stdout.write(renderPlan({ plan, rows, outside, details: cli.options.details }));
  const repository = repositoryOf(planned, comparison, cli);
  const context = { cli, runProject, outputRoot, comparison, analyzers };
  const results = rows.map((row) => runRow(row, context));
  const elapsedMs = Date.now() - startedAt;
  const summary = combinedSummary({ plan, results, outside, notices, repository, elapsedMs });
  const text: string = renderSummary({
    summary,
    summaryPath: path.join(outputRoot, 'summary.json'),
    details: cli.options.details,
  });
  writeCombinedReports(outputRoot, summary, text);
  writeCombinedMachineReports({ outputRoot, plan, repository });
  cli.stdout.write(text);
  return exitCodeOf(summary, cli.options);
}

function runMember(
  planned: Planned & { readonly member: PlanProject },
  cli: MonorepoCli,
  runProject: RunProject,
): ExitCode {
  const { member } = planned;
  const comparison = comparisonOf(planned.plan, cli);
  const extras = extrasOf(member, { comparison, analyzers: new Map() });
  const loosenings = headProjectSet(planned, comparison);
  return runProject(cli.options, {
    ...extras.cli,
    repositoryLoosenings: asProjectLoosenings(loosenings, planned.plan.root),
    repositoryToolErrors: comparison.toolErrors ?? [],
  });
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
    return singleMode(inspection, cli, currentProjectRoot);
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
  if (cli.singleProject === true || isGitWorkTree(currentProjectRoot) !== true) {
    return {};
  }
  const inspection = inspect({ root: currentProjectRoot, repositoryRoot: undefined });
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
