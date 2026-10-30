import path from 'node:path';
import { applyDisable } from '../../configuration/config.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { sharedConfigFiles } from '../../configuration/layers/shared-files.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { resolveBase } from '../../diff/git/repository/base-ref.mjs';
import { resolveComparison } from '../../diff/git/repository/git.mjs';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { PROJECT_FILES } from '../discovery/declared-projects.mjs';
import { isInside, isSkippedLocation } from '../discovery/repository-files.mjs';

export function comparisonBase({ repositoryRoot, configuredBase, cli }) {
  const base = resolveBase({
    repositoryRoot,
    explicitBase: cli.options.baseRef,
    configuredBase,
    environment: cli.environment,
  });
  return { base, mergeBaseSha: resolveComparison(repositoryRoot, base.baseRef).mergeBaseSha };
}

function analyzerNamesOf(project, injected) {
  const config = readLayeredConfig(project.absolute, { overlay: project.overlay });
  return [
    ...applyDisable(presetAnalyzers(config, injected), config).map(({ name }) => name),
    ...(config.analyzers ?? []).map(({ name }) => name),
  ];
}

export function analyzersByProject(plan, cli) {
  const requested = cli.options.analyzerNames ?? [];
  if (requested.length === 0) {
    return new Map();
  }
  const readable = plan.projects.filter(({ configError }) => configError === undefined);
  const byProject = new Map(
    readable.map((project) => [project.path, analyzerNamesOf(project, cli.analyzers)]),
  );
  const known = new Set([...byProject.values()].flat());
  const unknown = requested.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown --analyzer: ${unknown.join(', ')}. Known analyzers of the projects in this monorepo: ` +
        [...known].toSorted().join(', '),
    );
  }
  return new Map(
    [...byProject].map(([folder, names]) => [
      folder,
      requested.filter((name) => names.includes(name)),
    ]),
  );
}

export function rootConfigFiles(plan) {
  const own = path.posix.join(plan.prefix, CONFIG_FILE_NAME);
  const shared = sharedConfigFiles(plan.root, { repositoryRoot: plan.repositoryRoot }).map(
    ({ file }) => path.relative(plan.repositoryRoot, file).split(path.sep).join('/'),
  );
  return [own, ...shared];
}

export function unlistedFolders(plan, changed) {
  if (plan.source !== 'declared') {
    return [];
  }
  const folders = changed
    .filter((file) => PROJECT_FILES.includes(path.posix.basename(file)))
    .map((file) => path.posix.dirname(file))
    .filter((folder) => folder !== plan.prefix && isInside(folder, plan.prefix))
    .filter((folder) => !isSkippedLocation(folder))
    .filter((folder) => !plan.projects.some(({ repoPath }) => isInside(folder, repoPath)));
  return [...new Set(folders)].toSorted();
}
