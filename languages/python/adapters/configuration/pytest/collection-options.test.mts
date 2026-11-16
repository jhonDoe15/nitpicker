import { describe, expect, it } from 'vitest';
import { collectionOptions, isTestFile, matchesGlob } from './collection-options.mts';
import { fieldsOf } from '../../../../../shared/values/readers.mts';
import { readPytestConfig } from './pytest-config.mts';

type Settings = { pythonFiles: string[]; django?: boolean; testpaths?: string[] };

const defaults = { pythonFiles: ['test_*.py', '*_test.py'] };

describe('matching a file name against a pattern', () => {
  it.each([
    ['test_a.py', 'test_*.py', true],
    ['a_test.py', 'test_*.py', false],
    ['tests.py', 'tests.py', true],
    ['abc.py', 'a?c.py', true],
    ['a.py', '*', true],
    ['test.py', 'test*.py', true],
    ['xtest.py', 'test*.py', false],
    ['test_x_y.py', 'test_*_y.py', true],
  ])('%s against %s is %s', (name, pattern, expected) => {
    expect(matchesGlob(name, pattern)).toBe(expected);
  });
});

describe('telling a test file from a source file', () => {
  it.each([
    ['tests/helpers.py', defaults, true],
    ['src/app/test_a.py', defaults, true],
    ['src/app/a_test.py', defaults, true],
    ['blog/tests.py', { ...defaults, django: true }, true],
    ['blog/tests_views.py', { ...defaults, django: true }, true],
    ['clinic/lab_tests.py', { ...defaults, django: true }, true],
    ['blog/tests.py', defaults, false],
    ['app/tests_helper.py', defaults, false],
    ['clinic/lab_tests.py', defaults, false],
    ['quiz/tests.py', { pythonFiles: ['tests.py'] }, true],
    ['app/service.py', { pythonFiles: ['*.py'], testpaths: ['spec'] }, false],
    ['spec/checks.py', { pythonFiles: ['*.py'], testpaths: ['spec'] }, true],
    ['spec/api/checks.py', { pythonFiles: ['*.py'], testpaths: ['./spec/'] }, true],
    ['app/test_a.py', { pythonFiles: ['*'], testpaths: ['spec'] }, true],
    ['conftest.py', defaults, true],
    ['src/app/checks_a.py', { ...defaults, pythonFiles: ['checks_*.py'] }, true],
    ['src/app/testing.py', defaults, false],
    ['testing/helpers.py', defaults, true],
    ['src/shop/testing/helpers.py', defaults, false],
    ['testing.py', defaults, false],
    ['src/app/service.py', defaults, false],
    ['src/app/testsuite.py', defaults, false],
  ])('%s with %j is %s', (file: string, settings: Settings, expected: boolean) => {
    const result: unknown = Reflect.apply(isTestFile, undefined, [file, settings]);
    expect(result).toBe(expected);
  });
});

describe('the collection options for the rules script', () => {
  it('lift the deselecting options out of addopts', () => {
    const base = fieldsOf(readPytestConfig('/nonexistent'));
    const config = {
      ...base,
      addopts: [
        '-q',
        '--deselect',
        'tests/a.py::test_x',
        '--deselect=tests/b.py',
        '--ignore',
        'tests/old',
        '--ignore-glob=tests/gen_*',
        '-k',
        'not slow',
        '-knot flaky',
        '-m',
        'not slow',
      ],
    };

    expect(Reflect.apply(collectionOptions, undefined, [config])).toEqual({
      pythonFiles: base['pythonFiles'],
      pythonClasses: base['pythonClasses'],
      pythonFunctions: base['pythonFunctions'],
      norecursedirs: base['norecursedirs'],
      testpaths: base['testpaths'],
      deselected: ['tests/a.py::test_x', 'tests/b.py'],
      ignored: ['tests/old'],
      ignoredGlobs: ['tests/gen_*'],
      keywords: ['not slow', 'not flaky'],
      marks: ['not slow'],
    });
  });
});
