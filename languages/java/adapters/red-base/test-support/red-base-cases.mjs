import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { runGitIn, summarize } from '../../test-support/gradle-e2e.mjs';
import { runJavaDiff } from '../../java-diff.mjs';

const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures');

export function createRepository({ fixture, ignored, files }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-e2e-'));
  cpSync(path.join(fixtures, fixture), root, { recursive: true });
  writeAll(root, { '.gitignore': ignored, ...files });
  runGitIn(root, 'init', '-q', '-b', 'main');
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'main');
  return root;
}

function writeAll(root, files) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function branchFrom(root, { name, from, files }) {
  runGitIn(root, 'checkout', '-q', '-b', name, from);
  writeAll(root, files);
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', name);
}

export function addRedBaseBranches(root, { testPath, bad }) {
  const passing = readFileSync(path.join(root, testPath), 'utf8');
  branchFrom(root, {
    name: 'red-base',
    from: 'main',
    files: { [testPath]: passing.replace('"Hello, Ada!"', '"Hi, Ada!"') },
  });
  branchFrom(root, { name: 'repaired', from: 'red-base', files: { [testPath]: passing } });
  branchFrom(root, { name: 'repaired-with-violation', from: 'repaired', files: bad });
}

function diffOf(root, branch, policy) {
  runGitIn(root, 'checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: root, requestedBaseRef: 'red-base', gradle, policy });
}

export function redBaseCases({ setup, policy, expected }) {
  let root;

  beforeAll(() => {
    root = setup();
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does not block a change that repairs the failing base tests, and keeps comparing the other checks with the base', () => {
    const result = diffOf(root, 'repaired', policy);

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
    const result = diffOf(root, 'repaired-with-violation', policy);

    expect({ failed: result.failed, newEnforceable: summarize(result.newEnforceable) }).toEqual({
      failed: true,
      newEnforceable: expected.violation,
    });
  });
}
