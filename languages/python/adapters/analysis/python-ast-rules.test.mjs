import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from '../test-support/fake-project.mjs';
import { DEFAULT_NORECURSEDIRS } from '../configuration/pytest/pytest-config.mjs';
import { checkRules, pythonSources } from './python-ast-rules.mjs';

const fakes = createFakeProjects();

afterEach(() => {
  fakes.cleanup();
});

describe('the Python files the rules look at', () => {
  it('are the ones ruff would lint, as project-relative paths', () => {
    const root = fakes.project({
      'src/demo/__init__.py': '',
      'src/demo/a.py': '',
      'tests/test_a.py': '',
      'notes.txt': '',
    });
    const { context } = fakes.contextFor(root);

    expect(pythonSources(context)).toEqual([
      'src/demo/__init__.py',
      'src/demo/a.py',
      'tests/test_a.py',
    ]);
  });

  it('ignore anything ruff lists that is not a Python source or not in the project', () => {
    const root = fakes.project({
      'sources.txt': 'src/demo/a.py\nnotebook.ipynb\n../outside.py\n',
    });
    const { context } = fakes.contextFor(root);

    expect(pythonSources(context)).toEqual(['src/demo/a.py']);
  });
});

describe('running the rules script', () => {
  it('hands it the file list and the report path, isolated from the project', () => {
    const logFile = path.join(fakes.temporaryRoot(), 'calls.jsonl');
    process.env.FAKE_PYTHON_LOG = logFile;
    const root = fakes.project({ 'src/demo/a.py': '', 'rules.json': '[{"rule":"x"}]' });
    const { context, reportRoot } = fakes.contextFor(root);

    try {
      checkRules(context);
    } finally {
      Reflect.deleteProperty(process.env, 'FAKE_PYTHON_LOG');
    }

    const [call] = fakes
      .calls(logFile)
      .filter(({ tool, args }) => tool === 'python' && args[0] === '-I');
    expect(call.args).toEqual([
      '-I',
      expect.stringMatching(/rules\/nitpicker_rules\.py$/),
      path.join(reportRoot, 'python-files.txt'),
      path.join(reportRoot, 'rules.json'),
      path.join(reportRoot, 'rule-options.json'),
    ]);
    expect(JSON.parse(readFileSync(path.join(reportRoot, 'rule-options.json'), 'utf8'))).toEqual({
      sourceRoots: context.project.sourceRoots,
      testRunner: context.project.testRunner,
      pythonFiles: ['test_*.py', '*_test.py'],
      pythonClasses: ['Test'],
      pythonFunctions: ['test'],
      norecursedirs: DEFAULT_NORECURSEDIRS,
      testpaths: [],
      deselected: [],
      ignored: [],
      ignoredGlobs: [],
      keywords: [],
      testFiles: [],
      entryFiles: [],
      entryModules: [],
      modules: { 'src/demo/a.py': 'demo.a' },
      published: false,
      entryPoints: [],
      invalidFiles: [],
    });
    expect(readFileSync(path.join(reportRoot, 'python-files.txt'), 'utf8')).toBe('src/demo/a.py');
    expect(readFileSync(path.join(reportRoot, 'rules.json'), 'utf8')).toBe('[{"rule":"x"}]');
  });

  it('hands it the production modules and the package facts', () => {
    const root = fakes.project({
      'pyproject.toml':
        '[project]\nname = "shop"\n[project.scripts]\nshop = "shop.cli:main"\n[build-system]\nbuild-backend = "hatchling.build"\n',
      'src/shop/__init__.py': '',
      'src/shop/cli.py': '',
      'tests/test_cli.py': '',
      'testing/helpers.py': '',
      'src/shop/tests.py': '',
      'src/shop/testing/fakes.py': '',
    });
    const { context, reportRoot } = fakes.contextFor(root);

    checkRules(context);

    expect(
      JSON.parse(readFileSync(path.join(reportRoot, 'rule-options.json'), 'utf8')),
    ).toMatchObject({
      modules: {
        'src/shop/__init__.py': 'shop',
        'src/shop/cli.py': 'shop.cli',
        'src/shop/testing/fakes.py': 'shop.testing.fakes',
      },
      testFiles: ['src/shop/tests.py', 'testing/helpers.py', 'tests/test_cli.py'],
      entryModules: ['shop.cli'],
      published: true,
      entryPoints: ['shop.cli:main'],
      invalidFiles: [],
    });
  });

  it('fails with the rules-failed rule when python fails', () => {
    const root = fakes.project({ 'fail.json': JSON.stringify({ python: 'no interpreter' }) });
    const { context } = fakes.contextFor(root);

    expect(() => {
      checkRules(context);
    }).toThrow(
      expect.objectContaining({
        rule: 'rules-failed',
        message: expect.stringContaining('no interpreter'),
      }),
    );
  });
});
