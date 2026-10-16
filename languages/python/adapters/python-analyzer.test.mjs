import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jscpdVersion } from '../../java/adapters/metrics/java-duplicates.mjs';
import { PYTEST_PROBE } from './execution/python-test-runner.mjs';
import { MUTMUT_VERSION_PROBE } from './mutation/python-mutation.mjs';
import { installFakeToolchain } from './test-support/fake-toolchain.mjs';
import {
  configurationFiles,
  createMutationAnalyzer,
  createPythonAnalyzer,
  createPythonAnalyzers,
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
} from './python-analyzer.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-analyzer-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
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
      'structure',
      'crap',
      'python-rules',
      'coverage-py',
      'duplicates',
      'coupling',
      'import-linter',
    ]);
    expect(analyzer.exclusions).toEqual([]);
    expect(analyzer.timeoutMs).toBe(30 * 60 * 1000);
    expect(analyzer.version).toBe('unresolved');
  });

  it('has mutation testing as an analyzer of its own that runs after the others and can be disabled', () => {
    const analyzer = createMutationAnalyzer();

    expect(createPythonAnalyzers().map(({ name }) => name)).toEqual(['python', 'mutation']);
    expect(analyzer.name).toBe(MUTATION_ANALYZER_NAME);
    expect(analyzer.reportedTools).toEqual(['mutmut']);
    expect(analyzer.dependencies).toEqual([PYTHON_ANALYZER_NAME]);
    expect(analyzer.timeoutMs).toBe(70 * 60 * 1000);
    expect(analyzer.version).toBe('unresolved');
  });

  it('hashes the ruff config, the adapters, the lizard pin and every file the runner imports, not the tests', () => {
    const files = configurationFiles();

    const required = [
      'languages/python/ruff/nitpicker-ruff.toml',
      'languages/python/adapters/execution/python-test-runner.mjs',
      'languages/python/ingest/coverage-reports/coverage-json.mjs',
      'languages/java/ingest/sarif.mjs',
      'shared/policy.mjs',
      'shared/rules/baseline-expansion.mjs',
      'languages/java/gradle/nitpicker.init.gradle',
    ];
    expect(required.filter((file) => !files.includes(file))).toEqual([]);
    expect(
      files.filter((file) => /\.test\.mjs$|(^|\/)(fixtures|test-support)\//.test(file)),
    ).toEqual([]);
  });

  it('runs the runner for the part it is, with the snapshot, the live checkout and the settings', () => {
    const settings = { formatter: 'black', sourceRoots: ['lib'] };

    expect(
      createPythonAnalyzer(settings).createInvocation({
        projectRoot: '/snapshot',
        liveProjectRoot: '/live',
        toolRoot: '/tool',
      }),
    ).toEqual({
      command: process.execPath,
      args: [
        expect.stringMatching(/python-runner\.mjs$/),
        '--part',
        'python',
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
        })
        .args.slice(1, 3),
    ).toEqual(['--part', 'mutation']);
  });

  it('leaves the settings out when there are none', () => {
    const { args } = createPythonAnalyzer().createInvocation({
      projectRoot: '/snapshot',
      liveProjectRoot: '/live',
      toolRoot: '/tool',
    });

    expect(args).toEqual([
      expect.stringMatching(/python-runner\.mjs$/),
      '--part',
      'python',
      '--project-root',
      '/snapshot',
      '--live-root',
      '/live',
    ]);
  });

  it('has a stable configuration hash that follows the settings', () => {
    const hash = createPythonAnalyzer().configurationHash;

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(createPythonAnalyzer({}).configurationHash).toBe(hash);
    expect(createPythonAnalyzer({ formatter: 'black' }).configurationHash).not.toBe(hash);
    expect(
      createPythonAnalyzer({ exceptions: [{ rule: 'T201', paths: ['cli/**'], reason: 'CLI' }] })
        .configurationHash,
    ).not.toBe(hash);
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
    expect(createMutationAnalyzer().resolveVersion(live)).toBe('mutmut@3.8.0;pytest@8.3.1');
  });

  describe('probing the tools', () => {
    function useCallsLog() {
      const log = path.join(temporaryRoot(), 'calls.jsonl');
      writeFileSync(log, '');
      vi.stubEnv('FAKE_PYTHON_LOG', log);
      return () =>
        readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .map(({ tool, args, cwd }) => ({ tool, args, cwd }));
    }

    const probeOf = (command, cwd) => ({ tool: command[0], args: command.slice(1), cwd });
    const versionOf = (tool, cwd) => probeOf([tool, '--version'], cwd);

    it('probes each tool once when base and head resolve the versions, and again for another checkout', () => {
      const live = temporaryRoot();
      const other = temporaryRoot();
      installFakeToolchain(path.join(live, '.venv/bin'));
      installFakeToolchain(path.join(other, '.venv/bin'));
      const calls = useCallsLog();
      const [python, mutation] = createPythonAnalyzers({ testRunner: 'pytest' });
      const pythonProbes = (cwd) => [
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

    it('probes a tool again once it is installed in the environment', () => {
      const live = temporaryRoot();
      installFakeToolchain(path.join(live, '.venv/bin'), ['ruff', 'coverage', 'python']);
      vi.stubEnv('PATH', temporaryRoot());
      const python = createPythonAnalyzer({ typeChecker: 'mypy' });
      const jscpd = `jscpd@${jscpdVersion()}`;

      const before = python.resolveVersion(live);
      installFakeToolchain(path.join(live, '.venv/bin'), ['mypy']);
      const after = python.resolveVersion(live);

      expect([before, after]).toEqual([
        `ruff@0.9.9;mypy@missing;coverage@7.6.1;unittest;${jscpd}`,
        `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;unittest;${jscpd}`,
      ]);
    });
  });

  it('reports a missing environment when resolving the version', () => {
    const live = temporaryRoot();

    expect(() => createPythonAnalyzer({ environment: 'nowhere' }).resolveVersion(live)).toThrow(
      'No Python environment',
    );
  });
});
