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
      validate({ preset: 'python', python: { environment: '/opt/venv' } });
      validate({
        preset: 'python',
        python: {
          typeChecker: 'basedpyright',
          exceptions: [{ rule: 'T201', paths: ['scripts/**'], reason: 'command line scripts' }],
        },
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
    'swallowed-exception',
    'blind-suppress',
    'arg-type',
    'import-not-found',
    'reportReturnType',
    'reportAny',
    'reportImplicitOverride',
    'reportUnusedCallResult',
  ])('accepts the exception rule %s', (rule) => {
    expect(() => {
      validate({
        preset: 'python',
        python: { exceptions: [{ rule, paths: ['src/**'], reason: 'r' }] },
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

  it('sends test-console-output to the top-level exceptions', () => {
    const exceptions = [{ rule: 'test-console-output', paths: ['tests/legacy/**'], reason: 'r' }];

    expect(() => {
      validate({ preset: 'python', python: { exceptions } });
    }).toThrow(
      '"python.exceptions[0].rule" is "test-console-output", a rule shared by every preset: lift it in the top-level "exceptions" instead',
    );
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
    [{ testRunner: 'nose' }, '"python.testRunner" must be one of: pytest, unittest, django, nose2'],
    [{ typeChecker: 'pytype' }, '"python.typeChecker" must be one of: mypy, pyright, basedpyright'],
    [{ exceptions: {} }, '"python.exceptions" must be an array'],
    [{ exceptions: ['T201'] }, '"python.exceptions[0]" must be an object'],
    [
      { exceptions: [{ rule: 'T201', paths: ['a'], reason: 'r', why: 'x' }] },
      'unknown key "why" in "python.exceptions[0]". Allowed keys: rule, paths, packages, reason',
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
    [
      { exceptions: [{ rule: 'T210', paths: ['a'], reason: 'r' }] },
      '"python.exceptions[0].rule" names no rule nitpicker reports: "T210"; use the id printed in the finding',
    ],
    [
      { exceptions: [{ rule: 'folder-files-limit', paths: ['a'], reason: 'r' }] },
      'a rule shared by every preset: lift it in the top-level "exceptions" instead',
    ],
    [
      { exceptions: [{ rule: 'E501', paths: ['a'], reason: 'r' }] },
      'names no rule nitpicker reports: "E501"',
    ],
    [
      { exceptions: [{ rule: 'B008', paths: ['a'], reason: 'r' }] },
      'names no rule nitpicker reports: "B008"',
    ],
    [
      { exceptions: [{ rule: 'S110', paths: ['a'], reason: 'r' }] },
      'names no rule nitpicker reports: "S110"; ruff S110 was replaced by "swallowed-exception": rename the entry to "swallowed-exception"',
    ],
    ...['restating-docstring', 'long-docstring'].map((rule) => [
      { exceptions: [{ rule, paths: ['a'], reason: 'r' }] },
      `names no rule nitpicker reports: "${rule}"; ${rule} is now the shared "doc-comment-content" rule: move the entry to the top-level "exceptions" as "doc-comment-content"`,
    ]),
    [
      { exceptions: [{ rule: 'unused-option', paths: ['a'], reason: 'r' }] },
      'a rule shared by every preset: lift it in the top-level "exceptions" instead',
    ],
    [
      { exceptions: [{ rule: 'doc-comment-content', paths: ['a'], reason: 'r' }] },
      'a rule shared by every preset: lift it in the top-level "exceptions" instead',
    ],
    [
      {
        exceptions: [
          { rule: 'T201', paths: ['a'], reason: 'r' },
          { rule: 'Frozen', paths: ['a'], reason: 'r' },
        ],
      },
      '"python.exceptions[1].rule" names no rule nitpicker reports: "Frozen"',
    ],
    [
      { exceptions: [{ rule: 'frozen-dataclas', paths: ['a'], reason: 'r' }] },
      '"frozen-dataclas"; did you mean "frozen-dataclass"?',
    ],
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
});
