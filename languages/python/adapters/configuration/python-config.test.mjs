import { describe, expect, it } from 'vitest';
import { validatePythonConfig } from './python-config.mjs';

const TYPESCRIPT_ONLY = ['layout', 'react'];
function validate(config) {
  validatePythonConfig(config, TYPESCRIPT_ONLY);
}

describe('python config validation', () => {
  it('accepts the python preset with and without settings', () => {
    expect(() => {
      validate({ preset: 'python' });
      validate({
        preset: 'python',
        python: {
          environment: 'uv',
          formatter: 'black',
          testRunner: 'unittest',
          importLinter: false,
          sourceRoots: ['src', 'tools/lib'],
        },
      });
      validate({ preset: 'python', python: { environment: 'envs/ci' } });
      validate({ preset: 'python', python: { environment: '/opt/venv' } });
      validate({
        preset: 'python',
        python: { typeChecker: 'pyright' },
        exceptions: [{ rule: 'T201', paths: ['scripts/**'], reason: 'command line scripts' }],
      });
    }).not.toThrow();
  });

  it.each([
    'T201',
    'T20',
    'PTH',
    'PTH118',
    'UP031',
    'F',
    'F401',
    'frozen-dataclass',
    'no-inline-suppression',
    'stub-beside-source',
    'arg-type',
    'import-not-found',
    'reportReturnType',
    'function-lines-limit',
    'structure/function-lines-limit',
    'folder-files-limit',
  ])('accepts the exception rule %s', (rule) => {
    expect(() => {
      validate({
        preset: 'python',
        exceptions: [{ rule, paths: ['src/**'], reason: 'r' }],
      });
    }).not.toThrow();
  });

  it('ignores configs of other presets', () => {
    expect(() => {
      validate({});
      validate({ preset: 'java', layout: {} });
    }).not.toThrow();
  });

  it('rejects the python key with another preset', () => {
    expect(() => {
      validate({ preset: 'java', python: {} });
    }).toThrow('"python" is only supported with "preset": "python"');
    expect(() => {
      validate({ python: {} });
    }).toThrow('only supported with "preset": "python"');
  });

  it('has no python.exceptions: every rule goes in the top-level exceptions', () => {
    expect(() => {
      validate({ preset: 'python', python: { exceptions: [] } });
    }).toThrow('"python.exceptions" does not exist: put the entries in the top-level "exceptions"');
  });

  it.each(TYPESCRIPT_ONLY)('rejects %s instead of ignoring it', (key) => {
    expect(() => {
      validate({ preset: 'python', [key]: {} });
    }).toThrow(`"${key}" is not supported with "preset": "python"`);
  });

  it.each([
    [[], '"python" must be an object'],
    [
      { interpreter: 'python3' },
      'unknown key "interpreter" in "python". Allowed keys: environment',
    ],
    [{ formatter: 'yapf' }, '"python.formatter" must be one of: ruff, black'],
    [{ testRunner: 'nose' }, '"python.testRunner" must be one of: pytest, unittest'],
    [{ typeChecker: 'pytype' }, '"python.typeChecker" must be one of: mypy, pyright'],
    [{ importLinter: 'yes' }, '"python.importLinter" must be true or false'],
    [{ environment: '' }, '"python.environment" must be a non-empty string'],
    [{ environment: '../outside' }, '"python.environment" must be a path inside the project'],
    [{ sourceRoots: 'src' }, '"python.sourceRoots" must be an array of non-empty strings'],
    [{ sourceRoots: [] }, '"python.sourceRoots" must not be empty'],
    [{ sourceRoots: ['../src'] }, '"python.sourceRoots" must be a path inside the project'],
  ])('rejects the settings %j', (settings, message) => {
    expect(() => {
      validate({ preset: 'python', python: settings });
    }).toThrow(message);
  });

  it.each([
    [
      { rule: 'T210', paths: ['a'], reason: 'r' },
      '"exceptions[1].rule" names no rule nitpicker reports: "T210"; use the id printed in the finding',
    ],
    [{ rule: 'E501', paths: ['a'], reason: 'r' }, 'names no rule nitpicker reports: "E501"'],
    [{ rule: 'B008', paths: ['a'], reason: 'r' }, 'names no rule nitpicker reports: "B008"'],
    [
      { rule: 'Frozen', paths: ['a'], reason: 'r' },
      '"exceptions[1].rule" names no rule nitpicker reports: "Frozen"',
    ],
    [
      { rule: 'frozen-dataclas', paths: ['a'], reason: 'r' },
      '"frozen-dataclas"; did you mean "frozen-dataclass"?',
    ],
  ])('rejects the exception %j', (entry, message) => {
    expect(() => {
      validate({
        preset: 'python',
        exceptions: [{ rule: 'T201', paths: ['a'], reason: 'r' }, entry],
      });
    }).toThrow(message);
  });
});
