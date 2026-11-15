import path from 'node:path';
import { clearDiffReports } from '../../../diff/reporting/reporters.mts';
import { clearSnapshotReports } from '../../../snapshot/reporters.mts';
import { reportFolder as untypedReportFolder } from '../../plan/project-entry.mts';
import { projectHeading } from '../../report/console.mjs';
import { outcomeOf, writeFailureReport } from '../../report/outcome.mjs';
import type { SharedWorktree } from '../../../diff/comparison/quick/head-run.mts';
import type {
  Comparison,
  MonorepoCli,
  PlanProject,
  ProjectCli,
  ProjectOutcome,
  ProjectRow,
  RunProject,
} from '../../project-types.mts';

const reportFolder: (projectPath: string) => string = untypedReportFolder;

export type SharedBase = {
  readonly worktree: SharedWorktree;
  readonly sharers: ReadonlySet<string>;
};
export type RunContext = {
  readonly cli: MonorepoCli;
  readonly runProject: RunProject;
  readonly outputRoot: string;
  readonly comparison: Comparison;
  readonly analyzers: ReadonlyMap<string, readonly string[]>;
  readonly sharedBase?: SharedBase | undefined;
};
export type Extras = { readonly options: object; readonly cli: ProjectCli };
export type SelectedRun = { readonly reportRoot: string; readonly extras: Extras };

export function clearReports(reportRoot: string): void {
  clearDiffReports(reportRoot);
  clearSnapshotReports(reportRoot);
}

export function failedOutcome(
  project: PlanProject,
  reportRoot: string,
  message: string,
): ProjectOutcome {
  writeFailureReport(reportRoot, project.path, message);
  return outcomeOf({ exitCode: 2, reportRoot, error: message });
}

function runSelected(
  project: PlanProject,
  { cli, runProject }: RunContext,
  run: SelectedRun,
): ProjectOutcome {
  const { reportRoot, extras } = run;
  cli.stdout.write(projectHeading(project));
  clearReports(reportRoot);
  try {
    const options = { ...cli.options, ...extras.options, outputRoot: reportRoot };
    const exitCode = runProject(options, extras.cli);
    return outcomeOf({ exitCode, reportRoot, error: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cli.stderr.write(`nitpicker failed in ${project.path}: ${message}\n`);
    return failedOutcome(project, reportRoot, message);
  }
}

export function extrasOf(
  project: PlanProject,
  {
    comparison,
    analyzers,
    sharedBase,
  }: Pick<RunContext, 'comparison' | 'analyzers' | 'sharedBase'>,
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
      projectKey: project.folder === project.path ? undefined : project.path,
      sharedBaseWorktree:
        sharedBase?.sharers.has(project.path) === true ? sharedBase.worktree : undefined,
    },
  };
}

export function selectedRunOf(row: ProjectRow, context: RunContext): SelectedRun {
  const reportRoot = path.join(context.outputRoot, reportFolder(row.project.path));
  const own = extrasOf(row.project, context);
  return { reportRoot, extras: { ...own, cli: { ...own.cli, currentFolder: undefined } } };
}

export function runRow(row: ProjectRow, context: RunContext): ProjectRow {
  const run = selectedRunOf(row, context);
  if (!row.selection.selected) {
    clearReports(run.reportRoot);
    return row;
  }
  return { ...row, outcome: runSelected(row.project, context, run) };
}
