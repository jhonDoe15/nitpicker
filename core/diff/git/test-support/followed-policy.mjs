import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fixtureGit, useGitFixtures } from './git-repository.mjs';
import { resolveComparison } from '../repository/git.mjs';
import { resolveHeadPolicy } from '../../../../languages/typescript/preset/head-policy.mjs';
import { comparisonPolicy } from '../../../conventions/resolve.mjs';

const { createGitRepository } = useGitFixtures();

function commitFeature(root) {
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/feature-file.ts'), 'export const a = 1;\n');
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
}

export function followedPolicy(files, config = { preset: 'typescript' }) {
  const { root } = createGitRepository(files);
  commitFeature(root);
  return comparisonPolicy(
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
