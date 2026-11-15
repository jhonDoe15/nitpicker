import { configError } from '../../shared/config.mjs';
import { resolveProjectHeadPolicy } from './project-head-policy.mts';
import { conventionDefinitions, conventionStyle } from './definitions.mts';
import { lazyConfigRoot } from './style-snapshot.mts';
import {
  commitSource,
  filteredSource,
  headCommit,
  lazySource,
  workingTreeSource,
} from './sources.mts';
import {
  builtInExcludedGlobs,
  conventionChoices,
  globMatcher,
  ignoredChoiceNote,
  isValidChoice,
} from './typed/convention-views.mts';
import { conventionsReport } from './typed/conventions-report.mts';
import { detect, layoutFilter } from './typed/measured-conventions.mts';
import { fieldOf, isPlainObject, textsOf } from '../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../shared/values/config-types.mts';
import type {
  CommitRef,
  ComparisonRun,
  ContextRequest,
  ConventionContext,
  ConventionDefinition,
  ConventionSource,
  DetectedConventions,
  FollowRequest,
  HeadPolicy,
  Pins,
  ProjectChoices,
  Sources,
} from './typed/convention-types.mts';

export function comparisonPolicy(
  run: ComparisonRun,
  resolveComparison: (repositoryRoot: string, baseRef: string) => { readonly mergeBaseSha: string },
): HeadPolicy {
  const { config, currentProjectRoot, headPolicy, stdout, repositoryRoot, base } = run;
  return followConventions({
    config,
    projectRoot: currentProjectRoot,
    headPolicy,
    commit: () => ({
      repositoryRoot,
      commitSha: resolveComparison(repositoryRoot, base.baseRef).mergeBaseSha,
    }),
    stdout,
  });
}

export function snapshotPolicy({
  config,
  currentProjectRoot,
  headPolicy,
  stdout,
}: Omit<ComparisonRun, 'repositoryRoot' | 'base'>): HeadPolicy {
  return followConventions({ config, projectRoot: currentProjectRoot, headPolicy, stdout });
}

export function publishHeadPolicy(
  config: NitpickerConfig,
  projectRoot: string,
  host: object = {},
): HeadPolicy {
  return followConventions({
    config,
    projectRoot,
    headPolicy: resolveProjectHeadPolicy(config, projectRoot, host),
    commit: () => headCommit(projectRoot),
  });
}

function rejectUnusedPins(pinned: Pins, unused: Readonly<Record<string, string>>): void {
  const [id] = Object.keys(pinned).filter((pin) => unused[pin] !== undefined);
  if (id !== undefined) {
    throw configError(`"conventions.${id}" has no effect: ${String(unused[id])}`);
  }
}

function fromProject(
  detected: DetectedConventions,
  project: ProjectChoices,
  {
    pinned = {},
    followsConfig,
  }: { readonly pinned?: Pins | undefined; readonly followsConfig: boolean },
): DetectedConventions {
  return Object.fromEntries(
    Object.entries(detected).map(([id, entry]) => {
      const projected = project[id];
      return [
        id,
        projected === undefined
          ? entry
          : {
              ...entry,
              choice: projected.choice,
              source: 'project',
              from: projected.from,
              followsConfig,
              overrides: pinned[id] !== projected.choice ? pinned[id] : undefined,
            },
      ];
    }),
  );
}

function appliedChoices(
  detected: DetectedConventions,
  definitions: readonly ConventionDefinition[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(conventionChoices(detected, definitions)).filter(([id, choice]) =>
      isValidChoice(
        definitions.find((candidate) => candidate.id === id),
        choice,
      ),
    ),
  );
}

function splitProject(
  project: ProjectChoices,
  definitions: readonly ConventionDefinition[],
): { usable: ProjectChoices; ignored: string[] } {
  const entries = Object.entries(project).flatMap(([id, entry]) => {
    const definition = definitions.find((candidate) => candidate.id === id);
    return definition === undefined ? [] : [{ id, entry, definition }];
  });
  const valid = entries.filter(({ definition, entry }) => isValidChoice(definition, entry.choice));
  return {
    usable: Object.fromEntries(valid.map(({ id, entry }) => [id, entry])),
    ignored: entries
      .filter((item) => !valid.includes(item))
      .map(({ definition, entry }) => ignoredChoiceNote(definition, entry)),
  };
}

