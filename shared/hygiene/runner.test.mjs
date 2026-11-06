import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../core/diff/git/test-support/git-repository.mjs';
import { HEAD_POLICY_ENV } from '../head-policy.mjs';
import { configurationFiles, createHygieneAnalyzers } from './analyzers.mjs';
import { parseCheckArguments } from './cli.mjs';
import { runHygieneCheck, runHygieneCli } from './runner.mjs';

const temporaryDirectories = [];
const { createGitRepository } = useGitFixtures();

afterEach(() => {
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

  it('matches a build output exception against the folder, and reports the manifest', () => {
    const { root } = createGitRepository({
      'svc/package.json': '{"name":"svc"}\n',
      'svc/build/app.class': 'x',
    });
    const check = (paths) =>
      runHygieneCheck({
        check: 'repository-hygiene',
        projectRoot: root,
        policy: { exceptions: [{ rule: 'committed-build-output', paths, reason: 'fixture' }] },
      });

    expect(check(['other/**'])).toEqual([
      {
        tool: 'repository-hygiene',
        rule: 'committed-build-output',
        path: 'svc/package.json',
        identity: 'svc/build|build-output',
        message:
          'svc/build/ looks like build output tracked in git. Untrack it with `git rm -r --cached svc/build`, ' +
          'add `svc/build/` to .gitignore, and let CI produce it; if it holds sources or build scripts, rename it. ' +
          'If this is intended, add {"rule":"committed-build-output","paths":["svc/build/**"],"reason":"..."} to ' +
          '"exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
    expect(check(['svc/build'])).toEqual([]);
  });

  it('rejects a check it does not know', () => {
    const { root } = createGitRepository(FILES);

    expect(() => runHygieneCheck({ check: 'other', projectRoot: root })).toThrow(
      'Unknown hygiene check: other',
    );
  });
});

describe('parseCheckArguments', () => {
  it('reads the named options', () => {
    expect(
      parseCheckArguments(['--check', 'a', '--project-root', '/p', '--history-ref', 'abc']),
    ).toEqual({ check: 'a', projectRoot: '/p', historyRef: 'abc' });
  });

  it.each([
    [['--nope', 'x'], 'hygiene', 'Invalid hygiene argument: --nope'],
    [['--check'], 'hygiene', 'Invalid hygiene argument: --check'],
    [['--nope', 'x'], 'history', 'Invalid history argument: --nope'],
  ])('rejects %j for the %s command', (commandArguments, command, message) => {
    expect(() => parseCheckArguments(commandArguments, command)).toThrow(new Error(message));
  });
});

describe('runHygieneCli', () => {
  function run(commandArguments, policy) {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-hygiene-policy-'));
    temporaryDirectories.push(directory);
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    const output = { stdout: '', stderr: '' };
    const status = runHygieneCli({
      commandArguments,
      stdout: { write: (text) => (output.stdout += text) },
      stderr: { write: (text) => (output.stderr += text) },
      environment: { [HEAD_POLICY_ENV]: policyFile },
    });
    return { status, ...output };
  }

  it('prints the findings as JSON and honours the head policy file', () => {
    const { root } = createGitRepository(FILES);
    const result = run(['--check', 'repository-hygiene', '--project-root', root], {
      exclude: ['vendor/**'],
    });

    expect({
      ...result,
      stdout: JSON.parse(result.stdout).findings.map(({ path: file }) => file),
    }).toEqual({ status: 0, stdout: ['.env'], stderr: '' });
  });

  it('exits 2 with the cause on bad input', () => {
    expect(run(['--check', 'nope', '--project-root', '/'], {})).toEqual({
      status: 2,
      stdout: '',
      stderr: 'Hygiene check failed: Unknown hygiene check: nope\n',
    });
  });
});

describe('createHygieneAnalyzers', () => {
  it('runs the repository check on the snapshot it is given', () => {
    const [analyzer, ...others] = createHygieneAnalyzers('/tool/core/cli.mjs');

    expect(others).toEqual([]);
    expect(analyzer.name).toBe('repository-hygiene');
    expect(analyzer.configurationHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(analyzer.createInvocation({ projectRoot: '/head', toolRoot: '/tool' })).toEqual({
      command: process.execPath,
      args: [
        '/tool/core/cli.mjs',
        'hygiene',
        '--check',
        'repository-hygiene',
        '--project-root',
        '/head',
      ],
      cwd: '/tool',
    });
  });
});

describe('the hygiene configuration hash', () => {
  it('covers every module the runner loads', () => {
    expect(configurationFiles()).toEqual([
      'filesystem.mjs',
      'head-policy.mjs',
      'hygiene/cli.mjs',
      'hygiene/files/build-output.mjs',
      'hygiene/files/env-files.mjs',
      'hygiene/files/known-files.mjs',
      'hygiene/files/output-sources.mjs',
      'hygiene/files/repository-files.mjs',
      'hygiene/rules.mjs',
      'hygiene/runner.mjs',
      'hygiene/tracked-files.mjs',
      'messages/error-chain.mjs',
      'messages/exception-sentence.mjs',
      'paths/glob.mjs',
      'project-rules/hygiene-rules.mjs',
      'traversal.mjs',
    ]);
  });
});
