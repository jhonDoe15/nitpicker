import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { configError } from '../../shared/config.mjs';
import { describeConventions, isValidChoice } from '../../shared/conventions/settings.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { builtInExcludedGlobs } from '../../languages/typescript/preset/layout.mjs';
import { conventionDefinitions, conventionStyle } from './definitions.mjs';
import { globToRegExp } from '../../shared/glob.mjs';
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
    headPolicy: resolveHeadPolicy(config, projectRoot),
    commit: () => headCommit(projectRoot),
  });
}

function rejectUnusedPins(pinned, unused) {
  const [id] = Object.keys(pinned).filter((pin) => unused[pin] !== undefined);
  if (id !== undefined) {
    throw configError(`"conventions.${id}" has no effect: ${unused[id]}`);
  }
}

function fromProject(detected, project, pinned = {}) {
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

function conventionSources(projectRoot, commit) {
  return {
    head: lazySource(() => workingTreeSource(projectRoot)),
    base:
      commit === undefined
        ? undefined
        : lazySource(() => commitSource({ ...commit(), projectRoot })),
  };
}

function projectStyleSource({ base, head }, { exclude, definitions }) {
  const excluded = exclude.map(globToRegExp);
  const sourceFiles = definitions.flatMap(({ files }) => files).map(globToRegExp);
  function accepts(file) {
    return !excluded.some((glob) => glob.test(file));
  }
  function holdsSources(source) {
    return source.paths().some((file) => sourceFiles.some((glob) => glob.test(file)));
  }
  return lazySource(() =>
    filteredSource(base !== undefined && holdsSources(base) ? base : head, accepts),
  );
}

function conventionContext({ config, projectRoot, headPolicy, commit }) {
  const exclude = [
    ...(headPolicy.layout?.excludedGlobs ?? builtInExcludedGlobs),
    ...headPolicy.exclude,
  ];
  const sources = conventionSources(projectRoot, commit);
  const all = conventionDefinitions(config.preset);
  const style = conventionStyle(config.preset, {
    config,
    projectRoot,
    source: projectStyleSource(sources, { exclude, definitions: all }),
  });
  rejectUnusedPins(config.conventions ?? {}, style.unused);
  return {
    style,
    sources,
    exclude,
    definitions: all.filter(({ id }) => style.unused[id] === undefined),
  };
}

function detectedConventions(config, { style, sources, exclude, definitions }) {
  const projectChoices = Object.fromEntries(
    Object.entries(style.project).map(([id, { choice }]) => [id, choice]),
  );
  const measured = fromProject(
    detect({
      definitions,
      pinned: { ...config.conventions, ...projectChoices },
      exclude,
      sources,
    }),
    style.project,
    config.conventions,
  );
  return fromProject(measured, style.derive?.(measured) ?? {}, config.conventions);
}

function followConventions({ config, projectRoot, headPolicy, commit, stdout }) {
  const context = conventionContext({ config, projectRoot, headPolicy, commit });
  const { style, definitions } = context;
  if (definitions.length === 0) {
    return headPolicy;
  }
  const detected = detectedConventions(config, context);
  const conventions = appliedChoices(detected, definitions);
  const followed = definitions.filter(
    ({ id }) => conventions[id] !== undefined || style.project[id] !== undefined,
  );
  const report = conventionsReport({ detected, followed, style, conventions });
  if (stdout !== undefined && report !== '') {
    stdout.write(report);
  }
  return Object.keys(conventions).length === 0 ? headPolicy : { ...headPolicy, conventions };
}

function conventionsReport({ detected, followed, style, conventions }) {
  const lines = describeConventions(detected, followed, style.note).map((line) => `  ${line}\n`);
  const notes = (style.summary?.(conventions) ?? []).map((line) => `${line}\n`);
  const heading = followed.length === 0 ? '' : "Following this project's conventions:\n";
  return `${heading}${lines.join('')}${notes.join('')}`;
}

function detect({ definitions, pinned, exclude, sources }) {
  if (definitions.every(({ id }) => pinned[id] !== undefined)) {
    return detectConventions({ definitions, pinned, exclude, source: undefined });
  }
  const settings = { pinned, exclude };
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
