import { isInside } from '../discovery/repository-files.mjs';
import { dependentsOf, deepestProject } from './dependencies/graph.mts';
import { isToolchainFileFor } from './toolchain-files.mjs';
import type { DependencyGraph } from './dependencies/graph.mts';
import type { PlanProject, ProjectSelection } from '../project-types.mts';

type Projects = readonly PlanProject[];
type Claim = { readonly project: string; readonly own?: true; readonly reason?: string };
type Touch = { readonly owned: number; readonly reasons: readonly string[] };
type ClaimContext = {
  readonly projects: Projects;
  readonly prefix: string;
  readonly rootConfigFiles: readonly string[];
};
export type SelectionQuery = {
  readonly projects: Projects;
  readonly changed: readonly string[];
  readonly graph: DependencyGraph;
  readonly prefix?: string;
  readonly requested?: readonly string[];
  readonly all?: boolean;
  readonly rootConfigFiles?: readonly string[];
};
export type Selected = {
  readonly selection: readonly ProjectSelection[];
  readonly outside: readonly string[];
};

function ownerOf(projects: Projects, file: string): PlanProject | undefined {
  const owner = deepestProject(
    projects.map(({ repoPath }) => repoPath).filter((repoPath) => isInside(file, repoPath)),
    file,
  );
  return projects.find(({ repoPath }) => repoPath === owner);
}

function rootClaims(projects: Projects, file: string, rootConfigFiles: readonly string[]): Claim[] {
  return rootConfigFiles.includes(file)
    ? projects.map(({ path: project }) => ({ project, reason: `root config ${file} changed` }))
    : [];
}

function claimsOn({ projects, prefix, rootConfigFiles }: ClaimContext, file: string): Claim[] {
  const owner = ownerOf(projects, file);
  const shared = projects
    .filter(({ sharedFiles }) => sharedFiles.includes(file))
    .map(({ path: project }) => ({ project, reason: `shared config ${file} changed` }));
  const toolchain =
    owner === undefined
      ? projects
          .filter(({ preset }) => isToolchainFileFor(preset, file, prefix))
          .map(({ path: project }) => ({ project, reason: `${file} changed` }))
      : [];
  const own: Claim[] = owner === undefined ? [] : [{ project: owner.path, own: true }];
  return [...own, ...rootClaims(projects, file, rootConfigFiles), ...shared, ...toolchain];
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function touchedBy({
  projects,
  changed,
  prefix,
  rootConfigFiles,
}: ClaimContext & { readonly changed: readonly string[] }): {
  readonly touched: Map<string, Touch>;
  readonly outside: string[];
} {
  const touched = new Map<string, Touch>();
  const outside: string[] = [];
  for (const file of changed) {
    const claims = claimsOn({ projects, prefix, rootConfigFiles }, file);
    if (claims.length === 0 && isInside(file, prefix)) {
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
  all = false,
  rootConfigFiles = [],
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
  const { touched, outside } = touchedBy({ projects, changed, prefix, rootConfigFiles });
  const dependents = dependentsOf(graph, new Set(touched.keys()));
  return { selection: changedSelection(projects, { touched, dependents }), outside };
}
