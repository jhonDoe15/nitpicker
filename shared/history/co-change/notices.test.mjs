import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixtureGit } from '../../../core/diff/git/test-support/git-repository.mjs';
import { availabilityNotices, coChangeNotices } from './notices.mjs';
import {
  edit,
  importHistory,
  repeated,
  useHistoryRepositories,
} from '../../../core/diff/git/test-support/history-repository.mjs';

const { historyRepository, temporaryRoot } = useHistoryRepositories();
const ENABLED = { history: { coChange: true } };
const PARTNERS = ['alpha', 'bravo', 'charlie', 'delta'];
const roots = {};
const CHECK_PARTNERS =
  'which this change leaves alone. Check that they need no matching edit; ' +
  'if they usually do, see the co-change finding for the knowledge both share.';
const UNAVAILABLE = 'Co-change evidence is unavailable, so no co-change findings were produced:';

function indexOf(name) {
  return `src/${name}/index.ts`;
}

function hubSteps() {
  const withPartners = (count, partners) =>
    repeated(count, (round) => ({
      files: edit([indexOf('hub'), ...partners.map(indexOf)], round + partners.length * 10),
    }));
  return [
    ...withPartners(5, PARTNERS),
    ...withPartners(1, PARTNERS.slice(0, 3)),
    ...withPartners(1, PARTNERS.slice(0, 2)),
    ...withPartners(1, PARTNERS.slice(0, 1)),
    ...repeated(12, (round) => ({ files: edit([indexOf('ui')], round + 100) })),
  ];
}

function busySteps() {
  return [
    ...repeated(7, (round) => ({ files: edit([indexOf('hub'), indexOf('satellite')], round) })),
    ...repeated(100, (round) => ({ files: edit([indexOf('hub')], round + 100) })),
    ...repeated(2, (round) => ({ files: edit([indexOf('satellite')], round + 300) })),
  ];
}

function filesOf(names) {
  return Object.fromEntries(names.map((name) => [indexOf(name), 'x\n']));
}

beforeAll(() => {
  roots.amplified = historyRepository();
  roots.deleted = historyRepository();
  roots.deletedBase = fixtureGit(roots.deleted, ['rev-parse', 'HEAD']).trim();
  importHistory(roots.deleted, [{ deletes: ['src/invoicing/ledger.ts'] }]);
  roots.hub = historyRepository({ files: filesOf(['hub', 'ui', ...PARTNERS]), steps: hubSteps() });
  roots.busy = historyRepository({ files: filesOf(['hub', 'satellite']), steps: busySteps() });
  roots.young = historyRepository({
    steps: repeated(5, (round) => ({ files: edit(['src/ui/page.ts'], round + 1) })),
  });
  roots.shallow = temporaryRoot('nitpicker-shallow-notice-');
  fixtureGit(roots.shallow, ['clone', '-q', '--depth', '3', `file://${roots.amplified}`, '.']);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function notices(root, changedPaths, extra = {}) {
  return coChangeNotices({ projectRoot: root, policy: ENABLED, changedPaths, ...extra });
}

describe('co-change notices for a change', () => {
  it('names the partners of a changed module that the change leaves alone, with the ratio', () => {
    expect(notices(roots.amplified, ['src/billing/invoice.ts'])).toEqual([
      `Files you changed in src/billing usually change together with src/invoicing (8 of 12 commits, 67%), ${CHECK_PARTNERS}`,
    ]);
  });

  it.each([
    ['the partner changes too', ['src/billing/invoice.ts', 'src/invoicing/ledger.ts']],
    [
      'only unrelated, test or doc files change',
      ['src/shipping/route.ts', 'src/billing/invoice.test.ts', 'README.md'],
    ],
  ])('says nothing when %s', (_, changedPaths) => {
    expect(notices(roots.amplified, changedPaths)).toEqual([]);
  });

  it('counts a partner file the change deletes as changed, read at the compared base', () => {
    const atBase = { ref: roots.deletedBase };

    expect({
      deletingPartner: notices(
        roots.deleted,
        ['src/billing/invoice.ts', 'src/invoicing/ledger.ts'],
        atBase,
      ),
      leavingPartner: notices(roots.deleted, ['src/billing/invoice.ts'], atBase).length,
    }).toEqual({ deletingPartner: [], leavingPartner: 1 });
  });

  it('stays quiet for the busier side of a pair: the hub rarely needs the satellite', () => {
    expect({
      hub: notices(roots.busy, [indexOf('hub')]),
      satellite: notices(roots.busy, [indexOf('satellite')]),
    }).toEqual({
      hub: [],
      satellite: [
        `Files you changed in src/satellite usually change together with src/hub (7 of 9 commits, 78%), ${CHECK_PARTNERS}`,
      ],
    });
  });

  it.each([
    ['the project has not opted in', {}],
    [
      'an exception lifts the pair',
      {
        ...ENABLED,
        exceptions: [{ rule: 'co-change', paths: ['src/invoicing/**'], reason: 'one release' }],
      },
    ],
  ])('says nothing when %s', (_, policy) => {
    expect(
      coChangeNotices({
        projectRoot: roots.amplified,
        policy,
        changedPaths: ['src/invoicing/ledger.ts'],
      }),
    ).toEqual([]);
  });

  it('lists at most three partners, strongest first', () => {
    expect(notices(roots.hub, [indexOf('hub')])).toEqual([
      'Files you changed in src/hub usually change together with ' +
        'src/alpha (8 of 8 commits, 100%), src/bravo (7 of 8 commits, 88%), src/charlie (6 of 8 commits, 75%), ' +
        CHECK_PARTNERS,
    ]);
  });

  it('describes at most three changed modules and counts the rest', () => {
    const described = notices(roots.hub, PARTNERS.map(indexOf));

    expect(described.map((notice) => notice.split(' usually')[0])).toEqual([
      'Files you changed in src/alpha',
      'Files you changed in src/bravo',
      'Files you changed in src/charlie',
      '1 more changed module has co-change partners this change leaves alone.',
    ]);
  });

  it('reports why the evidence is unavailable instead of failing', () => {
    expect(notices(roots.young, ['src/ui/page.ts'])).toEqual([
      `${UNAVAILABLE} only 6 commits are available and at least 20 are needed. ` +
        'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.',
    ]);
  });
});

describe('availabilityNotices', () => {
  it('names a shallow clone and how to deepen it', () => {
    expect(availabilityNotices({ projectRoot: roots.shallow, policy: ENABLED })).toEqual([
      `${UNAVAILABLE} the repository is a shallow clone. ` +
        'Fetch the full history (for example `fetch-depth: 0` in actions/checkout) to enable it.',
    ]);
  });

  it.each([
    ['the evidence is available', ENABLED],
    ['the project has not opted in', {}],
  ])('is empty when %s', (_, policy) => {
    expect(availabilityNotices({ projectRoot: roots.amplified, policy })).toEqual([]);
  });

  it('names a project outside any repository', () => {
    const projectRoot = temporaryRoot('nitpicker-no-repository-');

    expect(availabilityNotices({ projectRoot, policy: ENABLED })).toEqual([
      `${UNAVAILABLE} the project is not inside a git repository.`,
    ]);
  });

  it('names a missing git binary', () => {
    vi.stubEnv('PATH', temporaryRoot('nitpicker-no-binaries-'));

    expect(availabilityNotices({ projectRoot: roots.amplified, policy: ENABLED })).toEqual([
      `${UNAVAILABLE} git is not installed or is not on the PATH.`,
    ]);
  });
});
