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
          importLinter: false,
          sourceRoots: ['src', 'tools/lib'],
        },
      });
      validate({ preset: 'python', python: { environment: 'envs/ci' } });
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
    [{ importLinter: 'yes' }, '"python.importLinter" must be true or false'],
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
