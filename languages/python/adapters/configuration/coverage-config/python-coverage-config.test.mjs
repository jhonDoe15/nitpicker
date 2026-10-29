import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectCoverage, writeCoverageConfig } from './python-coverage-config.mjs';

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

describe('the project coverage config under tools.coverage', () => {
  const PYPROJECT = [
    '[tool.coverage.run]',
    'timid = true',
    'branch = false',
    'source = ["elsewhere"]',
    'omit = ["src/gen/*"]',
    '[tool.coverage.report]',
    'exclude_lines = ["pragma: no cover"]',
    'exclude_also = ["def __repr__"]',
    'partial_branches = ["pragma: no branch"]',
    'fail_under = 100',
    '',
  ].join('\n');
  const TEST_OMITS = ['*/test_*.py', '*/*_test.py', '*/conftest.py', '*/tests/*', '*/test/*'];
  const UNTESTABLE = [
    String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
    String.raw`^\s*if __name__ == .__main__.:`,
    String.raw`^\s*@(typing\.)?overload\b`,
    String.raw`^\s*raise NotImplementedError\b`,
  ];
  const OPTED_EXCLUSIONS = {
    excluded: ['pragma: no cover', 'def __repr__'],
    partial: ['pragma: no branch'],
  };
  function listed(key, values) {
    return [`${key} =`, ...values.map((value) => `    ${value}`)];
  }

  function expected(projectRoot, { omit = [], run = [], excluded = [], partial = [] }) {
    return [
      '[run]',
      'branch = True',
      'parallel = False',
      ...listed('source', [path.join(projectRoot, 'src')]),
      ...listed('omit', [...TEST_OMITS, ...omit]),
      ...run,
      '[report]',
      ...listed('exclude_lines', [...UNTESTABLE, ...excluded]),
      ...listed('partial_branches', partial),
      '',
    ].join('\n');
  }

  function written(precedence, { files = { 'pyproject.toml': PYPROJECT }, policyFiles } = {}) {
    const projectRoot = project(files);
    const policyRoot = policyFiles === undefined ? projectRoot : project(policyFiles);
    const context = {
      projectRoot,
      policyRoot,
      reportRoot: project({}),
      toolPrecedence: precedence === undefined ? undefined : { coverage: precedence },
    };
    return { text: readFileSync(writeCoverageConfig(context, ['src']), 'utf8'), projectRoot };
  }

  it('reads only omit and the process options without the opt-in', () => {
    const { text, projectRoot } = written(['nitpicker']);

    expect(text).toBe(expected(projectRoot, { omit: [path.join(projectRoot, 'src/gen/*')] }));
  });

  it('adds the project exclusions and run options when the project is listed first', () => {
    for (const precedence of [['project', 'nitpicker'], ['project']]) {
      const { text, projectRoot } = written(precedence);

      expect(text).toBe(
        expected(projectRoot, {
          omit: [path.join(projectRoot, 'src/gen/*')],
          run: ['timid = True'],
          ...OPTED_EXCLUSIONS,
        }),
      );
    }
  });

  it('keeps the nitpicker exclusions alone when nitpicker is listed first', () => {
    const { text, projectRoot } = written(['nitpicker', 'project']);

    expect(text).toBe(
      expected(projectRoot, { omit: [path.join(projectRoot, 'src/gen/*')], run: ['timid = True'] }),
    );
  });

  it('reads the config of the head checkout and resolves omit in the checked snapshot', () => {
    const { text, projectRoot } = written(['project', 'nitpicker'], {
      files: { '.coveragerc': '[report]\nexclude_lines = base only\n' },
      policyFiles: { 'pyproject.toml': PYPROJECT },
    });

    expect(text).toBe(
      expected(projectRoot, {
        omit: [path.join(projectRoot, 'src/gen/*')],
        run: ['timid = True'],
        ...OPTED_EXCLUSIONS,
      }),
    );
  });

  it('reads regexes one per line from an ini file, commas included', () => {
    const { text, projectRoot } = written(['project'], {
      files: {
        'setup.cfg': '[coverage:report]\nexclude_also =\n    raise AssertionError(.*, .*)\n',
      },
    });

    expect(text).toBe(expected(projectRoot, { excluded: ['raise AssertionError(.*, .*)'] }));
  });

  it('fails when the project is listed without a coverage config, or with one that does not parse', () => {
    expect(() => written(['project'], { files: { 'pyproject.toml': '[project]\n' } })).toThrow(
      /^"tools\.coverage\.precedence" lists "project" but a coverage config .* is missing/,
    );
    expect(() => written(['project'], { files: { 'pyproject.toml': '[tool.coverage\n' } })).toThrow(
      /^The coverage config pyproject\.toml could not be parsed/,
    );
  });
});
