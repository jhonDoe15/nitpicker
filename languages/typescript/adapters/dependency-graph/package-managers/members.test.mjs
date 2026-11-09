import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../../core/diff/git/test-support/git-checkout.mjs';
import { memberDependencyDirectories } from './members.mjs';

const { gitCheckout } = useGitCheckouts();

describe('memberDependencyDirectories', () => {
  it('names the installed folders of the members of the Git checkout only', () => {
    const root = gitCheckout(
      {
        'package.json': '{}',
        'packages/a/package.json': '{}',
        'scratch/b/package.json': '{}',
        ...nestedCheckout('.claude/worktrees/x', { 'packages/c/package.json': '{}' }),
      },
      ['scratch/'],
    );
    for (const member of ['packages/a', 'scratch/b', '.claude/worktrees/x/packages/c']) {
      mkdirSync(path.join(root, member, 'node_modules'), { recursive: true });
    }

    expect(memberDependencyDirectories(root)).toEqual([path.join('packages/a', 'node_modules')]);
  });
});
