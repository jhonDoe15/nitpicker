import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldOf, parseJson, textOf, textsOf } from '../../../shared/values/readers.mts';
import { DUPLICATES_TOOL } from '../../../core/tooling/jscpd/run-jscpd.mjs';
import { jscpdVersion } from './typed/tests/tools-test-views.mts';
import { PYTEST_PROBE } from './execution/python-test-runner.mjs';
import { MUTMUT_VERSION_PROBE } from './mutation/python-mutation.mjs';
import { stubCallsLog } from './test-support/runs/calls-log.mts';
import { installFakeToolchain } from './test-support/fake-toolchain.mts';
import {
  configurationFiles,
  createMutationAnalyzer,
  createPythonAnalyzer,
  createPythonAnalyzers,
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
} from './python-analyzer.mjs';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';

const { temporaryRoot: scratchRoot } = useGitFixtures();

const NO_EXTRAS = { baselineMovesFile: undefined, mutationScope: undefined };

function analyzerPair(settings: { testRunner: string }) {
  const [python, mutation] = createPythonAnalyzers(settings);
  if (python === undefined || mutation === undefined) {
    throw new Error('both analyzers expected');
  }
  return { python, mutation };
}

type Probe = { tool: string; args: string[]; cwd: string | undefined };

function parseProbe(line: string): Probe {
  const probe = parseJson(line);
  const cwd = fieldOf(probe, 'cwd');
  return {
    tool: textOf(fieldOf(probe, 'tool')),
    args: textsOf(fieldOf(probe, 'args')),
    cwd: cwd === undefined ? undefined : textOf(cwd),
  };
}

