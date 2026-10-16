import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { resolveComparison } from '../diff/git/repository/git.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { conventionDefinitions } from './definitions.mjs';
import { comparisonPolicy } from './resolve.mjs';

const { createGitRepository } = useGitFixtures();

const BIG_COMMENT = `// ${'x'.repeat(600 * 1024)}\n`;

function commitFeature(root) {
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/feature-file.ts'), 'export const a = 1;\n');
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
}

function followed(files, config = { preset: 'typescript' }) {
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
  ).conventions;
}

const code = 'export const a = 1;\n';

describe('file name casing in the head policy', () => {
  it('counts only source and test roots, not fixtures, generated code or other folders', () => {
    expect(
      followed({
        'src/kebab-one.ts': code,
        'src/kebab-two.ts': code,
        'src/__generated__/snake_one.ts': code,
        'src/api/snake_pb.ts': code,
        'scripts/snake_three.ts': code,
        'scripts/snake_four.ts': code,
        'e2e/snake_five.ts': code,
        'tests/fixtures/snake_six.ts': code,
        '.storybook/snake_seven.ts': code,
      }),
    ).toBeUndefined();
  });

  it('counts test roots and files too large to read', () => {
    expect(
      followed({
        'src/kebab-one.ts': code,
        'src/snake_big_one.ts': BIG_COMMENT,
        'src/snake_big_two.ts': BIG_COMMENT,
        'tests/snake_test_one.ts': code,
      }),
    ).toEqual({ 'typescript.fileNames': 'snake_case' });
  });

  it('follows the layout of the config', () => {
    expect(
      followed(
        {
          'lib/snake_one.ts': code,
          'lib/snake_two.ts': code,
          'src/kebab-one.ts': code,
        },
        { preset: 'typescript', layout: { sourceRoots: ['lib'] } },
      ),
    ).toEqual({ 'typescript.fileNames': 'snake_case' });
  });
});

describe('conventions per preset', () => {
  const nonPrettierIds = (preset) =>
    conventionDefinitions(preset)
      .map(({ id }) => id)
      .filter((id) => !id.startsWith('prettier.'));

  it('offers type import style to the typescript preset only, and file names to both', () => {
    expect(nonPrettierIds('typescript')).toEqual([
      'typescript.typeImports',
      'typescript.fileNames',
    ]);
    expect(nonPrettierIds('javascript')).toEqual(['typescript.fileNames']);
  });
});
