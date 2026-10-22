import { describe, expect, it } from 'vitest';
import {
  buildToolOf,
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
      'node_modules/\nreports/\n.venv/\n__pycache__/\n.pytest_cache/\n.ruff_cache/\n.mypy_cache/\nmutants/\ncustom/\n',
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

describe('defaultAcceptance', () => {
  it('runs vitest for scripts', () => {
    expect(defaultAcceptance({ preset: 'javascript', files: [] })).toEqual([
      'npx',
      '--no-install',
      'vitest',
      'run',
    ]);
  });

  it('runs the acceptance test files with pytest in the project venv', () => {
    const files = ['tests/test_shout_acceptance.py', 'tests/helpers.py'];
    expect(defaultAcceptance({ preset: 'python', files })).toEqual([
      '.venv/bin/python',
      '-m',
      'pytest',
      '-q',
      '-p',
      'no:cacheprovider',
      'tests/test_shout_acceptance.py',
    ]);
    expect(defaultAcceptance({ preset: 'python', files: [] }).at(-1)).toBe('tests');
  });

  it('selects the acceptance classes for Gradle', () => {
    const files = [
      'src/test/java/sample/ShoutAcceptanceTest.java',
      'src/test/kotlin/sample/MoreTest.kt',
    ];
    expect(defaultAcceptance({ preset: 'java', files, buildTool: 'gradle' })).toEqual([
      'gradle',
      '--console=plain',
      'test',
      '--tests',
      'sample.ShoutAcceptanceTest',
      '--tests',
      'sample.MoreTest',
    ]);
  });

  it('selects the acceptance classes for Maven by simple name', () => {
    const files = ['src/test/java/sample/ShoutAcceptanceTest.java'];
    expect(defaultAcceptance({ preset: 'java', files, buildTool: 'maven' })).toEqual([
      'mvn',
      '-B',
      '-q',
      'test',
      '-Dtest=ShoutAcceptanceTest',
      '-Dsurefire.failIfNoSpecifiedTests=false',
    ]);
    expect(defaultAcceptance({ preset: 'java', files: [], buildTool: 'maven' })).toEqual([
      'mvn',
      '-B',
      '-q',
      'test',
    ]);
  });
});

describe('buildToolOf', () => {
  it('is maven only for a pom.xml without a Gradle build', () => {
    expect(buildToolOf(['pom.xml', 'src/main/java/A.java'])).toBe('maven');
    expect(buildToolOf(['build.gradle'])).toBe('gradle');
    expect(buildToolOf(['pom.xml', 'build.gradle.kts'])).toBe('gradle');
    expect(buildToolOf([])).toBe('gradle');
  });
});
