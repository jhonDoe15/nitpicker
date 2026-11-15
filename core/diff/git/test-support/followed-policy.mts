import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FileMap } from './fixture-files.mts';
import { fixtureGit, useGitFixtures } from './git-repository.mts';
import { resolveComparison } from '../repository/git.mjs';
import { resolveHeadPolicy } from '../../../../languages/typescript/preset/head-policy.mjs';
import { comparisonPolicy } from '../../../conventions/resolve.mts';

const { createGitRepository } = useGitFixtures();

export type FollowedPolicy = {
  readonly conventions?: Readonly<Record<string, unknown>> | undefined;
};

const policyFollowedOnBranch: (
  run: {
    readonly config: Readonly<Record<string, unknown>>;
    readonly currentProjectRoot: string;
    readonly headPolicy: unknown;
    readonly repositoryRoot: string;
    readonly base: { readonly baseRef: string };
    readonly stdout?: undefined;
  },
  resolve: typeof resolveComparison,
) => FollowedPolicy = comparisonPolicy;

function commitFeature(root: string): void {
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/feature-file.ts'), 'export const a = 1;\n');
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
}

export function followedPolicy(
  files: FileMap,
  config: Readonly<Record<string, unknown>> = { preset: 'typescript' },
): FollowedPolicy {
  const { root } = createGitRepository(files);
  commitFeature(root);
  return policyFollowedOnBranch(
    {
      config,
      currentProjectRoot: root,
      headPolicy: resolveHeadPolicy(config, root),
      repositoryRoot: root,
      base: { baseRef: 'main' },
    },
    resolveComparison,
  );
}
