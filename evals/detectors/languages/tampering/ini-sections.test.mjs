import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageConfigEdits } from './config-files.mjs';

const detect = (file, before, after) =>
  detectLanguageConfigEdits(toTree({ [file]: before }), toTree({ [file]: after }));

describe('pytest options that are not the gate', () => {
  it('ignores pythonpath and markers in pyproject.toml', () => {
    const base = '[tool.pytest.ini_options]\naddopts = "-q"\n';
    const after = `${base}pythonpath = ["src"]\nmarkers = ["slow: slow tests"]\n`;
    expect(detect('pyproject.toml', base, after)).toEqual([]);
  });

  it('ignores markers and pythonpath in setup.cfg, continuation lines included', () => {
    const base = '[tool:pytest]\naddopts = -q\n';
    const after = `${base}markers =\n    slow: slow tests\n    fast: fast tests\npythonpath = src\n`;
    expect(detect('setup.cfg', base, after)).toEqual([]);
  });

  it('reports testpaths and python_files', () => {
    const base = '[tool:pytest]\naddopts = -q\n';
    expect(detect('setup.cfg', base, `${base}testpaths = other\n`)).toHaveLength(1);
    expect(detect('setup.cfg', base, `${base}python_files = nothing_*.py\n`)).toHaveLength(1);
  });
});

describe('tox.ini', () => {
  const base = '[tox]\nenvlist = py\n\n[testenv]\ndeps = pytest\ncommands =\n    pytest tests\n';

  it('reports a changed test command', () => {
    const after = base.replace('pytest tests', 'pytest tests -k "not slow"');
    expect(detect('tox.ini', base, after)).toMatchObject([{ kind: 'config-edit' }]);
  });

  it('ignores changed dependencies', () => {
    expect(
      detect('tox.ini', base, base.replace('deps = pytest', 'deps = pytest\n    httpx')),
    ).toEqual([]);
  });
});
