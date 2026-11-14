import { basePlanOf, planInputsChanged } from '../policy/base-plan.mjs';
import { changedFiles } from '../selection/changed-files.mjs';
import { dependencyGraph } from '../selection/dependencies/graph.mts';
import { requestedProjects } from '../selection/requested-projects.mts';
import { selectProjects, type Selected } from '../selection/select-projects.mts';
import { comparisonBase, rootConfigFiles, toolErrorsOf } from './context.mts';
import type {
  Comparison,
  MonorepoPlan,
  ProjectRow,
  ProjectSelection,
  SelectionCli,
} from '../project-types.mts';

type Analyzers = ReadonlyMap<string, readonly string[]>;
export type PlannedSelection = {
  readonly comparison: Comparison;
  readonly rows: readonly ProjectRow[];
  readonly outside: readonly string[];
};

const basePlanAt: (query: {
  readonly repositoryRoot: string;
  readonly prefix: string;
  readonly mergeBaseSha: string;
}) => { readonly plan?: MonorepoPlan; readonly error?: unknown } = basePlanOf;

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
  const { plan: basePlan, error } =
    planInputsChanged({ repositoryRoot, mergeBaseSha, changed }) === true
      ? basePlanAt({ ...plan, mergeBaseSha })
      : { plan, error: undefined };
  return { base, mergeBaseSha, changed, basePlan, toolErrors: toolErrorsOf(error) };
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
    graph: byChanges ? dependencyGraph(plan.root, projectPaths) : new Map(),
    prefix: plan.prefix,
    requested,
    all: cli.options.all,
    rootConfigFiles: rootConfigFiles(plan),
  });
}

export function submodulePaths(plan: MonorepoPlan): readonly string[] {
  return (plan.submodules ?? []).map((submodule) =>
    plan.prefix === '.' ? submodule : `${plan.prefix}/${submodule}`,
  );
}

function withAnalyzers(
  selection: readonly ProjectSelection[],
  analyzers: Analyzers,
): readonly ProjectSelection[] {
  if (analyzers.size === 0) {
    return selection;
  }
  return selection.map((entry) =>
    entry.selected && analyzers.get(entry.path)?.length === 0
      ? { ...entry, selected: false, reason: 'has none of the requested analyzers' }
      : entry,
  );
}

export function selectionOf(
  plan: MonorepoPlan,
  cli: SelectionCli,
  analyzers: Analyzers = new Map(),
): PlannedSelection {
  const comparison = comparisonOf(plan, cli);
  const { selection, outside: unclaimed } = choose(plan, cli, comparison);
  const submodules = submodulePaths(plan);
  const outside = unclaimed.filter((file) => !submodules.includes(file));
  const chosen = withAnalyzers(selection, analyzers);
  const rows = plan.projects.flatMap((project, index) => {
    const entry = chosen[index];
    return entry === undefined ? [] : [{ project, selection: entry }];
  });
  return { comparison, rows, outside };
}
