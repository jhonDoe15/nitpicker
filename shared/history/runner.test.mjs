import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../core/diff/git/test-support/git-repository.mjs';
import {
  amplifiedHistory,
  commitSteps,
  SOURCE_FILES,
} from '../../core/diff/git/test-support/history-repository.mjs';
import { configurationFiles, createHygieneAnalyzers } from '../hygiene/analyzers.mjs';
import { HEAD_POLICY_ENV } from '../head-policy.mjs';
import { createHistoryAnalyzers } from './analyzers.mjs';
import { runHistoryCheck, runHistoryCli } from './runner.mjs';

const temporaryDirectories = [];
const { createGitRepository } = useGitFixtures();

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('createHistoryAnalyzers', () => {
  it('runs the history check on the snapshot it is given', () => {
    const [analyzer, ...others] = createHistoryAnalyzers('/tool/core/cli.mjs');

    expect(others).toEqual([]);
    expect(analyzer.name).toBe('change-history');
    expect(analyzer.configurationHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(analyzer.configurationHash).not.toBe(
      createHygieneAnalyzers('/tool/core/cli.mjs')[0].configurationHash,
    );
    expect(analyzer.createInvocation({ projectRoot: '/head', toolRoot: '/tool' })).toEqual({
      command: process.execPath,
      args: [
        '/tool/core/cli.mjs',
        'history',
        '--check',
        'change-history',
        '--project-root',
        '/head',
      ],
      cwd: '/tool',
    });
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
      'messages/exception-sentence.mjs',
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
      'Unknown history check: nope',
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
    const { root } = createGitRepository(SOURCE_FILES);
    commitSteps(root, amplifiedHistory());
    const args = ['--check', 'change-history', '--project-root', root];
    const enabled = run(args, { history: { coChange: true } });
    const lifted = run(args, {
      history: { coChange: true },
      exceptions: [{ rule: 'co-change', paths: ['src/invoicing/**'], reason: 'one release' }],
    });

    expect({
      status: enabled.status,
      identities: JSON.parse(enabled.stdout).findings.map(({ identity }) => identity),
      stderr: enabled.stderr,
    }).toEqual({ status: 0, identities: ['src/billing|src/invoicing'], stderr: '' });
    expect(JSON.parse(lifted.stdout)).toEqual({ findings: [] });
  });

  it('exits 2 with the cause on bad input', () => {
    expect(run(['--check', 'nope', '--project-root', '/'], {})).toEqual({
      status: 2,
      stdout: '',
      stderr: 'History check failed: Unknown history check: nope\n',
    });
  });
});
