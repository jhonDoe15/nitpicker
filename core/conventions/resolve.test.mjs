import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../diff/fixtures/git-repository.mjs';
import { describeConfigOverrides, validateConfig } from '../config.mjs';
import { publishHeadPolicy, runHeadPolicy } from './resolve.mjs';

const twoSpaces = 'class A {\n  void a() {\n    run();\n  }\n}\n';
const fourSpaces = 'class B {\n    void b() {\n        run();\n    }\n}\n';

afterEach(() => {
  removeGitRepositories();
});

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

const comparison = (stdout, options = {}) => ({
  options: { all: false, baseRef: 'main', ...options },
  environment: {},
  stdout,
});

describe('runHeadPolicy', () => {
  it('measures the merge base, so a branch cannot flip the style', () => {
    const { root } = createGitRepository({ 'src/A.java': fourSpaces, 'src/B.java': fourSpaces });
    commitBranch(root, {
      'src/C.java': twoSpaces,
      'src/D.java': twoSpaces,
      'src/E.java': twoSpaces,
    });
    const stdout = output();

    const policy = runHeadPolicy({
      cli: comparison(stdout),
      config: { preset: 'java' },
      projectRoot: root,
    });

    expect(policy.conventions).toEqual({ 'java.indentation': '4' });
    expect(stdout.text()).toBe(
      "Following this project's conventions:\n" +
        '  Java indentation: 4 spaces (google-java-format --aosp) (used by 2 of 2 measured files)\n',
    );
  });

  it('measures the working tree when the base has nothing to measure, and for --all', () => {
    const { root } = createGitRepository({ 'README.md': 'x\n' });
    commitBranch(root, { 'src/C.java': fourSpaces });
    writeFiles(root, { 'src/D.java': twoSpaces, 'src/E.java': twoSpaces });

    const atBase = runHeadPolicy({
      cli: comparison(),
      config: { preset: 'java' },
      projectRoot: root,
    });
    const snapshot = runHeadPolicy({
      cli: comparison(undefined, { all: true }),
      config: { preset: 'java' },
      projectRoot: root,
    });

    expect(atBase.conventions).toEqual({ 'java.indentation': '2' });
    expect(snapshot.conventions).toEqual({ 'java.indentation': '2' });
  });

  it('measures only the analyzed project and leaves excluded paths out', () => {
    const { root } = createGitRepository({
      'service/src/A.java': fourSpaces,
      'service/generated/G1.java': twoSpaces,
      'service/generated/G2.java': twoSpaces,
      'other/X.java': twoSpaces,
      'other/Y.java': twoSpaces,
    });

    const policy = runHeadPolicy({
      cli: comparison(),
      config: { preset: 'java', exclude: ['generated/**'] },
      projectRoot: path.join(root, 'service'),
    });

    expect(policy.conventions).toEqual({ 'java.indentation': '4' });
  });

  it('keeps a pinned value and leaves presets without conventions untouched', () => {
    const { root } = createGitRepository({ 'src/A.java': fourSpaces });

    expect(
      runHeadPolicy({
        cli: comparison(),
        config: { preset: 'java', conventions: { 'java.indentation': '2' } },
        projectRoot: root,
      }).conventions,
    ).toEqual({ 'java.indentation': '2' });
    expect(
      runHeadPolicy({ cli: comparison(), config: { preset: 'python' }, projectRoot: root }),
    ).not.toHaveProperty('conventions');
  });

  it('measures the published commit for cache publish', () => {
    const { root } = createGitRepository({ 'src/A.java': fourSpaces });
    writeFiles(root, { 'src/B.java': twoSpaces, 'src/C.java': twoSpaces });

    expect(publishHeadPolicy({ preset: 'java' }, root).conventions).toEqual({
      'java.indentation': '4',
    });
  });
});

describe('conventions config key', () => {
  it('pins only the conventions the preset has', () => {
    const config = { preset: 'java', conventions: { 'java.indentation': '4' } };

    expect(validateConfig(config)).toEqual(config);
    expect(describeConfigOverrides(config)).toEqual([
      'preset: "java"',
      'conventions: {"java.indentation":"4"}',
    ]);
    expect(() => validateConfig({ conventions: { 'java.indentation': '4' } })).toThrow(
      'unknown convention "java.indentation". Allowed conventions: (none for this preset)',
    );
    expect(() =>
      validateConfig({ preset: 'java', conventions: { 'java.indentation': 'tabs' } }),
    ).toThrow('"conventions.java.indentation" must be one of: "2", "4"');
  });
});
