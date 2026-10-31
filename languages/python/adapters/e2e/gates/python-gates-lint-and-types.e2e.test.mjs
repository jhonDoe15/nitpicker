import path from 'node:path';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GREETER_HI,
  GREETER_HI_TEST,
  LEGACY_MOVED,
  TYPE_ERROR,
  VIOLATION,
} from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
  summarize,
} from '../test-support/python-e2e-support.mjs';
import {
  GATE_PACKAGES,
  enforceable,
  pythonExceptionRoute,
  reportedFindings,
  withoutMutants,
} from '../test-support/python-gate-support.mjs';
import { helpUriProblems } from '../../../../../shared/reference/test-support/help-uris.mjs';

describe.skipIf(!pythonE2eEnabled)('Python preset lint and type gates end to end', () => {
  let project;
  let violation;
  beforeAll(() => {
    project = fixtureRepository(GATE_PACKAGES);
    commitBranch(project, 'clean', {
      'src/demo/greeter.py': GREETER_HI,
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(project, 'moved', { 'src/demo/legacy.py': LEGACY_MOVED });
    commitBranch(project, 'violation', { 'src/demo/bad.py': VIOLATION });
    commitBranch(project, 'type-error', { 'src/demo/typed.py': TYPE_ERROR });
    violation = gate(project, 'violation');
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
    expect(violation.exitCode, violation.text).toBe(1);
    expect(
      summarize(
        violation
          .json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable'),
      ),
    ).toEqual([
      'mutmut mutant-nocoverage bad.py',
      'mypy no-untyped-def bad.py',
      'ruff F401 bad.py',
      'ruff-format format bad.py',
    ]);
    expect(helpUriProblems(violation.json('new-findings.json'))).toEqual([]);
    const sarif = JSON.parse(readFileSync(path.join(violation.reports, 'report.sarif'), 'utf8'));
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
    const junit = readFileSync(path.join(violation.reports, 'report.junit.xml'), 'utf8');
    expect(
      [...junit.matchAll(/<testcase classname="quality\.diff\.new-findings" name="([^"]+)"/g)].map(
        ([, name]) => name,
      ),
    ).toEqual([
      'mutmut/mutant-nocoverage src/demo/bad.py:5',
      'mypy/no-untyped-def src/demo/bad.py:4',
      'ruff/F401 src/demo/bad.py:1',
      'ruff-format/format src/demo/bad.py',
    ]);
    expect(reportedFindings(violation.text)).toEqual([
      'mypy/no-untyped-def src/demo/bad.py:4: Function is missing a type annotation. ' +
        'Fix the type; inline ignores are banned. ' +
        pythonExceptionRoute('no-untyped-def', 'src/demo/bad.py'),
      'ruff/F401 src/demo/bad.py:1: `sys` imported but unused. ' +
        pythonExceptionRoute('F401', 'src/demo/bad.py'),
      'ruff-format/format src/demo/bad.py: ' +
        'File is not formatted with ruff (detected; set "python.formatter" if wrong). ' +
        'Format it with the "Format with ruff" command printed at the start of the run.',
    ]);
  });
  it('fails a new type error found by mypy, strict by default, and keeps the legacy ones baselined', () => {
    const result = gate(project, 'type-error');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['mypy return-value typed.py']);
    expect(reportedFindings(result.text)).toEqual([
      'mypy/return-value src/demo/typed.py:2: ' +
        'Incompatible return value type (got "int", expected "str"). ' +
        'Fix the type; inline ignores are banned. ' +
        pythonExceptionRoute('return-value', 'src/demo/typed.py'),
    ]);
  });
  it('reports line coverage as a descriptive finding', () => {
    expect(violation.json('new-findings.json').filter(({ tool }) => tool === 'coverage')).toEqual([
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
