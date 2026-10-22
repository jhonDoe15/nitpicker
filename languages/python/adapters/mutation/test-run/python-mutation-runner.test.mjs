import { afterEach, describe, expect, it } from 'vitest';
import {
  callsLog,
  contextFor,
  mutantsData,
  mutmutCalls,
  project,
} from '../../test-support/mutmut-project.mjs';
import {
  restoreTemporaryState,
  setEnvironment,
} from '../../execution/test-support/python-tools-project.mjs';
import { MUTATION_FAILED_RULE, mutationFindings } from '../python-mutation.mjs';
import { MUTATION_SKIPPED_RULE } from './python-mutation-runner.mjs';

afterEach(restoreTemporaryState);

const NOTHING_COLLECTED = {
  'mutants-data.json': mutantsData(null),
  'mutmut-exit.txt': '1\n',
  'mutmut-output.txt': 'no tests ran in 0.08s\nfailed to collect stats. runner returned 5\n',
};

const DJANGO_MANAGE =
  'import os\n\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "site.settings")\n';

describe('running mutmut for the other test runners', () => {
  const runnerContext = (root, testRunner) => contextFor(root, { settings: { testRunner } });

  it.each(['unittest', 'nose2'])(
    'lets pytest collect the test files of %s, which it does not by default',
    (testRunner) => {
      const calls = callsLog();
      setEnvironment('PYTEST_ADDOPTS', undefined);
      const root = project();

      mutationFindings(runnerContext(root, testRunner));

      expect(mutmutCalls(calls)[0].pytestAddopts).toBe('-o python_files=test*.py');
    },
  );

  it('names the runner when pytest still collected no test', () => {
    const root = project(NOTHING_COLLECTED);

    expect(mutationFindings(runnerContext(root, 'unittest')).map(({ message }) => message)).toEqual(
      [
        'Mutation testing was skipped: pytest, which mutmut runs the tests with, collected no test in its copy of the project with python_files=test*.py, the file pattern of unittest. If the tests live outside the copied directories, list them under "also_copy" in [tool.mutmut] of pyproject.toml. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.',
      ],
    );
  });

  it('asks for pytest, which mutmut runs every suite with', () => {
    const calls = callsLog();
    const root = project({ 'no-pytest.txt': '' });

    expect(() => mutationFindings(runnerContext(root, 'unittest'))).toThrow(
      expect.objectContaining({
        rule: MUTATION_FAILED_RULE,
        message:
          'mutmut runs the tests with pytest, which cannot be imported in the virtualenv environment: install pytest there (it also runs unittest, Django and nose2 test cases), or set "python.environment" to the environment that has it. To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.',
      }),
    );
    expect(mutmutCalls(calls)).toEqual([]);
  });

  it.each([
    [
      'pytest-django',
      { 'manage.py': DJANGO_MANAGE },
      'mutmut runs the tests with pytest, and the Django tests need the pytest-django plugin under pytest, which is not installed in the virtualenv environment. Install pytest-django there to enable it; the settings module is read from manage.py.',
    ],
    [
      'django-subdirectory',
      { 'backend/manage.py': DJANGO_MANAGE, 'pytest-django.txt': '' },
      'mutmut names each module by its path from the project root, while the Django tests import it from backend/, where manage.py is, so no test would match a mutant. Run nitpicker with backend/ as the project root to enable it.',
    ],
  ])('skips a Django project with a descriptive %s note', (identity, files, reason) => {
    const calls = callsLog();
    const message = `Mutation testing was skipped: ${reason} To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.`;
    const skipped = { tool: 'mutmut', rule: MUTATION_SKIPPED_RULE, path: '.', identity, message };

    expect(mutationFindings(runnerContext(project(files), 'django'))).toEqual([
      { ...skipped, classification: 'descriptive' },
    ]);
    expect(mutmutCalls(calls)).toEqual([]);
  });

  it('runs a Django project under pytest-django with the settings module of manage.py', () => {
    const calls = callsLog();
    setEnvironment('DJANGO_SETTINGS_MODULE', undefined);
    setEnvironment('PYTEST_ADDOPTS', undefined);
    const root = project({ 'manage.py': DJANGO_MANAGE, 'pytest-django.txt': '' });

    mutationFindings(runnerContext(root, 'django'));

    const [{ djangoSettings, pytestAddopts }] = mutmutCalls(calls);
    expect([djangoSettings, pytestAddopts]).toEqual([
      'site.settings',
      '-o python_files=test*.py -o django_find_project=false',
    ]);
  });

  it('keeps pytest-django from importing the unmutated project next to manage.py', () => {
    const calls = callsLog();
    setEnvironment('PYTEST_ADDOPTS', undefined);
    const root = project({ 'manage.py': DJANGO_MANAGE, 'pytest-django.txt': '' });

    mutationFindings(contextFor(root));

    expect(mutmutCalls(calls)[0].pytestAddopts).toBe('-o django_find_project=false');
  });

  it('keeps the settings of the caller and of pytest, and sets none manage.py lacks', () => {
    const calls = callsLog();
    const plugin = { 'manage.py': DJANGO_MANAGE, 'pytest-django.txt': '' };
    setEnvironment('DJANGO_SETTINGS_MODULE', 'site.ci');
    mutationFindings(runnerContext(project(plugin), 'django'));
    setEnvironment('DJANGO_SETTINGS_MODULE', undefined);
    const configured = project({
      ...plugin,
      'setup.cfg': '[tool:pytest]\nDJANGO_SETTINGS_MODULE = site.test\n',
    });
    mutationFindings(runnerContext(configured, 'django'));
    const unnamed = project({ ...plugin, 'manage.py': 'import django\n' });
    mutationFindings(runnerContext(unnamed, 'django'));

    expect(mutmutCalls(calls).map(({ djangoSettings }) => djangoSettings)).toEqual([
      'site.ci',
      undefined,
      undefined,
    ]);
  });
});
