import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { configError } from '../../shared/config.mjs';
import { describeConventions } from '../../shared/conventions/settings.mjs';
import { isJavascriptPolicy } from '../../languages/javascript/preset/javascript-preset.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import {
  builtInExcludedGlobs,
  globMatcher,
  prettierPatterns,
  resolveLayout,
} from '../../languages/typescript/preset/layout.mjs';
import { conventionDefinitions, conventionStyle } from './definitions.mjs';
import { commitSource, headCommit, workingTreeSource } from './sources.mjs';

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
            source: 'project',
            from: project[id].from,
            overrides: pinned[id] !== project[id].choice ? pinned[id] : undefined,
          },
    ]),
  );
}

function isApplicable(definition, choice) {
  return definition.kind === 'names' || definition.options.includes(choice);
}

function appliedChoices(detected, definitions) {
  return Object.fromEntries(
    Object.entries(conventionChoices(detected, definitions)).filter(([id, choice]) =>
      isApplicable(
        definitions.find((definition) => definition.id === id),
        choice,
      ),
    ),
  );
}

function followConventions({ config, projectRoot, headPolicy, commit, stdout }) {
  const style = conventionStyle(config.preset, { config, projectRoot });
  rejectUnusedPins(config.conventions ?? {}, style.unused);
  const definitions = conventionDefinitions(config.preset).filter(
    ({ id }) => style.unused[id] === undefined,
  );
  if (definitions.length === 0) {
    return headPolicy;
  }
  const projectChoices = Object.fromEntries(
    Object.entries(style.project).map(([id, { choice }]) => [id, choice]),
  );
  const detected = fromProject(
    detect({
      definitions,
      pinned: { ...config.conventions, ...projectChoices },
      exclude: [
        ...(headPolicy.layout?.excludedGlobs ?? builtInExcludedGlobs),
        ...headPolicy.exclude,
      ],
      accepts: definitions.some(({ scope }) => scope !== undefined)
        ? layoutFilter(config, headPolicy)
        : undefined,
      projectRoot,
      commit,
    }),
    style.project,
    config.conventions,
  );
  const conventions = appliedChoices(detected, definitions);
  const followed = definitions.filter(
    ({ id }) => conventions[id] !== undefined || style.project[id] !== undefined,
  );
  const report = conventionsReport({ detected, followed, style, conventions });
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
}

function conventionsReport({ detected, followed, style, conventions }) {
  const lines = describeConventions(detected, followed, style.note).map((line) => `  ${line}\n`);
  const notes = (style.summary?.(conventions) ?? []).map((line) => `${line}\n`);
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

function detect({ definitions, pinned, exclude, accepts, projectRoot, commit }) {
  if (definitions.every(({ id }) => pinned[id] !== undefined)) {
    return detectConventions({ definitions, pinned, exclude, source: undefined });
  }
  const settings = { pinned, exclude, accepts };
  if (commit === undefined) {
    return detectConventions({ ...settings, definitions, source: workingTreeSource(projectRoot) });
  }
  const measured = detectConventions({
    ...settings,
    definitions,
    source: commitSource({ ...commit(), projectRoot }),
  });
  const unmeasured = definitions.filter(({ id }) => isUnmeasured(measured[id]));
  return unmeasured.length === 0
    ? measured
    : {
        ...measured,
        ...detectConventions({
          ...settings,
          definitions: unmeasured,
          source: workingTreeSource(projectRoot),
        }),
      };
}

function isUnmeasured({ files }) {
  return files === 0;
}
