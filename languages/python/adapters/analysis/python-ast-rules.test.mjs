import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProjects } from '../test-support/fake-project.mjs';
import { DEFAULT_NORECURSEDIRS } from '../configuration/pytest/pytest-config.mjs';
import { checkRules, contractFaces, pythonSources } from './python-ast-rules.mjs';

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
      marks: [],
      testFiles: [],
      entryFiles: [],
      entryModules: [],
      boundaryRoots: ['pydantic', 'pydantic_settings'],
      contractFaces: {},
    });
    expect(readFileSync(path.join(reportRoot, 'python-files.txt'), 'utf8')).toBe('src/demo/a.py');
    expect(readFileSync(path.join(reportRoot, 'rules.json'), 'utf8')).toBe('[{"rule":"x"}]');
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

  it('tells it which imports are the validation boundary, from the declared libraries', () => {
    const root = fakes.project({ 'requirements.txt': 'marshmallow\nmsgspec\n' });
    const { context, reportRoot } = fakes.contextFor(root);

    checkRules(context);

    expect(
      JSON.parse(readFileSync(path.join(reportRoot, 'rule-options.json'), 'utf8')).boundaryRoots,
    ).toEqual(['msgspec', 'marshmallow', 'marshmallow_dataclass']);
  });

  it('defaults the boundary to pydantic when no library is declared', () => {
    const root = fakes.project();
    const { context, reportRoot } = fakes.contextFor(root);

    checkRules(context);

    expect(
      JSON.parse(readFileSync(path.join(reportRoot, 'rule-options.json'), 'utf8')).boundaryRoots,
    ).toEqual(['pydantic', 'pydantic_settings']);
  });
});

describe('the public faces of the features the contract rule reads', () => {
  const sources = [
    'app/features/orders/__init__.py',
    'app/features/orders/service.py',
    'app/features/orders/_store.py',
    'app/features/orders/web/views.py',
    'app/features/helpers.py',
    'app/shared/db.py',
    'app/billing/ledger.py',
  ];

  it('are the __init__.py and the public modules directly in each feature folder', () => {
    expect(contractFaces(sources, {})).toEqual({
      'app/features/orders/__init__.py': 'app/features/orders',
      'app/features/orders/service.py': 'app/features/orders',
    });
  });

  it('follow the configured feature and shared roots', () => {
    const layout = { featureRoots: ['app'], sharedRoots: ['app/shared'] };

    expect(contractFaces(sources, layout)).toEqual({
      'app/billing/ledger.py': 'app/billing',
      'app/features/helpers.py': 'app/features',
    });
  });
});
