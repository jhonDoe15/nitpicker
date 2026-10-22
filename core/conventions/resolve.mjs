import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { configError } from '../../shared/config.mjs';
import {
  describeConventions,
  ignoredChoiceNote,
  isValidChoice,
} from '../../shared/conventions/settings.mjs';
import { isJavascriptPolicy } from '../../languages/javascript/preset/javascript-preset.mjs';
import { resolveProjectHeadPolicy } from '../configuration/project-head-policy.mjs';
import {
  builtInExcludedGlobs,
  prettierPatterns,
  resolveLayout,
} from '../../languages/typescript/preset/layout.mjs';
import { conventionDefinitions, conventionStyle } from './definitions.mjs';
import { lazyConfigRoot } from './style-snapshot.mjs';
import { globMatcher } from '../../shared/paths/glob.mjs';
import {
  commitSource,
  filteredSource,
  headCommit,
  lazySource,
  workingTreeSource,
} from './sources.mjs';

export function comparisonPolicy(run, resolveComparison) {
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

export function snapshotPolicy({ config, currentProjectRoot, headPolicy, stdout }) {
  return followConventions({ config, projectRoot: currentProjectRoot, headPolicy, stdout });
}

export function publishHeadPolicy(config, projectRoot) {
  return followConventions({
    config,
    projectRoot,
    headPolicy: resolveProjectHeadPolicy(config, projectRoot),
    commit: () => headCommit(projectRoot),
  });
}

function rejectUnusedPins(pinned, unused) {
  const [id] = Object.keys(pinned).filter((pin) => unused[pin] !== undefined);
  if (id !== undefined) {
    throw configError(`"conventions.${id}" has no effect: ${unused[id]}`);
  }
}

function fromProject(detected, project, { pinned = {}, followsConfig = false } = {}) {
  return Object.fromEntries(
    Object.entries(detected).map(([id, entry]) => [
      id,
      project[id] === undefined
        ? entry
        : {
            ...entry,
            choice: project[id].choice,
            source: 'project',
            from: project[id].from,
            followsConfig,
            overrides: pinned[id] !== project[id].choice ? pinned[id] : undefined,
          },
    ]),
  );
}

function appliedChoices(detected, definitions) {
  return Object.fromEntries(
    Object.entries(conventionChoices(detected, definitions)).filter(([id, choice]) =>
      isValidChoice(
        definitions.find((candidate) => candidate.id === id),
        choice,
      ),
    ),
  );
}

function splitProject(project, definitions) {
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

function conventionSources(projectRoot, commit) {
  return {
    head: lazySource(() => workingTreeSource(projectRoot)),
    base:
      commit === undefined
        ? undefined
        : lazySource(() => commitSource({ ...commit(), projectRoot })),
  };
}

function baseHoldsSources(base, definitions) {
  const sourceFiles = definitions.flatMap(({ files }) => files).map(globMatcher);
  return () =>
    base !== undefined && base.paths().some((file) => sourceFiles.some((glob) => glob.test(file)));
}

function projectStyleSource({ base, head }, { exclude, useBase }) {
  const excluded = exclude.map(globMatcher);
  function accepts(file) {
    return !excluded.some((glob) => glob.test(file));
  }
  return lazySource(() => filteredSource(useBase() ? base : head, accepts));
}

function conventionContext({ config, projectRoot, headPolicy, sources, configRoot }) {
  const exclude = [
    ...(headPolicy.layout?.excludedGlobs ?? builtInExcludedGlobs),
    ...headPolicy.exclude,
  ];
  const all = conventionDefinitions(config.preset);
  const style = conventionStyle(config.preset, {
    config,
    projectRoot,
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

function detectedConventions(config, { style, sources, exclude, accepts, definitions }) {
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
  return fromProject(measured, style.derive?.(measured) ?? {}, { pinned: config.conventions });
}

function followConventions({ config, projectRoot, headPolicy, commit, stdout }) {
  const sources = conventionSources(projectRoot, commit);
  const configRoot = lazyConfigRoot({
    projectRoot,
    commit,
    useBase: baseHoldsSources(sources.base, conventionDefinitions(config.preset)),
  });
  try {
    const context = conventionContext({ config, projectRoot, headPolicy, sources, configRoot });
    const { style, definitions } = context;
    if (definitions.length === 0) {
      return headPolicy;
    }
    const detected = detectedConventions(config, context);
    const conventions = appliedChoices(detected, definitions);
    const followed = definitions.filter(
      ({ id }) => conventions[id] !== undefined || style.project[id] !== undefined,
    );
    const report = conventionsReport({
      detected,
      followed,
      style,
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

function conventionsReport({ detected, followed, style, conventions, notes: collected }) {
  const lines = describeConventions(detected, followed, style.note).map((line) => `  ${line}\n`);
  const notes = [...collected, ...(style.summary?.(conventions) ?? [])].map((line) => `${line}\n`);
  const heading = followed.length === 0 ? '' : "Following this project's conventions:\n";
  return `${heading}${lines.join('')}${notes.join('')}`;
}

const TEST_SUPPORT_PATH = /(?:^|\/)(?:test-support|test-utils|testing|testkit)\//;

function layoutFilter(config, headPolicy) {
  const layout = resolveLayout(headPolicy.layout, headPolicy.exclude, {
    javascript: isJavascriptPolicy(config),
    generatedFiles: headPolicy.generatedFiles,
  });
  const formatted = prettierPatterns(layout).map(globMatcher);
  const scopes = {
    layout: (file) => layout.isSourceFile(file) || layout.isTestFile(file),
    'test-code': (file) => layout.isTestFile(file) || TEST_SUPPORT_PATH.test(file),
    'formatted-data': (file) =>
      formatted.some((pattern) => pattern.test(file)) &&
      !layout.isGeneratedPath(file) &&
      !layout.isFixturePath(file),
  };
  return function accepts({ scope }, file) {
    return scope === undefined || (scopes[scope](file) && !layout.isExcluded(file));
  };
}

function detect({ definitions, pinned, exclude, accepts, sources }) {
  if (definitions.every(({ id }) => pinned[id] !== undefined)) {
    return detectConventions({ definitions, pinned, exclude, source: undefined });
  }
  const settings = { pinned, exclude, accepts };
  if (sources.base === undefined) {
    return detectConventions({ ...settings, definitions, source: sources.head });
  }
  const measured = detectConventions({ ...settings, definitions, source: sources.base });
  const unmeasured = definitions.filter(({ id }) => isUnmeasured(measured[id]));
  return unmeasured.length === 0
    ? measured
    : {
        ...measured,
        ...detectConventions({
          ...settings,
          definitions: unmeasured,
          source: sources.head,
        }),
      };
}

function isUnmeasured({ files }) {
  return files === 0;
}
