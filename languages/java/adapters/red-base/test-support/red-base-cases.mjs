import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { commitBranch, runGitIn, summarize } from '../../test-support/gradle-e2e.mjs';
import { runCli } from '../../../../../core/cli.mjs';
import { runJavaDiff } from '../../java-diff.mjs';
import { testsFailOnBase } from '../../../../../shared/rules/finding-helpers.mjs';
import { linkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';

const fixtures = path.resolve(import.meta.dirname, '../../fixtures');

function contained(base, name) {
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}

export function createRepository({ fixture, preset, ignored, files }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-e2e-'));
  cpSync(contained(fixtures, fixture), root, { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), ignored);
  writeFileSync(path.join(root, 'nitpicker.config.json'), `${JSON.stringify({ preset })}\n`);
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

export function gateRedBase({ root, branch, base = 'red-base', environment }) {
  runGitIn(root, 'checkout', '-q', branch);
  const reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-red-base-out-'));
  const sink = { write: () => undefined };
  const exitCode = runCli({
    arguments_: ['--base', base, '--output', reports],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: root,
    stdout: sink,
    stderr: sink,
    progress: sink,
  });
  function json(name) {
    return JSON.parse(readFileSync(contained(reports, name), 'utf8'));
  }
  return { exitCode, json, reports };
}

export function redBaseCases({ setup, gradle, environment, policy, expected }) {
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

  it('passes the repairing change through the command line and records the failing base as a note', () => {
    const result = gateRedBase({
      root,
      branch: 'repaired',
      environment: { ...environment, NITPICKER_GRADLE: gradle },
    });

    expect({
      exitCode: result.exitCode,
      toolErrors: result.json('tool-errors.json'),
      notes: result.json('notes.json'),
    }).toEqual({
      exitCode: 0,
      toolErrors: [],
      notes: [
        {
          tool: policy.preset,
          snapshot: 'base',
          rule: 'tests-failed',
          path: '.',
          message: `${testsFailOnBase([
            'demo.GreeterTest.greetsByName: expected: <Hi, Ada!> but was: <Hello, Ada!>',
          ])}\n${linkSentence('baseTestsFail')}`,
        },
      ],
    });
    rmSync(result.reports, { recursive: true, force: true });
  });

  it('still fails a new violation next to a failing base', () => {
    const result = diffOf(root, 'repaired-with-violation', { gradle, policy });

    expect({ failed: result.failed, newEnforceable: summarize(result.newEnforceable) }).toEqual({
      failed: true,
      newEnforceable: expected.violation,
    });
  });
}
