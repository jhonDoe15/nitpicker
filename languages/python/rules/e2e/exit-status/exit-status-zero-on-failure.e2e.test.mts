import {
  useRuleScripts,
  ruleLine,
  pythonLines as code,
} from '../../test-support/python-rule-scripts.mts';

const RULE = 'exit-status-zero-on-failure';
const found = ruleLine(RULE);
const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const SYS = ['import sys', '', ''];
const SUBPROCESS = ['import subprocess', 'import click', '', ''];

describeRules(RULE, () => {
  itOutcomes('reports a zero exit in a failure path', [
    [
      'raise SystemExit in an except block',
      code(
        'def run(args):',
        '    try:',
        '        args.func(args)',
        '    except TypeError:',
        '        raise SystemExit',
      ),
      [found(5, 'raise SystemExit|except')],
    ],
    [
      'SystemExit with parentheses and with zero',
      code(
        'def run(args):',
        '    try:',
        '        args.func(args)',
        '    except TypeError:',
        '        raise SystemExit()',
        '    except ValueError:',
        '        raise SystemExit(0)',
      ),
      [found(5, 'raise SystemExit()|except'), found(7, 'raise SystemExit(0)|except')],
    ],
    [
      'sys.exit without a code in an except block',
      code(
        ...SYS,
        'def run(task):',
        '    try:',
        '        task()',
        '    except OSError as error:',
        '        print(error)',
        '        sys.exit()',
      ),
      [found(9, 'sys.exit()|except')],
    ],
    [
      'exit(0) and sys.exit(0) in except blocks',
      code(
        ...SYS,
        'def run(task, other):',
        '    try:',
        '        task()',
        '    except OSError:',
        '        exit(0)',
        '    try:',
        '        other()',
        '    except ValueError:',
        '        sys.exit(0)',
      ),
      [found(8, 'exit(0)|except'), found(12, 'sys.exit(0)|except')],
    ],
    [
      'sys.exit right after an error written to stderr',
      code(
        ...SYS,
        'def run(path):',
        '    if not path:',
        '        print("no path", file=sys.stderr)',
        '        sys.exit()',
      ),
      [found(7, 'sys.exit()|error-output')],
    ],
    [
      'sys.exit(0) right after logging an error',
      code(
        'import logging',
        'import sys',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def run(path):',
        '    if not path:',
        '        logger.error("no path")',
        '        sys.exit(0)',
      ),
      [found(10, 'sys.exit(0)|error-output')],
    ],
  ]);

  itOutcomes('reports a command that hides the failure of what it ran', [
    [
      'subprocess.run whose result is dropped',
      code(...SUBPROCESS, '@click.command()', 'def build():', '    subprocess.run(["make"])'),
      [found(7, 'subprocess.run()|returncode')],
    ],
    [
      'a result that is never checked',
      code(
        ...SUBPROCESS,
        '@click.command()',
        'def build():',
        '    result = subprocess.run(["make"], capture_output=True)',
        '    click.echo(result.stdout)',
      ),
      [found(7, 'subprocess.run()|returncode')],
    ],
    [
      'os.system in an argparse command',
      code(
        'import argparse',
        'import os',
        '',
        '',
        'def build(args):',
        '    os.system("make")',
        '',
        '',
        'parser = argparse.ArgumentParser()',
        'parser.set_defaults(func=build)',
      ),
      [found(6, 'os.system()|returncode')],
    ],
    [
      'a failure flag that is only printed',
      code(
        'import click',
        '',
        '',
        '@click.command()',
        'def test_connection(client):',
        '    result = client.test()',
        '    if not result.success:',
        '        click.echo("connection failed")',
      ),
      [found(7, 'result.success|flag')],
    ],
  ]);

  itOutcomes('stays quiet for non-zero exits and checked results', [
    [
      'a failure flag used in the exit code',
      code(
        'import click',
        'import sys',
        '',
        '',
        '@click.command()',
        'def test_connection(client):',
        '    result = client.test()',
        '    if not result.ok:',
        '        click.echo("connection failed")',
        '    sys.exit(0 if result.ok else 1)',
      ),
      [],
    ],
    [
      'a click abort handler',
      code(
        'import click',
        'import sys',
        '',
        '',
        'def run(task):',
        '    try:',
        '        task()',
        '    except click.Abort:',
        '        sys.exit(0)',
      ),
      [],
    ],
    [
      'a missing optional import',
      code(...SYS, 'try:', '    import extra', 'except ImportError:', '    sys.exit(0)'),
      [],
    ],
    [
      'a signal handler',
      code(
        'import logging',
        'import signal',
        'import sys',
        '',
        'logger = logging.getLogger(__name__)',
        '',
        '',
        'def stop(signum, frame):',
        '    logger.error("stopping")',
        '    sys.exit(0)',
        '',
        '',
        'signal.signal(signal.SIGTERM, stop)',
      ),
      [],
    ],
    [
      'a status of one',
      code(
        ...SYS,
        'def run(task):',
        '    try:',
        '        task()',
        '    except OSError:',
        '        sys.exit(1)',
      ),
      [],
    ],
    [
      'a message, which exits with one',
      code(
        'def run(task):',
        '    try:',
        '        task()',
        '    except TypeError as err:',
        '        raise SystemExit(f"Invalid arguments: {err}") from err',
      ),
      [],
    ],
    [
      'a click exception',
      code(
        'import click',
        '',
        '',
        'def run(task):',
        '    try:',
        '        task()',
        '    except OSError as err:',
        '        raise click.ClickException(str(err)) from err',
      ),
      [],
    ],
    [
      'a clean interrupt',
      code(
        ...SYS,
        'def run(task):',
        '    try:',
        '        task()',
        '    except KeyboardInterrupt:',
        '        sys.exit(0)',
      ),
      [],
    ],
    [
      'a zero exit on the success path',
      code(...SYS, 'def run(task):', '    task()', '    print("done")', '    sys.exit(0)'),
      [],
    ],
    [
      'a zero exit after a plain message',
      code(
        ...SYS,
        'def run(task):',
        '    if task is None:',
        '        print("nothing to do")',
        '        sys.exit(0)',
      ),
      [],
    ],
    [
      'an exit code taken from a variable',
      code(
        ...SYS,
        'def run(task):',
        '    try:',
        '        task()',
        '    except OSError as error:',
        '        sys.exit(error.errno)',
      ),
      [],
    ],
    [
      'check=True',
      code(
        ...SUBPROCESS,
        '@click.command()',
        'def build():',
        '    subprocess.run(["make"], check=True)',
      ),
      [],
    ],
    [
      'a returncode that is read',
      code(
        ...SUBPROCESS,
        '@click.command()',
        'def build():',
        '    result = subprocess.run(["make"])',
        '    raise SystemExit(result.returncode)',
      ),
      [],
    ],
    [
      'a call code that is returned',
      code(
        ...SUBPROCESS,
        '@click.command()',
        'def build():',
        '    code = subprocess.call(["make"])',
        '    raise SystemExit(code)',
      ),
      [],
    ],
    [
      'a program run outside a command',
      code('import subprocess', '', '', 'def build():', '    subprocess.run(["make"])'),
      [],
    ],
    [
      'a failure flag that raises',
      code(
        'import click',
        '',
        '',
        '@click.command()',
        'def test_connection(client):',
        '    result = client.test()',
        '    if not result.success:',
        '        click.echo("connection failed")',
        '        raise SystemExit(1)',
      ),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_cli.py',
        code: code(
          'def run(args):',
          '    try:',
          '        args.func(args)',
          '    except TypeError:',
          '        raise SystemExit',
        ),
      },
      [],
    ],
  ]);
});