function conventionSources(projectRoot: string, commit: (() => CommitRef) | undefined): Sources {
  return {
    head: lazySource(() => workingTreeSource(projectRoot)),
    base:
      commit === undefined
        ? undefined
        : lazySource(() => commitSource({ ...commit(), projectRoot })),
  };
}

function baseHoldsSources(
  base: ConventionSource | undefined,
  definitions: readonly ConventionDefinition[],
): () => boolean {
  const sourceFiles = definitions.flatMap(({ files }) => files).map(globMatcher);
  return () =>
    base !== undefined && base.paths().some((file) => sourceFiles.some((glob) => glob.test(file)));
}

function projectStyleSource(
  { base, head }: Sources,
  { exclude, useBase }: { readonly exclude: readonly string[]; readonly useBase: () => boolean },
): ConventionSource {
  const excluded = exclude.map(globMatcher);
  function accepts(file: string): boolean {
    return !excluded.some((glob) => glob.test(file));
  }
  return lazySource(() => filteredSource((useBase() ? base : head) ?? head, accepts));
}

function conventionContext({
  config,
  projectRoot,
  headPolicy,
  sources,
  configRoot,
}: ContextRequest): ConventionContext {
  const excludedGlobs = fieldOf(headPolicy['layout'], 'excludedGlobs');
  const exclude = [
    ...(excludedGlobs === undefined ? builtInExcludedGlobs : textsOf(excludedGlobs)),
    ...textsOf(headPolicy['exclude']),
  ];
  const all = conventionDefinitions(config.preset);
  const style = conventionStyle(config.preset, {
    config,
    projectRoot,
    headPolicy,
    source: projectStyleSource(sources, { exclude, useBase: baseHoldsSources(sources.base, all) }),
    configRoot: configRoot.get,
  });
  rejectUnusedPins(config.conventions ?? {}, style.unused);
  const definitions = all.filter(({ id }) => style.unused[id] === undefined);
  const { usable, ignored } = splitProject(style.project, definitions);
  return {
    style: { ...style, project: usable },
    ignored,
    sources,
    exclude,
    accepts: definitions.some(({ scope }) => scope !== undefined)
      ? layoutFilter(config, headPolicy)
      : undefined,
    definitions,
  };
}

function detectedConventions(
  config: NitpickerConfig,
  { style, sources, exclude, accepts, definitions }: ConventionContext,
): DetectedConventions {
  const projectChoices = Object.fromEntries(
    Object.entries(style.project).map(([id, { choice }]) => [id, choice]),
  );
  const measured = fromProject(
    detect({
      definitions,
      pinned: { ...config.conventions, ...projectChoices },
      exclude,
      accepts,
      sources,
    }),
    style.project,
    { pinned: config.conventions, followsConfig: true },
  );
  return fromProject(measured, style.derive?.(measured) ?? {}, {
    pinned: config.conventions,
    followsConfig: false,
  });
}

function followConventions({
  config,
  projectRoot,
  headPolicy: untypedHeadPolicy,
  commit,
  stdout,
}: FollowRequest): HeadPolicy {
  const headPolicy: HeadPolicy = isPlainObject(untypedHeadPolicy) ? untypedHeadPolicy : {};
  const sources = conventionSources(projectRoot, commit);
  const configRoot = lazyConfigRoot({
    projectRoot,
    commit,
    useBase: baseHoldsSources(sources.base, conventionDefinitions(config.preset)),
  });
  try {
    const context = conventionContext({ config, projectRoot, headPolicy, sources, configRoot });
    if (context.definitions.length === 0) {
      return headPolicy;
    }
    const detected = detectedConventions(config, context);
    const conventions = appliedChoices(detected, context.definitions);
    const followed = context.definitions.filter(
      ({ id }) => conventions[id] !== undefined || context.style.project[id] !== undefined,
    );
    const report = conventionsReport({
      detected,
      followed,
      style: context.style,
      conventions,
      notes: [...context.ignored, ...configRoot.notes()],
    });
    if (stdout !== undefined && report !== '') {
      stdout.write(report);
    }
    return {
      ...headPolicy,
      ...(Object.keys(conventions).length === 0 ? {} : { conventions }),
      ...(Object.keys(config.conventions ?? {}).length === 0
        ? {}
        : { conventionPins: config.conventions }),
    };
  } finally {
    configRoot.dispose();
  }
}
