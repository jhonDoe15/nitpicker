import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectTestRunner,
  djangoSettingsModule,
  testCommand,
  testsRan,
} from './python-test-runner.mjs';

const DJANGO_MANAGE = [
  'import os',
  '',
  'from django.core.management import execute_from_command_line',
  '',
  'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "site.settings")',
  '',
].join('\n');
const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-runner-detect-'));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('test runner detection', () => {
  it.each([
    ['a [tool.pytest.ini_options] table', { 'pyproject.toml': '[tool.pytest.ini_options]\n' }],
    ['pytest.ini', { 'pytest.ini': '[pytest]\n' }],
    ['a [tool:pytest] section', { 'setup.cfg': '[tool:pytest]\ntestpaths = tests\n' }],
    ['a dependency', { 'pyproject.toml': '[project]\ndependencies = ["pytest>=8"]\n' }],
    ['a pytest plugin dependency', { 'requirements/dev.txt': 'pytest-cov==5\n' }],
    [
      'a poetry dependency',
      { 'pyproject.toml': '[tool.poetry.dev-dependencies]\npytest = "^8"\n' },
    ],
    ['a tox command', { 'tox.ini': '[testenv]\ncommands = pytest\n' }],
    ['a root conftest.py', { 'conftest.py': '' }],
    ['a conftest.py in tests', { 'tests/conftest.py': '' }],
    ['a test function', { 'tests/unit/test_a.py': 'def test_a():\n    assert True\n' }],
    ['an import of pytest', { 'test_a.py': 'import pytest\n' }],
    ['a test class without a base', { 'tests/a_test.py': 'class TestA:\n    pass\n' }],
    ['a tests.py with a test function', { 'tests.py': 'def test_a():\n    assert True\n' }],
    [
      'pytest-django next to manage.py',
      { 'manage.py': DJANGO_MANAGE, 'requirements.txt': 'django\npytest-django\n' },
    ],
    ['a pytest dependency next to nose2', { 'requirements.txt': 'nose2\npytest\n' }],
  ])('chooses pytest from %s', (_, files) => {
    expect(detectTestRunner(project(files))).toBe('pytest');
  });

  it.each([
    [
      'unittest test cases',
      {
        'tests/test_a.py':
          'import unittest\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        pass\n',
      },
    ],
    ['no tests', {}],
    ['a package named like a plugin', { 'requirements.txt': 'pytestify-not-a-plugin_x\n' }],
    ['a Django dependency without manage.py', { 'requirements.txt': 'django\n' }],
    [
      'a manage.py of another framework',
      { 'manage.py': 'import flask\n', 'requirements.txt': 'django-environ\n' },
    ],
    ['a unittest.cfg without plugins', { 'unittest.cfg': '[unittest]\nstart-dir = tests\n' }],
    ['a package named like nose2', { 'requirements.txt': 'nose2-html-report\n' }],
  ])('chooses unittest for %s', (_, files) => {
    expect(detectTestRunner(project(files))).toBe('unittest');
  });

  it.each([
    ['a Django dependency', { 'manage.py': '', 'requirements.txt': 'Django==5.1\n' }],
    [
      'a poetry dependency',
      { 'manage.py': '', 'pyproject.toml': '[tool.poetry.dependencies]\ndjango = "^5"\n' },
    ],
    ['a manage.py that imports Django', { 'manage.py': DJANGO_MANAGE }],
    [
      'test functions Django would not run',
      { 'manage.py': DJANGO_MANAGE, 'tests/test_a.py': 'def test_a():\n    pass\n' },
    ],
  ])('chooses django for manage.py with %s', (_, files) => {
    expect(detectTestRunner(project(files))).toBe('django');
  });

  it.each([
    ['nose2.cfg', { 'nose2.cfg': '[unittest]\n' }],
    [
      'unittest.cfg with plugins',
      { 'unittest.cfg': '[unittest]\nstart-dir = tests\nplugins = nose2.plugins.mp\n' },
    ],
    ['a dependency', { 'requirements-dev.txt': 'nose2>=0.14\n' }],
    ['a tox command', { 'tox.ini': '[testenv]\ncommands = nose2 -v\n' }],
    ['test functions', { 'nose2.cfg': '', 'tests/test_a.py': 'def test_a():\n    pass\n' }],
  ])('chooses nose2 from %s', (_, files) => {
    expect(detectTestRunner(project(files))).toBe('nose2');
  });

  it('prefers the setting over every signal', () => {
    expect(detectTestRunner(project({ 'conftest.py': '' }), 'unittest')).toBe('unittest');
    expect(detectTestRunner(project({}), 'pytest')).toBe('pytest');
    expect(detectTestRunner(project({ 'nose2.cfg': '' }), 'django')).toBe('django');
  });

  it('reads the settings module from manage.py', () => {
    expect(djangoSettingsModule(project({ 'manage.py': DJANGO_MANAGE }))).toBe('site.settings');
    expect(djangoSettingsModule(project({ 'manage.py': 'import django\n' }))).toBeUndefined();
    expect(djangoSettingsModule(project({}))).toBeUndefined();
  });
});
describe('unittest command', () => {
  const contextFor = (root) => ({ projectRoot: root, project: { testRunner: 'unittest' } });

  it('discovers from the project when there is no tests directory', () => {
    expect(testCommand(contextFor(project({})))).toEqual(['-m', 'unittest', 'discover']);
  });

  it('starts in a plain tests directory', () => {
    expect(testCommand(contextFor(project({ 'tests/test_a.py': '' })))).toEqual([
      '-m',
      'unittest',
      'discover',
      '-s',
      'tests',
    ]);
  });

  it('keeps the project as the top level directory for a tests package', () => {
    expect(testCommand(contextFor(project({ 'test/__init__.py': '' })))).toEqual([
      '-m',
      'unittest',
      'discover',
      '-s',
      'test',
      '-t',
      '.',
    ]);
  });
});

describe('detecting a run without tests', () => {
  it.each([
    [{ status: 5, stderr: '' }, false],
    [{ status: 0, stderr: 'Ran 0 tests in 0.000s\n\nOK\n' }, false],
    [{ status: 0, stderr: 'Ran 1 test in 0.000s\n\nOK\n' }, true],
    [{ status: 0, stderr: 'Ran 10 tests in 0.1s\n' }, true],
    [{ status: 0, stderr: '' }, true],
  ])('%j ran tests: %s', (result, expected) => {
    expect(testsRan(result)).toBe(expected);
  });
});
