import { realpathSync } from 'node:fs';
import path from 'node:path';
import { conventionChoices, detectConventions } from '../../shared/conventions/detect.mjs';
import { describeConventions } from '../../shared/conventions/settings.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { resolveBase } from '../diff/base-ref.mjs';
import { resolveComparison, runGit } from '../diff/git.mjs';
import { conventionDefinitions } from './definitions.mjs';
import { commitSource, workingTreeSource } from './sources.mjs';

export function runHeadPolicy({ cli, config, projectRoot }) {
  const { options, environment, stdout } = cli;
  const definitions = conventionDefinitions(config.preset);
  const headPolicy = resolveHeadPolicy(config, projectRoot);
  if (definitions.length === 0) {
    return headPolicy;
  }
  const detected = detect({
    definitions,
    config,
    exclude: headPolicy.exclude,
    projectRoot,
    measuredSource: options.all
      ? undefined
      : () => mergeBaseSource({ projectRoot, baseRef: options.baseRef, config, environment }),
  });
  const lines = describeConventions(detected, definitions);
  stdout.write(
    `Following this project's conventions:\n${lines.map((line) => `  ${line}\n`).join('')}`,
  );
  return { ...headPolicy, conventions: conventionChoices(detected) };
}

export function publishHeadPolicy(config, projectRoot) {
  const definitions = conventionDefinitions(config.preset);
  const headPolicy = resolveHeadPolicy(config, projectRoot);
  if (definitions.length === 0) {
    return headPolicy;
  }
  const detected = detect({
    definitions,
    config,
    exclude: headPolicy.exclude,
    projectRoot,
    measuredSource: () => headCommitSource(projectRoot),
  });
  return { ...headPolicy, conventions: conventionChoices(detected) };
}

function detect({ definitions, config, exclude, projectRoot, measuredSource }) {
  const pinned = config.conventions ?? {};
  if (definitions.every(({ id }) => pinned[id] !== undefined)) {
    return detectConventions({ definitions, pinned, exclude, source: undefined });
  }
  const settings = { pinned, exclude };
  if (measuredSource === undefined) {
    return detectConventions({ ...settings, definitions, source: workingTreeSource(projectRoot) });
  }
  const measured = detectConventions({ ...settings, definitions, source: measuredSource() });
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

function headCommitSource(projectRoot) {
  const { repositoryRoot, projectRelativePath } = locate(projectRoot);
  const commitSha = runGit(repositoryRoot, ['rev-parse', 'HEAD^{commit}']).trim();
  return commitSource({ repositoryRoot, commitSha, projectRelativePath });
}

function mergeBaseSource({ projectRoot, baseRef, config, environment }) {
  const { repositoryRoot, projectRelativePath } = locate(projectRoot);
  const base = resolveBase({
    repositoryRoot,
    explicitBase: baseRef,
    configuredBase: config.base,
    environment,
  });
  const { mergeBaseSha } = resolveComparison(repositoryRoot, base.baseRef);
  return commitSource({ repositoryRoot, commitSha: mergeBaseSha, projectRelativePath });
}

function locate(projectRoot) {
  const repositoryRoot = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  return { repositoryRoot, projectRelativePath: path.relative(repositoryRoot, projectRoot) || '.' };
}
