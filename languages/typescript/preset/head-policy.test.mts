import {
  createGitTemplate,
  copyGitTemplate,
} from '../../../core/diff/git/test-support/git-repository.mts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fieldOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { runQualityDiff } from '../../../core/diff/comparison/run-diff.mts';
import {
  defaultLayout as untypedDefaultLayout,
  prettierPrecedence as untypedPrettierPrecedence,
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  typecheckEngine as untypedTypecheckEngine,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from './head-policy.mjs';
import { useTemporaryProjects } from './test-support/temporary-projects.mts';

type Section = Readonly<Record<string, unknown>>;
type PolicySections = {
  readonly react: Section;
  readonly tools: { readonly prettier: Section };
  readonly duplicates: Section;
  readonly frameworks: Section;
};
type Environment = NodeJS.ProcessEnv;

const defaultLayout: Readonly<Record<string, readonly string[]>> = untypedDefaultLayout;
const resolveHeadPolicy: (config?: object, projectRoot?: string) => PolicySections =
  untypedResolveHeadPolicy;
const withHeadPolicyFile: (policy: object, operation: (policyFile: string) => void) => void =
  untypedWithHeadPolicyFile;
const readHeadPolicy: (environment?: Environment) => PolicySections = untypedReadHeadPolicy;
const readLayout: (environment?: Environment) => {
  readonly entryPoints: readonly string[];
  readonly duplicateSkippedFolders: readonly string[] | undefined;
} = untypedReadLayout;
const prettierPrecedence: (environment?: Environment) => readonly string[] =
  untypedPrettierPrecedence;
const typecheckEngine: (environment?: Environment) => string = untypedTypecheckEngine;

const probeRunnerPath = path.join(
  import.meta.dirname,
  '../../../core/diff/fixtures/policy-probe-runner.mjs',
);
const libraryOverrides = {
  exclude: ['**/legacy/**'],
  layout: { ...defaultLayout, sourceRoots: ['lib'] },
  thresholds: { crapLimit: 12 },
};

function policyWithDefaults(overrides: object = {}) {
  return {
    exclude: [],
    layout: defaultLayout,
    exceptions: [],
    thresholds: {},
    react: {},
    i18n: {},
    tools: {},
    duplicates: {},
    testConsole: {},
    generatedFiles: [],
    frameworks: { defaultExports: [], entryPoints: [] },
    history: {},
    ...overrides,
  };
}

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
    expect(readHeadPolicy({})).toEqual(policyWithDefaults());
  });

  it('merges the head policy over the defaults', () => {
    const policy = resolveHeadPolicy({
      exclude: ['**/legacy/**'],
      layout: { sourceRoots: ['lib'] },
      thresholds: { crapLimit: 12 },
    });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile })).toEqual(
        policyWithDefaults(libraryOverrides),
      );
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
    const before = resolveHeadPolicy(projectConfig, root).tools.prettier['projectConfigDigest'];
    expect(resolveHeadPolicy(nitpickerOnly, root).tools.prettier).toEqual({
      precedence: ['nitpicker'],
    });
    writeFileSync(path.join(root, '.prettierrc'), '{ "semi": true }\n');
    expect(resolveHeadPolicy(projectConfig, root).tools.prettier['projectConfigDigest']).not.toBe(
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
    expect(() => readHeadPolicy({ NITPICKER_POLICY: '/nonexistent/policy.json' })).toThrow(
      /policy\.json/,
    );
    const root = temporaryDirectory();
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, '{not-json');
    expect(() => readHeadPolicy({ NITPICKER_POLICY: policyFile })).toThrow(/not valid JSON/);
  });

  it('removes the policy file after the operation', () => {
    let seen: string | undefined;
    withHeadPolicyFile({}, (policyFile) => {
      seen = policyFile;
      expect(existsSync(policyFile)).toBe(true);
    });
    expect(existsSync(String(seen))).toBe(false);
  });
});

describe('head policy delivery', () => {
  let gitTemplateRoot: string;

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

    const policyProbe = {
      name: 'policy-probe',
      version: '1.0.0',
      configurationHash: 'probe',
      exclusions: [],
      createInvocation: (context: unknown) => {
        const projectRoot = textOf(fieldOf(context, 'projectRoot'));
        return {
          command: process.execPath,
          args: [probeRunnerPath, projectRoot, logPath],
          cwd: projectRoot,
        };
      },
    };

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
      analyzers: [policyProbe],
    });

    const runs = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => parseJson(line));
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((run) => fieldOf(run, 'root'))).size).toBe(2);
    expect(runs.map((run) => fieldOf(run, 'policy'))).toEqual(
      runs.map(() => policyWithDefaults(libraryOverrides)),
    );
  });
});

const { emptyProject: temporaryDirectory } = useTemporaryProjects('nitpicker-head-policy-test-');

const gitFixtureEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd: string, arguments_: string[]) {
  return execFileSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    env: gitFixtureEnvironment,
    timeout: 10_000,
  });
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
