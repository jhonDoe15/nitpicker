import path from 'node:path';
import { realpathSync } from 'node:fs';
import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { describeConventions } from '../../shared/conventions/settings.mjs';
import { resolveBase } from '../diff/base-ref.mjs';
import { resolveComparison, runGit } from '../diff/git.mjs';
import { conventionDefinitions } from './definitions.mjs';
import { commitSource, workingTreeSource } from './sources.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';

export function runHeadPolicy({ cli, config, projectRoot }) {
  const { options, environment, stdout } = cli;
  return withProjectConventions({
    headPolicy: resolveHeadPolicy(config, projectRoot),
    config,
    projectRoot,
    measureAt: options.all
      ? atWorkingTree
      : atMergeBase({ baseRef: options.baseRef, config, environment }),
    stdout,
  });
}

export function publishHeadPolicy(config, projectRoot) {
  return withProjectConventions({
    headPolicy: resolveHeadPolicy(config, projectRoot),
    config,
    projectRoot,
    measureAt: atHeadCommit,
  });
}

function withProjectConventions({ headPolicy, config, projectRoot, measureAt, stdout }) {
  const definitions = conventionDefinitions(config.preset);
  if (definitions.length === 0) {
    return headPolicy;
  }
  const settings = { pinned: config.conventions, exclude: headPolicy.exclude };
  const measured = detectConventions({ ...settings, definitions, source: measureAt(projectRoot) });
  const unmeasured = definitions.filter(({ id }) => isUnmeasured(measured[id]));
  const detected =
    unmeasured.length === 0 || measureAt === atWorkingTree
      ? measured
      : {
          ...measured,
          ...detectConventions({
            ...settings,
            definitions: unmeasured,
            source: workingTreeSource(projectRoot),
          }),
        };
  const lines = describeConventions(detected, definitions);
  stdout?.write(
    `Following this project's conventions:\n${lines.map((line) => `  ${line}\n`).join('')}`,
  );
  return { ...headPolicy, conventions: conventionChoices(detected) };
}

function isUnmeasured({ source, counts }) {
  return source === 'default' && Object.values(counts).every((count) => count === 0);
}

function atWorkingTree(projectRoot) {
  return workingTreeSource(projectRoot);
}

function atHeadCommit(projectRoot) {
  const { repositoryRoot, projectRelativePath } = locate(projectRoot);
  const commitSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  return commitSource({ repositoryRoot, commitSha, projectRelativePath });
}

function atMergeBase({ baseRef, config, environment }) {
  return (projectRoot) => {
    const { repositoryRoot, projectRelativePath } = locate(projectRoot);
    const base = resolveBase({
      repositoryRoot,
      explicitBase: baseRef,
      configuredBase: config.base,
      environment,
    });
    const { mergeBaseSha } = resolveComparison(repositoryRoot, base.baseRef);
    return commitSource({ repositoryRoot, commitSha: mergeBaseSha, projectRelativePath });
  };
}

function locate(projectRoot) {
  const repositoryRoot = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  return { repositoryRoot, projectRelativePath: path.relative(repositoryRoot, projectRoot) || '.' };
}
