import { describe, expect, it } from 'vitest';
import {
  canonicalRule,
  exceptionRoute,
  isAddedRule,
  normalizeFunctionName,
  toolPrefixError,
} from './rule-names.mjs';

describe('canonicalRule', () => {
  it.each([
    ['function-lines-limit', 'function-lines-limit'],
    ['structure/function-lines-limit', 'function-lines-limit'],
    ['jacoco/changed-branch-coverage', 'changed-branch-coverage'],
    ['dead-code/exports', 'exports'],
    ['coding-standards/runtime-boundary/domain', 'runtime-boundary/domain'],
    ['pmd/UnusedPrivateField', 'pmd/UnusedPrivateField'],
    ['pmd/function-lines-limit', 'pmd/function-lines-limit'],
    ['react-hooks/exhaustive-deps', 'react-hooks/exhaustive-deps'],
    ['T201', 'T201'],
  ])('%s names %s', (rule, expected) => {
    expect(canonicalRule(rule)).toBe(expected);
  });
});

describe('isAddedRule', () => {
  it.each([
    ['crap-score-limit', true],
    ['crap/crap-score-limit', true],
    ['runtime-boundary/domain', true],
    ['no-production-to-test', true],
    ['pmd/UnusedPrivateField', false],
    ['TS2322', false],
  ])('%s is %s', (rule, expected) => {
    expect(isAddedRule(rule)).toBe(expected);
  });
});

describe('toolPrefixError', () => {
  it.each([
    ['structure/function-lines-limit', 'java', undefined],
    ['jacoco/changed-branch-coverage', 'java', undefined],
    ['coverage-py/changed-branch-coverage', 'python', undefined],
    ['changed-branch-coverage', 'python', undefined],
    ['pmd/UnusedPrivateField', 'java', undefined],
    [
      'bogus/function-parameters-limit',
      'typescript',
      'unknown tool prefix "bogus" for function-parameters-limit: use the rule bare or as structure/function-parameters-limit',
    ],
    [
      'jacoco/changed-branch-coverage',
      'python',
      'unknown tool prefix "jacoco" for changed-branch-coverage: use the rule bare or as coverage-py/changed-branch-coverage',
    ],
    [
      'pmd/function-lines-limit',
      'java',
      'unknown tool prefix "pmd" for function-lines-limit: use the rule bare or as structure/function-lines-limit',
    ],
  ])('%s in %s', (rule, preset, expected) => {
    expect(toolPrefixError(rule, preset)).toBe(expected);
  });
});

describe('normalizeFunctionName', () => {
  it.each([
    ['Calc::classify( int a , int b)', 'Calc.classify'],
    ['Store.save', 'Store.save'],
    ['Tests.`handles (x) input`', 'Tests.`handles (x) input`'],
    ['Tests.`handles (x) input`(a)', 'Tests.`handles (x) input`'],
    ['(anonymous)', '(anonymous)'],
  ])('%s is %s', (name, expected) => {
    expect(normalizeFunctionName(name)).toBe(expected);
  });
});

describe('exceptionRoute', () => {
  it('prints the entry with an obvious placeholder reason', () => {
    expect(exceptionRoute({ rule: 'crap-score-limit', path: 'src/a.ts', function: 'Store.save' })).toBe(
      'If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["src/a.ts"],"function":"Store.save","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('escapes the glob characters of the path', () => {
    expect(exceptionRoute({ rule: 'duplicate-clone', path: 'src/{x}/[id]/a,b*?.ts' })).toBe(
      'If a reviewer agrees this is intended, add {"rule":"duplicate-clone","paths":["src/\\\\{x\\\\}/\\\\[id\\\\]/a\\\\,b\\\\*\\\\?.ts"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('names a declaration and a different config key', () => {
    expect(
      exceptionRoute({ rule: 'exports', path: 'src/lib.ts', name: 'unusedA', key: 'python.exceptions' }),
    ).toBe(
      'If a reviewer agrees this is intended, add {"rule":"exports","paths":["src/lib.ts"],"name":"unusedA","reason":"<why this is intended>"} to "python.exceptions" in nitpicker.config.json.',
    );
  });
});
