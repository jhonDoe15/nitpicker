import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { commitBranch, runGitIn, summarize } from '../../test-support/gradle-e2e.mjs';
import { runJavaDiff } from '../../java-diff.mjs';

const fixtures = path.resolve(import.meta.dirname, '../../fixtures');

function contained(base, name) {
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

export function createRepository({ fixture, ignored, files }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-e2e-'));
  cpSync(contained(fixtures, fixture), root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), ignored);
  for (const [file, content] of Object.entries(files)) {
    const target = contained(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  runGitIn(root, 'init', '-q', '-b', 'main');
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'main');
  return root;
}

export function addRedBaseBranches(root, { testPath, bad }) {
  const passing = readFileSync(contained(root, testPath), 'utf8');
  const failing = passing.replace('"Hello, Ada!"', '"Hi, Ada!"');
  commitBranch(root, 'red-base', { [testPath]: failing }, 'main');
  commitBranch(root, 'repaired', { [testPath]: passing }, 'red-base');
  commitBranch(root, 'repaired-with-violation', bad, 'repaired');
}

function diffOf(root, branch, { gradle, policy }) {
  runGitIn(root, 'checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: root, requestedBaseRef: 'red-base', gradle, policy });
}

export function redBaseCases({ setup, gradle, policy, expected }) {
  let root;

  beforeAll(() => {
    root = setup();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not block a change that repairs the failing base tests, and keeps comparing the other checks with the base', () => {
    const result = diffOf(root, 'repaired', { gradle, policy });

    expect({
      failed: result.failed,
      newEnforceable: summarize(result.newEnforceable),
      notes: result.notes.map(({ tool, rule }) => `${tool} ${rule}`),
      legacy: summarize(result.unchangedFindings).filter((entry) => entry === expected.legacy),
    }).toEqual({
      failed: false,
      newEnforceable: [],
      notes: [`${policy.preset} tests-failed`],
      legacy: [expected.legacy],
    });
  });

  it('still fails a new violation next to a failing base', () => {
    const result = diffOf(root, 'repaired-with-violation', { gradle, policy });

    expect({ failed: result.failed, newEnforceable: summarize(result.newEnforceable) }).toEqual({
      failed: true,
      newEnforceable: expected.violation,
    });
  });
}
