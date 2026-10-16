import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { describeConfigOverrides } from '../configuration/config.mjs';
import { validateConfig } from '../configuration/validate.mjs';
import { resolveComparison } from '../diff/git/repository/git.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { comparisonPolicy, publishHeadPolicy, snapshotPolicy } from './resolve.mjs';

const { createGitRepository } = useGitFixtures();

const twoSpaces = 'class A {\n  void a() {\n    run();\n  }\n}\n';
const fourSpaces = 'class B {\n    void b() {\n        run();\n    }\n}\n';

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), contents);
  }
}

function commitBranch(root, files) {
  fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
  writeFiles(root, files);
  fixtureGit(root, ['add', '-A']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'feature']);
}

function output() {
  const chunks = [];
  return { write: (chunk) => chunks.push(chunk), text: () => chunks.join('') };
}

function runOf(config, currentProjectRoot, stdout = output()) {
  return {
    config,
    currentProjectRoot,
    headPolicy: resolveHeadPolicy(config, currentProjectRoot),
    stdout,
  };
}

function compare(repositoryRoot, config, { projectRoot = repositoryRoot, stdout } = {}) {
  return comparisonPolicy(
    { ...runOf(config, projectRoot, stdout), repositoryRoot, base: { baseRef: 'main' } },
    resolveComparison,
  );
}

describe('conventions in the head policy', () => {
  it('measures the merge base, so a branch cannot flip the style', () => {
    const { root } = createGitRepository({ 'src/A.java': fourSpaces, 'src/B.java': fourSpaces });
    commitBranch(root, {
      'src/C.java': twoSpaces,
      'src/D.java': twoSpaces,
      'src/E.java': twoSpaces,
    });
    const stdout = output();

    const policy = compare(root, { preset: 'java' }, { stdout });

    expect(policy.conventions).toEqual({ 'java.indentation': '4' });
    expect(stdout.text()).toBe(
      "Following this project's conventions:\n" +
        '  Java indentation: 4 spaces (google-java-format --aosp) (used by 2 of 2 measured files)\n',
    );
  });

  it('measures the working tree when the base has nothing to measure, and for --all', () => {
    const { root } = createGitRepository({ 'README.md': 'x\n' });
    commitBranch(root, { 'src/C.java': twoSpaces });
    writeFiles(root, { 'src/D.java': fourSpaces, 'src/E.java': fourSpaces });

    const atBase = compare(root, { preset: 'java' });
    const snapshot = snapshotPolicy(runOf({ preset: 'java' }, root));

    expect(atBase.conventions).toEqual({ 'java.indentation': '4' });
    expect(snapshot.conventions).toEqual({ 'java.indentation': '4' });
  });

  it('keeps the default when the base has files that give no evidence', () => {
    const { root } = createGitRepository({ 'src/A.java': 'interface A {}\n' });
    commitBranch(root, { 'src/C.java': fourSpaces });

    expect(compare(root, { preset: 'java' })).not.toHaveProperty('conventions');
  });

  it('measures only the analyzed project and leaves excluded paths out', () => {
    const { root } = createGitRepository({
      'service/src/A.java': fourSpaces,
      'service/legacy/L1.java': twoSpaces,
      'service/legacy/L2.java': twoSpaces,
      'service/generated/G1.java': twoSpaces,
      'service/build/B1.java': twoSpaces,
      'service/build/B2.java': twoSpaces,
      'service/target/T1.java': twoSpaces,
      'other/X.java': twoSpaces,
      'other/Y.java': twoSpaces,
    });

    const policy = compare(
      root,
      { preset: 'java', exclude: ['legacy/**'] },
      { projectRoot: path.join(root, 'service') },
    );

    expect(policy.conventions).toEqual({ 'java.indentation': '4' });
  });

  it('keeps a pin and carries only choices that differ from the preset default', () => {
    const { root } = createGitRepository({ 'src/A.java': twoSpaces });
    const stdout = output();

    expect(
      compare(root, { preset: 'java', conventions: { 'java.indentation': '4' } }).conventions,
    ).toEqual({ 'java.indentation': '4' });
    expect(compare(root, { preset: 'java' }, { stdout })).not.toHaveProperty('conventions');
    expect(stdout.text()).toBe('');
    expect(compare(root, { preset: 'python' })).not.toHaveProperty('conventions');
  });

  it('measures the published commit for cache publish', () => {
    const { root } = createGitRepository({ 'src/A.java': fourSpaces });
    writeFiles(root, { 'src/B.java': twoSpaces, 'src/C.java': twoSpaces });

    expect(publishHeadPolicy({ preset: 'java' }, root).conventions).toEqual({
      'java.indentation': '4',
    });
  });
});

