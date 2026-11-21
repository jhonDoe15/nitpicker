import path from 'node:path';
import { applyDisable } from '../../configuration/config.mts';
import { readLayeredConfig } from '../../configuration/layers/read-layered.mts';
import { sharedConfigFiles } from '../../configuration/layers/shared-files.mts';
import { presetAnalyzers, withRepositoryChecks } from '../../configuration/preset-analyzers.mts';
import { resolveBase } from '../../diff/git/repository/base-ref.mts';
import { resolveComparison } from '../../diff/git/repository/git.mts';
import { CONFIG_FILE_NAME } from '../../../shared/config.mts';
import { PROJECT_FILES } from '../discovery/declared-projects.mts';
import { isInside, isSkippedLocation } from '../discovery/repository-files.mts';
import { byText } from '../../../shared/text-order/by-text.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
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
    ...withRepositoryChecks(
      enabled(presetAnalyzers(config, injected), config),
      project.overlay,
    ).map(({ name }) => name),
    ...(config.analyzers ?? []).map(({ name }) => name),
  ];
}

type AnalyzerRequest = Pick<MonorepoCli, 'analyzers'> & {
  readonly options: Pick<MonorepoCli['options'], 'analyzerNames'>;
};

export function analyzersByProject(
  plan: MonorepoPlan,
  cli: AnalyzerRequest,
  selected?: ReadonlySet<string>,
): Map<string, readonly string[]> {
  const requested = cli.options.analyzerNames;
  if (requested.length === 0) {
    return new Map();
  }
  const readable = plan.projects.filter(({ configError }) => configError === undefined);
  const running = readable.filter((project) => selected?.has(project.path) === true);
  const byProject = new Map(
    (running.length === 0 ? readable : running).map((project) => [
      project.path,
      analyzerNamesOf(project, cli.analyzers),
    ]),
  );
  const missing = requested.filter((name) => ![...byProject.values()].flat().includes(name));
  if (missing.length > 0) {
    const known = new Set(readable.flatMap((project) => analyzerNamesOf(project, cli.analyzers)));
    const unknown = missing.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown --analyzer: ${unknown.join(', ')}. Known analyzers of the projects in this ` +
          `monorepo: ${[...known].toSorted(byText).join(', ')}`,
      );
    }
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
    ({ file }: { readonly file: string }) =>
      path.relative(plan.repositoryRoot, file).split(path.sep).join('/'),
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
