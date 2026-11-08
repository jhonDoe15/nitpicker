import { afterEach, describe, expect, it } from 'vitest';
import { PICK_SOURCE, runArea, createRunnerProjects } from './test-support/runner-project.mjs';

const projects = createRunnerProjects();

const ASSERTIONS = {
  vitest: "import { expect, it } from 'vitest';\n",
  jest: '',
  mocha: "import assert from 'node:assert/strict';\n",
  'node --test': "import { it } from 'node:test';\nimport assert from 'node:assert/strict';\n",
};

function failingProject(runner) {
  const usesExpect = runner === 'vitest' || runner === 'jest';
  const check = usesExpect
    ? "  expect({ kind: pick(true) }).toEqual({ kind: 'no' });"
    : "  assert.deepEqual({ kind: pick(true) }, { kind: 'no' });";
  const jest = runner === 'jest' ? { jest: { preset: 'ts-jest', testEnvironment: 'node' } } : {};
  return projects.project({
    'package.json': {
      name: 'p',
      private: true,
      type: 'module',
      scripts: { test: runner },
      ...jest,
    },
    'tsconfig.json': { compilerOptions: { strict: true, types: ['jest', 'node'] } },
    'src/main/pick.ts': PICK_SOURCE,
    'test/pick.test.ts': [
      ASSERTIONS[runner],
      `import { pick } from '../src/main/pick${runner === 'jest' ? '' : '.ts'}';`,
      "it('picks', () => {",
      check,
      '});',
      '',
    ].join('\n'),
  });
}

afterEach(() => {
  projects.remove();
});

const EXPECTED_LINES = {
  vitest: [
    "  test/pick.test.ts:5 > picks: AssertionError: expected { kind: 'yes' } to deeply equal { kind: 'no' }",
    '    expected: { "kind": "no", }',
    '    received: { "kind": "yes", }',
  ],
  jest: [
    '  test/pick.test.ts:4 > picks: Error: expect(received).toEqual(expected) // deep equality',
    "    expected: { kind: 'no' }",
    "    received: { kind: 'yes' }",
  ],
  mocha: [
    '  test/pick.test.ts:5 > picks: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:',
    '    expected: { "kind": "no" }',
    '    received: { "kind": "yes" }',
  ],
  'node --test': [
    '  test/pick.test.ts:6 > picks: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:',
    "    expected: { kind: 'no' }",
    "    received: { kind: 'yes' }",
  ],
};

describe('a failing equality assertion', () => {
  it.each(Object.keys(ASSERTIONS))(
    'names the line of the assertion, expected and received with %s',
    async (runner) => {
      const findings = await runArea('coverage', failingProject(runner));

      expect(findings.map(({ rule, message }) => [rule, message.split('\n')])).toEqual([
        [
          'tests-failed',
          [
            '1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
            ...EXPECTED_LINES[runner],
          ],
        ],
      ]);
    },
  );
});

describe('vitest tests that share a name', () => {
  it('give each failing test its own values', async () => {
    const project = projects.project({
      'package.json': { name: 'p', private: true, type: 'module', scripts: { test: 'vitest' } },
      'tsconfig.json': { compilerOptions: { strict: true, types: ['node'] } },
      'src/main/pick.ts': PICK_SOURCE,
      'test/pick.test.ts': [
        "import { expect, it } from 'vitest';",
        "import { pick } from '../src/main/pick.ts';",
        "it('picks', () => {",
        "  throw new Error('boom');",
        '});',
        "it('picks', () => {",
        "  expect({ kind: pick(true) }).toEqual({ kind: 'no' });",
        '});',
        '',
      ].join('\n'),
    });

    const [{ message }] = await runArea('coverage', project);

    expect(message.split('\n')).toEqual([
      '2 tests fail; coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
      '  test/pick.test.ts:4 > picks: Error: boom',
      ...EXPECTED_LINES.vitest.map((line) => line.replace(':5 >', ':7 >')),
    ]);
  });
});
