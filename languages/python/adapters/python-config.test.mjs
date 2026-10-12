import { describe, expect, it } from 'vitest';
import { validatePythonConfig } from './python-config.mjs';

const TYPESCRIPT_ONLY = ['layout', 'exceptions'];
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
          sourceRoots: ['src', 'tools/lib'],
        },
      });
      validate({ preset: 'python', python: { environment: 'envs/ci' } });
      validate({
        preset: 'python',
        python: {
          typeChecker: 'pyright',
          exceptions: [{ rule: 'T201', paths: ['scripts/**'], reason: 'command line scripts' }],
        },
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
    [{ exceptions: {} }, '"python.exceptions" must be an array'],
    [{ exceptions: ['T201'] }, '"python.exceptions[0]" must be an object'],
    [
      { exceptions: [{ rule: 'T201', paths: ['a'], reason: 'r', why: 'x' }] },
      'unknown key "why" in "python.exceptions[0]". Allowed keys: rule, paths, reason',
    ],
    [
      { exceptions: [{ paths: ['a'], reason: 'r' }] },
      '"python.exceptions[0].rule" must be a non-empty rule id',
    ],
    [
      { exceptions: [{ rule: 'T201', paths: [], reason: 'r' }] },
      '"python.exceptions[0].paths" needs at least one path glob',
    ],
    [
      { exceptions: [{ rule: 'T201', paths: ['a'], reason: '  ' }] },
      '"python.exceptions[0].reason" is required: say why the rule is lifted for these paths',
    ],
    [{ environment: '' }, '"python.environment" must be a non-empty string'],
    [{ environment: '../outside' }, '"python.environment" must be a path inside the project'],
    [{ environment: '/usr' }, '"python.environment" must be a path inside the project'],
    [{ sourceRoots: 'src' }, '"python.sourceRoots" must be an array of non-empty strings'],
    [{ sourceRoots: [] }, '"python.sourceRoots" must not be empty'],
    [{ sourceRoots: ['../src'] }, '"python.sourceRoots" must be a path inside the project'],
  ])('rejects the settings %j', (settings, message) => {
    expect(() => {
      validate({ preset: 'python', python: settings });
    }).toThrow(message);
  });
});
