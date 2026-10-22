import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { availabilityNotices, coChangeNotices } from './notices.mjs';
import {
  amplifiedHistory,
  commitSteps,
  edit,
  repeated,
  SOURCE_FILES,
} from '../../../core/diff/git/test-support/history-repository.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const ENABLED = { history: { coChange: true } };

function amplifiedRepository(files = SOURCE_FILES) {
  const { root } = createGitRepository(files);
  commitSteps(root, amplifiedHistory());
  return root;
}

describe('co-change notices for a change', () => {
  it('names the partners of a changed module that the change leaves alone', () => {
    const root = amplifiedRepository();

    expect(
      coChangeNotices({
        projectRoot: root,
        policy: ENABLED,
        changedFiles: ['src/billing/invoice.ts'],
      }),
    ).toEqual([
      'Files you changed in src/billing usually change together with src/invoicing (8 of 12 commits), ' +
        'which this change leaves alone. Check that they need no matching edit; ' +
        'if they usually do, see the co-change finding for the knowledge both share.',
    ]);
  });

  it('says nothing when the partner changes too, or an unrelated or test file changes', () => {
    const root = amplifiedRepository();
    const notices = (changedFiles) =>
      coChangeNotices({ projectRoot: root, policy: ENABLED, changedFiles });

    expect(notices(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'])).toEqual([]);
    expect(notices(['src/shipping/route.ts', 'src/billing/invoice.test.ts', 'README.md'])).toEqual(
      [],
    );
  });

  it('says nothing when the project has not opted in or an exception lifts the pair', () => {
    const root = amplifiedRepository();
    const changedFiles = ['src/invoicing/ledger.ts'];

    expect(coChangeNotices({ projectRoot: root, policy: {}, changedFiles })).toEqual([]);
    expect(
      coChangeNotices({
        projectRoot: root,
        policy: {
          ...ENABLED,
          exceptions: [{ rule: 'co-change', paths: ['src/invoicing/**'], reason: 'one release' }],
        },
        changedFiles,
      }),
    ).toEqual([]);
  });

  describe('with one hub module that five others change with', () => {
    const modules = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

    function hubRepository() {
      const files = Object.fromEntries(
        ['hub', ...modules].map((name) => [`src/${name}/index.ts`, 'x\n']),
      );
      const { root } = createGitRepository(files);
      commitSteps(
        root,
        modules.flatMap((name, index) =>
          repeated(8 - index, (round) => ({
            files: edit(['src/hub/index.ts', `src/${name}/index.ts`], round + index * 10),
          })),
        ),
      );
      return root;
    }

    it('lists at most three partners, strongest first', () => {
      const [notice] = coChangeNotices({
        projectRoot: hubRepository(),
        policy: ENABLED,
        changedFiles: ['src/hub/index.ts'],
      });

      expect(notice).toBe(
        'Files you changed in src/hub usually change together with ' +
          'src/alpha (8 of 30 commits), src/bravo (7 of 30 commits), src/charlie (6 of 30 commits), ' +
          'which this change leaves alone. Check that they need no matching edit; ' +
          'if they usually do, see the co-change finding for the knowledge both share.',
      );
    });

    it('describes at most three changed modules and counts the rest (a module needs the minimum support)', () => {
      const notices = coChangeNotices({
        projectRoot: hubRepository(),
        policy: ENABLED,
        changedFiles: modules.map((name) => `src/${name}/index.ts`),
      });

      expect(notices.map((notice) => notice.split(' usually')[0])).toEqual([
        'Files you changed in src/alpha',
        'Files you changed in src/bravo',
        'Files you changed in src/charlie',
        '1 more changed module has co-change partners this change leaves alone.',
      ]);
    });
  });

  it('reports why the evidence is unavailable instead of failing', () => {
    const { root } = createGitRepository(SOURCE_FILES);
    commitSteps(
      root,
      repeated(5, (round) => ({ files: edit(['src/ui/page.ts'], round + 1) })),
    );
    const [notice] = coChangeNotices({
      projectRoot: root,
      policy: ENABLED,
      changedFiles: ['src/ui/page.ts'],
    });

    expect(notice).toBe(
      'Co-change evidence is unavailable, so no co-change findings were produced: only 6 commits are available and at least 20 are needed. ' +
        'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.',
    );
  });
});

describe('availabilityNotices', () => {
  it('names a shallow clone and how to deepen it', () => {
    const { root } = createGitRepository(SOURCE_FILES);
    commitSteps(root, amplifiedHistory());
    const clone = temporaryRoot('nitpicker-shallow-notice-');
    fixtureGit(clone, ['clone', '-q', '--depth', '3', `file://${root}`, '.']);

    expect(availabilityNotices({ projectRoot: clone, policy: ENABLED })).toEqual([
      'Co-change evidence is unavailable, so no co-change findings were produced: the repository is a shallow clone. ' +
        'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.',
    ]);
  });

  it('is empty when the evidence is available or the project has not opted in', () => {
    const root = amplifiedRepository();

    expect(availabilityNotices({ projectRoot: root, policy: ENABLED })).toEqual([]);
    expect(availabilityNotices({ projectRoot: root, policy: {} })).toEqual([]);
  });

  it('names a project outside any repository', () => {
    expect(
      availabilityNotices({
        projectRoot: temporaryRoot('nitpicker-no-repository-'),
        policy: ENABLED,
      }),
    ).toEqual([
      'Co-change evidence is unavailable, so no co-change findings were produced: the project is not inside a git repository.',
    ]);
  });
});
