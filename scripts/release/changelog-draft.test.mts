import { describe, expect, it } from 'vitest';
import {
  type MergedPullRequest,
  draftEntries,
  latestRelease,
  parseMergeLog,
  releaseChangelog,
  releaseVersion,
  sectionOf,
  shipsFile,
} from './changelog-draft.mts';

const CHANGELOG = [
  '# Changelog',
  '',
  'Intro.',
  '',
  '## [Unreleased]',
  '',
  '### Fixed',
  '',
  '- A fix written by hand (#7).',
  '',
  '## [1.0.0] - 2026-01-02',
  '',
  '### Added',
  '',
  '- First.',
  '',
  '[Unreleased]: https://example.test/repo/compare/v1.0.0...HEAD',
  '[1.0.0]: https://example.test/repo/releases/tag/v1.0.0',
  '',
].join('\n');

function pullRequest(number: number, title: string, ...files: string[]): MergedPullRequest {
  return { number, title, files: files.length > 0 ? files : ['core/cli.mjs'] };
}

function record(subject: string, body: string, ...files: string[]): string {
  return `\u001Eabc123\u001F${subject}\u001F${body}\u001F\n\n${files.join('\n')}\n`;
}

describe('parseMergeLog', () => {
  it('reads merge commits, squash commits and their files, and skips other commits', () => {
    const log = [
      record(
        'Merge pull request #12 from owner/branch',
        'Fix the cache\n\nMore text.\n',
        'core/a.mjs',
      ),
      record('Add a preset (#13)', '', 'languages/go/x.mjs', 'docs/usage.md'),
      record('Direct commit on main', '', 'README.md'),
      record('Merge pull request #14 from owner/untitled', '', 'scripts/x.mts'),
    ].join('');

    expect(parseMergeLog(log)).toEqual([
      { number: 12, title: 'Fix the cache', files: ['core/a.mjs'] },
      { number: 13, title: 'Add a preset', files: ['languages/go/x.mjs', 'docs/usage.md'] },
      { number: 14, title: 'owner/untitled', files: ['scripts/x.mts'] },
    ]);
  });
});

describe('shipsFile', () => {
  it('counts packaged code, skills, schemas and the action, not tests, fixtures, CI or docs', () => {
    const shipped = [
      'core/cli.mjs',
      'shared/rules/a.mts',
      'languages/java/gradle/init.gradle',
      'skills/nitpicker/SKILL.md',
      'spec/config.schema.json',
      'docs/agents-snippet.md',
      'package.json',
      'Dockerfile',
      'action.yml',
    ];
    const internal = [
      'core/cli.test.mjs',
      'languages/go/inspect/main_test.go',
      'core/diff/fixtures/a.ts',
      'core/__tests__/hooks.mjs',
      'shared/test-support/x.mjs',
      'languages/python/README.md',
      'scripts/check.mts',
      '.github/workflows/typescript.yml',
      'docs/internals.md',
      'spec/checks.md',
    ];

    expect(shipped.filter((file) => !shipsFile(file))).toEqual([]);
    expect(internal.filter((file) => shipsFile(file))).toEqual([]);
  });
});

describe('sectionOf', () => {
  it('sorts by the first word of the title', () => {
    expect(sectionOf('Fix a crash')).toBe('Fixed');
    expect(sectionOf('fixes: crash')).toBe('Fixed');
    expect(sectionOf('Add Go rules')).toBe('Added');
    expect(sectionOf('Support Bun')).toBe('Added');
    expect(sectionOf('Turn on a stricter rule')).toBe('Changed');
    expect(sectionOf('Prefix the fixture names')).toBe('Changed');
  });
});

describe('releaseVersion and latestRelease', () => {
  it('takes a version with or without a leading v', () => {
    expect(releaseVersion('v0.2.0-rc.1')).toBe('0.2.0-rc.1');
    expect(releaseVersion('1.2.3')).toBe('1.2.3');
    expect(() => releaseVersion('next')).toThrow('Not a version: next');
  });

  it('finds the newest release under Unreleased', () => {
    expect(latestRelease(CHANGELOG)).toBe('1.0.0');
    expect(() => latestRelease('# Changelog\n\n## [Unreleased]\n')).toThrow('no release yet');
  });
});

describe('draftEntries', () => {
  it('keeps written entries and adds the pull requests they do not mention', () => {
    const written = ['', 'Loose line.', '', '### Fixed', '', '- Hand fix (#7).', ''];
    const pullRequests = [
      pullRequest(7, 'Fix the hand-written one'),
      pullRequest(70, 'Fix another crash'),
      pullRequest(8, 'Add a check'),
      pullRequest(9, 'Rework CI shards', '.github/workflows/typescript.yml'),
    ];

    expect(Object.fromEntries(draftEntries(written, pullRequests))).toEqual({
      Changed: ['Loose line.'],
      Fixed: ['- Hand fix (#7).', '- Fix another crash (#70)'],
      Added: ['- Add a check (#8)'],
    });
  });
});

describe('releaseChangelog', () => {
  it('moves Unreleased under the version with the drafted entries and updates the links', () => {
    const pullRequests = [
      pullRequest(8, 'Add a check'),
      pullRequest(9, 'Fix a crash'),
      pullRequest(10, 'Speed up CI', 'scripts/ci/a.mts'),
      pullRequest(11, 'Turn on a stricter rule'),
    ];

    expect(
      releaseChangelog(CHANGELOG, { version: '1.1.0', date: '2026-02-03', pullRequests }),
    ).toBe(
      [
        '# Changelog',
        '',
        'Intro.',
        '',
        '## [Unreleased]',
        '',
        '## [1.1.0] - 2026-02-03',
        '',
        '### Added',
        '',
        '- Add a check (#8)',
        '',
        '### Changed',
        '',
        '- Turn on a stricter rule (#11)',
        '',
        '### Fixed',
        '',
        '- A fix written by hand (#7).',
        '- Fix a crash (#9)',
        '',
        '## [1.0.0] - 2026-01-02',
        '',
        '### Added',
        '',
        '- First.',
        '',
        '[Unreleased]: https://example.test/repo/compare/v1.1.0...HEAD',
        '[1.1.0]: https://example.test/repo/releases/tag/v1.1.0',
        '[1.0.0]: https://example.test/repo/releases/tag/v1.0.0',
        '',
      ].join('\n'),
    );
  });

  it('refuses a version that is listed, an empty release and a changelog without its anchors', () => {
    const release = { version: '1.1.0', date: '2026-02-03', pullRequests: [] };
    const empty = CHANGELOG.replace('- A fix written by hand (#7).', '');

    expect(() => releaseChangelog(CHANGELOG, { ...release, version: '1.0.0' })).toThrow(
      'already has an entry for 1.0.0',
    );
    expect(() => releaseChangelog(empty, release)).toThrow('Nothing to release');
    expect(() => releaseChangelog(CHANGELOG.replace('## [Unreleased]', ''), release)).toThrow(
      'no "## [Unreleased]" heading',
    );
    expect(() => releaseChangelog(CHANGELOG.replace(/^\[Unreleased\].*$/mu, ''), release)).toThrow(
      'no [Unreleased] link definition',
    );
  });
});
