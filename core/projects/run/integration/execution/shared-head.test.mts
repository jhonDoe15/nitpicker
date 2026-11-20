import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFiles } from '../../../../diff/git/test-support/fixture-files.mts';
import {
  projectFiles,
  useMonorepoFixtures,
  violation,
} from '../../test-support/monorepo-harness.mts';
import { tracedWorktrees } from '../../test-support/git-trace.mts';

const { repository, run, temporaryRoot } = useMonorepoFixtures();
const HEAD_WORKTREE = /built-in: git worktree add --detach \S+\/head [0-9a-f]{40}$/u;

afterEach(() => {
  vi.unstubAllEnvs();
});

function services(): string {
  return repository({
    'nitpicker.config.json': JSON.stringify({ projects: ['web', 'admin'] }),
    ...projectFiles('web', {
      'package.json': '{"name":"web","version":"1.0.0"}\n',
      'src/a.ts': 'export const a = 1;\n',
    }),
    ...projectFiles('admin', {
      'package.json': '{"name":"admin","version":"1.0.0"}\n',
      'src/b.ts': 'export const b = 1;\n',
    }),
  });
}

function traced(): () => string[] {
  return tracedWorktrees(temporaryRoot, HEAD_WORKTREE);
}

describe('one head worktree for the projects of a monorepo run', () => {
  it('checks out the head once for --all and finds what a run of each project alone finds', () => {
    const root = services();
    writeFiles(root, { 'web/src/a.ts': violation('web-finding') });
    const alone = run(root, ['--all', '--project', 'web'], { withoutBase: true });
    const headWorktrees = traced();

    const shared = run(root, ['--all', '--jobs', '1'], { withoutBase: true });

    expect(headWorktrees()).toHaveLength(1);
    expect(shared.json('web/findings.json')).toEqual(alone.json('web/findings.json'));
  });
  it('checks out the head once when a change touches several projects', () => {
    const root = services();
    writeFiles(root, {
      'web/src/a.ts': violation('web-finding'),
      'admin/src/b.ts': 'export const b = 2;\n',
    });
    const alone = run(root, ['--project', 'web']);
    const headWorktrees = traced();

    const shared = run(root, ['--jobs', '1']);

    expect(headWorktrees()).toHaveLength(1);
    expect(shared.exitCode).toBe(1);
    expect(shared.json('web/new-findings.json')).toEqual(alone.json('web/new-findings.json'));
  });
});
