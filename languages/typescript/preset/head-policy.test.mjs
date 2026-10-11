import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runQualityDiff } from '../../../core/diff/run-diff.mjs';
import {
  defaultLayout,
  readHeadPolicy,
  readLayout,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from './head-policy.mjs';

const probeRunnerPath = path.join(
  import.meta.dirname,
  '../../../core/diff/fixtures/policy-probe-runner.mjs',
);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('head policy react key', () => {
  it('is left out of the policy until the config sets it', () => {
    expect(Object.keys(resolveHeadPolicy({}))).toEqual([
      'exclude',
      'layout',
      'exceptions',
      'thresholds',
    ]);
  });

  it('carries the react setting to the readers of the policy file', () => {
    const policy = resolveHeadPolicy({ react: { enabled: false, styling: 'css-in-js' } });

    expect(policy.react).toEqual({ enabled: false, styling: 'css-in-js' });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).react).toEqual({
        enabled: false,
        styling: 'css-in-js',
      });
    });
  });
});

describe('head policy reader', () => {
  it('falls back to preset layout defaults without a policy file', () => {
    expect(readHeadPolicy({})).toEqual({
      exclude: [],
      layout: defaultLayout,
      exceptions: [],
      thresholds: {},
      react: {},
    });
  });

  it('merges the head policy over the defaults', () => {
    const policy = resolveHeadPolicy({
      exclude: ['**/legacy/**'],
      layout: { sourceRoots: ['lib'] },
      thresholds: { crapLimit: 12 },
    });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile })).toEqual({
        exclude: ['**/legacy/**'],
        layout: { ...defaultLayout, sourceRoots: ['lib'] },
        exceptions: [],
        thresholds: { crapLimit: 12 },
        react: {},
      });
    });
  });

  it('exposes the configured entry points on the resolved layout', () => {
    const policy = resolveHeadPolicy({ layout: { entryPoints: ['tools/*-runner.mjs'] } });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readLayout({ NITPICKER_POLICY: policyFile }).entryPoints).toEqual([
        'tools/*-runner.mjs',
      ]);
    });
    expect(readLayout({}).entryPoints).toEqual([]);
  });

  it('fails instead of weakening the policy when the file is unreadable or malformed', () => {
    expect(() => readHeadPolicy({ NITPICKER_POLICY: '/nonexistent/policy.json' })).toThrow();
    const root = temporaryDirectory();
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, '{not-json');
    expect(() => readHeadPolicy({ NITPICKER_POLICY: policyFile })).toThrow(/not valid JSON/);
  });

  it('removes the policy file after the operation', () => {
    let seen;
    withHeadPolicyFile({}, (policyFile) => {
      seen = policyFile;
      expect(existsSync(policyFile)).toBe(true);
    });
    expect(existsSync(seen)).toBe(false);
  });
});

describe('head policy delivery', () => {
  it('shows the head policy to a runner child process on both the base and head runs', () => {
    const root = realpathSync(temporaryDirectory());
    const logPath = path.join(root, 'probe.log');
    const repository = path.join(root, 'repo');
    mkdirSync(repository);
    git(repository, ['init', '-q', '-b', 'main']);
    git(repository, ['config', 'user.name', 'Policy Fixture']);
    git(repository, ['config', 'user.email', 'policy@example.invalid']);
    writeFileSync(path.join(repository, 'a.txt'), 'base\n');
    git(repository, ['add', '-A']);
    git(repository, ['commit', '-q', '-m', 'base']);
    git(repository, ['branch', 'comparison-base']);
    writeFileSync(path.join(repository, 'a.txt'), 'head\n');
    git(repository, ['add', '-A']);
    git(repository, ['commit', '-q', '-m', 'head']);

    runQualityDiff({
      repositoryRoot: repository,
      projectRelativePath: '.',
      headProjectRoot: repository,
      requestedBaseRef: 'comparison-base',
      outputRoot: path.join(root, 'out'),
      headPolicy: resolveHeadPolicy({
        exclude: ['**/legacy/**'],
        layout: { sourceRoots: ['lib'] },
        thresholds: { crapLimit: 12 },
      }),
      analyzers: [
        {
          name: 'policy-probe',
          version: '1.0.0',
          configurationHash: 'probe',
          exclusions: [],
          createInvocation: ({ projectRoot }) => ({
            command: process.execPath,
            args: [probeRunnerPath, projectRoot, logPath],
            cwd: projectRoot,
          }),
        },
      ],
    });

    const runs = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((run) => run.root)).size).toBe(2);
    for (const run of runs) {
      expect(run.policy).toEqual({
        exclude: ['**/legacy/**'],
        layout: { ...defaultLayout, sourceRoots: ['lib'] },
        exceptions: [],
        thresholds: { crapLimit: 12 },
        react: {},
      });
    }
  });
});

function temporaryDirectory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-head-policy-test-'));
  temporaryRoots.push(root);
  return root;
}

// Hermetic fixture git: a developer's global config (commit signing adds about 150 ms per commit)
// must not change the fixture's cost or behaviour.
const gitFixtureEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd, arguments_) {
  return execFileSync('git', arguments_, { cwd, encoding: 'utf8', env: gitFixtureEnvironment });
}
