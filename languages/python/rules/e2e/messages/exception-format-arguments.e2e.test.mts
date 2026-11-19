import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

describe.skipIf(!enabled)('exception-format-arguments', () => {
  itOutcomes('flags an exception built like a logger call', [
    [
      'a builtin exception with a percent placeholder',
      code('def run(path):', '    raise ValueError("path %s not found", path)'),
      ['exception-format-arguments:2 ValueError|percent'],
    ],
    [
      'a library exception named like an error',
      code(
        'from airflow.exceptions import AirflowException',
        '',
        '',
        'def run(path):',
        '    raise AirflowException("Repository path: %s not found", path)',
      ),
      ['exception-format-arguments:5 AirflowException|percent'],
    ],
    [
      'a brace placeholder and a project exception',
      code(
        'class MissingRow(Exception):',
        '    pass',
        '',
        '',
        'def run(key, other):',
        '    if key:',
        '        raise MissingRow("row {} missing", key)',
        '    raise MissingRow("row {name} of {other} missing", key, other)',
      ),
      [
        'exception-format-arguments:7 MissingRow|braces',
        'exception-format-arguments:8 MissingRow|braces',
      ],
    ],
    [
      'an exception that is built and not raised',
      code('def run(path, errors):', '    errors.append(OSError("cannot read %r", path))'),
      ['exception-format-arguments:2 OSError|percent'],
    ],
  ]);

  itOutcomes('stays quiet for formatted text and exceptions that format themselves', [
    [
      'formatting applied to the literal',
      code(
        'def run(path):',
        '    if path:',
        '        raise ValueError("path %s not found" % path)',
        '    if path is None:',
        '        raise ValueError("path {} not found".format(path))',
        '    raise ValueError(f"path {path} not found")',
      ),
      [],
    ],
    [
      'a second argument with no placeholder in the text',
      code('def run(code):', '    raise ValueError("bad value", code)', ''),
      [],
    ],
    [
      'a project exception that formats in its constructor',
      code(
        'class Formatted(Exception):',
        '    def __init__(self, text, *args):',
        '        super().__init__(text % args)',
        '',
        '',
        'def run(path):',
        '    raise Formatted("path %s not found", path)',
      ),
      [],
    ],
    [
      'a project exception whose mixin base formats the arguments',
      code(
        'class FormatMixin:',
        '    def __str__(self):',
        '        return self.args[0] % self.args[1:]',
        '',
        '',
        'class MixError(FormatMixin, ValueError):',
        '    pass',
        '',
        '',
        'def run(path):',
        '    raise MixError("path %s not found", path)',
      ),
      [],
    ],
    [
      'a syntax error with a details tuple',
      code('def run(name):', '    raise SyntaxError("unexpected {}", (name, 1))'),
      [],
    ],
    [
      'a validation error with a code and a literal percent',
      code(
        'from django.core.exceptions import ValidationError',
        '',
        '',
        'def run(value):',
        '    raise ValidationError("invalid %(value)s", "invalid")',
        '',
        '',
        'def other(code):',
        '    raise ValueError("100% done", code)',
      ),
      [],
    ],
    [
      'unpacked arguments and calls that are not exceptions',
      code(
        'import logging',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def run(args, path):',
        '    logger.info("path %s", path)',
        '    print("name %s", path)',
        '    raise ValueError("path %s", *args)',
      ),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_run.py',
        code: code('def test_run(path):', '    raise ValueError("path %s", path)'),
      },
      [],
    ],
  ]);
});
