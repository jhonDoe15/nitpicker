import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeToolchain } from './fixtures/fake-toolchain.mjs';
import { createPythonAnalyzer, PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-analyzer-')));
  roots.push(root);
  return root;
}

afterEach(() => {
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
      'python-rules',
      'structure',
      'crap',
    ]);
    expect(analyzer.exclusions).toEqual([]);
    expect(analyzer.timeoutMs).toBe(30 * 60 * 1000);
    expect(analyzer.version).toBe('unresolved');
  });

  it('runs the runner with the snapshot, the live checkout and the settings', () => {
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
        '--project-root',
        '/snapshot',
        '--live-root',
        '/live',
        '--python-settings',
        JSON.stringify(settings),
      ],
      cwd: '/tool',
    });
  });

  it('leaves the settings out when there are none', () => {
    const { args } = createPythonAnalyzer().createInvocation({
      projectRoot: '/snapshot',
      liveProjectRoot: '/live',
      toolRoot: '/tool',
    });

    expect(args).toEqual([
      expect.stringMatching(/python-runner\.mjs$/),
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
  });

  it('resolves the versions of the tools in the live checkout environment', () => {
    const live = temporaryRoot();
    installFakeToolchain(path.join(live, '.venv/bin'));

    expect(createPythonAnalyzer().resolveVersion(live)).toBe(
      'ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1',
    );
    expect(createPythonAnalyzer({ formatter: 'black' }).resolveVersion(live)).toBe(
      'ruff@0.9.9;black@24.1.0;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1',
    );
    expect(createPythonAnalyzer({ typeChecker: 'pyright' }).resolveVersion(live)).toBe(
      'ruff@0.9.9;pyright@1.1.390;coverage@7.6.1;pytest@8.3.1',
    );
  });

  it('reports a missing environment when resolving the version', () => {
    const live = temporaryRoot();

    expect(() => createPythonAnalyzer({ environment: 'nowhere' }).resolveVersion(live)).toThrow(
      'No Python environment',
    );
  });
});
