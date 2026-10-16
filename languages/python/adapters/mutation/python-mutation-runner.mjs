import { readProjectHints } from '../execution/python-project.mjs';
import {
  djangoSettingsModule,
  mutationPytestOptions,
  probePytest,
} from '../execution/python-test-runner.mjs';

export const MUTATION_SKIPPED_RULE = 'mutation-skipped';
export const DISABLE_HINT =
  'To run without mutation testing, add "mutation" to "disable" in nitpicker.config.json.';
const CONFIGURED_SETTINGS = /^\s*DJANGO_SETTINGS_MODULE\s*=/m;
const COPY_HINT = 'list them under "also_copy" in [tool.mutmut] of pyproject.toml';

export function skippedFinding(identity, reason) {
  return {
    tool: 'mutmut',
    rule: MUTATION_SKIPPED_RULE,
    path: '.',
    identity,
    message: `Mutation testing was skipped: ${reason} ${DISABLE_HINT}`,
    classification: 'descriptive',
  };
}

export function missingPytest(context) {
  return probePytest(context) === undefined
    ? `mutmut runs the tests with pytest, which cannot be imported in the ${context.launcher.description} environment: install pytest there (it also runs unittest, Django and nose2 test cases), or set "python.environment" to the environment that has it. ${DISABLE_HINT}`
    : undefined;
}

export function runnerSkip(context) {
  if (context.project.testRunner !== 'django' || probePytest(context)?.django) {
    return undefined;
  }
  return skippedFinding(
    'pytest-django',
    `mutmut runs the tests with pytest, and the Django tests need the pytest-django plugin under pytest, which is not installed in the ${context.launcher.description} environment. Install pytest-django there to enable it; the settings module is read from manage.py.`,
  );
}

function djangoEnvironment(context) {
  const module = djangoSettingsModule(context.projectRoot);
  const configured = CONFIGURED_SETTINGS.test(readProjectHints(context.projectRoot));
  return module === undefined || configured ? {} : { DJANGO_SETTINGS_MODULE: module };
}

export function mutmutEnvironment(context) {
  const options = mutationPytestOptions(context);
  return {
    appendEnv: options.length === 0 ? {} : { PYTEST_ADDOPTS: options.join(' ') },
    defaultEnv: context.project.testRunner === 'django' ? djangoEnvironment(context) : {},
  };
}

export function mutationRunnerLabels(context) {
  if (context.project.testRunner !== 'django') {
    return [];
  }
  return [`pytest-django@${probePytest(context)?.django ? 'installed' : 'missing'}`];
}

export function noTestsCollected(context) {
  const { testRunner } = context.project;
  const pattern =
    testRunner === 'pytest' ? '' : ` with python_files=test*.py, the file pattern of ${testRunner}`;
  return skippedFinding(
    'no-tests-collected',
    `pytest, which mutmut runs the tests with, collected no test in its copy of the project${pattern}. If the tests live outside the copied directories, ${COPY_HINT}.`,
  );
}
