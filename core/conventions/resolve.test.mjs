import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  fixtureGit,
  removeGitRepositories,
} from '../diff/fixtures/git-repository.mjs';
import { describeConfigOverrides, validateConfig } from '../config.mjs';
import { resolveComparison } from '../diff/git.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { comparisonPolicy, publishHeadPolicy, snapshotPolicy } from './resolve.mjs';

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

  it('measures only the analyzed project and leaves excluded paths out', () => {
    const { root } = createGitRepository({
      'service/src/A.java': fourSpaces,
      'service/generated/G1.java': twoSpaces,
      'service/generated/G2.java': twoSpaces,
      'other/X.java': twoSpaces,
      'other/Y.java': twoSpaces,
    });

    const policy = compare(
      root,
      { preset: 'java', exclude: ['generated/**'] },
      { projectRoot: path.join(root, 'service') },
    );

    expect(policy.conventions).toEqual({ 'java.indentation': '4' });
  });

  it('keeps a pinned value, carries only choices that differ from the preset, and leaves presets without conventions untouched', () => {
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

  it('needs no git when every convention is pinned', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-no-git-'));
    try {
      expect(
        snapshotPolicy(runOf({ preset: 'java', conventions: { 'java.indentation': '4' } }, root))
          .conventions,
      ).toEqual({ 'java.indentation': '4' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
