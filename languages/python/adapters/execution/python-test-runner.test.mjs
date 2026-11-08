import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  djangoSettingsModule,
  djangoSubdirectory,
  pytestNamesDjangoSettings,
} from './python-django.mjs';
import { detectTestRunner, testCommand, testsRan, UNITTEST_SCRIPT } from './python-test-runner.mjs';

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
    [
      'nose2 signals too',
      { 'manage.py': DJANGO_MANAGE, 'nose2.cfg': '', 'requirements.txt': 'nose2\n' },
    ],
    ['the manage.py one directory down', { 'backend/manage.py': DJANGO_MANAGE }],
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

  it.each([
    ['the setdefault call', { 'manage.py': DJANGO_MANAGE }, 'site.settings'],
    [
      'an assignment',
      { 'manage.py': 'import os\nos.environ["DJANGO_SETTINGS_MODULE"] = "site.prod"\n' },
      'site.prod',
    ],
    [
      'the line that is not commented out',
      {
        'manage.py': `# os.environ.setdefault("DJANGO_SETTINGS_MODULE", "old.settings")\n${DJANGO_MANAGE}`,
      },
      'site.settings',
    ],
    ['the manage.py one directory down', { 'backend/manage.py': DJANGO_MANAGE }, 'site.settings'],
    ['a manage.py without settings', { 'manage.py': 'import django\n' }, undefined],
    ['no manage.py', {}, undefined],
  ])('reads the settings module from %s', (_, files, expected) => {
    expect(djangoSettingsModule(project(files))).toBe(expected);
  });

  it.each([
    ['pytest.ini', { 'pytest.ini': '[pytest]\nDJANGO_SETTINGS_MODULE = site.test\n' }, true],
    ['setup.cfg', { 'setup.cfg': '[tool:pytest]\nDJANGO_SETTINGS_MODULE = site.test\n' }, true],
    ['tox.ini', { 'tox.ini': '[pytest]\nDJANGO_SETTINGS_MODULE = site.test\n' }, true],
    [
      'pyproject.toml',
      { 'pyproject.toml': '[tool.pytest.ini_options]\nDJANGO_SETTINGS_MODULE = "site.test"\n' },
      true,
    ],
    [
      'a tox setenv',
      { 'tox.ini': '[testenv]\nsetenv =\n    DJANGO_SETTINGS_MODULE = site.ci\n' },
      false,
    ],
    ['nothing', {}, false],
  ])('tells whether the pytest configuration in %s names the settings', (_, files, expected) => {
    expect(pytestNamesDjangoSettings(project(files))).toBe(expected);
  });

  it.each([
    ['manage.py one directory down', { 'backend/manage.py': DJANGO_MANAGE }, 'backend'],
    ['manage.py at the root', { 'manage.py': DJANGO_MANAGE }, undefined],
    ['no manage.py', {}, undefined],
  ])('names the subdirectory of the Django project with %s', (_, files, expected) => {
    expect(djangoSubdirectory(project(files))).toBe(expected);
  });
});
describe('Django and nose2 commands', () => {
  const contextFor = (root, testRunner) => ({
    projectRoot: root,
    project: { testRunner },
    launcher: {
      description: 'test',
      launch: () => ({ command: process.execPath, args: ['-e', 'console.log("5.1.0")'], env: {} }),
    },
  });

  it.each([
    ['django', { 'manage.py': DJANGO_MANAGE }, ['manage.py', 'test', '--noinput']],
    ['django', { 'backend/manage.py': DJANGO_MANAGE }, ['manage.py', 'test', '--noinput']],
    ['nose2', {}, ['-m', 'nose2']],
  ])('runs %s as the project does', (testRunner, files, command) => {
    expect(testCommand(contextFor(project(files), testRunner))).toEqual(command);
  });
});
describe('unittest command', () => {
  const contextFor = (root) => ({
    projectRoot: root,
    reportRoot: '/reports',
    project: { testRunner: 'unittest' },
  });
  const timed = [UNITTEST_SCRIPT, path.join('/reports', 'pytest-junit.xml'), 'discover'];

  it('discovers from the project when there is no tests directory, timing each test', () => {
    expect(testCommand(contextFor(project({})))).toEqual(timed);
  });

  it('starts in a plain tests directory', () => {
    expect(testCommand(contextFor(project({ 'tests/test_a.py': '' })))).toEqual([
      ...timed,
      '-s',
      'tests',
    ]);
  });

  it('keeps the project as the top level directory for a tests package', () => {
    expect(testCommand(contextFor(project({ 'test/__init__.py': '' })))).toEqual([
      ...timed,
      '-s',
      'test',
      '-t',
      '.',
    ]);
  });

  it('starts in a top-level testing directory only when it holds tests', () => {
    const helpers = { 'testing/__init__.py': '', 'testing/fakes.py': '' };

    expect(testCommand(contextFor(project(helpers)))).toEqual(timed);
    expect(
      testCommand(contextFor(project({ ...helpers, 'testing/unit/test_cart.py': '' }))),
    ).toEqual([...timed, '-s', 'testing', '-t', '.']);
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
