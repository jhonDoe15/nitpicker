import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readProjectCoverage,
  UNTESTABLE_LINES,
  writeCoverageConfig,
} from './python-coverage-config.mjs';
import { javascriptPattern } from '../../../ingest/coverage-reports/exhaustive-match.mjs';

const roots = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-coverage-config-')));
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

const settings = (root, { run = {}, omit = [], reportOmit = [] }) => ({
  run,
  omit: omit.map((pattern) => path.join(root, pattern)),
  reportOmit: reportOmit.map((pattern) => path.join(root, pattern)),
});
const PROCESS_RUN = {
  concurrency: ['multiprocessing', 'thread'],
  plugins: ['django_coverage_plugin'],
};

describe('the coverage settings of the project', () => {
  it.each([
    [
      '.coveragerc',
      '[run]\nbranch = False\nconcurrency = multiprocessing, thread\nplugins =\n    django_coverage_plugin\nomit = src/demo/generated.py\n[report]\nomit = */migrations/*\n',
    ],
    [
      'setup.cfg',
      '[metadata]\nname = demo\n[coverage:run]\nconcurrency =\n    multiprocessing\n    thread\nplugins = django_coverage_plugin\nomit = src/demo/generated.py\n[coverage:report]\nomit = */migrations/*\n',
    ],
    [
      'tox.ini',
      '[coverage:run]\nconcurrency = multiprocessing,thread\nplugins = django_coverage_plugin\nomit = src/demo/generated.py\n[coverage:report]\nomit = */migrations/*\n',
    ],
    [
      'pyproject.toml',
      '[tool.coverage.run]\nbranch = false\nconcurrency = ["multiprocessing", "thread"]\nplugins = ["django_coverage_plugin"]\nomit = ["src/demo/generated.py"]\n[tool.coverage.report]\nomit = ["*/migrations/*"]\n',
    ],
  ])('carries over concurrency, plugins and both omits from %s', (file, text) => {
    const root = project({ [file]: text });

    expect(readProjectCoverage(root)).toEqual({
      run: PROCESS_RUN,
      omit: [path.join(root, 'src/demo/generated.py')],
      reportOmit: ['*/migrations/*'],
    });
  });

  it('reads the subprocess patch and the [coverage:run] section of .coveragerc', () => {
    const root = project({ '.coveragerc': '[coverage:run]\npatch = subprocess\n' });

    expect(readProjectCoverage(root)).toEqual(settings(root, { run: { patch: ['subprocess'] } }));
  });

  it('keeps reading a list across comment and blank lines, as configparser does', () => {
    const root = project({
      '.coveragerc':
        '[run]\nomit =\n    a/*\n    # legacy\n\n    b/*\nconcurrency =\n # the workers\n    multiprocessing\n',
    });

    expect(readProjectCoverage(root)).toEqual(
      settings(root, { run: { concurrency: ['multiprocessing'] }, omit: ['a/*', 'b/*'] }),
    );
  });

  it.each([
    [
      '.coveragerc before setup.cfg and pyproject.toml',
      {
        '.coveragerc': '[run]\nconcurrency = thread\n',
        'setup.cfg': '[coverage:run]\nconcurrency = gevent\n',
        'pyproject.toml': '[tool.coverage.run]\nconcurrency = ["eventlet"]\n',
      },
      ['thread'],
    ],
    [
      'setup.cfg before pyproject.toml',
      {
        'setup.cfg': '[coverage:run]\nconcurrency = gevent\n',
        'pyproject.toml': '[tool.coverage.run]\nconcurrency = ["eventlet"]\n',
      },
      ['gevent'],
    ],
    [
      'pyproject.toml when the others have no coverage section',
      {
        'setup.cfg': '[metadata]\nname = demo\n',
        'tox.ini': '[testenv]\ncommands = pytest\n',
        'pyproject.toml': '[tool.coverage.run]\nconcurrency = ["eventlet"]\n',
      },
      ['eventlet'],
    ],
  ])('reads %s, the order coverage.py uses', (_, files, concurrency) => {
    const root = project(files);

    expect(readProjectCoverage(root)).toEqual(settings(root, { run: { concurrency } }));
  });

  it('stops at the first file with any coverage section, even without [run]', () => {
    const root = project({
      'tox.ini': '[coverage:report]\nshow_missing = True\n',
      'pyproject.toml': '[tool.coverage.run]\nconcurrency = ["gevent"]\n',
    });

    expect(readProjectCoverage(root)).toEqual(settings(root, {}));
    expect(readProjectCoverage(project({ 'pyproject.toml': '[project]\n' }))).toEqual(
      settings(root, {}),
    );
  });

  it('writes the settings after its own, keeping the test files out of measurement', () => {
    const root = project({
      '.coveragerc':
        '[run]\nconcurrency = multiprocessing\nomit = */gen/*\n[report]\nomit = legacy/*\n',
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
        `    ${path.join(root, 'src')}`,
        `    ${path.join(root, 'lib')}`,
        'omit =',
        '    */test_*.py',
        '    */*_test.py',
        '    */conftest.py',
        '    */tests/*',
        '    */test/*',
        '    */gen/*',
        'concurrency =',
        '    multiprocessing',
        '[report]',
        'omit =',
        `    ${path.join(root, 'legacy/*')}`,
        'exclude_lines =',
        ...UNTESTABLE_LINES.map((pattern) => `    ${pattern}`),
        'partial_branches =',
        '',
      ].join('\n'),
    );
  });

  it.each([
    ['    def write(self, text: str) -> object: ...', true],
    ['    async def read(self) -> bytes: ...  # stub', true],
    ['    def writelines(\n        self,\n        rows: list[str],\n    ) -> object: ...', true],
    ['    def get[T](self, key: Callable[[int], T] = f(1)) -> dict[str, T]: ...', true],
    ['    def get(self) -> dict[\n        str, int\n    ]: ...', true],
    ['        case _:\n            assert_never(color)', true],
    ['        case _:  # all\n            typing_extensions.assert_never(c)\n\n    return 2', true],
    ['    def write(self, text: str) -> object:', false],
    ['def first(x):\n    ...\n    return compute(x)', false],
    ['    except (\n        ValueError,\n    ):\n        ...\n        return -1', false],
    ['    if (\n        x\n    ): ...', false],
    ['    with (\n        open(a) as b,\n    ): ...', false],
    ['class A(\n    Base,\n): ...', false],
    ['def make(): return lambda: ...', false],
    ['    return ...', false],
    ['        case _:\n            return "other"', false],
    ['        case _:\n            assert_never(c)\n            return 0', false],
    ['        case _:\n            assert_never(c)\n\n            print(c)', false],
    ['        case _: assert_never(c)', false],
    ['        case _:\n            assert_never(compute())', false],
    ['        case _:\n            mylib.assert_never(c)', false],
    ['    else:\n        assert_never(x)', false],
    ['    assert_never(a) if a > 100 else print(a)', false],
    ['handler: Callable[..., int] = run', false],
  ])('excludes %j only when no honest test can run it: %s', (source, excluded) => {
    const config = readFileSync(
      writeCoverageConfig({ projectRoot: project({}), reportRoot: project({}) }, ['src']),
      'utf8',
    );
    const patterns = config
      .split('exclude_lines =\n')[1]
      .split('\npartial_branches')[0]
      .split('\n')
      .map((pattern) => javascriptPattern(pattern.trim(), 'mu'));

    expect(patterns.some((pattern) => pattern.test(source))).toBe(excluded);
  });
});
