import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../core/command/test-support/accepted-digest.mjs';
import {
  GREETER_HI,
  GREETER_HI_TEST,
  HIDDEN_ERROR,
  LEGACY_MOVED,
  NOISY_TEST,
  ONE_WAY_VIOLATIONS,
  RUNTIME_TEST,
  TYPE_ERROR,
  VIOLATION,
  WEAKENED_MYPY,
  WEAKENED_PYRIGHT,
} from './test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  policyChangesOf,
  pythonE2eEnabled,
  removeRepositories,
  summarize,
} from './test-support/python-e2e-support.mjs';
import { helpUriProblems } from '../../../../shared/reference/test-support/help-uris.mjs';

const enforceable = (result) =>
  summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );

const EXCEPTING_CONFIG = JSON.stringify({
  preset: 'python',
  disable: ['mutation'],
  python: {
    exceptions: [
      { rule: 'PTH118', paths: ['src/demo/rules.py'], reason: 'fixture' },
      { rule: 'frozen-dataclass', paths: ['src/demo/*.py'], reason: 'fixture' },
      { rule: 'no-inline-suppression', paths: ['src/**'], reason: 'fixture' },
    ],
  },
});

const EXCEPTION_LOOSENINGS = [
  'analyzer disabled: mutation',
  'exception added: frozen-dataclass for src/demo/*.py (fixture)',
  'exception added: no-inline-suppression for src/** (fixture)',
  'python.exceptions for PTH118 hide code this change adds or moves where the base config checked it: src/demo/rules.py',
  'python.exceptions for frozen-dataclass hide code this change adds or moves where the base config checked it: src/demo/rules.py',
  'python.exceptions for no-inline-suppression hide code this change adds or moves where the base config checked it: src/demo/rules.py',
];

function sourcePython(root) {
  return readdirSync(path.join(root, 'src'), { recursive: true })
    .filter((file) => file.endsWith('.py') && !file.includes('__pycache__'))
    .map((file) => `src/${file}`);
}

const TEST_RUN_CONFIG = {
  preset: 'python',
  disable: ['mutation'],
  thresholds: { unitTestSeconds: 0.2 },
};

const LIFTED_CONFIG = JSON.stringify({
  ...TEST_RUN_CONFIG,
  testConsole: { allow: [{ contains: 'cache is cold', reason: 'fixture' }] },
  exceptions: [
    { rule: 'test-console-output', paths: ['tests/test_noisy.py'], reason: 'f' },
    { rule: 'slow-test', paths: ['tests/**'], reason: 'fixture' },
  ],
  python: { exceptions: [{ rule: 'sleep-in-test', paths: ['tests/**'], reason: 'fixture' }] },
});

const LIFTED_LOOSENINGS = [
  'analyzer disabled: mutation',
  'exception added: sleep-in-test for tests/** (fixture)',
  'exception added: slow-test for tests/** (fixture)',
  'exceptions for slow-test hide code this change adds or moves where the base config checked it: tests/test_noisy.py, tests/test_runtime.py',
  'exceptions for test-console-output hide code this change adds or moves where the base config checked it: tests/test_noisy.py',
  'python.exceptions for sleep-in-test hide code this change adds or moves where the base config checked it: tests/test_noisy.py, tests/test_runtime.py',
];

const withoutMutants = (summaries) => summaries.filter((summary) => !summary.startsWith('mutmut '));

