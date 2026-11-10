import { describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { readProjectTexts } from './project-texts.mjs';

const { gitCheckout } = useGitCheckouts();

const MODULE = {
  qualifier: '',
  sourceRoots: ['src/main/java'],
  kotlinSourceRoots: [],
  resourceRoots: [],
};

function filesRead(root, project = MODULE) {
  return readProjectTexts(root, [project])
    .map(({ file }) => file)
    .toSorted();
}

describe('the container files of a project', () => {
  it('are those of the Git checkout, not of ignored folders or nested checkouts', () => {
    const root = gitCheckout(
      {
        Dockerfile: 'CMD ["java"]\n',
        'deploy/api.Dockerfile': 'CMD ["java"]\n',
        'scratch/Dockerfile': 'CMD ["java"]\n',
        ...nestedCheckout('.claude/worktrees/x', { Dockerfile: 'CMD ["java"]\n' }),
      },
      ['scratch/'],
    );

    expect(filesRead(root)).toEqual(['Dockerfile', 'deploy/api.Dockerfile']);
  });
});

describe('the files under the source and resource roots', () => {
  it('include ignored generated code, but not nested checkouts or installed packages', () => {
    const root = gitCheckout(
      {
        'src/main/java/shop/A.java': 'package shop;\n',
        'src/main/java/gen/G.java': 'package gen;\n',
        'src/main/java/node_modules/dep/N.java': 'package dep;\n',
        'build/generated/R.java': 'package gen;\n',
        ...nestedCheckout('src/main/java/agent', { 'X.java': 'package agent;\n' }),
      },
      ['src/main/java/gen/', 'src/main/java/node_modules/', 'build/'],
    );
    const project = { ...MODULE, sourceRoots: ['src/main/java', 'build/generated'] };

    expect(filesRead(root, project)).toEqual([
      'build/generated/R.java',
      'src/main/java/gen/G.java',
      'src/main/java/shop/A.java',
    ]);
  });
});
