import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { runHistoryCheck } from '../runner.mjs';
import {
  amplifiedHistory,
  commitSteps,
  edit,
  repeated,
  shortShaOf,
  SOURCE_FILES,
} from '../../../core/diff/git/test-support/history-repository.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const ENABLED = { history: { coChange: true } };

function findings(root, policy = ENABLED) {
  return runHistoryCheck({ check: 'change-history', projectRoot: root, policy });
}

function repositoryWith(steps, files = SOURCE_FILES) {
  const { root } = createGitRepository(files);
  commitSteps(root, steps);
  return root;
}

describe('co-change findings', () => {
  it('reports two modules that keep changing together, with the evidence and a way out', () => {
    const root = repositoryWith(amplifiedHistory());
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
          'src/billing and src/invoicing changed together in 8 commits:',
          '100% of the 8 commits that changed src/invoicing',
          `(22 commits sampled; for example ${examples.join(', ')}).`,
          'Nitpicker does not read imports for this check, so it does not know whether either imports the other.',
          'Co-change is correlation: feature work, migrations and coordinated releases change modules together on purpose.',
          'If src/invoicing reaches into the internals of src/billing, put what it needs behind one smaller interface that src/billing owns.',
          'If neither imports the other, they share knowledge (a format, a constant, a schema) that needs one owner.',
          'If they only ever change as one unit, merge them into one module.',
          'If this is intended, add {"rule":"co-change","paths":["src/billing/**"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        ].join(' '),
      },
    ]);
  });

  it('reports nothing unless the project opts in', () => {
    const root = repositoryWith(amplifiedHistory());

    expect(findings(root, {})).toEqual([]);
    expect(findings(root, { history: { coChange: false } })).toEqual([]);
  });

  it('keeps the identity free of counts, so more evidence never makes a finding new', () => {
    const root = repositoryWith(amplifiedHistory());
    const before = findings(root)[0];
    commitSteps(
      root,
      repeated(3, (round) => ({
        files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 500),
      })),
    );
    const after = findings(root)[0];

    expect([after.path, after.identity]).toEqual([before.path, before.identity]);
    expect(after.message).not.toBe(before.message);
  });

  it('needs the minimum support, and a lower one is a setting', () => {
    const root = repositoryWith([
      ...repeated(4, (round) => ({
        files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 1),
      })),
      ...repeated(18, (round) => ({ files: edit(['src/ui/page.ts'], round + 100) })),
    ]);

    expect(findings(root)).toEqual([]);
    expect(findings(root, { history: { coChange: true, minSupport: 4 } })).toHaveLength(1);
  });

  it('needs the minimum confidence: modules that often change alone are not amplified', () => {
    const root = repositoryWith([
      ...repeated(5, (round) => ({
        files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 1),
      })),
      ...repeated(10, (round) => ({
        files: edit(['src/billing/invoice.ts', 'src/ui/page.ts'], round + 100),
      })),
      ...repeated(10, (round) => ({ files: edit(['src/billing/invoice.ts'], round + 200) })),
      ...repeated(10, (round) => ({ files: edit(['src/invoicing/ledger.ts'], round + 300) })),
    ]);

    expect(findings(root).map(({ identity }) => identity)).toEqual(['src/billing|src/ui']);
    expect(findings(root, { history: { coChange: true, minConfidence: 0.3 } })).toHaveLength(2);
  });

  it('ignores commits that touch more than the file limit, and a lower limit is a setting', () => {
    const root = repositoryWith([
      ...repeated(8, (round) => ({
        files: {
          ...edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 1),
          ...Object.fromEntries(
            Array.from({ length: 30 }, (_, index) => [
              `docs/page-${String(index)}.md`,
              `round ${String(round)}\n`,
            ]),
          ),
        },
      })),
      ...repeated(14, (round) => ({ files: edit(['src/ui/page.ts'], round + 100) })),
    ]);

    expect(findings(root)).toEqual([]);
    expect(findings(root, { history: { coChange: true, maxCommitFiles: 40 } })).toHaveLength(1);
  });

  it('ignores commits that only rename files and follows a renamed folder', () => {
    const root = repositoryWith([
      ...repeated(6, (round) => ({
        files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 1),
      })),
      { renames: [['src/billing/invoice.ts', 'src/accounts/invoice.ts']] },
      ...repeated(14, (round) => ({ files: edit(['src/ui/page.ts'], round + 100) })),
    ]);

    expect(findings(root).map(({ identity }) => identity)).toEqual(['src/accounts|src/invoicing']);
  });

  it('does not treat tests, fixtures, generated code, docs or lockfiles as modules', () => {
    const files = {
      ...SOURCE_FILES,
      'src/billing/invoice.test.ts': 'x\n',
      'test/billing/invoice.ts': 'x\n',
      'src/gen/client.ts': '// Code generated by a tool. DO NOT EDIT.\nexport const value = 0;\n',
      'docs/guide.md': 'x\n',
      'package-lock.json': '{}\n',
    };
    const root = repositoryWith(
      repeated(10, (round) => ({
        files: {
          ...edit(
            ['src/billing/invoice.ts', 'src/billing/invoice.test.ts', 'test/billing/invoice.ts'],
            round + 1,
          ),
          ...edit(['docs/guide.md', 'package-lock.json'], round + 1),
          'src/gen/client.ts': `// Code generated by a tool. DO NOT EDIT.\nexport const value = ${String(round)};\n`,
        },
      })).concat(repeated(12, (round) => ({ files: edit(['src/ui/page.ts'], round + 100) }))),
      files,
    );

    expect(findings(root)).toEqual([]);
  });

  it('keeps files of one folder in one module', () => {
    const files = { 'src/billing/a.ts': 'x\n', 'src/billing/b.ts': 'x\n', 'src/ui/page.ts': 'x\n' };
    const root = repositoryWith(
      repeated(10, (round) => ({
        files: edit(['src/billing/a.ts', 'src/billing/b.ts'], round + 1),
      })).concat(repeated(12, (round) => ({ files: edit(['src/ui/page.ts'], round + 100) }))),
      files,
    );

    expect(findings(root)).toEqual([]);
  });

  it('uses the feature folder as the module under a feature root', () => {
    const files = {
      'src/features/billing/model/invoice.ts': 'x\n',
      'src/features/billing/ui/view.ts': 'x\n',
      'src/features/invoicing/ledger.ts': 'x\n',
      'src/ui/page.ts': 'x\n',
    };
    const root = repositoryWith(
      repeated(10, (round) => ({
        files: edit(
          ['src/features/billing/model/invoice.ts', 'src/features/invoicing/ledger.ts'],
          round + 1,
        ),
      })).concat(repeated(12, (round) => ({ files: edit(['src/ui/page.ts'], round + 100) }))),
      files,
    );

    expect(findings(root).map(({ identity }) => identity)).toEqual([
      'src/features/billing|src/features/invoicing',
    ]);
    expect(
      findings(root, { ...ENABLED, layout: { featureRoots: ['src/other'] } }).map(
        ({ identity }) => identity,
      ),
    ).toEqual(['src/features/billing/model|src/features/invoicing']);
  });

  it('honours exclude and lifts a finding with an exception on either module', () => {
    const root = repositoryWith(amplifiedHistory());

    expect(findings(root, { ...ENABLED, exclude: ['src/invoicing/**'] })).toEqual([]);
    for (const paths of [['src/billing/**'], ['src/invoicing/**'], ['src/invoicing']]) {
      expect(
        findings(root, {
          ...ENABLED,
          exceptions: [{ rule: 'co-change', paths, reason: 'one release' }],
        }),
      ).toEqual([]);
    }
    expect(
      findings(root, {
        ...ENABLED,
        exceptions: [{ rule: 'co-change', paths: ['src/ui/**'], reason: 'other' }],
      }),
    ).toHaveLength(1);
  });

  it('reports nothing, and does not fail, without usable history', () => {
    const source = repositoryWith(amplifiedHistory());
    const clone = temporaryRoot('nitpicker-shallow-check-');
    fixtureGit(clone, ['clone', '-q', '--depth', '10', `file://${source}`, '.']);
    const young = repositoryWith(
      repeated(5, (round) => ({
        files: edit(['src/billing/invoice.ts', 'src/invoicing/ledger.ts'], round + 1),
      })),
    );

    expect(findings(clone)).toEqual([]);
    expect(findings(young)).toEqual([]);
    expect(findings(temporaryRoot('nitpicker-no-repository-check-'))).toEqual([]);
  });

  it('analyses a project that lives in a folder of a larger repository', () => {
    const inApp = (changed) =>
      Object.fromEntries(Object.entries(changed).map(([file, text]) => [`app/${file}`, text]));
    const { root } = createGitRepository({ ...inApp(SOURCE_FILES), 'other/lib/x.ts': 'x\n' });
    commitSteps(root, [
      ...amplifiedHistory().map(({ files }) => ({ files: inApp(files) })),
      ...repeated(5, (round) => ({ files: edit(['other/lib/x.ts', 'other/lib/y.ts'], round) })),
    ]);

    expect(findings(path.join(root, 'app')).map(({ identity }) => identity)).toEqual([
      'src/billing|src/invoicing',
    ]);
  });
});
