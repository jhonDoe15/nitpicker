import {
  createGitTemplate,
  copyGitTemplate,
} from '../../../core/diff/git/test-support/git-repository.mjs';
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
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { runQualityDiff } from '../../../core/diff/comparison/run-diff.mjs';
import {
  defaultLayout,
  prettierPrecedence,
  readHeadPolicy,
  readLayout,
  resolveHeadPolicy,
  typecheckEngine,
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

describe('head policy icon package', () => {
  function projectWith(dependencies) {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
    return root;
  }

  it('records the first icon package of the head checkout next to the React scope', () => {
    const root = projectWith({ react: '19.0.0', 'react-icons': '5.0.0', 'lucide-react': '1.0.0' });

    expect(resolveHeadPolicy({}, root).react).toEqual({
      enabled: true,
      iconPackage: 'react-icons',
    });
  });

  it('leaves the key out when the head checkout has no icon package', () => {
    const root = projectWith({ react: '19.0.0' });

    expect(resolveHeadPolicy({}, root).react).toEqual({ enabled: true });
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
      i18n: {},
      tools: {},
      duplicates: {},
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
        i18n: {},
        tools: {},
        duplicates: {},
      });
    });
  });

  it('reads the Prettier precedence, defaulting to the nitpicker config alone', () => {
    expect(prettierPrecedence({})).toEqual(['nitpicker']);
    const policy = resolveHeadPolicy({
      tools: { prettier: { precedence: ['project', 'nitpicker'] } },
    });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(prettierPrecedence({ NITPICKER_POLICY: policyFile })).toEqual([
        'project',
        'nitpicker',
      ]);
    });
  });

  it('reads the type check engine, defaulting to TypeScript 7', () => {
    expect(typecheckEngine({})).toBe('native');
    const policy = resolveHeadPolicy({ tools: { typescript: { engine: 'project' } } });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(typecheckEngine({ NITPICKER_POLICY: policyFile })).toBe('project');
    });
  });

  it('fingerprints the project Prettier config only when the project layer is used', () => {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, '.prettierrc'), '{ "semi": false }\n');
    const projectConfig = { tools: { prettier: { precedence: ['project'] } } };
    const nitpickerOnly = { tools: { prettier: { precedence: ['nitpicker'] } } };
    const before = resolveHeadPolicy(projectConfig, root).tools.prettier.projectConfigDigest;
    expect(resolveHeadPolicy(nitpickerOnly, root).tools.prettier).toEqual({
      precedence: ['nitpicker'],
    });
    writeFileSync(path.join(root, '.prettierrc'), '{ "semi": true }\n');
    expect(resolveHeadPolicy(projectConfig, root).tools.prettier.projectConfigDigest).not.toBe(
      before,
    );
    expect(resolveHeadPolicy({}, root)).not.toHaveProperty('tools');
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
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  it('shows the head policy to a runner child process on both the base and head runs', () => {
    const root = realpathSync(temporaryDirectory());
    const logPath = path.join(root, 'probe.log');
    const repository = path.join(root, 'repo');
    mkdirSync(repository);
    copyGitTemplate(gitTemplateRoot, repository);
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
        i18n: {},
        tools: {},
        duplicates: {},
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

describe('head policy duplicates key', () => {
  it('is left out of the policy until the config sets it and read back as an empty object', () => {
    expect(resolveHeadPolicy({})).toEqual({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
    });
    withHeadPolicyFile(resolveHeadPolicy({}), (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).duplicates).toEqual({});
      expect(readLayout({ NITPICKER_POLICY: policyFile }).duplicateSkippedFolders).toBeUndefined();
    });
  });

  it('carries the skipped folders to the readers of the policy file and the layout', () => {
    const policy = resolveHeadPolicy({ duplicates: { skippedFolders: ['dist'] } });

    expect(policy.duplicates).toEqual({ skippedFolders: ['dist'] });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).duplicates).toEqual({
        skippedFolders: ['dist'],
      });
      expect(readLayout({ NITPICKER_POLICY: policyFile }).duplicateSkippedFolders).toEqual([
        'dist',
      ]);
    });
  });
});
