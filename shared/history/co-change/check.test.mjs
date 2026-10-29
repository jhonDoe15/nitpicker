import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fixtureGit } from '../../../core/diff/git/test-support/git-repository.mjs';
import { runHistoryCheck } from '../runner.mjs';
import {
  amplifiedHistory,
  edit,
  importHistory,
  repeated,
  shortShaOf,
  SOURCE_FILES,
  useHistoryRepositories,
} from '../../../core/diff/git/test-support/history-repository.mjs';

const { historyRepository, temporaryRoot } = useHistoryRepositories();
const ENABLED = { history: { coChange: true } };
const BOTH = ['src/billing/invoice.ts', 'src/invoicing/ledger.ts'];
const roots = {};

function findings(root, policy = ENABLED, historyRef) {
  return runHistoryCheck({ check: 'change-history', projectRoot: root, policy, historyRef });
}

function identities(root, policy = ENABLED, historyRef) {
  return findings(root, policy, historyRef).map(({ identity }) => identity);
}

function together(count, offset = 1) {
  return repeated(count, (round) => ({ files: edit(BOTH, round + offset) }));
}

function alone(count, file) {
  return repeated(count, (round) => ({ files: edit([file], round + 100) }));
}

function inApp(files) {
  return Object.fromEntries(Object.entries(files).map(([file, text]) => [`app/${file}`, text]));
}

const NON_MODULE_FILES = {
  'src/billing/invoice.test.ts': 'x\n',
  'test/billing/invoice.ts': 'x\n',
  'docs/guide.md': 'x\n',
  'package-lock.json': '{}\n',
};

function repositories() {
  return {
    amplified: historyRepository(),
    amplifiedLater: historyRepository({ steps: [...amplifiedHistory(), ...together(3, 500)] }),
    lowSupport: historyRepository({
      steps: [...together(4), ...alone(18, 'src/ui/page.ts')],
    }),
    lowConfidence: historyRepository({
      steps: [
        ...together(5),
        ...repeated(10, (round) => ({
          files: edit(['src/billing/invoice.ts', 'src/ui/page.ts'], round + 100),
        })),
        ...alone(10, 'src/billing/invoice.ts'),
        ...alone(10, 'src/invoicing/ledger.ts'),
      ],
    }),
    largeCommits: historyRepository({
      steps: [
        ...repeated(8, (round) => ({
          files: {
            ...edit(BOTH, round + 1),
            ...Object.fromEntries(
              repeated(30, (index) => [`docs/page-${String(index)}.md`, `${String(round)}\n`]),
            ),
          },
        })),
        ...alone(14, 'src/ui/page.ts'),
      ],
    }),
    renamed: historyRepository({
      steps: [
        ...together(6),
        { renames: [['src/billing/invoice.ts', 'src/accounts/invoice.ts']] },
        ...alone(14, 'src/ui/page.ts'),
      ],
    }),
    nonModules: historyRepository({
      files: { ...SOURCE_FILES, ...NON_MODULE_FILES },
      steps: [
        ...repeated(10, (round) => ({
          files: edit(['src/billing/invoice.ts', ...Object.keys(NON_MODULE_FILES)], round + 1),
        })),
        ...alone(12, 'src/ui/page.ts'),
      ],
    }),
    oneFolder: historyRepository({
      files: { 'src/billing/a.ts': 'x\n', 'src/billing/b.ts': 'x\n', 'src/ui/page.ts': 'x\n' },
      steps: [
        ...repeated(10, (round) => ({
          files: edit(['src/billing/a.ts', 'src/billing/b.ts'], round + 1),
        })),
        ...alone(12, 'src/ui/page.ts'),
      ],
    }),
    features: historyRepository({
      files: {
        'src/features/billing/model/invoice.ts': 'x\n',
        'src/features/billing/ui/view.ts': 'x\n',
        'src/features/invoicing/ledger.ts': 'x\n',
        'src/ui/page.ts': 'x\n',
      },
      steps: [
        ...repeated(10, (round) => ({
          files: edit(
            ['src/features/billing/model/invoice.ts', 'src/features/invoicing/ledger.ts'],
            round + 1,
          ),
        })),
        ...alone(12, 'src/ui/page.ts'),
      ],
    }),
    inFolder: historyRepository({
      files: { ...inApp(SOURCE_FILES), 'other/lib/x.ts': 'x\n', 'other/lib/y.ts': 'x\n' },
      steps: [
        ...amplifiedHistory().map(({ files }) => ({ files: inApp(files) })),
        ...repeated(5, (round) => ({ files: edit(['other/lib/x.ts', 'other/lib/y.ts'], round) })),
      ],
    }),
    young: historyRepository({ steps: together(5) }),
    window: historyRepository({ steps: [...together(5), ...alone(15, 'src/ui/page.ts')] }),
  };
}

beforeAll(() => {
  Object.assign(roots, repositories());
  roots.shallow = temporaryRoot('nitpicker-shallow-check-');
  fixtureGit(roots.shallow, ['clone', '-q', '--depth', '10', `file://${roots.amplified}`, '.']);
  roots.windowBase = fixtureGit(roots.window, ['rev-parse', 'HEAD']).trim();
  importHistory(roots.window, alone(1, 'src/shipping/route.ts'));
});

