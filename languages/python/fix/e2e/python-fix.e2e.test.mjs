import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../core/fix/test-support/fix-project.mjs';
import { installPackages } from '../../adapters/e2e/test-support/python-e2e-support.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { fix } = useFixProject();

const PROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';
const BLACK = `${PROJECT}[tool.black]\nline-length = 88\n`;
const MISFORMATTED = 'value  =  1\n';
const FORMATTED = 'value = 1\n';
const UNUSED_IMPORT = 'import os\nvalue = 1\n';
const SUPPRESSED = (value) => `import json  # noqa: F401\n\nx = ${value}\n`;
const EDITED_LEGACY = 'value  =  2\n';

const GATE_CONFIG = '{ "preset": "python", "disable": ["mutation"] }\n';
const GATE_PACKAGES = ['coverage', 'pytest', 'ruff'];
const NOTEBOOK = `${JSON.stringify({
  cells: [
    {
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: ['value  =  1'],
    },
  ],
  metadata: { language_info: { name: 'python' } },
  nbformat: 4,
  nbformat_minor: 5,
})}\n`;

function repository(pyproject, black = 'black') {
  return {
    committed: {
      '.gitignore': 'node_modules/\n.venv/\n',
      'nitpicker.config.json': GATE_CONFIG,
      'pyproject.toml': pyproject,
      'test_demo.py': 'def test_demo():\n    assert True\n',
      'changed.py': FORMATTED,
      'untouched.py': MISFORMATTED,
      'dirty_base.py': MISFORMATTED,
    },
    changed: {
      'changed.py': MISFORMATTED,
      'added.py': MISFORMATTED,
      'dirty_base.py': EDITED_LEGACY,
      'notebook.ipynb': NOTEBOOK,
      'windows.py': 'value  =  1\r\n',
    },
    prepare: (root) => {
      installPackages(root, [...GATE_PACKAGES, black]);
    },
    realAnalyzers: true,
  };
}

function formatFindings(result) {
  return result
    .newFindings()
    .filter(({ rule }) => rule === 'format')
    .map(({ tool, path: file }) => `${tool} ${file}`);
}

function outcomeOf(result) {
  return {
    exitCode: result.exitCode,
    report: fixReport(result.stdout),
    files: {
      changed: result.read('changed.py'),
      added: result.read('added.py'),
      untouched: result.read('untouched.py'),
      dirtyBase: result.read('dirty_base.py'),
      notebook: result.read('notebook.ipynb') === NOTEBOOK ? 'as is' : 'formatted',
      windows: result.read('windows.py'),
    },
    base: result.baseSource('changed.py'),
  };
}

const NOTEBOOK_SKIPPED =
  '  black left notebook.ipynb as is: Black formats notebooks only with its jupyter extra (black[jupyter]) installed\n';

function expectedOutcome(label, notebook) {
  const rewritten = [
    'added.py',
    'changed.py',
    ...(notebook ? ['notebook.ipynb'] : []),
    'windows.py',
  ];
  return {
    exitCode: 0,
    report: `Fixed files:\n${rewritten.join('\n')}\nFix notes:\n  ${label} rewrote ${rewritten.join(', ')}\n  ${label} left dirty_base.py as is: already unformatted before your change\n${notebook ? '' : NOTEBOOK_SKIPPED}`,
    files: {
      changed: FORMATTED,
      added: FORMATTED,
      untouched: MISFORMATTED,
      dirtyBase: EDITED_LEGACY,
      notebook: notebook ? 'formatted' : 'as is',
      windows: 'value = 1\r\n',
    },
    base: FORMATTED,
  };
}

describe.skipIf(!enabled)('nitpicker --fix for Python', () => {
  it.each([
    { label: 'ruff format', pyproject: PROJECT, black: 'black', notebook: true },
    { label: 'black', pyproject: BLACK, black: 'black', notebook: false },
    { label: 'black', pyproject: BLACK, black: 'black[jupyter]', notebook: true },
  ])(
    'rewrites the changed files with $label next to $black, leaves the others alone and passes the format check of the gate',
    ({ label, pyproject, black, notebook }) => {
      const result = fix(repository(pyproject, black));

      expect(
        { ...outcomeOf(result), gateFormatFindings: formatFindings(result) },
        result.stdout + result.stderr,
      ).toEqual({ ...expectedOutcome(label, notebook), gateFormatFindings: [] });
    },
  );
  it('applies the safe ruff fixes for the rules nitpicker selects and honours noqa comments', () => {
    const result = fix({
      committed: {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        'pyproject.toml': PROJECT,
        'app.py': FORMATTED,
        'suppressed.py': SUPPRESSED(1),
      },
      changed: { 'app.py': UNUSED_IMPORT, 'suppressed.py': SUPPRESSED(2) },
    });

    expect(
      {
        exitCode: result.exitCode,
        report: fixReport(result.stdout),
        app: result.read('app.py'),
        suppressed: result.read('suppressed.py'),
      },
      result.stdout + result.stderr,
    ).toEqual({
      exitCode: 0,
      report: 'Fixed files:\napp.py\nFix notes:\n  ruff check --fix rewrote app.py\n',
      app: FORMATTED,
      suppressed: SUPPRESSED(2),
    });
  });
});
