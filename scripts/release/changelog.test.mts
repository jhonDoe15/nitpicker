import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeReleaseChangelog } from './changelog.mts';
import { temporaryRepositories } from '../test-support/temporary-repositories.mts';

const repository = temporaryRepositories('release-changelog-');
const GIT_TIMEOUT_MS = 10_000;
const HERMETIC_GIT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.test',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.test',
};

const RELEASED = [
  '## [1.0.0] - 2026-01-02',
  '',
  '- First.',
  '',
  '[Unreleased]: https://example.test/repo/compare/v1.0.0...HEAD',
  '[1.0.0]: https://example.test/repo/releases/tag/v1.0.0',
  '',
];
const CHANGELOG = ['# Changelog', '', '## [Unreleased]', '', ...RELEASED].join('\n');
const FILES = { 'CHANGELOG.md': CHANGELOG, 'core/a.mjs': '', 'scripts/b.mts': '' };

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, {
    cwd: root,
    env: HERMETIC_GIT,
    stdio: 'ignore',
    timeout: GIT_TIMEOUT_MS,
  });
}

function merge(root: string, number: string, title: string, file: string): void {
  git(root, 'checkout', '-q', '-b', `branch-${number}`);
  writeFileSync(path.join(root, file), `${title}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', title);
  git(root, 'checkout', '-q', 'main');
  const subject = `Merge pull request #${number} from o/b`;
  git(root, 'merge', '-q', '--no-ff', `branch-${number}`, '-m', subject, '-m', title);
}

let template: string;

beforeAll(() => {
  template = mkdtempSync(path.join(tmpdir(), 'release-changelog-template-'));
  for (const [file, text] of Object.entries(FILES)) {
    mkdirSync(path.dirname(path.join(template, file)), { recursive: true });
    writeFileSync(path.join(template, file), text);
  }
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'add', '.');
  git(template, 'commit', '-q', '-m', 'Release v1.0.0');
  git(template, 'tag', 'v1.0.0');
  merge(template, '5', 'Fix a crash', 'core/a.mjs');
  merge(template, '6', 'Speed up a script', 'scripts/b.mts');
  merge(template, '7', 'Add a check', 'core/c.mjs');
});

afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

function releasedRepository(): string {
  const root = repository({});
  cpSync(template, root, { recursive: true });
  return root;
}

describe('writeReleaseChangelog', () => {
  it('drafts the version from the pull requests merged since the last release tag', () => {
    const root = releasedRepository();

    const summary = writeReleaseChangelog({ root, version: 'v1.1.0', date: '2026-02-03' });

    expect(summary).toBe(
      [
        'CHANGELOG.md: 1.1.0 drafted from 3 pull requests merged since v1.0.0.',
        'Left out, no shipped file changed (1):',
        '  #6 Speed up a script',
        'Rewrite each drafted entry for users and drop internal ones before you commit.',
      ].join('\n'),
    );
    expect(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [1.1.0] - 2026-02-03',
        '',
        '### Added',
        '',
        '- Add a check (#7)',
        '',
        '### Fixed',
        '',
        '- Fix a crash (#5)',
        '',
        ...RELEASED.slice(0, -3),
        '[Unreleased]: https://example.test/repo/compare/v1.1.0...HEAD',
        '[1.1.0]: https://example.test/repo/releases/tag/v1.1.0',
        ...RELEASED.slice(-2),
      ].join('\n'),
    );
  });

  it('starts from --since and explains a start that is not a commit', () => {
    const root = releasedRepository();

    expect(writeReleaseChangelog({ root, version: '1.1.0', since: 'HEAD~1' })).toBe(
      [
        'CHANGELOG.md: 1.1.0 drafted from 1 pull requests merged since HEAD~1.',
        'Left out, no shipped file changed (0):',
        'Rewrite each drafted entry for users and drop internal ones before you commit.',
      ].join('\n'),
    );
    expect(() => writeReleaseChangelog({ root, version: '1.2.0', since: 'v0.9.0' })).toThrow(
      'v0.9.0 is not a commit here',
    );
  });
});
