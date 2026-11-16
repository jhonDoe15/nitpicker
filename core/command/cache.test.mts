import path from 'node:path';
import type { TextOutput } from '../cli-context.mts';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mts';
import { startTestHttpServer } from '../diff/cache/test-support/test-http-server.mts';
import { runTasksInProcess } from '../diff/execution/test-support/in-process-analyzers.mts';
import { exactText } from '../diff/reporting/test-support/output-expectations.mts';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mts';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mts';
import { fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mts';
import type { FixtureAnalyzer, FixtureInvocationContext } from './test-support/fixture-types.mts';
import { writeFiles } from '../diff/git/test-support/fixture-files.mts';
import { linkSentence } from '../../shared/messages/test-support/link-sentence.mjs';
import { fixtureGit } from '../diff/git/test-support/git-repository.mts';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

type CacheRunOptions = {
  readonly extraArguments?: readonly string[];
  readonly configurationHash?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly progress?: TextOutput;
  readonly projectRoot?: string;
};

describe('findings cache', () => {
  function setup() {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old.ts': findingLine(finding({ identity: 'old-finding' })),
    });
    writeFiles(repository.root, {
      'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const cacheDirectory = makeTemporaryRoot('nitpicker-cli-cache-');
    const snapshots: string[] = [];
    const run = ({
      extraArguments = [],
      configurationHash = 'fixture-policy',
      environment = { NITPICKER_CACHE_DIR: cacheDirectory },
      progress,
      projectRoot = repository.root,
    }: CacheRunOptions = {}) => {
      const analyzer = fakeAnalyzer();
      analyzer.configurationHash = configurationHash;
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot ?? '');
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot(), ...extraArguments],
        environment,
        currentProjectRoot: projectRoot,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
        ...(progress === undefined ? {} : { progress }),
      });
      return { exitCode, output };
    };
    return { run, snapshots, repository };
  }
  it('skips base analysis on a second run against the same base', () => {
    const { run, snapshots } = setup();

    const first = run();
    const second = run();

    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(1);
    expect(second.output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Fixture finding
    src/main/new.ts:1:4
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    );
    expect(snapshots).toEqual(['base', 'head', 'head']);
  });
  it('shares a cache in the Git directory between worktrees when there is no node_modules', () => {
    const { run, snapshots, repository } = setup();
    const worktree = path.join(makeTemporaryRoot('nitpicker-cli-worktree-'), 'worktree');
    fixtureGit(repository.root, ['worktree', 'add', '--quiet', '--detach', worktree]);
    writeFiles(worktree, { 'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })) });
    const lines: string[] = [];
    const progress = { write: (text: string) => lines.push(text) };

    run({ environment: {} });
    run({ environment: {}, progress, projectRoot: worktree });

    expect(snapshots).toEqual(['base', 'head', 'head']);
    expect(lines).toEqual([
      `nitpicker: base 1 analyzer cached (${repository.root}/.git/nitpicker/cache; use --no-cache to rerun)\n`,
      'nitpicker: head: running 1 analyzer\n',
    ]);
  });
  it('analyzes the base again with --no-cache', () => {
    const { run, snapshots } = setup();

    run();
    run({ extraArguments: ['--no-cache'] });

    expect(snapshots).toEqual(['base', 'head', 'base', 'head']);
  });
  it('analyzes the base again when the head policy hash changes', () => {
    const { run, snapshots } = setup();

    run();
    run({ configurationHash: 'changed-policy' });

    expect(snapshots).toEqual(['base', 'head', 'base', 'head']);
  });
});
const PUBLISHED_NAMES = 'fake-quality-analyzer, fake-quality-analyzer (without changed tests)';

type ScopedContext = FixtureInvocationContext & { readonly mutationScope?: unknown };

type KeyedAnalyzer = FixtureAnalyzer & {
  comparisonKey?: (context: {
    readonly touchedPaths: readonly string[];
    readonly quick: unknown;
  }) => string;
};

function keyedAnalyzer(): KeyedAnalyzer {
  return fakeAnalyzer();
}

