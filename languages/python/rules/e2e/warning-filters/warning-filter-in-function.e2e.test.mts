import { expect, it } from 'vitest';
import {
  useScripts,
  useRuleScripts,
  ruleLine,
  pythonLines as code,
} from '../../test-support/python-rule-scripts.mts';

const RULE = 'warning-filter-in-function';
const found = ruleLine(RULE);
const { findingsOf } = useScripts({ enabled: process.env['NITPICKER_PYTHON_E2E'] === '1' });
const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules(RULE, () => {
  itOutcomes('reports warning filters changed inside a function', [
    [
      'catch_warnings with a filter inside',
      code(
        'import warnings',
        '',
        '',
        'def create_model(name, build):',
        '    with warnings.catch_warnings():',
        '        warnings.simplefilter("ignore")',
        '        return build(name)',
      ),
      [found(5, 'warnings.catch_warnings()')],
    ],
    [
      'imported names',
      code(
        'from warnings import catch_warnings, filterwarnings',
        '',
        '',
        'class Client:',
        '    def __init__(self, value):',
        '        with catch_warnings():',
        '            self.value = value',
        '',
        '    def quiet(self):',
        '        filterwarnings("ignore", category=DeprecationWarning)',
      ),
      [found(6, 'warnings.catch_warnings()'), found(10, 'warnings.filterwarnings()')],
    ],
    [
      'simplefilter and resetwarnings on their own',
      code(
        'import warnings',
        '',
        '',
        'def load():',
        '    warnings.simplefilter("ignore")',
        '    warnings.resetwarnings()',
      ),
      [found(5, 'warnings.simplefilter()'), found(6, 'warnings.resetwarnings()')],
    ],
    [
      'an async function',
      code('import warnings', '', '', 'async def load():', '    warnings.filterwarnings("ignore")'),
      [found(5, 'warnings.filterwarnings()')],
    ],
  ]);

  itOutcomes('stays quiet for program start, tests and other warning calls', [
    [
      'a Django management command',
      code(
        'import warnings',
        'from django.core.management.base import BaseCommand',
        '',
        '',
        'class Command(BaseCommand):',
        '    def handle(self, *args, **options):',
        '        warnings.simplefilter("ignore")',
      ),
      [],
    ],
    [
      'a function called from the main guard',
      code(
        'import warnings',
        '',
        '',
        'def configure():',
        '    warnings.simplefilter("ignore")',
        '',
        '',
        'if __name__ == "__main__":',
        '    configure()',
      ),
      [],
    ],
    [
      'a function nested in main',
      code(
        'import warnings',
        '',
        '',
        'def main():',
        '    def quiet():',
        '        warnings.simplefilter("ignore")',
        '',
        '    quiet()',
        '',
        '',
        'if __name__ == "__main__":',
        '    main()',
      ),
      [],
    ],
    ['module level filters', code('import warnings', '', 'warnings.simplefilter("ignore")'), []],
    [
      'the main guard',
      code(
        'import warnings',
        '',
        '',
        'def run():',
        '    return 1',
        '',
        '',
        'if __name__ == "__main__":',
        '    warnings.simplefilter("ignore")',
        '    run()',
      ),
      [],
    ],
    [
      'a main function of a script',
      code(
        'import warnings',
        '',
        '',
        'def main():',
        '    warnings.simplefilter("ignore")',
        '',
        '',
        'if __name__ == "__main__":',
        '    main()',
      ),
      [],
    ],
    [
      'a main module',
      {
        file: 'pkg/__main__.py',
        code: code('import warnings', '', '', 'def run():', '    warnings.simplefilter("ignore")'),
      },
      [],
    ],
    [
      'a click command',
      code(
        'import click',
        'import warnings',
        '',
        '',
        '@click.command()',
        'def cli():',
        '    warnings.simplefilter("ignore")',
      ),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_models.py',
        code: code(
          'import warnings',
          '',
          '',
          'def test_quiet():',
          '    with warnings.catch_warnings():',
          '        warnings.simplefilter("ignore")',
        ),
      },
      [],
    ],
    [
      'a conftest file',
      {
        file: 'conftest.py',
        code: code(
          'import warnings',
          '',
          '',
          'def pytest_configure():',
          '    warnings.simplefilter("ignore")',
        ),
      },
      [],
    ],
    [
      'a test support folder',
      {
        file: 'testing/helpers.py',
        code: code(
          'import warnings',
          '',
          '',
          'def quiet():',
          '    warnings.simplefilter("ignore")',
        ),
      },
      [],
    ],
    [
      'warn and a local filter name',
      code(
        'import warnings',
        '',
        '',
        'def check(options):',
        '    warnings.warn("old", DeprecationWarning, stacklevel=2)',
        '    return options.simplefilter("ignore")',
      ),
      [],
    ],
  ]);

  it('leaves a function that pyproject.toml publishes as a console script', () => {
    const run = 'import warnings\n\n\ndef run():\n    warnings.simplefilter("ignore")\n';
    const files = {
      'pyproject.toml': '[project.scripts]\ntool = "pkg.cli:run"\n',
      'pkg/__init__.py': '',
      'pkg/cli.py': run,
      'pkg/other.py': run,
    };
    expect(findingsOf(files).filter((line) => line.startsWith(`${RULE} `))).toEqual([
      `${RULE} pkg/other.py:5 warnings.simplefilter()`,
    ]);
  });

  it('leaves a function that poetry publishes as a console script', () => {
    const run = 'import warnings\n\n\ndef run():\n    warnings.simplefilter("ignore")\n';
    const files = {
      'pyproject.toml': '[tool.poetry.scripts]\ntool = "pkg.cli:run"\n',
      'pkg/__init__.py': '',
      'pkg/cli.py': run,
      'pkg/other.py': run,
    };
    expect(findingsOf(files).filter((line) => line.startsWith(`${RULE} `))).toEqual([
      `${RULE} pkg/other.py:5 warnings.simplefilter()`,
    ]);
  });
});
