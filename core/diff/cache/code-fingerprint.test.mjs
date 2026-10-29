import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureGit } from '../git/test-support/git-repository.mjs';
import { computeCodeFingerprint, currentCodeFingerprint } from './code-fingerprint.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const MANIFEST = { version: '1.0.0', files: ['core/**/*.mjs', 'languages/**', '!**/*.test.mjs'] };

function packageRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-code-fingerprint-'));
  temporaryRoots.push(root);
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  write('package.json', `${JSON.stringify(MANIFEST)}\n`);
  write('core/cli.mjs', 'export const run = 1;\n');
  write('languages/python/rules/rule.mjs', 'export const banned = ["print"];\n');
  return { root, write };
}

describe('the fingerprint of the code that produced the findings', () => {
  it('changes with a shipped rule, not with a test or a file the package does not ship', () => {
    const { root, write } = packageRoot();
    const before = computeCodeFingerprint(root);

    write('languages/python/rules/rule.test.mjs', 'export const checked = 2;\n');
    write('docs/notes.md', 'notes\n');
    expect(computeCodeFingerprint(root)).toBe(before);

    write('languages/python/rules/rule.mjs', 'export const banned = ["print", "pprint"];\n');
    expect(computeCodeFingerprint(root)).not.toBe(before);
  });

  it('reads a checkout through git, so ignored files do not count and new ones do', () => {
    const { root, write } = packageRoot();
    write('.gitignore', '.venv/\n');
    fixtureGit(root, ['init', '-q']);
    const before = computeCodeFingerprint(root);

    write('languages/python/.venv/lib/site.py', 'junk = 1\n');
    expect(computeCodeFingerprint(root)).toBe(before);

    write('languages/python/rules/new_rule.mjs', 'export const banned = ["exec"];\n');
    expect(computeCodeFingerprint(root)).not.toBe(before);
  });

  it('is computed once per process', () => {
    const { root, write } = packageRoot();
    const first = currentCodeFingerprint(root);

    write('languages/python/rules/rule.mjs', 'export const banned = [];\n');

    expect(currentCodeFingerprint(root)).toBe(first);
    expect(computeCodeFingerprint(root)).not.toBe(first);
  });
});
