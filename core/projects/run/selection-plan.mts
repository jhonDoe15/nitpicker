import { basePlanOf, planInputsChanged } from '../policy/base-plan.mts';
import { changedFiles } from '../selection/changed-files.mts';
import { dependencyGraph } from '../selection/dependencies/graph.mts';
import { requestedProjects } from '../selection/requested-projects.mts';
import {
  selectProjects,
  type Selected,
  type ToolchainImpact,
} from '../selection/select-projects.mts';
import { lockfileImpact } from '../selection/lockfile-impact.mts';
import { comparisonBase, rootConfigFiles, toolErrorsOf } from './context.mts';
import type {
  Comparison,
  MonorepoPlan,
  PlanProject,
  ProjectRow,
  SelectionCli,
} from '../project-types.mts';

type Analyzers = ReadonlyMap<string, readonly string[]>;
export type PlannedSelection = {
  readonly comparison: Comparison;
  readonly rows: readonly ProjectRow[];
  readonly outside: readonly string[];
};

export function comparisonOf(plan: MonorepoPlan, cli: SelectionCli): Comparison {
  if (cli.options.all) {
    return { changed: [] };
  }
  const { repositoryRoot } = plan;
  const { base, mergeBaseSha } = comparisonBase({
    repositoryRoot,
    configuredBase: plan.rootConfig.base,
    cli,
  });
  const changed: readonly string[] = changedFiles({ repositoryRoot, mergeBaseSha });
  const { plan: basePlan, error } = planInputsChanged({ repositoryRoot, mergeBaseSha, changed })
    ? basePlanOf({ ...plan, mergeBaseSha })
    : { plan, error: undefined };
  return { base, mergeBaseSha, changed, basePlan, toolErrors: toolErrorsOf(error) };
}

const impactOfLockfiles: (request: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly projects: readonly PlanProject[];
}) => ToolchainImpact = lockfileImpact;

function foldersOf(plan: MonorepoPlan): ReadonlyMap<string, string> {
  return new Map(plan.projects.map((project) => [project.path, project.folder ?? project.path]));
}

function choose(plan: MonorepoPlan, cli: SelectionCli, comparison: Comparison): Selected {
  const requested = requestedProjects({
    projects: plan.projects,
    requested: cli.options.projectPaths ?? [],
    root: plan.root,
    workingDirectory: cli.workingDirectory,
  });
  const byChanges = !cli.options.all && requested.length === 0;
  const projectPaths = plan.projects.map(({ path: folder }) => folder);
  return selectProjects({
    projects: plan.projects,
    changed: byChanges ? comparison.changed : [],
    graph: byChanges ? dependencyGraph(plan.root, projectPaths, foldersOf(plan)) : new Map(),
    prefix: plan.prefix,
    requested,
    all: cli.options.all,
    rootConfigFiles: rootConfigFiles(plan),
    impactOf:
      byChanges && comparison.mergeBaseSha !== undefined
        ? impactOfLockfiles({
            repositoryRoot: plan.repositoryRoot,
            mergeBaseSha: comparison.mergeBaseSha,
            projects: plan.projects,
          })
        : undefined,
  });
}

export function submodulePaths(plan: MonorepoPlan): readonly string[] {
  return (plan.submodules ?? []).map((submodule) =>
    plan.prefix === '.' ? submodule : `${plan.prefix}/${submodule}`,
  );
}

export function withRequestedAnalyzers(
  rows: readonly ProjectRow[],
  analyzers: Analyzers,
): readonly ProjectRow[] {
  if (analyzers.size === 0) {
    return rows;
  }
  return rows.map((row) =>
    row.selection.selected && analyzers.get(row.selection.path)?.length === 0
      ? {
          ...row,
          selection: {
            ...row.selection,
            selected: false,
            reason: 'has none of the requested analyzers',
          },
        }
      : row,
  );
}

export function selectedPaths(rows: readonly ProjectRow[]): ReadonlySet<string> {
  return new Set(
    rows.filter(({ selection }) => selection.selected).map(({ selection }) => selection.path),
  );
}

export function selectionOf(plan: MonorepoPlan, cli: SelectionCli): PlannedSelection {
  const comparison = comparisonOf(plan, cli);
  const { selection, outside: unclaimed } = choose(plan, cli, comparison);
  const submodules = submodulePaths(plan);
  const outside = unclaimed.filter((file) => !submodules.includes(file));
  const rows = plan.projects.flatMap((project, index) => {
    const entry = selection[index];
    return entry === undefined ? [] : [{ project, selection: entry }];
  });
  return { comparison, rows, outside };
}