describe('co-change findings', () => {
  it('reports two modules that keep changing together, with the evidence and a way out', () => {
    const root = roots.amplified;
    const examples = ['change 7', 'change 6', 'change 5'].map((message) =>
      shortShaOf(root, message),
    );

    expect(findings(root)).toEqual([
      {
        tool: 'change-history',
        rule: 'co-change',
        path: 'src/billing',
        identity: 'src/billing|src/invoicing',
        classification: 'descriptive',
        message: [
          'src/billing and src/invoicing changed together in 8 of 22 sampled commits',
          `(100% of the 8 that changed src/invoicing; for example ${examples.join(', ')}).`,
          'This is correlation, not proof of coupling: if they share knowledge (a format, a constant, a schema) give it one owner, and if they only ever change as one unit, merge them.',
          'If this is intended, add {"rule":"co-change","paths":["src/billing/**"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        ].join(' '),
      },
    ]);
  });

  it.each([
    ['without a history key', {}],
    [
      'with co-change switched off, thresholds and all',
      { history: { coChange: false, commits: 50 } },
    ],
  ])('reports nothing %s', (_, policy) => {
    expect(findings(roots.amplified, policy)).toEqual([]);
  });

  it('keeps the identity free of counts, so more evidence never makes a finding new', () => {
    const [before] = findings(roots.amplified);
    const [after] = findings(roots.amplifiedLater);

    expect([after.path, after.identity, after.message === before.message]).toEqual([
      before.path,
      before.identity,
      false,
    ]);
  });

  it.each([
    ['the default minimum support', ENABLED, []],
    [
      'a lower minimum support',
      { history: { coChange: true, minSupport: 4 } },
      ['src/billing|src/invoicing'],
    ],
  ])('needs %s', (_, policy, expected) => {
    expect(identities(roots.lowSupport, policy)).toEqual(expected);
  });

  it.each([
    ['the default minimum confidence', ENABLED, ['src/billing|src/ui']],
    [
      'a lower minimum confidence',
      { history: { coChange: true, minConfidence: 0.3 } },
      ['src/billing|src/invoicing', 'src/billing|src/ui'],
    ],
  ])('needs %s: modules that often change alone are not amplified', (_, policy, expected) => {
    expect(identities(roots.lowConfidence, policy)).toEqual(expected);
  });

  it.each([
    ['the default file limit', ENABLED, []],
    [
      'a higher file limit',
      { history: { coChange: true, maxCommitFiles: 40 } },
      ['src/billing|src/invoicing'],
    ],
  ])('ignores commits over %s', (_, policy, expected) => {
    expect(identities(roots.largeCommits, policy)).toEqual(expected);
  });

  it('ignores commits that only rename files and follows a renamed folder', () => {
    expect(identities(roots.renamed)).toEqual(['src/accounts|src/invoicing']);
  });

  it('does not treat tests, docs or lockfiles as modules', () => {
    expect(findings(roots.nonModules)).toEqual([]);
  });

  it('keeps files of one folder in one module', () => {
    expect(findings(roots.oneFolder)).toEqual([]);
  });

  it.each([
    ['under the default feature root', ENABLED, ['src/features/billing|src/features/invoicing']],
    [
      'by folder when the feature root is elsewhere',
      { ...ENABLED, layout: { featureRoots: ['src/other'] } },
      ['src/features/billing/model|src/features/invoicing'],
    ],
  ])('names the module %s', (_, policy, expected) => {
    expect(identities(roots.features, policy)).toEqual(expected);
  });

  it('honours exclude', () => {
    expect(findings(roots.amplified, { ...ENABLED, exclude: ['src/invoicing/**'] })).toEqual([]);
  });

  it.each([['src/billing/**'], ['src/invoicing/**']])(
    'lifts the finding with a %s exception',
    (glob) => {
      const policy = {
        ...ENABLED,
        exceptions: [{ rule: 'co-change', paths: [glob], reason: 'one release' }],
      };

      expect(findings(roots.amplified, policy)).toEqual([]);
    },
  );

  it('keeps the finding when the exception names another module', () => {
    const policy = {
      ...ENABLED,
      exceptions: [{ rule: 'co-change', paths: ['src/ui/**'], reason: 'other' }],
    };

    expect(identities(roots.amplified, policy)).toEqual(['src/billing|src/invoicing']);
  });

  it.each([
    ['a shallow clone', 'shallow'],
    ['a young repository', 'young'],
  ])('reports nothing, and does not fail, in %s', (_, name) => {
    expect(findings(roots[name])).toEqual([]);
  });

  it('reports nothing outside a repository', () => {
    expect(findings(temporaryRoot('nitpicker-no-repository-check-'))).toEqual([]);
  });

  it('analyses a project that lives in a folder of a larger repository', () => {
    expect(identities(path.join(roots.inFolder, 'app'))).toEqual(['src/billing|src/invoicing']);
  });

  it('reads the history that ends at the compared base, so a later commit cannot push a pair out', () => {
    const policy = { history: { coChange: true, commits: 20 } };

    expect({
      atBase: identities(roots.window, policy, roots.windowBase),
      atHead: identities(roots.window, policy),
    }).toEqual({ atBase: ['src/billing|src/invoicing'], atHead: [] });
  });
});
