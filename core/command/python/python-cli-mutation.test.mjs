import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { LEGACY_VIOLATION, usePythonFixtures } from './test-support/python-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { callsLog, pythonRepository, run } = usePythonFixtures(nitpickerCli);

const mutantFindings = (result) =>
  result.json('new-findings.json').filter(({ rule }) => rule !== 'mutation-summary');

describe('nitpicker with "preset": "python" and mutation testing', () => {
  const MUTATED_VALUE =
    'def x_value__mutmut_orig():\n    return 1\n\n\ndef x_value__mutmut_1():\n    return 2\n\n\ndef x_value__mutmut_2():\n    return 3\n';
  const mutants = (exitCodes) =>
    JSON.stringify({
      'src/demo/a.py': {
        exitCodes: Object.fromEntries(
          exitCodes.map((code, index) => [`demo.a.x_value__mutmut_${String(index + 1)}`, code]),
        ),
        mutated: MUTATED_VALUE,
      },
    });
  it('fails a new surviving mutant and reports it with the function and the change', () => {
    const root = pythonRepository({ 'mutants-data.json': mutants([1]) });
    writeFiles(root, { 'mutants-data.json': mutants([1, 0]) });
    commit(root, 'a mutant survives');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(mutantFindings(result)).toEqual([
      {
        tool: 'mutmut',
        rule: 'mutant-survived',
        path: 'src/demo/a.py',
        identity: 'value|1→3#1',
        message:
          'Survived number: replacing `1` with `3` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If this is intended, add {"rule":"mutant-survived","paths":["src/demo/a.py"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm:
          'Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
        exception: {
          rule: 'mutant-survived',
          paths: ['src/demo/a.py'],
          function: 'value',
          reason: '...',
        },
        exceptionList: 'exceptions',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 5 },
      },
    ]);
  });
  it('fails a new mutant that no test reaches', () => {
    const root = pythonRepository({ 'mutants-data.json': mutants([1]) });
    writeFiles(root, { 'mutants-data.json': mutants([1, 33]) });
    commit(root, 'a mutant is not covered');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(mutantFindings(result)).toEqual([
      {
        tool: 'mutmut',
        rule: 'mutant-nocoverage',
        path: 'src/demo/a.py',
        identity: 'value|1→3#1',
        message:
          'NoCoverage number: no test runs this code. Add a test that reaches it. If this is intended, add {"rule":"mutant-nocoverage","paths":["src/demo/a.py"],"function":"value","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Add a test that reaches it.',
        exception: {
          rule: 'mutant-nocoverage',
          paths: ['src/demo/a.py'],
          function: 'value',
          reason: '...',
        },
        exceptionList: 'exceptions',
        classification: 'enforceable',
        symbol: 'value',
        location: { line: 5 },
      },
    ]);
  });
  it('does not fail the survivor the base already had, even when its line moves', () => {
    const root = pythonRepository({ 'mutants-data.json': mutants([0]) });
    writeFiles(root, { 'src/demo/a.py': 'import os\n\n\n\ndef value():\n    return 1\n' });
    commit(root, 'move the function');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(mutantFindings(result)).toEqual([]);
  });
  it('lists the mutants that are neither killed, survived nor uncovered without failing', () => {
    const root = pythonRepository({ 'mutants-data.json': mutants([1]) });
    writeFiles(root, { 'mutants-data.json': mutants([36]) });
    commit(root, 'a mutant times out');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(mutantFindings(result)).toEqual([
      {
        tool: 'mutmut',
        rule: 'mutant-timeout',
        path: 'src/demo/a.py',
        identity: 'value|1→2#1',
        message: 'Timeout number',
        classification: 'descriptive',
        symbol: 'value',
        location: { line: 5 },
      },
    ]);
  });
  it.each([
    ['an unrelated source was added', { 'src/demo/b.py': 'x = 1\n' }, ['src/demo/a.py.meta']],
    ['the source itself changed', { 'src/demo/a.py': 'def value():\n    return 3\n' }, []],
    [
      'a module it imports changed',
      {
        'import-scan.json': '{"src/demo/a.py":[{"level":0,"module":"demo","names":["b"]}]}',
        'src/demo/b.py': 'y = 1\n',
      },
      [],
    ],
    ['a test changed too', { 'tests/test_a.py': 'x = 2\n', 'src/demo/b.py': 'x = 1\n' }, []],
  ])('reuses the base results of the untouched modules on head when %s', (_, changes, reused) => {
    const calls = callsLog();
    const root = pythonRepository({
      'mutants-data.json': mutants([0]),
      'tests/test_a.py': 'x = 1\n',
    });
    writeFiles(root, changes);
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    const seeded = calls()
      .filter(({ tool }) => tool === 'mutmut-seeded')
      .map(({ seeded: files }) => files);
    expect(seeded).toEqual([[], reused]);
  });
  it('keeps the lint and format findings when mutmut is missing, and says how to disable mutation', () => {
    const root = pythonRepository({ 'no-mutmut.txt': '' });
    writeFiles(root, {
      'violations.txt': `${LEGACY_VIOLATION}B006|src/demo/a.py|Mutable default\n`,
    });
    commit(root, 'a new violation');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json').map(({ rule }) => rule)).toEqual(['B006']);
    const missing = (snapshot) => ({
      tool: 'mutation',
      snapshot,
      rule: 'mutation-failed',
      path: '.',
      message:
        'mutmut was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.',
    });
    expect(result.json('tool-errors.json')).toEqual([missing('base'), missing('head')]);
  });
  it('does not run mutmut when mutation is disabled', () => {
    const calls = callsLog();
    const root = pythonRepository({
      'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
      'no-mutmut.txt': '',
    });
    writeFiles(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual([
      'python',
      'repository-hygiene',
    ]);
    expect(calls().filter(({ tool }) => tool === 'mutmut')).toEqual([]);
  });
  it('does not run mutmut when the tests fail, and the tests-not-run error is the only one', () => {
    const calls = callsLog();
    const root = pythonRepository();
    writeFiles(root, { 'test-exit.txt': '1\n' });
    commit(root, 'break the tests');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json').map(({ rule }) => rule)).toEqual(['tests-not-run']);
    expect(calls().filter(({ tool }) => tool === 'mutmut')).toHaveLength(1);
  });
  it('reports a failing mutmut run as a tool error on head', () => {
    const root = pythonRepository();
    writeFiles(root, { 'mutmut-exit.txt': '2\n' });
    commit(root, 'break mutmut');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'mutation',
        snapshot: 'head',
        rule: 'mutation-failed',
        path: '.',
        message: 'mutmut run exited 2 in the virtualenv environment:\nFailed to run clean test',
      },
    ]);
  });
});
