import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { changedTestLines, slowTestFindings } from './slow-tests.mjs';

const temporaryRoots = [];
const TEST_FILE = [
  "import { expect, it } from 'vitest';",
  "it('waits', async () => {",
  '  await wait(7000);',
  '  expect(done()).toBe(true);',
  '});',
  "it('also waits', async () => {",
  '  await wait(7000);',
  '});',
  '',
].join('\n');

const { createGitRepository } = useGitFixtures();

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-tests-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function report(projectRoot, file, durations) {
  return {
    testResults: [
      {
        name: path.join(projectRoot, file),
        assertionResults: durations.map(([fullName, duration, line]) => ({
          fullName,
          duration,
          location: { line, column: 1 },
        })),
      },
    ],
  };
}

function findings(file, durations, context = {}) {
  const projectRoot = projectWith({ [file]: TEST_FILE });
  return slowTestFindings(report(projectRoot, file, durations), {
    projectRoot,
    analyzerName: 'coverage',
    testRoots: ['test'],
    thresholds: {},
    exceptions: [],
    changedLines: new Map([[file, [[3, 3]]]]),
    ...context,
  });
}

const UNIT_MESSAGE =
  'This test took 7.2 s; the budget for a unit test is 5 s. Replace real waits with fake timers (`vi.useFakeTimers()`) and use smaller fixtures. If it really is an integration test, move it to an `integration/` or `e2e/` folder of a test root. If this is intended, add {"rule":"slow-test","paths":["test/a.test.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.';

describe('tests over their time budget', () => {
  it('fail when the change edited them, keyed by file and full test name', () => {
    expect(
      findings('test/a.test.ts', [
        ['waits', 7200, 2],
        ['also waits', 7200, 6],
      ]),
    ).toEqual([
      {
        tool: 'coverage',
        rule: 'slow-test',
        path: 'test/a.test.ts',
        identity: 'slow-test|test/a.test.ts|waits',
        message: UNIT_MESSAGE,
        allowedForm:
          'Replace real waits with fake timers (`vi.useFakeTimers()`) and use smaller fixtures. If it really is an integration test, move it to an `integration/` or `e2e/` folder of a test root.',
        classification: 'enforceable',
        location: { line: 2 },
      },
    ]);
  });

  it('stay baselined when the change did not touch them or their file', () => {
    const untouched = new Map([['test/a.test.ts', [[9, 9]]]]);

    expect(findings('test/a.test.ts', [['waits', 7200, 2]], { changedLines: untouched })).toEqual(
      [],
    );
    expect(findings('test/a.test.ts', [['waits', 7200, 2]], { changedLines: new Map() })).toEqual(
      [],
    );
  });

  it('get 30 s in an integration or e2e folder or root, and the thresholds change both budgets', () => {
    const integration = findings(
      'test/integration/a.test.ts',
      [
        ['waits', 12_000, 2],
        ['also waits', 31_000, 6],
      ],
      { changedLines: undefined },
    );

    expect(integration.map(({ message }) => message)).toEqual([
      'This test took 31.0 s; the budget for an integration or e2e test is 30 s. Replace real waits with fake timers (`vi.useFakeTimers()`) and use smaller fixtures. If this is intended, add {"rule":"slow-test","paths":["test/integration/a.test.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    expect(
      findings('test/e2e/a.test.ts', [['waits', 31_000, 2]], {
        thresholds: { integrationTestSeconds: 40, unitTestSeconds: 2 },
      }),
    ).toEqual([]);
    expect(
      findings('e2e/a.test.ts', [['waits', 12_000, 2]], { testRoots: ['test', 'e2e'] }),
    ).toEqual([]);
    expect(
      findings('test/a.test.ts', [['waits', 3000, 2]], { thresholds: { unitTestSeconds: 2 } }).map(
        ({ identity }) => identity,
      ),
    ).toEqual(['slow-test|test/a.test.ts|waits']);
  });

  it('are lifted by an exception for slow-test', () => {
    const exceptions = [{ rule: 'slow-test', paths: ['test/a.test.ts'], reason: 'Real browser' }];

    expect(findings('test/a.test.ts', [['waits', 7200, 2]], { exceptions })).toEqual([]);
  });
});

describe('lines of the test files the change wrote', () => {
  it('are the added lines of each file against the base checkout, and none without a base', () => {
    const { root } = createGitRepository({ 'test/a.test.ts': TEST_FILE, 'package.json': '{}\n' });
    const baselineRoot = path.join(root, '.base-worktree');
    fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
    writeFileSync(
      path.join(root, 'test/a.test.ts'),
      TEST_FILE.replace('7000);\n  expect', '1);\n  expect'),
    );
    fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
    fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'head']);

    expect(changedTestLines({ baselineRoot, projectRoot: root })).toEqual(
      new Map([['test/a.test.ts', [[3, 3]]]]),
    );
    expect(changedTestLines({ projectRoot: root })).toBeUndefined();
  });
});
