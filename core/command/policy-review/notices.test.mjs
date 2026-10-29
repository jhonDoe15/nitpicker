import { beforeAll, describe, expect, it } from 'vitest';
import { historyAvailabilityNotes, noticeDescriber } from './notices.mjs';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';
import {
  SOURCE_FILES,
  useHistoryRepositories,
} from '../../diff/git/test-support/history-repository.mjs';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';

const { createGitRepository } = useGitFixtures();
const { historyRepository } = useHistoryRepositories();
const changed = ['scripts/slop.ts', 'src/a.ts'];
const PARTNER_NOTICE =
  'Files you changed in src/billing usually change together with src/invoicing (8 of 12 commits, 67%), ' +
  'which this change leaves alone. Check that they need no matching edit; ' +
  'if they usually do, see the co-change finding for the knowledge both share.';

describe('noticeDescriber', () => {
  it('describes changed TypeScript files outside the roots for the TypeScript preset', () => {
    const expected = outsideRootsNotices(changed, {});

    expect(expected).toHaveLength(1);
    expect(noticeDescriber({}, {})?.(changed)).toEqual(expected);
    expect(noticeDescriber({ preset: 'typescript' }, {})?.(changed)).toEqual(expected);
  });

  it('uses the head policy of the project', () => {
    const describeExcluded = noticeDescriber({}, { exclude: ['scripts/**'] });

    expect(describeExcluded?.(changed)).toEqual([]);
  });

  it('passes on the notices the head policy recorded about the test runner, for every preset', () => {
    const headPolicy = { exclude: ['scripts/**'], tools: { tests: { notices: ['read failed'] } } };

    expect(noticeDescriber({}, headPolicy)?.(changed)).toEqual(['read failed']);
    expect(noticeDescriber({ preset: 'javascript' }, headPolicy)?.(changed)).toEqual([
      'read failed',
    ]);
  });

  it('describes changed Python files outside python.sourceRoots', () => {
    const { root } = createGitRepository({
      'src/app/__init__.py': '',
      'tools/slop.py': 'x = 1\n',
    });
    const describe = noticeDescriber({ preset: 'python' }, { exclude: [] }, root);

    expect(describe?.(['src/app/__init__.py', 'tools/slop.py', 'tests/test_a.py'])).toEqual([
      '1 changed Python file is outside python.sourceRoots, so only the lint and format checks see it: tools/slop.py. ' +
        'Move it under a source root or add its folder to python.sourceRoots; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
  });

  it('describes changed Java and Kotlin files outside the build source sets, following declared directories', () => {
    const { root } = createGitRepository({
      'build.gradle': "sourceSets { main { java { srcDir 'extra/code' } } }\n",
      'src/main/java/A.java': 'class A {}\n',
    });
    const files = ['src/main/java/A.java', 'extra/code/B.java', 'tools/Slop.java', 'tools/Slop.kt'];

    expect(noticeDescriber({ preset: 'java' }, { exclude: [] }, root)?.(files)).toEqual([
      "1 changed Java file is outside the build's source sets, so the build does not compile or check it: tools/Slop.java. " +
        'Move it under src/main or src/test of a module, or declare its folder as a source directory in the build file; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    ]);
    expect(noticeDescriber({ preset: 'kotlin' }, { exclude: ['tools/**'] }, root)?.(files)).toEqual(
      [],
    );
    expect(noticeDescriber({ preset: 'kotlin' }, { exclude: [] }, root)?.(files)).toHaveLength(1);
  });

  it('describes nothing for the javascript preset', () => {
    expect(noticeDescriber({ preset: 'javascript' }, {})).toBeUndefined();
  });

  describe('co-change', () => {
    const amplified = {};

    beforeAll(() => {
      amplified.root = historyRepository();
      amplified.head = fixtureGit(amplified.root, ['rev-parse', 'HEAD']).trim();
    });

    function amplifiedRoot() {
      return amplified.root;
    }

    it('adds the partners a change leaves alone to the language notices', () => {
      const root = amplifiedRoot();
      const config = { history: { coChange: true } };
      const describe = noticeDescriber(config, config, root);

      expect(describe?.(['src/billing/invoice.ts', 'scripts/slop.ts'])).toEqual([
        ...outsideRootsNotices(['scripts/slop.ts', 'src/billing/invoice.ts'], config),
        PARTNER_NOTICE,
      ]);
      expect(
        noticeDescriber(
          { preset: 'javascript', ...config },
          config,
          root,
        )?.(['src/billing/invoice.ts']),
      ).toEqual([PARTNER_NOTICE]);
    });

    it('reads the compared base and every path the change touches, deleted ones included', () => {
      const config = { history: { coChange: true } };
      const describeChange = noticeDescriber(
        { preset: 'javascript', ...config },
        config,
        amplifiedRoot(),
      );
      const context = (touchedPaths) => ({ mergeBaseSha: amplified.head, touchedPaths });

      expect({
        alone: describeChange(['src/billing/invoice.ts'], context(['src/billing/invoice.ts'])),
        deleting: describeChange(
          ['src/billing/invoice.ts'],
          context(['src/billing/invoice.ts', 'src/invoicing/ledger.ts']),
        ),
      }).toEqual({ alone: [PARTNER_NOTICE], deleting: [] });
    });

    it('is off without the opt-in or when the analyzer is disabled', () => {
      const root = amplifiedRoot();
      const policy = { history: { coChange: true } };

      expect(noticeDescriber({ preset: 'javascript' }, policy, root)).toBeUndefined();
      expect(
        noticeDescriber(
          { preset: 'javascript', history: { coChange: true }, disable: ['change-history'] },
          policy,
          root,
        ),
      ).toBeUndefined();
    });

    it('names unavailable history once for a snapshot run', () => {
      const { root } = createGitRepository(SOURCE_FILES);
      const config = { history: { coChange: true } };

      expect(historyAvailabilityNotes(config, config, root)).toEqual([
        'Co-change evidence is unavailable, so no co-change findings were produced: ' +
          'only 1 commit is available and at least 20 are needed. ' +
          'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.',
      ]);
      expect(historyAvailabilityNotes({}, config, root)).toEqual([]);
      expect(historyAvailabilityNotes(config, config, amplifiedRoot())).toEqual([]);
    });
  });
});
