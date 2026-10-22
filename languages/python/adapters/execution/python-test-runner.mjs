import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { environmentError } from './python-environment.mjs';
import { execute, probeVersion, VERSION_PATTERN } from './python-process.mjs';
import { readOptional, readProjectHints } from './python-project.mjs';
import { DJANGO_SCRIPT, readDjangoScript } from './python-django.mjs';
import { TEST_DIRECTORIES, TEST_FILE_NAME } from './python-test-files.mjs';
import { JUNIT_REPORT } from '../test-runs/junit-results.mjs';
import { pinnedEnvironmentAddopts, pinnedPytestArguments } from '../test-runs/pytest-pins.mjs';

export const NO_TESTS_EXIT = 5;
const PYTEST_PROBE = [
  'python',
  '-c',
  'import importlib.util as u, pytest; print(pytest.__version__, *(int(u.find_spec(m) is not None) for m in ("pytest_cov", "xdist", "pytest_rerunfailures", "pytest_django")))',
];
const UNITTEST_FILES = 'python_files=test*.py';
const RUNNER_DISTRIBUTIONS = { django: 'Django', nose2: 'nose2' };
const probes = new WeakMap();
export const UNITTEST_SCRIPT = fileURLToPath(
  new URL('../test-runs/unittest_timings.py', import.meta.url),
);
export const PYTEST_SCRIPT = fileURLToPath(
  new URL('../test-runs/pytest_timings.py', import.meta.url),
);

