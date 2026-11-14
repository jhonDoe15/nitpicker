import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanTestStrings } from '../../analysis/test-runtime/python-test-runtime.mjs';
import { run } from '../../execution/python-process.mjs';
import { useScannedProjects } from '../test-support/scanned-projects.mts';

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

type Strings = Readonly<Record<string, { readonly fixtures: readonly unknown[] }>>;
const parseStrings: (text: string) => Strings = JSON.parse;

const scannedProject = useScannedProjects();

function scan(code: string, { production }: { production?: string } = {}): Strings {
  const { context, reportRoot } = scannedProject({
    'src/mod.py': production ?? 'VALUE = 1\n',
    'tests/test_mod.py': code,
  });
  scanTestStrings(context, run);
  return parseStrings(readFileSync(path.join(reportRoot, 'string-literals.json'), 'utf8'));
}

const EMPTY = { strings: [], plugins: [], fixtures: [], requests: [], marks: [] };

describe.skipIf(!pythonE2eEnabled)('string literal scan of test files', () => {
  it('keeps the strings of known import contexts and pytest_plugins', () => {
    const code = [
      'import importlib',
      'import subprocess',
      'from unittest import mock',
      'pytest_plugins = ["tests.fixtures", "plain"]',
      'def test_it(monkeypatch):',
      '    importlib.import_module("app.x")',
      '    importlib.import_module("single")',
      '    importlib.util.find_spec("app.spec")',
      '    __import__("app.dunder")',
      '    runpy.run_module("app.runner")',
      '    with mock.patch("app.service.requests"):',
      '        pass',
      '    mock.patch.dict("app.table", {})',
      '    mock.patch.multiple("app.multi", a=1)',
      '    mocker.patch("app.mocked")',
      '    monkeypatch.setattr("app.attr.name", 1)',
      '    monkeypatch.delattr("app.gone.name")',
      '    monkeypatch.setattr(target, "app.second", 1)',
      '    subprocess.run(["python", "-m", "app.cli"])',
      '    subprocess.run(("python", "-m", "tool"))',
      '    subprocess.run("python", "-m", "app.flat")',
      '    assert name == "app.compared"',
      '    print("sentence. with a stop", "word")',
      '    Path("config.yaml")',
      '    logging.getLogger("app.core")',
      '',
    ].join('\n');

    expect(scan(code)).toEqual({
      'tests/test_mod.py': {
        ...EMPTY,
        strings: [
          'app.attr.name',
          'app.cli',
          'app.dunder',
          'app.gone.name',
          'app.mocked',
          'app.multi',
          'app.runner',
          'app.service.requests',
          'app.spec',
          'app.table',
          'app.x',
          'single',
          'tool',
        ],
        plugins: ['plain', 'tests.fixtures'],
        requests: ['monkeypatch'],
      },
    });
  });

  it('reports the fixtures a file defines and the fixtures its tests request', () => {
    const code = [
      'import pytest',
      'pytestmark = pytest.mark.usefixtures("module_level")',
      '@pytest.fixture(autouse=True)',
      'def boot(db, request, tmp_path):',
      '    pass',
      '@pytest.fixture(name="renamed", scope="session")',
      'def original():',
      '    pass',
      '@pytest.mark.django_db',
      '@pytest.mark.usefixtures("on_function", "second")',
      'def test_it(client, tmp_path):',
      '    pass',
      'class TestK:',
      '    @pytest_asyncio.fixture',
      '    async def inner(self, boot):',
      '        pass',
      '    def test_m(self, inner):',
      '        pass',
      '',
    ].join('\n');

    expect(scan(code)).toEqual({
      'tests/test_mod.py': {
        ...EMPTY,
        fixtures: [
          { name: 'boot', autouse: true, requests: ['db', 'tmp_path'] },
          { name: 'renamed', autouse: false, requests: [] },
          { name: 'inner', autouse: false, requests: ['boot'] },
        ],
        requests: ['client', 'inner', 'module_level', 'on_function', 'second', 'tmp_path'],
        marks: ['django_db', 'usefixtures'],
      },
    });
  });

  it('scans a production module that pytest_plugins names, for its fixtures', () => {
    const found = scan('pytest_plugins = ["mod"]\n', {
      production: 'import pytest\n@pytest.fixture\ndef shared():\n    pass\n',
    });

    expect(found['src/mod.py']?.fixtures).toEqual([
      { name: 'shared', autouse: false, requests: [] },
    ]);
  });

  it('leaves out a file with nothing to report and a file that does not parse', () => {
    expect(scan('x = 1\n')).toEqual({});
    expect(scan('def test_it(:\n')).toEqual({});
  });
});