function temporaryRoot(): string {
  return scratchRoot('nitpicker-python-analyzer-');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Python analyzer', () => {
  it('is named python and reports the tools it runs', () => {
    const analyzer = createPythonAnalyzer();

    expect(analyzer.name).toBe(PYTHON_ANALYZER_NAME);
    expect(analyzer.reportedTools).toEqual([
      'ruff',
      'ruff-format',
      'black',
      'coverage',
      'mypy',
      'pyright',
      'basedpyright',
      'structure',
      'crap',
      'python-rules',
      'coverage-py',
      DUPLICATES_TOOL,
      'coupling',
      'import-linter',
      'tests',
      'test-runtime',
      'test-console',
      'facts',
      'dependencies',
    ]);
    expect(analyzer.exclusions).toEqual([]);
    expect(analyzer.timeoutMs).toBe(30 * 60 * 1000);
    expect(analyzer.version).toBe('unresolved');
  });

  it('has mutation testing as an analyzer of its own that runs after the others and can be disabled', () => {
    const analyzer = createMutationAnalyzer();

    expect(createPythonAnalyzers().map(({ name }) => name)).toEqual([
      PYTHON_ANALYZER_NAME,
      MUTATION_ANALYZER_NAME,
    ]);
    expect(analyzer.name).toBe(MUTATION_ANALYZER_NAME);
    expect(analyzer.reportedTools).toEqual(['mutmut']);
    expect(analyzer.dependencies).toEqual([PYTHON_ANALYZER_NAME]);
    expect(analyzer.toleratedDependencyErrors).toEqual(['tests', 'test-runtime', 'dependencies']);
    expect(analyzer.timeoutMs).toBe(70 * 60 * 1000);
    expect(analyzer.version).toBe('unresolved');
  });

  it('hashes the ruff config, the adapters and every file the runner imports, not the tests', () => {
    const files = configurationFiles();

    const required = [
      'languages/python/ruff/nitpicker-ruff.toml',
      'languages/python/adapters/execution/python-test-runner.mjs',
      'languages/python/ingest/coverage-reports/coverage-json.mts',
      'shared/ingest/sarif.mjs',
      'shared/policy.mjs',
      'shared/rules/baseline-expansion.mjs',
      'languages/python/metrics/structure_metrics.py',
    ];
    expect(required.filter((file) => !files.includes(file))).toEqual([]);
    expect(
      files.filter((file) => /\.test\.m[jt]s$|(^|\/)(fixtures|test-support)\//.test(file)),
    ).toEqual([]);
  });

  it('runs the runner for the part it is, with the snapshot, the live checkout and the settings', () => {
    const settings = { formatter: 'black', sourceRoots: ['lib'] };

    expect(
      createPythonAnalyzer(settings).createInvocation({
        projectRoot: '/snapshot',
        liveProjectRoot: '/live',
        toolRoot: '/tool',
        ...NO_EXTRAS,
      }),
    ).toEqual({
      command: process.execPath,
      args: [
        expect.stringMatching(/python-runner\.m[jt]s$/),
        '--part',
        PYTHON_ANALYZER_NAME,
        '--project-root',
        '/snapshot',
        '--live-root',
        '/live',
        '--python-settings',
        JSON.stringify(settings),
      ],
      cwd: '/tool',
    });
    expect(
      createMutationAnalyzer(settings)
        .createInvocation({
          projectRoot: '/snapshot',
          liveProjectRoot: '/live',
          toolRoot: '/tool',
          ...NO_EXTRAS,
        })
        .args.slice(1, 3),
    ).toEqual(['--part', MUTATION_ANALYZER_NAME]);
  });

  it('leaves the settings out when there are none', () => {
    const { args } = createPythonAnalyzer().createInvocation({
      projectRoot: '/snapshot',
      liveProjectRoot: '/live',
      toolRoot: '/tool',
      ...NO_EXTRAS,
    });

    expect(args).toEqual([
      expect.stringMatching(/python-runner\.m[jt]s$/),
      '--part',
      PYTHON_ANALYZER_NAME,
      '--project-root',
      '/snapshot',
      '--live-root',
      '/live',
    ]);
  });

  it('hands the moves file of the head run to the python part only', () => {
    const context = {
      projectRoot: '/snapshot',
      liveProjectRoot: '/live',
      toolRoot: '/tool',
      baselineMovesFile: '/m/moves.json',
      mutationScope: undefined,
    };

    expect(createPythonAnalyzer().createInvocation(context).args.slice(-2)).toEqual([
      '--baseline-moves-file',
      '/m/moves.json',
    ]);
    expect(createMutationAnalyzer().createInvocation(context).args).not.toContain(
      '--baseline-moves-file',
    );
  });

  it('has a stable configuration hash that follows the settings', () => {
    const hash = createPythonAnalyzer().configurationHash;

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(createPythonAnalyzer({}).configurationHash).toBe(hash);
    expect(createPythonAnalyzer({ formatter: 'black' }).configurationHash).not.toBe(hash);
    expect(createPythonAnalyzer({ typeChecker: 'pyright' }).configurationHash).not.toBe(hash);
    expect(createPythonAnalyzer({ formatter: 'ruff' }).configurationHash).not.toBe(
      createPythonAnalyzer({ formatter: 'black' }).configurationHash,
    );
    expect(createMutationAnalyzer().configurationHash).not.toBe(hash);
  });

  it('resolves the versions of the tools in the live checkout environment', () => {
    const live = temporaryRoot();
    installFakeToolchain(path.join(live, '.venv/bin'));

    const jscpd = `jscpd@${jscpdVersion()}`;

    expect(createPythonAnalyzer({ testRunner: 'pytest' }).resolveVersion(live)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(
      createPythonAnalyzer({ formatter: 'black', testRunner: 'pytest' }).resolveVersion(live),
    ).toBe(`ruff@0.9.9;black@24.1.0;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;${jscpd}`);
    expect(
      createPythonAnalyzer({ typeChecker: 'pyright', testRunner: 'pytest' }).resolveVersion(live),
    ).toBe(`ruff@0.9.9;pyright@1.1.390;coverage@7.6.1;pytest@8.3.1;${jscpd}`);
    expect(createMutationAnalyzer().resolveVersion(live)).toBe(
      'mutmut@3.8.0;pytest@8.3.1;pytest-django@missing',
    );
  });

  describe('probing the tools', () => {
    function useCallsLog() {
      const lines = stubCallsLog(temporaryRoot());
      return () => lines().map(parseProbe);
    }

    const probeOf = (command: readonly string[], cwd: string): Probe => ({
      tool: command[0] ?? '',
      args: command.slice(1),
      cwd,
    });
    const versionOf = (tool: string, cwd: string) => probeOf([tool, '--version'], cwd);

    it('probes each tool once when base and head resolve the versions, and again for another checkout', () => {
      const live = temporaryRoot();
      const other = temporaryRoot();
      installFakeToolchain(path.join(live, '.venv/bin'));
      installFakeToolchain(path.join(other, '.venv/bin'));
      const calls = useCallsLog();
      const { python, mutation } = analyzerPair({ testRunner: 'pytest' });
      const pythonProbes = (cwd: string) => [
        versionOf('ruff', cwd),
        versionOf('mypy', cwd),
        versionOf('coverage', cwd),
        probeOf(PYTEST_PROBE, cwd),
      ];

      for (const checkout of [live, live]) {
        python.resolveVersion(checkout);
        mutation.resolveVersion(checkout);
      }
      const resolvedOnce = calls();
      python.resolveVersion(other);

      expect(resolvedOnce).toEqual([...pythonProbes(live), probeOf(MUTMUT_VERSION_PROBE, live)]);
      expect(calls()).toEqual([...resolvedOnce, ...pythonProbes(other)]);
    });

    it('probes again for an analyzer created on its own, even for the same checkout', () => {
      const live = temporaryRoot();
      installFakeToolchain(path.join(live, '.venv/bin'));
      const calls = useCallsLog();

      createPythonAnalyzer({ testRunner: 'pytest' }).resolveVersion(live);
      const once = calls();
      createPythonAnalyzer({ testRunner: 'pytest' }).resolveVersion(live);

      expect(calls()).toEqual([...once, ...once]);
    });

    it('probes a tool again once it is installed in the environment', () => {
      const live = temporaryRoot();
      installFakeToolchain(path.join(live, '.venv/bin'), [
        'ruff',
        'coverage',
        PYTHON_ANALYZER_NAME,
      ]);
      vi.stubEnv('PATH', temporaryRoot());
      const python = createPythonAnalyzer({ typeChecker: 'mypy' });
      const jscpd = `jscpd@${jscpdVersion()}`;

      const before: unknown = python.resolveVersion(live);
      installFakeToolchain(path.join(live, '.venv/bin'), ['mypy']);
      const after: unknown = python.resolveVersion(live);

      expect([before, after]).toEqual([
        `ruff@0.9.9;mypy@missing;coverage@7.6.1;unittest;${jscpd}`,
        `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;unittest;${jscpd}`,
      ]);
    });
  });

  it('reports a missing environment when resolving the version', () => {
    const live = temporaryRoot();

    expect(() => {
      createPythonAnalyzer({ environment: 'nowhere' }).resolveVersion(live);
    }).toThrow('No Python environment');
  });
});