const PYTEST_CONFIGURATION = /^\s*\[(?:tool\.pytest(?:\.ini_options)?|pytest|tool:pytest)\]/m;
const PYTEST_DEPENDENCY = /(?:^|[\s"'=])pytest(?:\b|_)/m;
const PYTEST_STYLE_TEST =
  /^(?:async\s+)?def test_|^(?:import|from)\s+pytest\b|^class Test\w*\s*(?:\(\s*\))?:/m;
const DJANGO_DEPENDENCY = /(?:^|[\s"'=])django(?![\w.-])/im;
const DJANGO_IMPORT = /^\s*(?:from|import)\s+django\b/m;
const NOSE2_DEPENDENCY = /(?:^|[\s"'=])nose2(?![\w.-])/m;
const NOSE2_SECTION = '[unittest]';

function existingTestFiles(projectRoot) {
  const directories = TEST_DIRECTORIES.filter((name) => existsSync(path.join(projectRoot, name)));
  return [
    ...readdirSync(projectRoot).filter((name) => TEST_FILE_NAME.test(name)),
    ...directories.flatMap((directory) =>
      readdirSync(path.join(projectRoot, directory), { recursive: true })
        .filter((name) => TEST_FILE_NAME.test(path.basename(name)))
        .map((name) => path.join(directory, name)),
    ),
  ];
}

function hasPytestFile(projectRoot) {
  const conftests = ['', ...TEST_DIRECTORIES].map((directory) =>
    path.join(projectRoot, directory, 'conftest.py'),
  );
  return (
    conftests.some((file) => existsSync(file)) ||
    existingTestFiles(projectRoot).some((file) =>
      PYTEST_STYLE_TEST.test(readFileSync(path.join(projectRoot, file), 'utf8')),
    )
  );
}

function declaresPytest(projectRoot, hints) {
  return (
    PYTEST_CONFIGURATION.test(hints) ||
    PYTEST_DEPENDENCY.test(hints) ||
    existsSync(path.join(projectRoot, 'pytest.ini'))
  );
}

function usesDjango(projectRoot, hints) {
  const found = readDjangoScript(projectRoot);
  return found !== undefined && (DJANGO_DEPENDENCY.test(hints) || DJANGO_IMPORT.test(found.text));
}

function listsNose2Plugins(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const start = lines.indexOf(NOSE2_SECTION);
  if (start === -1) {
    return false;
  }
  const section = lines.slice(start + 1);
  const end = section.findIndex((line) => line.startsWith('['));
  return section.slice(0, end === -1 ? undefined : end).some((line) => /^plugins\s*=/.test(line));
}

function usesNose2(projectRoot, hints) {
  return (
    existsSync(path.join(projectRoot, 'nose2.cfg')) ||
    listsNose2Plugins(readOptional(path.join(projectRoot, 'unittest.cfg'))) ||
    NOSE2_DEPENDENCY.test(hints)
  );
}

export function detectTestRunner(projectRoot, setting) {
  if (setting !== undefined) {
    return setting;
  }
  const hints = readProjectHints(projectRoot);
  const signals = [
    ['pytest', () => declaresPytest(projectRoot, hints)],
    ['django', () => usesDjango(projectRoot, hints)],
    ['nose2', () => usesNose2(projectRoot, hints)],
    ['pytest', () => hasPytestFile(projectRoot)],
  ];
  return signals.find(([, applies]) => applies())?.[0] ?? 'unittest';
}

export function probePytest(context) {
  if (!probes.has(context)) {
    const result = execute(context, PYTEST_PROBE);
    const [version, coverage, xdist, rerunfailures, django] =
      result.error === undefined && result.status === 0 ? result.stdout.trim().split(' ') : [];
    probes.set(
      context,
      VERSION_PATTERN.test(version ?? '')
        ? {
            version,
            coverage: coverage === '1',
            xdist: xdist === '1',
            rerunfailures: rerunfailures === '1',
            django: django === '1',
          }
        : undefined,
    );
  }
  return probes.get(context);
}

export function pytestLabel(context) {
  return `pytest@${probePytest(context)?.version ?? 'missing'}`;
}

function runnerVersion(context, runner) {
  return probeVersion(context, [
    'python',
    '-c',
    `import importlib.metadata as m; print(m.version("${RUNNER_DISTRIBUTIONS[runner]}"))`,
  ]);
}

export function testRunnerLabel(context) {
  const { testRunner } = context.project;
  if (testRunner === 'unittest') {
    return testRunner;
  }
  return testRunner === 'pytest'
    ? pytestLabel(context)
    : `${testRunner}@${runnerVersion(context, testRunner)}`;
}

function mutationPytestOptions(context) {
  const probe = probePytest(context);
  return [
    ...(probe?.xdist ? ['-n0'] : []),
    ...(context.project.testRunner === 'pytest' ? [] : ['-o', UNITTEST_FILES]),
    ...(probe?.django ? ['-o', 'django_find_project=false'] : []),
  ];
}

/** PYTEST_ADDOPTS for the pytest runs mutmut starts: pinned, single-process, `ignored` left out. */
export function mutmutPytestEnvironment(context, ignored = []) {
  const inherited = context.pytestAddopts;
  const pinned = pinnedEnvironmentAddopts(inherited).PYTEST_ADDOPTS ?? inherited;
  const options = [
    pinned,
    ...mutationPytestOptions(context),
    ...ignored.map((file) => `--ignore=${file}`),
  ].filter(Boolean);
  return options.length === 0 || options.join(' ') === inherited
    ? {}
    : { PYTEST_ADDOPTS: options.join(' ') };
}

export function pytestCommand(context) {
  const probe = probePytest(context);
  if (probe === undefined) {
    throw environmentError(
      `pytest is used by this project but cannot be imported in the ${context.launcher.description} environment: install it there, or set "python.testRunner" to "unittest"`,
    );
  }
  return [
    PYTEST_SCRIPT,
    '-q',
    '-o',
    `cache_dir=${path.join(context.reportRoot, 'pytest-cache')}`,
    ...(probe.coverage ? ['--no-cov'] : []),
    ...(probe.xdist ? ['-n0'] : []),
    '--continue-on-collection-errors',
    `--junitxml=${path.join(context.reportRoot, JUNIT_REPORT)}`,
    '-o',
    'junit_family=xunit1',
    '-o',
    'junit_duration_report=call',
    ...pinnedPytestArguments(context.projectRoot, probe),
  ];
}

export function testEnvironment(context) {
  return context.project.testRunner === 'pytest'
    ? pinnedEnvironmentAddopts(context.pytestAddopts)
    : {};
}

function unittestCommand(context) {
  const timed = [UNITTEST_SCRIPT, path.join(context.reportRoot, JUNIT_REPORT), 'discover'];
  const directory = TEST_DIRECTORIES.find((name) =>
    existsSync(path.join(context.projectRoot, name)),
  );
  if (directory === undefined) {
    return timed;
  }
  const packaged = existsSync(path.join(context.projectRoot, directory, '__init__.py'));
  return [...timed, '-s', directory, ...(packaged ? ['-t', '.'] : [])];
}

function requireRunner(context, runner) {
  if (runnerVersion(context, runner) === 'missing') {
    throw environmentError(
      `${RUNNER_DISTRIBUTIONS[runner]} runs the tests of this project but is not installed in the ${context.launcher.description} environment: install it there, or set "python.testRunner" to the runner the tests use`,
    );
  }
}

function djangoCommand(context) {
  if (readDjangoScript(context.projectRoot) === undefined) {
    throw environmentError(
      `the tests run with Django's manage.py test, but there is no manage.py at ${path.join(context.projectRoot, DJANGO_SCRIPT)} or one directory below it: add it there, or set "python.testRunner" to the runner the tests use`,
    );
  }
  requireRunner(context, 'django');
  return [DJANGO_SCRIPT, 'test', '--noinput'];
}

export function testDirectory(context) {
  const found =
    context.project.testRunner === 'django' ? readDjangoScript(context.projectRoot) : undefined;
  return found?.directory ?? context.projectRoot;
}

function nose2Command(context) {
  requireRunner(context, 'nose2');
  return ['-m', 'nose2'];
}

const COMMANDS = {
  pytest: pytestCommand,
  unittest: unittestCommand,
  django: djangoCommand,
  nose2: nose2Command,
};

export function testCommand(context) {
  return COMMANDS[context.project.testRunner](context);
}

export function testsRan({ status, stderr }) {
  return status !== NO_TESTS_EXIT && !/^Ran 0 tests?\b/m.test(stderr);
}
