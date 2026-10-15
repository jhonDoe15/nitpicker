import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { describeConventions } from '../../shared/conventions/settings.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
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
    exclude: headPolicy.exclude,
    projectRoot,
    commit,
  });
  const conventions = conventionChoices(detected, definitions);
  const followed = definitions.filter(({ id }) => conventions[id] !== undefined);
  if (stdout !== undefined && followed.length > 0) {
    const lines = describeConventions(detected, followed).map((line) => `  ${line}\n`);
    stdout.write(`Following this project's conventions:\n${lines.join('')}`);
  }
  return Object.keys(conventions).length === 0 ? headPolicy : { ...headPolicy, conventions };
}

function detect({ definitions, pinned, exclude, projectRoot, commit }) {
  if (definitions.every(({ id }) => pinned[id] !== undefined)) {
    return detectConventions({ definitions, pinned, exclude, source: undefined });
  }
  const settings = { pinned, exclude };
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

function isUnmeasured({ source, counts }) {
  return source === 'default' && Object.values(counts).every((count) => count === 0);
}
