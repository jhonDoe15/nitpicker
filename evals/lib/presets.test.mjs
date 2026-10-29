import { describe, expect, it } from 'vitest';
import {
  defaultAcceptance,
  gitignoreOf,
  isJvm,
  peerDependencies,
  presetOf,
  quickAnalyzersOf,
  usesNpmPackages,
} from './presets.mjs';

describe('presetOf', () => {
  it('defaults to typescript and accepts every preset', () => {
    expect(presetOf({ id: 'a' })).toBe('typescript');
    for (const preset of ['typescript', 'javascript', 'python', 'java', 'kotlin']) {
      expect(presetOf({ id: 'a', preset })).toBe(preset);
    }
  });

  it('rejects an unknown preset and names the case', () => {
    expect(() => presetOf({ id: 'odd', preset: 'ruby' })).toThrow(/odd: preset must be one of/u);
  });

  it('rejects dependencies for a Gradle or Maven preset only', () => {
    const dependencies = { left: '^1.0.0' };
    expect(() => presetOf({ id: 'a', preset: 'java', dependencies })).toThrow(/build file/u);
    expect(() => presetOf({ id: 'a', preset: 'kotlin', dependencies })).toThrow(/build file/u);
    expect(presetOf({ id: 'a', preset: 'python', dependencies })).toBe('python');
    expect(presetOf({ id: 'a', dependencies })).toBe('typescript');
  });
});

describe('preset kinds', () => {
  it('tells script presets from the others', () => {
    expect(['typescript', 'javascript'].map(usesNpmPackages)).toEqual([true, true]);
    expect(['python', 'java', 'kotlin'].map(usesNpmPackages)).toEqual([false, false, false]);
    expect(['python', 'java', 'kotlin'].map(isJvm)).toEqual([false, true, true]);
  });

  it('gives peers to script presets only', () => {
    const manifest = { devDependencies: { vitest: '^4', typescript: '^5' } };
    expect(peerDependencies('typescript', manifest)).toMatchObject({ vitest: '^4' });
    expect(peerDependencies('python', manifest)).toEqual({});
  });
});

describe('gitignoreOf', () => {
  it('lists what the preset tools leave behind, then the fixture entries', () => {
    expect(gitignoreOf('python', 'custom/\n')).toBe(
      'node_modules/\nreports/\n.venv/\n__pycache__/\n.pytest_cache/\n.ruff_cache/\n.mypy_cache/\n.coverage\nmutants/\ncustom/\n',
    );
    expect(gitignoreOf('kotlin').split('\n')).toEqual(
      expect.arrayContaining(['build/', '.gradle/', '.kotlin/']),
    );
    expect(gitignoreOf('typescript')).toBe('node_modules/\nreports/\n');
  });
});

describe('quickAnalyzersOf', () => {
  it('skips mutation and coverage for scripts and runs the whole gate for the others', () => {
    expect(quickAnalyzersOf('typescript')).toContain('eslint-lint');
    expect(quickAnalyzersOf('typescript')).not.toContain('mutation');
    expect(quickAnalyzersOf('javascript')).toEqual(quickAnalyzersOf('typescript'));
    expect(['python', 'java', 'kotlin'].map(quickAnalyzersOf)).toEqual([[], [], []]);
  });
});

const tree = (entries) => new Map(Object.entries(entries));
const JAVA_TEST = 'src/test/java/sample/ShoutAcceptanceTest.java';

describe('defaultAcceptance', () => {
  it('runs vitest for scripts', () => {
    expect(defaultAcceptance({ preset: 'javascript', files: tree({}) })).toEqual([
      'npx',
      '--no-install',
      'vitest',
      'run',
    ]);
  });

  it('runs only the acceptance test files with pytest in the project venv', () => {
    const files = tree({
      'tests/test_shout_acceptance.py': '',
      'tests/unit/greeter_test.py': '',
      'tests/helpers.py': '',
    });
    expect(defaultAcceptance({ preset: 'python', files })).toEqual([
      '.venv/bin/python',
      '-m',
      'pytest',
      '-q',
      '-p',
      'no:cacheprovider',
      'tests/test_shout_acceptance.py',
      'tests/unit/greeter_test.py',
    ]);
  });

  it('never falls back to the whole tests directory for Python', () => {
    const files = tree({ 'tests/acceptance.py': '', 'tests/data.json': '{}' });
    expect(defaultAcceptance({ preset: 'python', files }).slice(6)).toEqual([
      'tests/acceptance.py',
    ]);
    expect(() => defaultAcceptance({ preset: 'python', files: tree({}) })).toThrow(
      /needs pytest files in acceptance/u,
    );
  });

  it('selects the classes declared in the acceptance files for Gradle, by package and class', () => {
    const files = tree({
      [JAVA_TEST]: 'package sample;\n\npublic class ShoutChecks {\n  static class Inner {}\n}\n',
      'src/test/kotlin/sample/More.kt':
        'package sample.more\n\ninternal class MoreTest {}\nclass Other\n',
      'src/test/java/NoPackage.java': 'final class NoPackage {}\n',
      'src/main/java/sample/Main.java': 'package sample;\nclass Main {}\n',
    });
    expect(defaultAcceptance({ preset: 'java', files, buildTool: 'gradle' })).toEqual([
      'gradle',
      '--console=plain',
      'test',
      '--tests',
      'sample.ShoutChecks',
      '--tests',
      'sample.more.MoreTest',
      '--tests',
      'sample.more.Other',
      '--tests',
      'NoPackage',
    ]);
  });

  it('selects the classes declared in the acceptance files for Maven by simple name', () => {
    const files = tree({ [JAVA_TEST]: 'package sample;\n\nclass ShoutChecks {}\n' });
    expect(defaultAcceptance({ preset: 'java', files, buildTool: 'maven' })).toEqual([
      'mvn',
      '-B',
      '-q',
      'test',
      '-Dtest=ShoutChecks',
      '-Dsurefire.failIfNoSpecifiedTests=false',
    ]);
    expect(defaultAcceptance({ preset: 'java', files: tree({}), buildTool: 'maven' })).toEqual([
      'mvn',
      '-B',
      '-q',
      'test',
    ]);
  });
});
