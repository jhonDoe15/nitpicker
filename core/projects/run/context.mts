import path from 'node:path';
import { applyDisable } from '../../configuration/config.mjs';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mjs';
import { sharedConfigFiles } from '../../configuration/layers/shared-files.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { resolveBase } from '../../diff/git/repository/base-ref.mts';
import { resolveComparison } from '../../diff/git/repository/git.mjs';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { PROJECT_FILES } from '../discovery/declared-projects.mjs';
import { isInside, isSkippedLocation } from '../discovery/repository-files.mjs';
import { projectsToolError } from '../policy/project-set.mts';
import { byText } from '../../../shared/text-order/by-text.mjs';
import type { NitpickerConfig } from '../../configuration/config-types.mts';
import type { ReportEntry } from '../../../shared/values/findings.mts';
import type { Analyzer } from '../../../shared/values/analyzers.mts';
import type { MonorepoCli, MonorepoPlan, PlanProject, SelectionCli } from '../project-types.mts';

const enabled: (analyzers: readonly Analyzer[], config: NitpickerConfig) => readonly Analyzer[] =
  applyDisable;

type BaseQuery = {
  readonly repositoryRoot: string;
  readonly configuredBase: string | undefined;
  readonly cli: SelectionCli;
};

export function comparisonBase({ repositoryRoot, configuredBase, cli }: BaseQuery): {
  readonly base: ReturnType<typeof resolveBase>;
  readonly mergeBaseSha: string;
} {
  const base = resolveBase({
    repositoryRoot,
    explicitBase: cli.options.baseRef,
    configuredBase,
    environment: cli.environment,
    staged: cli.options.staged,
  });
  return { base, mergeBaseSha: resolveComparison(repositoryRoot, base.baseRef).mergeBaseSha };
}

function analyzerNamesOf(
  project: PlanProject,
  injected: readonly Analyzer[] | undefined,
): string[] {
  const config: NitpickerConfig = readLayeredConfig(project.absolute, {
    overlay: project.overlay,
  });
  return [
    ...enabled(presetAnalyzers(config, injected), config).map(({ name }) => name),
    ...(config.analyzers ?? []).map(({ name }) => name),
  ];
}

export function analyzersByProject(
  plan: MonorepoPlan,
  cli: MonorepoCli,
): Map<string, readonly string[]> {
  const requested = cli.options.analyzerNames;
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
        [...known].toSorted(byText).join(', '),
    );
  }
  return new Map(
    [...byProject].map(([folder, names]) => [
      folder,
      requested.filter((name) => names.includes(name)),
    ]),
  );
}

export function rootConfigFiles(plan: MonorepoPlan): string[] {
  const own = path.posix.join(plan.prefix, CONFIG_FILE_NAME);
  const shared = sharedConfigFiles(plan.root, { repositoryRoot: plan.repositoryRoot }).map(
    ({ file }) => path.relative(plan.repositoryRoot, file).split(path.sep).join('/'),
  );
  return [own, ...shared];
}

export function unlistedFolders(plan: MonorepoPlan, changed: readonly string[]): string[] {
  if (plan.source !== 'declared') {
    return [];
  }
  const folders = changed
    .filter((file) => PROJECT_FILES.includes(path.posix.basename(file)))
    .map((file) => path.posix.dirname(file))
    .filter((folder) => folder !== plan.prefix && isInside(folder, plan.prefix))
    .filter((folder) => !isSkippedLocation(folder))
    .filter((folder) => !plan.projects.some(({ repoPath }) => isInside(folder, repoPath)));
  return [...new Set(folders)].toSorted(byText);
}

export function toolErrorsOf(error: unknown): readonly ReportEntry[] {
  return error === undefined ? [] : [projectsToolError(error)];
}
