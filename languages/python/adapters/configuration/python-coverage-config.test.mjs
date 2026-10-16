import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectCoverageRun, writeCoverageConfig } from './python-coverage-config.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-coverage-config-'));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const PROCESS_SETTINGS = {
  concurrency: ['multiprocessing', 'thread'],
  plugins: ['django_coverage_plugin'],
  omit: ['src/demo/generated.py'],
};

describe('the coverage settings of the project', () => {
  it.each([
    [
      '.coveragerc',
      '[run]\nbranch = False\nconcurrency = multiprocessing, thread\nplugins =\n    django_coverage_plugin\nomit = src/demo/generated.py\n',
    ],
    [
      'setup.cfg',
      '[metadata]\nname = demo\n[coverage:run]\nconcurrency =\n    multiprocessing\n    thread\nplugins = django_coverage_plugin\nomit = src/demo/generated.py\n',
    ],
    [
      'tox.ini',
      '[coverage:run]\nconcurrency = multiprocessing,thread\nplugins = django_coverage_plugin\nomit = src/demo/generated.py\n',
    ],
    [
      'pyproject.toml',
      '[tool.coverage.run]\nbranch = false\nconcurrency = ["multiprocessing", "thread"]\nplugins = ["django_coverage_plugin"]\nomit = ["src/demo/generated.py"]\n',
    ],
  ])('carries over concurrency, plugins and omit from %s', (file, text) => {
    expect(readProjectCoverageRun(project({ [file]: text }))).toEqual(PROCESS_SETTINGS);
  });

  it('reads the subprocess patch and the [coverage:run] section of .coveragerc', () => {
    const root = project({ '.coveragerc': '[coverage:run]\npatch = subprocess\n' });

    expect(readProjectCoverageRun(root)).toEqual({ patch: ['subprocess'] });
  });

  it('takes the first file with coverage settings, in the order coverage.py reads them', () => {
    const root = project({
      'setup.cfg': '[metadata]\nname = demo\n',
      'tox.ini': '[coverage:report]\nshow_missing = True\n',
      'pyproject.toml': '[tool.coverage.run]\nconcurrency = ["gevent"]\n',
    });

    expect(readProjectCoverageRun(root)).toEqual({});
    expect(readProjectCoverageRun(project({ 'pyproject.toml': '[project]\n' }))).toEqual({});
  });

  it('writes the settings after its own, keeping the test files out of measurement', () => {
    const root = project({
      '.coveragerc': '[run]\nconcurrency = multiprocessing\nomit = */gen/*\n',
    });
    const reportRoot = project({});

    const config = writeCoverageConfig({ projectRoot: root, reportRoot }, ['src', 'lib']);

    expect(config).toBe(path.join(reportRoot, 'coveragerc'));
    expect(readFileSync(config, 'utf8')).toBe(
      [
        '[run]',
        'branch = True',
        'parallel = False',
        'source =',
        '    src',
        '    lib',
        'omit =',
        '    */test_*.py',
        '    *_test.py',
        '    */tests.py',
        '    */conftest.py',
        '    */tests/*',
        '    */test/*',
        '    */gen/*',
        'concurrency =',
        '    multiprocessing',
        '[report]',
        'exclude_lines =',
        String.raw`    ^\s*if (typing\.)?TYPE_CHECKING:`,
        String.raw`    ^\s*if __name__ == .__main__.:`,
        String.raw`    ^\s*@(typing\.)?overload\b`,
        String.raw`    ^\s*raise NotImplementedError\b`,
        'partial_branches =',
        '',
      ].join('\n'),
    );
  });
});
