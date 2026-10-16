import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { configError } from '../../shared/config.mjs';
import { describeConventions } from '../../shared/conventions/settings.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { excludedGlobs as builtInExcludedGlobs } from '../../languages/typescript/preset/layout.mjs';
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

function fromProject(detected, project) {
  return Object.fromEntries(
    Object.entries(detected).map(([id, entry]) => [
      id,
      project[id] === undefined ? entry : { ...entry, source: 'project', from: project[id].from },
    ]),
  );
}

function appliedChoices(detected, definitions) {
  return Object.fromEntries(
    Object.entries(conventionChoices(detected, definitions)).filter(([id, choice]) =>
      definitions.find((definition) => definition.id === id).options.includes(choice),
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
      projectRoot,
      commit,
    }),
    style.project,
  );
  const conventions = appliedChoices(detected, definitions);
  const followed = definitions.filter(
    ({ id }) => conventions[id] !== undefined || style.project[id] !== undefined,
  );
  if (stdout !== undefined && followed.length > 0) {
    const lines = describeConventions(detected, followed, style.note).map((line) => `  ${line}\n`);
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

function isUnmeasured({ files }) {
  return files === 0;
}
