import { describe, expect, it } from 'vitest';
import { startTestHttpServer } from '../diff/cache/test-http-server.mjs';
import { runTasksInProcess } from '../diff/fixtures/in-process-analyzers.mjs';
import { exactText } from '../diff/fixtures/output-expectations.mjs';
import {
  captureOutput,
  createRepository,
  fakeAnalyzer,
  finding,
  findingLine,
  makeOutputRoot,
  makeTemporaryRoot,
  policy,
  runCli,
  useCliFixtures,
  writeFiles,
} from '../diff/fixtures/cli-harness.mjs';

useCliFixtures();

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
    const snapshots = [];
    const run = ({ extraArguments = [], configurationHash = 'fixture-policy' } = {}) => {
      const analyzer = fakeAnalyzer();
      analyzer.configurationHash = configurationHash;
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot);
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot(), ...extraArguments],
        environment: { NITPICKER_CACHE_DIR: cacheDirectory },
        currentProjectRoot: repository.root,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
      });
      return { exitCode, output };
    };
    return { run, snapshots };
  }
  it('skips base analysis on a second run against the same base', () => {
    const { run, snapshots } = setup();

    const first = run();
    const second = run();

    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(1);
    expect(second.output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: comparison-base (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
    );
    expect(snapshots).toEqual(['base', 'head', 'head']);
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
    const snapshots = [];
    const execute = (arguments_, url = remote.url, { subprocess = false } = {}) => {
      const analyzer = fakeAnalyzer();
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot);
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
        runTasks: subprocess ? undefined : runTasksInProcess,
      });
      return { exitCode, output };
    };
    const compare = (url) =>
      execute(['--base', repository.baseRef, '--output', makeOutputRoot()], url);
    return { remote, snapshots, execute, compare };
  }
  it('publishes a base snapshot that a fresh checkout then reuses', async () => {
    const { remote, snapshots, execute, compare } = await setup();
    try {
      // The real scheduler subprocess publishes; the comparison then runs in-process.
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

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
      );
      expect(snapshots).toEqual(['base', 'head']);
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

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m src/main/new.ts:1
    Fixture finding
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
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
`),
      );
    } finally {
      await remote.close();
    }
  });
});