describe('remote findings cache', () => {
  async function setup() {
    const remote = await startTestHttpServer();
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old.ts': findingLine(finding({ identity: 'old-finding' })),
    });
    writeFiles(repository.root, {
      'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const snapshots: string[] = [];
    const execute = (
      arguments_: readonly string[],
      url = remote.url,
      {
        subprocess,
        analyzer = fakeAnalyzer(),
      }: { readonly subprocess?: true; readonly analyzer?: FixtureAnalyzer } = {},
    ) => {
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot ?? '');
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_,
        environment: {
          NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-'),
          NITPICKER_CACHE_URL: url,
        },
        currentProjectRoot: repository.root,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: subprocess === true ? undefined : runTasksInProcess,
      });
      return { exitCode, output };
    };
    const compare = (url?: string) =>
      execute(['--base', repository.baseRef, '--output', makeOutputRoot()], url);
    return { remote, snapshots, execute, compare };
  }
  it('publishes a base snapshot that a fresh checkout then reuses', async () => {
    const { remote, snapshots, execute, compare } = await setup();
    try {
      const published = execute(['cache', 'publish'], remote.url, { subprocess: true });
      expect(published.exitCode).toBe(0);
      expect(published.output.stdoutText).toEqual(
        expect.stringMatching(
          exactText`Published 1 of 1 base snapshots for ${/[a-f0-9]{40}/}: fake-quality-analyzer
`,
        ),
      );
      expect(await remote.keys()).toHaveLength(1);

      const result = compare();

      expect(result.exitCode).toBe(1);
      expect(result.output.stdoutText).toEqual(
        expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Fixture finding
    src/main/new.ts:1:4
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
      );
      expect(snapshots).toEqual(['base', 'head']);
    } finally {
      await remote.close();
    }
  });
  it('also publishes the unmutated base a comparison without changed tests reads', async () => {
    const { remote, execute } = await setup();
    try {
      const scopes: unknown[] = [];
      const keyed = keyedAnalyzer();
      const createInvocation = keyed.createInvocation.bind(keyed);
      keyed.comparisonKey = ({ touchedPaths, quick }) =>
        `${String(touchedPaths.length)}:${String(quick)}`;
      keyed.createInvocation = (context: ScopedContext) => {
        scopes.push(context.mutationScope);
        return createInvocation(context);
      };
      const { exitCode, output } = execute(['cache', 'publish'], remote.url, { analyzer: keyed });

      expect(exitCode).toBe(0);
      expect(scopes).toEqual([undefined, []]);
      expect(output.stdoutText).toEqual(
        expect.stringMatching(
          exactText`Published 1 of 1 base snapshots for ${/[a-f0-9]{40}/}: ${PUBLISHED_NAMES}
`,
        ),
      );
      expect(await remote.keys()).toHaveLength(2);
    } finally {
      await remote.close();
    }
  });
  it('keeps the full entry and warns when the unmutated base cannot be written', async () => {
    const { remote, execute } = await setup();
    try {
      const keyed = keyedAnalyzer();
      const createInvocation = keyed.createInvocation.bind(keyed);
      keyed.comparisonKey = () => 'tests';
      keyed.createInvocation = (context: ScopedContext) => {
        if (context.mutationScope !== undefined) {
          throw new Error('unmutated run failed');
        }
        return createInvocation(context);
      };

      const { exitCode, output } = execute(['cache', 'publish'], remote.url, { analyzer: keyed });

      expect(exitCode).toBe(0);
      expect(output.stderrText).toBe(
        'nitpicker: the base without changed tests was not published: fake-quality-analyzer (analysis failed)\n',
      );
      expect(await remote.keys()).toHaveLength(1);
    } finally {
      await remote.close();
    }
  });
  it('still gates when the remote cache is unreachable', async () => {
    const { remote, snapshots, compare } = await setup();
    await remote.failWith(500);
    try {
      const result = compare();

      expect(result.exitCode).toBe(1);
      expect(result.output.stdoutText).toEqual(
        expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Fixture finding
    src/main/new.ts:1:4
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
      );
      expect(snapshots).toEqual(['base', 'head']);
    } finally {
      await remote.close();
    }
  });
  it('fails publishing without a remote URL, and reports an unreachable one', async () => {
    const { remote, execute } = await setup();
    try {
      expect(execute(['cache', 'publish'], '').exitCode).toBe(2);
      await remote.failWith(500);
      const result = execute(['cache', 'publish']);
      expect(result.exitCode).toBe(2);
      expect(result.output.stdoutText).toEqual(
        expect.stringMatching(exactText`Published 0 of 1 base snapshots for ${/[a-f0-9]{40}/}
Not published: fake-quality-analyzer (upload failed)
${linkSentence('cachePublishFails')}
`),
      );
    } finally {
      await remote.close();
    }
  });
});