describe('reading the measured files', () => {
  it('skips files too large to measure and keeps names with newlines apart', () => {
    const { root } = createGitRepository({
      'src/Generated.java': `class G {\n  ${'int a;\n  '.repeat(80_000)}}\n`,
      'src/new\nline.java': fourSpaces,
      'src/B.java': fourSpaces,
      'src/C.java': twoSpaces,
    });
    const stdout = output();

    compare(root, { preset: 'java' }, { stdout });

    expect(stdout.text()).toBe(
      "Following this project's conventions:\n" +
        '  Java indentation: 4 spaces (google-java-format --aosp) (used by 2 of 3 measured files)\n',
    );
  });

  it('follows wildcard imports in main code and static wildcards in tests apart', () => {
    const main = (name) => `package a;\n\nimport b.*;\n\nclass ${name} {}\n`;
    const test = (name) =>
      `package a;\n\nimport static org.assertj.core.api.Assertions.*;\nimport b.C;\n\nclass ${name} {}\n`;
    const { root } = createGitRepository({
      'src/main/java/A.java': main('A'),
      'src/main/java/B.java': main('B'),
      'src/test/java/ATest.java': test('ATest'),
    });
    const stdout = output();

    const policy = compare(root, { preset: 'java' }, { stdout });

    expect(policy.conventions).toEqual({
      'java.wildcardImports': 'wildcard',
      'java.testStaticImports': 'wildcard',
    });
    expect(stdout.text()).toBe(
      "Following this project's conventions:\n" +
        '  Java imports: wildcards allowed (used by 2 of 3 measured files)\n' +
        '  Java static imports in tests: wildcards allowed (used by 1 of 1 measured files)\n',
    );
  });

  it('needs no git when every convention is pinned', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-no-git-'));
    try {
      const conventions = {
        'java.indentation': '4',
        'java.wildcardImports': 'wildcard',
        'java.testStaticImports': 'wildcard',
      };

      expect(snapshotPolicy(runOf({ preset: 'java', conventions }, root)).conventions).toEqual(
        conventions,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('conventions of the Python and Kotlin presets', () => {
  const singleQuoted = "a = 'a'\nb = 'b'\nc = 'c'\ndef f():\n  return 'd'\n";
  const wildcardKotlin = 'package a\n\nimport b.*\n\nclass A {\n  fun f() {\n    run()\n  }\n}\n';

  it('follows the single quotes and two spaces of Python files', () => {
    const { root } = createGitRepository({ 'a.py': singleQuoted, 'pkg/b.py': singleQuoted });
    const stdout = output();

    const policy = compare(root, { preset: 'python' }, { stdout });

    expect(policy.conventions).toEqual({ 'python.quotes': 'single', 'python.indentation': '2' });
    expect(stdout.text()).toBe(
      "Following this project's conventions:\n" +
        '  Python quotes: single quotes (used by 2 of 2 measured files)\n' +
        '  Python indentation: 2 spaces (used by 2 of 2 measured files)\n' +
        `Format with ruff: ruff format --isolated --target-version py38 --line-length 88 --config 'format.quote-style = "single"' --config 'indent-width = 2' .\n`,
    );
  });

  it('follows the wildcard imports and two spaces of Kotlin files, and lets a pin win', () => {
    const { root } = createGitRepository({
      'build.gradle.kts': 'plugins { id("org.jlleitschuh.gradle.ktlint") }',
      'src/A.kt': wildcardKotlin,
      'src/B.kt': wildcardKotlin,
    });

    expect(compare(root, { preset: 'kotlin' }).conventions).toEqual({
      'kotlin.indentation': '2',
      'kotlin.wildcardImports': 'wildcard',
    });
    expect(
      compare(root, { preset: 'kotlin', conventions: { 'kotlin.indentation': '4' } }).conventions,
    ).toEqual({ 'kotlin.indentation': '4', 'kotlin.wildcardImports': 'wildcard' });
  });
});

describe('conventions config key', () => {
  it('pins only the conventions the preset has', () => {
    const config = { preset: 'java', conventions: { 'java.indentation': '4' } };

    expect(validateConfig(config)).toEqual(config);
    expect(validateConfig({ ...config, preset: 'kotlin' })).toEqual({
      ...config,
      preset: 'kotlin',
    });
    expect(describeConfigOverrides(config)).toEqual([
      'preset: "java"',
      'conventions: {"java.indentation":"4"}',
    ]);
    expect(() =>
      validateConfig({ preset: 'python', conventions: { 'java.indentation': '4' } }),
    ).toThrow(
      'unknown convention "java.indentation". Allowed conventions: python.quotes, python.lineLength, python.indentation',
    );
    expect(() => validateConfig({ conventions: { 'java.indentation': '4' } })).toThrow(
      /Allowed conventions: prettier\.quotes, prettier\.semicolons/,
    );
    expect(() =>
      validateConfig({ preset: 'java', conventions: { 'java.indentation': 'tabs' } }),
    ).toThrow('"conventions.java.indentation" must be one of: "2", "4"');
  });
});
