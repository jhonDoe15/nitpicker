import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PICK_SOURCE, createRunnerProjects, runArea } from './test-support/runner-project.mts';

const projects = createRunnerProjects();
const markers: string[] = [];

afterEach(() => {
  projects.remove();
  for (const marker of markers.splice(0)) rmSync(marker, { recursive: true, force: true });
});

const SHARED_SPY = [
  "import { beforeAll, expect, it, vi } from 'vitest';",
  "import { pick } from '../src/main/pick.ts';",
  'const log = { warn: (text: string) => text };',
  'let spy: ReturnType<typeof vi.spyOn>;',
  "beforeAll(() => { spy = vi.spyOn(log, 'warn'); });",
  "it('calls the spy', () => { log.warn(pick(true)); expect(spy).toHaveBeenCalledTimes(1); });",
  "it('still sees the spy call', () => { expect(spy).toHaveBeenCalledTimes(1); });",
  '',
].join('\n');

const BROKEN = [
  "import { expect, it } from 'vitest';",
  "import { pick } from '../src/main/pick.ts';",
  "it('picks wrongly', () => { expect(pick(true)).toBe('no'); });",
  '',
].join('\n');

const SPY_FAILURE = 'AssertionError: expected "warn" to be called 1 times, but got 0 times';

function pinnedMessage(setting: string, failures: readonly string[]): string {
  return [
    `2 tests fail only because nitpicker pins ${setting} for the coverage run; the same tests pass without it,`,
    ' so coverage, CRAP and mutation were skipped. Create the spy in `beforeEach` or inside the test instead of',
    ' once in `beforeAll` or a `describe` body, and rerun:\n',
    failures.join('\n'),
  ].join('');
}

const FLAKY_ENTRY = (file: string): string =>
  `  ${file}:7 > fails only the first time: AssertionError: expected false to be true // Object.is equality`;

function flakyTest(): string {
  const markerDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-flaky-'));
  markers.push(markerDirectory);
  return [
    "import { existsSync, writeFileSync } from 'node:fs';",
    "import { expect, it } from 'vitest';",
    `const marker = ${JSON.stringify(path.join(markerDirectory, 'seen'))};`,
    "it('fails only the first time', () => {",
    '  const seen = existsSync(marker);',
    "  writeFileSync(marker, 'x');",
    '  expect(seen).toBe(true);',
    '});',
    '',
  ].join('\n');
}

function vitestProject(testText: string) {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: 'vitest' } },
    'src/main/pick.ts': PICK_SOURCE,
    'test/pick.test.ts': testText,
  });
}

describe('a Vitest test that relies on a spy created once', () => {
  it('names the restoreMocks pin and the fix when the test passes without it', async () => {
    const [finding] = await runArea('coverage', vitestProject(SHARED_SPY));

    expect(finding?.rule).toBe('tests-failed');
    expect(finding?.message).toBe(
      pinnedMessage('`restoreMocks: true`', [
        `  test/pick.test.ts:6 > calls the spy: ${SPY_FAILURE}`,
        `  test/pick.test.ts:7 > still sees the spy call: ${SPY_FAILURE}`,
      ]),
    );
  });

  it('keeps the plain failure message for a test that also fails without the pin', async () => {
    const [finding] = await runArea('coverage', vitestProject(BROKEN));

    expect(finding?.message).toBe(
      [
        '1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
        "  test/pick.test.ts:3 > picks wrongly: AssertionError: expected 'yes' to be 'no' // Object.is equality",
      ].join('\n'),
    );
  });

  it('names a test that fails once and passes when rerun with the pin as load-sensitive', async () => {
    const [finding] = await runArea('coverage', vitestProject(flakyTest()));

    expect(finding?.message).toBe(
      [
        '1 test failed in the first run and passed when rerun, so it looks load-sensitive or flaky; ' +
          'coverage, CRAP and mutation were skipped. Make the assertions independent of timing and machine ' +
          'load, and rerun:',
        FLAKY_ENTRY('test/pick.test.ts'),
      ].join('\n'),
    );
  });

  it('blames the pin only for the test that fails under it, and names the other as load-sensitive', async () => {
    const root = projects.project({
      'package.json': { name: 'p', type: 'module', scripts: { test: 'vitest' } },
      'src/main/pick.ts': PICK_SOURCE,
      'test/pick.test.ts': SHARED_SPY,
      'test/timing.test.ts': flakyTest(),
    });

    const [finding] = await runArea('coverage', root);

    expect(finding?.message).toBe(
      [
        pinnedMessage('`restoreMocks: true`', [
          `  test/pick.test.ts:6 > calls the spy: ${SPY_FAILURE}`,
          `  test/pick.test.ts:7 > still sees the spy call: ${SPY_FAILURE}`,
        ]),
        '1 more test failed in the first run and passed when rerun, so it looks load-sensitive or flaky. ' +
          'Make the assertions independent of timing and machine load, and rerun:',
        FLAKY_ENTRY('test/timing.test.ts'),
      ].join('\n'),
    );
  });
});

describe('a Jest test that relies on a spy created once', () => {
  it('names the --restoreMocks pin when the test passes without it', async () => {
    const root = projects.project({
      'package.json': {
        name: 'p',
        private: true,
        scripts: { test: 'jest' },
        jest: { testEnvironment: 'node' },
      },
      'src/main/pick.js': "exports.pick = (flag) => (flag ? 'yes' : 'no');\n",
      'test/pick.test.js': [
        "const { pick } = require('../src/main/pick');",
        'const log = { warn: (text) => text };',
        'let spy;',
        "beforeAll(() => { spy = jest.spyOn(log, 'warn'); });",
        "it('calls the spy', () => { log.warn(pick(true)); expect(spy).toHaveBeenCalledTimes(1); });",
        "it('still sees the spy call', () => { expect(spy).toHaveBeenCalledTimes(1); });",
        '',
      ].join('\n'),
    });

    const [finding] = await runArea('coverage', root);

    expect(finding?.message).toBe(
      pinnedMessage('`--restoreMocks`', [
        '  test/pick.test.js:5 > calls the spy: Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)',
        '  test/pick.test.js:6 > still sees the spy call: Error: expect(jest.fn()).toHaveBeenCalledTimes(expected)',
      ]),
    );
  });
});
