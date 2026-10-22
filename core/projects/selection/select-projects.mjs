import { isInside } from '../discovery/repository-files.mjs';
import { dependentsOf, deepestProject } from './dependencies/graph.mjs';
import { isToolchainFileFor } from './toolchain-files.mjs';

function ownerOf(projects, file) {
  const owner = deepestProject(
    projects.map(({ repoPath }) => repoPath).filter((repoPath) => isInside(file, repoPath)),
    file,
  );
  return projects.find(({ repoPath }) => repoPath === owner);
}

function claimsOn(projects, file) {
  const owner = ownerOf(projects, file);
  const shared = projects
    .filter(({ sharedFiles }) => sharedFiles.includes(file))
    .map(({ path: project }) => ({ project, reason: `shared config ${file} changed` }));
  const toolchain =
    owner === undefined
      ? projects
          .filter(({ preset }) => isToolchainFileFor(preset, file))
          .map(({ path: project }) => ({ project, reason: `${file} changed` }))
      : [];
  const own = owner === undefined ? [] : [{ project: owner.path, own: true }];
  return [...own, ...shared, ...toolchain];
}

function plural(count, word) {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function touchedBy(projects, changed, prefix) {
  const touched = new Map();
  const outside = [];
  for (const file of changed) {
    const claims = claimsOn(projects, file);
    if (claims.length === 0 && isInside(file, prefix)) {
      outside.push(file);
    }
    for (const { project, own, reason } of claims) {
      const entry = touched.get(project) ?? { owned: 0, reasons: [] };
      touched.set(project, {
        owned: entry.owned + (own === true ? 1 : 0),
        reasons: own === true ? entry.reasons : [...entry.reasons, reason],
      });
    }
  }
  return { touched, outside };
}

function reasonOf({ owned, reasons }) {
  return owned > 0 ? plural(owned, 'changed file') : reasons[0];
}

function unknownRequests(projects, requested) {
  const known = projects.map(({ path: project }) => project);
  const unknown = requested.filter((project) => !known.includes(project));
  if (unknown.length > 0) {
    throw new Error(
      `--project names ${unknown.join(', ')}, which is not a project of this repository. Projects: ${known.join(', ')}`,
    );
  }
}

export function selectProjects({ projects, changed, graph, prefix = '.', requested = [], all }) {
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
  if (all === true) {
    return {
      selection: projects.map(({ path: project }) => ({
        path: project,
        selected: true,
        reason: '--all',
      })),
      outside: [],
    };
  }
  const { touched, outside } = touchedBy(projects, changed, prefix);
  const dependents = dependentsOf(graph, new Set(touched.keys()));
  const selection = projects.map(({ path: project }) => {
    if (touched.has(project)) {
      return { path: project, selected: true, reason: reasonOf(touched.get(project)) };
    }
    return dependents.has(project)
      ? { path: project, selected: true, reason: `depends on ${dependents.get(project)}` }
      : { path: project, selected: false, reason: 'no changed files' };
  });
  return { selection, outside };
}
