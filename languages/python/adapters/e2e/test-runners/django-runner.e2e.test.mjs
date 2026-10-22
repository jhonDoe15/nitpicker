import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  summarize,
  write,
} from '../test-support/python-e2e-support.mjs';

const MANAGE = [
  'import os',
  'import sys',
  '',
  'from django.core.management import execute_from_command_line',
  '',
  'if __name__ == "__main__":',
  '    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "site_config.settings")',
  '    execute_from_command_line(sys.argv)',
  '',
].join('\n');
const SETTINGS = [
  'SECRET_KEY = "not-a-secret"',
  'INSTALLED_APPS = ["polls"]',
  'DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}',
  'USE_TZ = True',
  '',
].join('\n');
const GRADE =
  'def grade(score: int) -> str:\n    if score >= 10:\n        return "pass"\n    return "fail"\n';
const GRADE_TESTS = [
  'from django.test import SimpleTestCase',
  '',
  'from polls.grades import grade',
  '',
  '',
  'class GradeTests(SimpleTestCase):',
  '    def test_pass(self) -> None:',
  '        self.assertEqual(grade(20), "pass")',
  '',
  '    def test_boundary(self) -> None:',
  '        self.assertEqual(grade(10), "pass")',
  '',
  '    def test_fail(self) -> None:',
  '        self.assertEqual(grade(9), "fail")',
  '',
].join('\n');
const WEAK_TESTS = GRADE_TESTS.split('\n    def test_boundary')[0];
const PLACEHOLDER_TESTS =
  'from django.test import SimpleTestCase\n\n\nclass GradeTests(SimpleTestCase):\n    pass\n';
const UNTYPED_DJANGO = ['import-untyped', 'misc'].map((rule) => ({
  rule,
  paths: ['polls/tests.py', 'backend/polls/tests.py'],
  reason: 'Django ships no type information',
}));

function enforceable(result) {
  return summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );
}

function killedMutants(result) {
  return result
    .json('new-findings.json')
    .filter(({ rule }) => rule === 'mutation-summary')
    .map(({ path: file, identity, metric }) => `${file} ${identity}=${String(metric.value)}`);
}

function mutmutNotes(result) {
  return result
    .json('new-findings.json')
    .filter(({ tool }) => tool === 'mutmut')
    .map(({ rule, identity }) => `${rule} ${identity}`);
}

function djangoProject(packages) {
  const root = repository();
  write(root, {
    'nitpicker.config.json': JSON.stringify({
      preset: 'python',
      python: { exceptions: UNTYPED_DJANGO },
    }),
    '.gitignore': '.venv/\n__pycache__/\nmutants/\n',
    'requirements.txt': 'django\n',
    'polls/__init__.py': '',
    'polls/tests.py': PLACEHOLDER_TESTS,
  });
  initializeRepository(root, 'base without Django');
  installPackages(root, packages);
  const django = {
    'manage.py': MANAGE,
    'site_config/__init__.py': '',
    'site_config/settings.py': SETTINGS,
    'polls/grades.py': GRADE,
  };
  commitBranch(root, 'tested', { ...django, 'polls/tests.py': GRADE_TESTS });
  commitBranch(root, 'weak', { ...django, 'polls/tests.py': WEAK_TESTS });
  return root;
}

function nestedDjangoProject(packages) {
  const root = repository();
  write(root, {
    'nitpicker.config.json': JSON.stringify({
      preset: 'python',
      python: { sourceRoots: ['backend/polls'], exceptions: UNTYPED_DJANGO },
    }),
    '.gitignore': '.venv/\n__pycache__/\nmutants/\n',
    'requirements.txt': 'django\n',
    'backend/polls/__init__.py': '',
    'backend/polls/tests.py': PLACEHOLDER_TESTS,
  });
  initializeRepository(root, 'base without Django');
  installPackages(root, packages);
  const django = Object.entries({
    'manage.py': MANAGE,
    'site_config/__init__.py': '',
    'site_config/settings.py': SETTINGS,
    'polls/grades.py': GRADE,
    'polls/tests.py': GRADE_TESTS,
  });
  commitBranch(
    root,
    'nested',
    Object.fromEntries(django.map(([file, text]) => [`backend/${file}`, text])),
  );
  return root;
}

describe.skipIf(!pythonE2eEnabled)('Python preset on a Django project run with manage.py', () => {
  let project;
  let withoutPlugin;
  let nested;
  afterAll(removeRepositories);
  beforeAll(() => {
    project = djangoProject(['django', 'coverage', 'pytest', 'pytest-django', 'mutmut']);
    withoutPlugin = djangoProject(['django', 'coverage', 'pytest', 'mutmut']);
    nested = nestedDjangoProject(['django', 'coverage', 'pytest', 'pytest-django', 'mutmut']);
  });
  it('runs manage.py test under coverage and mutates the app, not its tests.py', () => {
    const result = gate(project, 'tested');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;django@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(killedMutants(result)).toEqual(['. status:Killed=6']);
  });
  it('fails the survivors that the weaker tests leave', () => {
    const result = gate(project, 'weak');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([
      'coverage-py changed-branch-coverage grades.py',
      ...Array.from({ length: 4 }, () => 'mutmut mutant-survived grades.py'),
    ]);
  });
  it('runs manage.py test from the directory below the root that holds it', () => {
    const result = gate(nested, 'nested');

    expect(result.exitCode, result.text).toBe(0);
    expect(mutmutNotes(result)).toEqual(['mutation-skipped django-subdirectory']);
  });
  it('skips mutation testing with a note when pytest-django is missing', () => {
    const result = gate(withoutPlugin, 'tested');

    expect(result.exitCode, result.text).toBe(0);
    expect(mutmutNotes(result)).toEqual(['mutation-skipped pytest-django']);
  });
});
