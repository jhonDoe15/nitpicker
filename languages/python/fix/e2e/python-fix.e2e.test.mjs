import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../core/fix/test-support/fix-project.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { fix } = useFixProject();

const PROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';
const BLACK = `${PROJECT}[tool.black]\nline-length = 88\n`;
const MISFORMATTED = 'value  =  1\n';
const FORMATTED = 'value = 1\n';
const UNUSED_IMPORT = 'import os\nvalue = 1\n';
const EDITED_LEGACY = 'value  =  2\n';

function repository(pyproject) {
  return {
    committed: {
      'nitpicker.config.json': '{ "preset": "python" }\n',
      'pyproject.toml': pyproject,
      'changed.py': FORMATTED,
      'untouched.py': MISFORMATTED,
      'dirty_base.py': MISFORMATTED,
    },
    changed: {
      'changed.py': MISFORMATTED,
      'added.py': MISFORMATTED,
      'dirty_base.py': EDITED_LEGACY,
    },
  };
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
    },
    base: result.baseSource('changed.py'),
  };
}

function expectedOutcome(label) {
  return {
    exitCode: 0,
    report: `Fixed files:\nadded.py\nchanged.py\nFix notes:\n  ${label} rewrote added.py, changed.py\n  ${label} left dirty_base.py as is: already unformatted before your change\n`,
    files: {
      changed: FORMATTED,
      added: FORMATTED,
      untouched: MISFORMATTED,
      dirtyBase: EDITED_LEGACY,
    },
    base: FORMATTED,
  };
}

describe.skipIf(!enabled)('nitpicker --fix for Python', () => {
  it.each([
    ['ruff format', PROJECT],
    ['black', BLACK],
  ])('rewrites the changed files with %s and leaves the others alone', (label, pyproject) => {
    const result = fix(repository(pyproject));

    expect(outcomeOf(result), result.stdout + result.stderr).toEqual(expectedOutcome(label));
  });
  it('applies the safe ruff fixes for the rules nitpicker selects', () => {
    const result = fix({
      committed: {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        'pyproject.toml': PROJECT,
        'app.py': FORMATTED,
      },
      changed: { 'app.py': UNUSED_IMPORT },
    });

    expect(
      { exitCode: result.exitCode, report: fixReport(result.stdout), app: result.read('app.py') },
      result.stdout + result.stderr,
    ).toEqual({
      exitCode: 0,
      report: 'Fixed files:\napp.py\nFix notes:\n  ruff check --fix rewrote app.py\n',
      app: FORMATTED,
    });
  });
});