describe.skipIf(!pythonE2eEnabled)('Python preset lint, type and rule gates end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(['coverage', 'mutmut', 'pytest', 'mypy']);
    commitBranch(project, 'clean', {
      'src/demo/greeter.py': GREETER_HI,
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(project, 'moved', { 'src/demo/legacy.py': LEGACY_MOVED });
    commitBranch(project, 'violation', { 'src/demo/bad.py': VIOLATION });
    commitBranch(project, 'type-error', { 'src/demo/typed.py': TYPE_ERROR });
    commitBranch(project, 'one-way', { 'src/demo/rules.py': ONE_WAY_VIOLATIONS });
    commitBranch(project, 'excepted', {
      'src/demo/rules.py': ONE_WAY_VIOLATIONS,
      'nitpicker.config.json': EXCEPTING_CONFIG,
    });
    commitBranch(project, 'pyright', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyrightconfig.json': '{}\n',
    });
    commitBranch(project, 'weakened-mypy', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': WEAKENED_MYPY,
    });
    commitBranch(project, 'weakened-pyright', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyrightconfig.json': `${WEAKENED_PYRIGHT}\n`,
    });
    commitBranch(project, 'hidden-from-types', { 'src/demo/hidden.py': HIDDEN_ERROR });
    const testRun = TEST_RUN_CONFIG;
    const testFiles = { 'tests/test_runtime.py': RUNTIME_TEST, 'tests/test_noisy.py': NOISY_TEST };
    commitBranch(project, 'test-run', {
      ...testFiles,
      'nitpicker.config.json': JSON.stringify(testRun),
    });
    commitBranch(project, 'test-run-lifted', {
      ...testFiles,
      'nitpicker.config.json': LIFTED_CONFIG,
    });
  });
  afterAll(removeRepositories);
  it('passes a change that alters behaviour: base tests run against base code, not the editable head install', () => {
    const result = gate(project, 'clean');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').overallStatus).toBe('completed');
    const [python, mutation] = result.json('summary.json').tools;
    expect(python.version).toMatch(
      /^ruff@[\d.]+;mypy@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(mutation.version).toMatch(/^mutmut@3\.[\d.]+;pytest@[\d.]+;pytest-django@missing$/);
    expect(python.unchanged).toBeGreaterThan(0);
  });
  it('keeps the legacy violation baselined when its line moves', () => {
    const result = gate(project, 'moved');

    expect(result.exitCode, result.text).toBe(0);
    expect(
      summarize(result.json('new-findings.json').filter(({ tool }) => tool !== 'coverage')),
    ).toEqual([]);
  });
  it('fails a new lint violation and a new unformatted file in every report format', () => {
    const result = gate(project, 'violation');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      summarize(
        result
          .json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable'),
      ),
    ).toEqual([
      'mutmut mutant-nocoverage bad.py',
      'mypy no-untyped-def bad.py',
      'ruff F401 bad.py',
      'ruff-format format bad.py',
    ]);
    expect(helpUriProblems(result.json('new-findings.json'))).toEqual([]);
    const sarif = JSON.parse(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8'));
    expect(sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      'coupling/module-coupling',
      'coupling/module-coupling',
      'coupling/module-coupling',
      'coverage/line-coverage',
      'coverage/uncovered-function',
      'mutmut/mutant-nocoverage',
      'mypy/no-untyped-def',
      'ruff/F401',
      'ruff-format/format',
    ]);
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toMatch(/F401/);
    expect(result.text).toMatch(/ruff\/F401: [^\n]*\n {4}src\/demo\/bad\.py:1:8\n/);
  });
  it('fails a new type error found by mypy, strict by default, and keeps the legacy ones baselined', () => {
    const result = gate(project, 'type-error');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['mypy return-value typed.py']);
    expect(result.text).toMatch(/Fix the type; inline ignores are banned/);
  });
  it('fails the one-way rules, each message naming the allowed form', () => {
    const result = gate(project, 'one-way');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual([
      'python-rules frozen-dataclass rules.py',
      'python-rules no-inline-suppression rules.py',
      'ruff PTH118 rules.py',
    ]);
    expect(result.text).toMatch(/Declare records as `@dataclass\(frozen=True\)`/);
    expect(result.text).toMatch(/Use `pathlib\.Path`/);
    expect(result.text).toMatch(/Remove the comment and fix the code/);
    expect(result.text).toMatch(
      /add \{"rule":"PTH118","paths":\["src\/demo\/rules\.py"\],"reason":"..."\} to "python\.exceptions" in nitpicker\.config\.json\./,
    );
  });
  it('fails the exceptions that hide checked code until a person accepts exactly those loosenings', () => {
    const result = gate(project, 'excepted');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, identity }) => ({ tool, rule, identity }))
        .sort((left, right) => left.identity.localeCompare(right.identity)),
    ).toEqual(
      EXCEPTION_LOOSENINGS.toSorted((left, right) => left.localeCompare(right)).map((identity) => ({
        tool: 'nitpicker-config',
        rule: 'policy-loosened',
        identity,
      })),
    );
  });
  it('passes the same code when exceptions lift its rules', () => {
    gate(project, 'excepted');
    const digest = acceptedDigest(EXCEPTION_LOOSENINGS, {
      'nitpicker.config.json': EXCEPTING_CONFIG,
      ...Object.fromEntries(
        sourcePython(project).map((file) => [file, readFileSync(path.join(project, file), 'utf8')]),
      ),
    });
    const result = gate(project, 'excepted', {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: digest },
    });

    expect(result.exitCode, result.text).toBe(0);
    expect(withoutMutants(enforceable(result))).toEqual([]);
    expect(result.json('summary.json').configOverrides).toEqual([
      'preset: "python"',
      'disable: ["mutation"]',
      'exception: {"rule":"PTH118","paths":["src/demo/rules.py"],"reason":"fixture"}',
      'exception: {"rule":"frozen-dataclass","paths":["src/demo/*.py"],"reason":"fixture"}',
      'exception: {"rule":"no-inline-suppression","paths":["src/**"],"reason":"fixture"}',
    ]);
  });
  it('runs pyright when the project has a pyright config, in its strict mode', () => {
    const result = gate(project, 'pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;pyright@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(withoutMutants(enforceable(result))).toEqual(['pyright reportReturnType typed.py']);
  });
  it('keeps checking when the project config switches mypy off for the file', () => {
    const result = gate(project, 'weakened-mypy');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['mypy return-value typed.py']);
  });
  it('keeps checking when the project config ignores or excludes the file in pyright', () => {
    const result = gate(project, 'weakened-pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['pyright reportReturnType typed.py']);
  });
  it('fails code hidden from the checkers with @no_type_check', () => {
    const result = gate(project, 'hidden-from-types');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['python-rules no-type-check hidden.py']);
    expect(result.text).toMatch(/Remove the decorator and annotate the code/);
  });
  it('fails a new slow test and new test output', () => {
    const mutationOff = acceptedDigest(['analyzer disabled: mutation'], {
      'nitpicker.config.json': JSON.stringify(TEST_RUN_CONFIG),
    });
    const result = gate(project, 'test-run', {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: mutationOff },
    });

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([
      'python-rules sleep-in-test test_runtime.py',
      'test-console test-console-output test_noisy.py',
      'test-console test-console-output test_runtime.py',
      'test-runtime slow-test test_runtime.py',
    ]);
    const messages = Object.fromEntries(
      result
        .json('new-findings.json')
        .filter(({ path: file }) => file === 'tests/test_runtime.py')
        .map(({ rule, message }) => [rule, message.replace(/took 0\.\d+ s/, 'took <s> s')]),
    );
    expect(messages['test-console-output']).toBe(
      'Tests print new console output: "WARNING demo: cache is cold for key <n>" (test "test_value_is_cached"). Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. If this is intended, add {"rule":"test-console-output","paths":["tests/test_runtime.py"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(messages['slow-test']).toBe(
      'test_value_is_cached took <s> s; a unit test may take 0.2 s. Remove time.sleep and other waits (patch the clock) and fake network, database and disk access, or move it to an integration test (an integration or e2e folder, or an integration or e2e marker registered in the pytest config) if it is one. If this is intended, add {"rule":"slow-test","paths":["tests/test_runtime.py"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });
  it('passes a new slow test and new test output once they are lifted', () => {
    const { policyLoosenings, policyDigest } = policyChangesOf(project, 'test-run-lifted');
    expect(policyLoosenings.toSorted()).toEqual(LIFTED_LOOSENINGS);
    const lifted = gate(project, 'test-run-lifted', {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: policyDigest },
    });
    expect(lifted.exitCode, lifted.text).toBe(0);
    expect(enforceable(lifted)).toEqual([]);
  });
  it('reports line coverage as a descriptive finding', () => {
    const result = gate(project, 'violation');

    expect(result.json('new-findings.json').filter(({ tool }) => tool === 'coverage')).toEqual([
      {
        tool: 'coverage',
        rule: 'line-coverage',
        path: 'src/demo/bad.py',
        identity: 'line-coverage',
        message: 'line-coverage 0% (0/3)',
        classification: 'descriptive',
        metric: { name: 'line-coverage', value: 0 },
      },
      {
        tool: 'coverage',
        rule: 'uncovered-function',
        path: 'src/demo/bad.py',
        identity: expect.any(String),
        message: 'Function f is not covered',
        classification: 'descriptive',
        symbol: 'f',
      },
    ]);
  });
});
