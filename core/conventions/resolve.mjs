import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { describeConventions } from '../../shared/conventions/settings.mjs';
import { isJavascriptPolicy } from '../../languages/javascript/preset/javascript-preset.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import {
  builtInExcludedGlobs,
  globToRegExp,
  prettierPatterns,
  resolveLayout,
} from '../../languages/typescript/preset/layout.mjs';
import { conventionDefinitions } from './definitions.mjs';
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

function followConventions({ config, projectRoot, headPolicy, commit, stdout }) {
  const definitions = conventionDefinitions(config.preset);
  if (definitions.length === 0) {
    return headPolicy;
  }
  const detected = detect({
    definitions,
    pinned: config.conventions ?? {},
    exclude: [...(headPolicy.layout?.excludedGlobs ?? builtInExcludedGlobs), ...headPolicy.exclude],
    accepts: definitions.some(({ scope }) => scope !== undefined)
      ? layoutFilter(config, headPolicy)
      : undefined,
    projectRoot,
    commit,
  });
  const conventions = conventionChoices(detected, definitions);
  const followed = definitions.filter(({ id }) => conventions[id] !== undefined);
  if (stdout !== undefined && followed.length > 0) {
    const lines = describeConventions(detected, followed).map((line) => `  ${line}\n`);
    stdout.write(`Following this project's conventions:\n${lines.join('')}`);
  }
  return {
    ...headPolicy,
    ...(Object.keys(conventions).length === 0 ? {} : { conventions }),
    ...(Object.keys(config.conventions ?? {}).length === 0
      ? {}
      : { conventionPins: config.conventions }),
  };
}

const TEST_SUPPORT_PATH = /(?:^|\/)(?:test-support|test-utils|testing|testkit)\//;

function layoutFilter(config, headPolicy) {
  const layout = resolveLayout(headPolicy.layout, headPolicy.exclude, {
    javascript: isJavascriptPolicy(config),
    generatedFiles: headPolicy.generatedFiles,
  });
  const formatted = prettierPatterns(layout).map(globToRegExp);
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
