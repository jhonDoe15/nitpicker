import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

describe.skipIf(!enabled)('unformatted-message-placeholder', () => {
  itOutcomes('flags a message that keeps the braces of a name in scope', [
    [
      'an attribute of a parameter in an exception message',
      code('def run(url):', '    raise ValueError("Path {url.path} is not supported")'),
      ['unformatted-message-placeholder:2 {url.path}'],
    ],
    [
      'a call on a caught exception',
      code(
        'class Transient(Exception):',
        '    pass',
        '',
        '',
        'def run(work):',
        '    try:',
        '        work()',
        '    except OSError as exc:',
        '        raise Transient("transient error: {str(exc)}")',
      ),
      ['unformatted-message-placeholder:9 {str(exc)}'],
    ],
    [
      'a log message',
      code(
        'import logging',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def run(user_id):',
        '    logger.exception("Failed for user_id:{user_id}")',
      ),
      ['unformatted-message-placeholder:7 {user_id}'],
    ],
    [
      'an assert message and a warning',
      code(
        'import warnings',
        '',
        '',
        'def run(count, name):',
        '    assert count > 0, "need {count} rows"',
        '    warnings.warn("renamed {name}")',
      ),
      ['unformatted-message-placeholder:5 {count}', 'unformatted-message-placeholder:6 {name}'],
    ],
    [
      'a module name in a message with a format spec',
      code(
        'LIMIT = 3',
        '',
        '',
        'def run():',
        '    raise RuntimeError("limit {LIMIT:>4} exceeded")',
      ),
      ['unformatted-message-placeholder:5 {LIMIT:>4}'],
    ],
  ]);

  itOutcomes('stays quiet when the text is formatted or is not a message', [
    [
      'an f-string, format and percent forms',
      code(
        'def run(url, name):',
        '    if url:',
        '        raise ValueError(f"Path {url.path} is not supported")',
        '    if name:',
        '        raise ValueError("Path {} bad".format(name))',
        '    raise ValueError("Path %s bad" % name)',
      ),
      [],
    ],
    [
      'a name that is not in scope',
      code('def run():', '    raise ValueError("Path {url.path} is not supported")'),
      [],
    ],
    [
      'a template kept in a variable or a docstring',
      code(
        'TEMPLATE = "Hello {name}"',
        '',
        '',
        'def run(name):',
        '    """Greets {name}."""',
        '    return TEMPLATE.format(name=name)',
      ),
      [],
    ],
    [
      'escaped braces, a JSON-like text and an empty field',
      code(
        'def run(name):',
        '    if name:',
        '        raise ValueError("set {{name}} first")',
        '    if name is None:',
        '        raise ValueError(\'expected {"a": 1} or {}\')',
      ),
      [],
    ],
    [
      'a log call with arguments for brace-style formatting',
      code(
        'import logging',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def run(name):',
        '    logger.info("{name} done", name)',
      ),
      [],
    ],
    [
      'a keyword argument that names the placeholder',
      code(
        'import logging',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def run(user, name):',
        '    logger.info("User {user}", user=user)',
        '    raise KeyError("Unknown {name}", name=name)',
      ),
      [],
    ],
    [
      'a call that is not an exception, log or warning',
      code('def run(name, report):', '    report("hello {name}")', '    print("hello {name}")'),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_run.py',
        code: code('def test_run(name):', '    raise ValueError("need {name}")'),
      },
      [],
    ],
  ]);
});
