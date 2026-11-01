import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fixtureGit } from '../../core/diff/git/test-support/git-repository.mjs';
import { useHistoryRepositories } from '../../core/diff/git/test-support/history-repository.mjs';
import { configurationFiles } from '../hygiene/analyzers.mjs';
import { HEAD_POLICY_ENV } from '../head-policy.mjs';
import { createHistoryAnalyzers } from './analyzers.mjs';
import { runHistoryCheck, runHistoryCli } from './runner.mjs';
import { linkSentence } from '../messages/test-support/link-sentence.mjs';

const temporaryDirectories = [];
const { historyRepository, temporaryRoot } = useHistoryRepositories();
const roots = {};
const ENTRY = '/tool/core/cli.mjs';
const BASE_ARGUMENTS = [ENTRY, 'history', '--check', 'change-history', '--project-root', '/head'];

beforeAll(() => {
  roots.full = historyRepository();
  roots.shallow = temporaryRoot('nitpicker-shallow-hash-');
  fixtureGit(roots.shallow, ['clone', '-q', '--depth', '3', `file://${roots.full}`, '.']);
  roots.head = fixtureGit(roots.full, ['rev-parse', 'HEAD']).trim();
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('createHistoryAnalyzers', () => {
  it('runs the history check on the snapshot it is given', () => {
    const [analyzer] = createHistoryAnalyzers(ENTRY);

    expect(analyzer.createInvocation({ projectRoot: '/head', toolRoot: '/tool' })).toEqual({
      command: process.execPath,
      args: BASE_ARGUMENTS,
      cwd: '/tool',
    });
  });

  it('reads the history of the compared base in a head run', () => {
    const [analyzer] = createHistoryAnalyzers(ENTRY);
    const invocation = analyzer.createInvocation({
      projectRoot: '/head',
      toolRoot: '/tool',
      baselineRoot: roots.full,
    });

    expect(invocation.args).toEqual([...BASE_ARGUMENTS, '--history-ref', roots.head]);
  });

  it('keys the cache on whether the clone is shallow', () => {
    const [analyzer] = createHistoryAnalyzers(ENTRY);
    const hashes = [roots.full, roots.full, roots.shallow].map((root) =>
      analyzer.resolveConfigurationHash(root),
    );

    expect([hashes[0] === hashes[1], hashes[0] === hashes[2]]).toEqual([true, false]);
  });
});

describe('the history configuration hash', () => {
  it('covers every module the runner loads and nothing of the other checks', () => {
    expect(configurationFiles('history/runner.mjs')).toEqual([
      'conventions/generator-marker.mjs',
      'filesystem.mjs',
      'head-policy.mjs',
      'history/co-change/check.mjs',
      'history/co-change/evidence/evidence.mjs',
      'history/co-change/evidence/git-history.mjs',
      'history/co-change/evidence/production-files.mjs',
      'history/co-change/findings.mjs',
      'history/co-change/project-evidence.mjs',
      'history/co-change/settings.mjs',
      'history/runner.mjs',
      'hygiene/cli.mjs',
      'hygiene/rules.mjs',
      'hygiene/tracked-files.mjs',
      'messages/docs-url.mjs',
      'messages/error-chain.mjs',
      'messages/exception-sentence.mjs',
      'messages/troubleshooting.mjs',
      'paths/glob.mjs',
      'project-rules/hygiene-rules.mjs',
      'rules/features/feature-roles.mjs',
      'traversal.mjs',
    ]);
  });
});

describe('runHistoryCheck', () => {
  it('rejects a check it does not know', () => {
    expect(() => runHistoryCheck({ check: 'nope', projectRoot: '/' })).toThrow(
      new Error('Unknown history check: nope'),
    );
  });
});

describe('runHistoryCli', () => {
  function run(commandArguments, policy) {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-history-policy-'));
    temporaryDirectories.push(directory);
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    const output = { stdout: '', stderr: '' };
    const status = runHistoryCli({
      commandArguments,
      stdout: { write: (text) => (output.stdout += text) },
      stderr: { write: (text) => (output.stderr += text) },
      environment: { [HEAD_POLICY_ENV]: policyFile },
    });
    return { status, ...output };
  }

  it('prints the findings as JSON and honours the head policy file', () => {
    const args = ['--check', 'change-history', '--project-root', roots.full];
    const enabled = run(args, { history: { coChange: true } });
    const lifted = run(args, {
      history: { coChange: true },
      exceptions: [{ rule: 'co-change', paths: ['src/invoicing/**'], reason: 'one release' }],
    });

    expect({
      status: enabled.status,
      identities: JSON.parse(enabled.stdout).findings.map(({ identity }) => identity),
      stderr: enabled.stderr,
      lifted: JSON.parse(lifted.stdout),
    }).toEqual({
      status: 0,
      identities: ['src/billing|src/invoicing'],
      stderr: '',
      lifted: { findings: [] },
    });
  });

  it.each([
    [
      ['--check', 'nope', '--project-root', '/'],
      `History check failed: Unknown history check: nope. ${linkSentence('analyzerCrashed')}\n`,
    ],
    [
      ['--nope', 'x'],
      `History check failed: Invalid history argument: --nope. ${linkSentence('analyzerCrashed')}\n`,
    ],
  ])('exits 2 with the cause for %j', (commandArguments, stderr) => {
    expect(run(commandArguments, {})).toEqual({ status: 2, stdout: '', stderr });
  });
});
