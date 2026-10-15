import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  removeGitRepositories,
} from '../../core/diff/fixtures/git-repository.mjs';
import { HEAD_POLICY_ENV } from '../head-policy.mjs';
import { configurationFiles, createHygieneAnalyzers } from './analyzers.mjs';
import { parseHygieneArguments, runHygieneCheck } from './runner.mjs';

const runnerPath = path.join(import.meta.dirname, 'runner.mjs');
const temporaryDirectories = [];

afterEach(() => {
  removeGitRepositories();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const FILES = { '.env': 'A=1\n', 'vendor/.env': 'A=1\n', 'src/a.ts': 'export {};\n' };

describe('runHygieneCheck', () => {
  it('drops excluded paths and excepted findings, and keeps the rest', () => {
    const { root } = createGitRepository(FILES);
    const check = (policy) =>
      runHygieneCheck({ check: 'repository-hygiene', projectRoot: root, policy }).map(
        ({ path: findingPath }) => findingPath,
      );

    expect(check(undefined)).toEqual(['.env', 'vendor/.env']);
    expect(check({ exclude: ['vendor/**'] })).toEqual(['.env']);
    expect(
      check({
        exceptions: [{ rule: 'committed-env-file', paths: ['vendor/**'], reason: 'fixture' }],
      }),
    ).toEqual(['.env']);
    expect(
      check({ exceptions: [{ rule: 'large-file', paths: ['**'], reason: 'other rule' }] }),
    ).toEqual(['.env', 'vendor/.env']);
  });

  it('rejects a check it does not know', () => {
    const { root } = createGitRepository(FILES);

    expect(() => runHygieneCheck({ check: 'other', projectRoot: root })).toThrow(
      'Unknown hygiene check: other',
    );
  });
});

describe('parseHygieneArguments', () => {
  it('reads the named options and rejects anything else', () => {
    expect(parseHygieneArguments(['--check', 'a', '--project-root', '/p'])).toEqual({
      check: 'a',
      projectRoot: '/p',
    });
    expect(() => parseHygieneArguments(['--nope', 'x'])).toThrow(
      'Invalid hygiene argument: --nope',
    );
    expect(() => parseHygieneArguments(['--check'])).toThrow('Invalid hygiene argument: --check');
  });
});

describe('the runner process', () => {
  function run(arguments_, policy) {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-hygiene-policy-'));
    temporaryDirectories.push(directory);
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    return spawnSync(process.execPath, [runnerPath, ...arguments_], {
      encoding: 'utf8',
      env: { ...process.env, [HEAD_POLICY_ENV]: policyFile },
    });
  }

  it('prints the findings as JSON and honours the head policy file', () => {
    const { root } = createGitRepository(FILES);
    const result = run(['--check', 'repository-hygiene', '--project-root', root], {
      exclude: ['vendor/**'],
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings.map(({ path: findingPath }) => findingPath)).toEqual([
      '.env',
    ]);
  });

  it('exits 2 with the cause on bad input', () => {
    const result = run(['--check', 'nope', '--project-root', '/'], {});

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Hygiene check failed: Unknown hygiene check: nope');
  });
});

describe('createHygieneAnalyzers', () => {
  it('runs the repository check on the snapshot it is given', () => {
    const [analyzer, ...others] = createHygieneAnalyzers();

    expect(others).toEqual([]);
    expect(analyzer.name).toBe('repository-hygiene');
    expect(analyzer.configurationHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(analyzer.createInvocation({ projectRoot: '/head', toolRoot: '/tool' })).toEqual({
      command: process.execPath,
      args: [runnerPath, '--check', 'repository-hygiene', '--project-root', '/head'],
      cwd: '/tool',
    });
  });
});

describe('the hygiene configuration hash', () => {
  it('covers every module the runner loads', () => {
    expect(configurationFiles()).toEqual([
      'glob.mjs',
      'head-policy.mjs',
      'hygiene/files/build-output.mjs',
      'hygiene/files/env-files.mjs',
      'hygiene/files/known-files.mjs',
      'hygiene/files/repository-files.mjs',
      'hygiene/rules.mjs',
      'hygiene/runner.mjs',
      'hygiene/tracked-files.mjs',
    ]);
  });
});
