import { isInside } from '../discovery/repository-files.mjs';
import { dependentsOf, deepestProject, edgeLabel } from './dependencies/graph.mts';
import { isToolchainFileFor } from './toolchain-files.mjs';
import { presetChecksFile } from '../plan/preset-languages.mts';
import type { DependencyGraph } from './dependencies/graph.mts';
import type { PlanProject, ProjectSelection } from '../project-types.mts';

type Projects = readonly PlanProject[];
type Claim = { readonly project: string; readonly own?: true; readonly reason?: string };
type ToolchainContext = { readonly owner: PlanProject | undefined; readonly prefix: string };
type Touch = { readonly owned: number; readonly reasons: readonly string[] };
export type ToolchainImpact = (file: string) => ReadonlyMap<string, string> | undefined;
type ClaimContext = {
  readonly projects: Projects;
  readonly prefix: string;
  readonly rootConfigFiles: readonly string[];
  readonly impactOf?: ToolchainImpact | undefined;
};
export type SelectionQuery = {
  readonly projects: Projects;
  readonly changed: readonly string[];
  readonly graph: DependencyGraph;
  readonly prefix?: string;
  readonly requested?: readonly string[];
  readonly all: boolean;
  readonly rootConfigFiles?: readonly string[];
  readonly impactOf?: ToolchainImpact | undefined;
};
export type Selected = {
  readonly selection: readonly ProjectSelection[];
  readonly outside: readonly string[];
};

function sharingOwner(sharing: Projects, file: string): PlanProject | undefined {
  return (
    sharing.find(({ preset }) => presetChecksFile(preset, file)) ??
    sharing.find(({ preset, repoPath }) => isToolchainFileFor(preset, file, repoPath)) ??
    sharing[0]
  );
}

function ownerOf(projects: Projects, file: string): PlanProject | undefined {
  const owner = deepestProject(
    projects.map(({ repoPath }) => repoPath).filter((repoPath) => isInside(file, repoPath)),
    file,
  );
  return sharingOwner(
    projects.filter(({ repoPath }) => repoPath === owner),
    file,
  );
}

function rootClaims(projects: Projects, file: string, rootConfigFiles: readonly string[]): Claim[] {
  return rootConfigFiles.includes(file)
    ? projects.map(({ path: project }) => ({ project, reason: `root config ${file} changed` }))
    : [];
}

function usesToolchainFile(project: PlanProject, file: string, context: ToolchainContext): boolean {
  const { owner, prefix } = context;
  if (project.toolchainRoot === undefined) {
    return owner === undefined && isToolchainFileFor(project.preset, file, prefix);
  }
  return (
    project.path !== owner?.path &&
    (owner === undefined || owner.repoPath === project.toolchainRoot) &&
    isToolchainFileFor(project.preset, file, project.toolchainRoot)
  );
}

function toolchainClaims(
  context: ClaimContext,
  file: string,
  owner: PlanProject | undefined,
): Claim[] {
  const users = context.projects.filter((project) =>
    usesToolchainFile(project, file, { owner, prefix: context.prefix }),
  );
  const impact = users.length === 0 ? undefined : context.impactOf?.(file);
  return users
    .filter(({ path: project }) => impact === undefined || impact.has(project))
    .map(({ path: project }) => ({ project, reason: impact?.get(project) ?? `${file} changed` }));
}

function claimsOn(context: ClaimContext, file: string): Claim[] {
  const { projects, rootConfigFiles } = context;
  const owner = ownerOf(projects, file);
  const shared = projects
    .filter(({ sharedFiles }) => sharedFiles.includes(file))
    .map(({ path: project }) => ({ project, reason: `shared config ${file} changed` }));
  const toolchain = toolchainClaims(context, file, owner);
  const own: Claim[] = owner === undefined ? [] : [{ project: owner.path, own: true }];
  return [...own, ...rootClaims(projects, file, rootConfigFiles), ...shared, ...toolchain];
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function touchedBy(context: ClaimContext & { readonly changed: readonly string[] }): {
  readonly touched: Map<string, Touch>;
  readonly outside: string[];
} {
  const touched = new Map<string, Touch>();
  const outside: string[] = [];
  for (const file of context.changed) {
    const claims = claimsOn(context, file);
    const weighed = context.impactOf?.(file) !== undefined;
    if (claims.length === 0 && !weighed && isInside(file, context.prefix)) {
      outside.push(file);
    }
    for (const { project, own, reason } of claims) {
      const entry = touched.get(project) ?? { owned: 0, reasons: [] };
      touched.set(project, {
        owned: entry.owned + (own === true ? 1 : 0),
        reasons: own === true || reason === undefined ? entry.reasons : [...entry.reasons, reason],
      });
    }
  }
  return { touched, outside };
}

function reasonOf({ owned, reasons }: Touch): string | undefined {
  return owned > 0 ? plural(owned, 'changed file') : reasons[0];
}

function unknownRequests(projects: Projects, requested: readonly string[]): void {
  const known = projects.map(({ path: project }) => project);
  const unknown = requested.filter((project) => !known.includes(project));
  if (unknown.length > 0) {
    throw new Error(
      `--project names ${unknown.join(', ')}, which is not a project of this repository. Projects: ${known.join(', ')}`,
    );
  }
}

function changedSelection(
  projects: Projects,
  {
    touched,
    dependents,
  }: { readonly touched: Map<string, Touch>; readonly dependents: Map<string, string> },
): ProjectSelection[] {
  return projects.map(({ path: project, configError }) => {
    const touch = touched.get(project);
    if (touch !== undefined) {
      return withReason({ path: project, selected: true }, reasonOf(touch));
    }
    if (configError !== undefined) {
      return { path: project, selected: true, reason: 'its config has an error' };
    }
    const dependency = dependents.get(project);
    return dependency === undefined
      ? { path: project, selected: false, reason: 'no changed files' }
      : { path: project, selected: true, reason: `depends on ${dependency}` };
  });
}

function withReason(entry: ProjectSelection, reason: string | undefined): ProjectSelection {
  return reason === undefined ? entry : { ...entry, reason };
}

export function selectProjects({
  projects,
  changed,
  graph,
  prefix = '.',
  requested = [],
  all,
  rootConfigFiles = [],
  impactOf,
}: SelectionQuery): Selected {
  if (requested.length > 0) {
    unknownRequests(projects, requested);
    return {
      selection: projects.map(({ path: project }) => ({
        path: project,
        selected: requested.includes(project),
        reason: requested.includes(project) ? 'requested with --project' : 'not requested',
      })),
      outside: [],
    };
  }
  if (all) {
    return {
      selection: projects.map(({ path: project }) => ({
        path: project,
        selected: true,
        reason: '--all',
      })),
      outside: [],
    };
  }
  const { touched, outside } = touchedBy({ projects, changed, prefix, rootConfigFiles, impactOf });
  const dependents = new Map(
    [...dependentsOf(graph, new Set(touched.keys()))].map(([project, dependency]) => {
      const via = edgeLabel(graph, project, dependency);
      return [project, via === undefined ? dependency : `${dependency} (${via})`];
    }),
  );
  return { selection: changedSelection(projects, { touched, dependents }), outside };
}
