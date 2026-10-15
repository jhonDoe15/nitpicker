import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../../../git/test-support/git-repository.mjs';
import {
  differingVersions,
  eslintCliPath,
  installedVersions,
  sameKey,
  snapshotKey,
} from './test-support/eslint-recording-key.mjs';

const { temporaryRoot } = useGitFixtures();

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

describe('installed versions of the tracked packages', () => {
  it('name each package ESLint output depends on with its installed version', () => {
    const versions = installedVersions();

    expect(Object.keys(versions)).toEqual([
      'eslint',
      'typescript-eslint',
      '@typescript-eslint/parser',
      '@typescript-eslint/eslint-plugin',
      'typescript',
    ]);
    expect(Object.values(versions).filter((version) => !/^\d+\.\d+\.\d+/.test(version))).toEqual(
      [],
    );
  });

  it('point at the ESLint binary of the installed package', () => {
    expect(eslintCliPath().endsWith(path.join('node_modules', 'eslint', 'bin', 'eslint.js'))).toBe(
      true,
    );
    expect(existsSync(eslintCliPath())).toBe(true);
  });
});

describe('differingVersions', () => {
  const installed = {
    eslint: '10.9.1',
    'typescript-eslint': '8.68.0',
    '@typescript-eslint/parser': '8.68.0',
    '@typescript-eslint/eslint-plugin': '8.68.0',
    typescript: '6.0.3',
  };

  it('is empty when the recording was made with the installed versions', () => {
    expect(differingVersions(installed, installed)).toEqual([]);
  });

  it('names each package whose version changed and each one the recording lacks', () => {
    const recorded = { ...installed, eslint: '10.8.0', typescript: undefined };

    expect(differingVersions(recorded, installed)).toEqual([
      'eslint 10.8.0 -> 10.9.1',
      'typescript unrecorded -> 6.0.3',
    ]);
  });

  it('treats a recording without versions as having none recorded', () => {
    expect(differingVersions(undefined, installed)).toHaveLength(5);
  });
});

describe('snapshotKey', () => {
  it('hashes the policy config and every TypeScript file under src/main, nested ones included', () => {
    const root = temporaryRoot('eslint-recording-key-');
    const policy = "export default [{ rules: { 'no-debugger': 'error' } }];\n";
    writeFiles(root, {
      'eslint.config.mjs': policy,
      'src/main/a.ts': 'export const a = 1;\n',
      'src/main/nested/deeper/b.ts': 'export const b = 2;\n',
      'src/main/notes.md': 'not typescript\n',
      'src/test/c.ts': 'export const c = 3;\n',
    });

    expect(snapshotKey(root, path.join(root, 'eslint.config.mjs'))).toEqual({
      policyConfig: 'eslint.config.mjs',
      policySha: sha256(policy),
      files: {
        'src/main/a.ts': sha256('export const a = 1;\n'),
        'src/main/nested/deeper/b.ts': sha256('export const b = 2;\n'),
      },
    });
  });
});

describe('sameKey', () => {
  const key = { policySha: 'policy', files: { 'src/main/a.ts': 'one', 'src/main/b.ts': 'two' } };

  it('matches keys with the same policy and file hashes whatever the property order', () => {
    const reordered = {
      policySha: 'policy',
      files: { 'src/main/b.ts': 'two', 'src/main/a.ts': 'one' },
    };

    expect(sameKey(key, reordered)).toBe(true);
  });

  it.each([
    ['a changed policy', { ...key, policySha: 'other' }],
    ['a changed file', { ...key, files: { ...key.files, 'src/main/b.ts': 'changed' } }],
    ['an added file', { ...key, files: { ...key.files, 'src/main/c.ts': 'three' } }],
    ['a renamed file', { ...key, files: { 'src/main/a.ts': 'one', 'src/main/c.ts': 'two' } }],
  ])('rejects %s', (_name, other) => {
    expect(sameKey(key, other)).toBe(false);
    expect(sameKey(other, key)).toBe(false);
  });
});
