import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { environmentError } from './python-environment.mjs';
import { execute, VERSION_PATTERN } from './python-process.mjs';
import { readProjectHints } from './python-project.mjs';
import { JUNIT_REPORT } from '../test-runs/junit-results.mjs';
import { pinnedEnvironmentAddopts, pinnedPytestArguments } from '../test-runs/pytest-pins.mjs';

export const NO_TESTS_EXIT = 5;
const TEST_DIRECTORIES = ['tests', 'test'];
const PYTEST_CONFIGURATION = /^\s*\[(?:tool\.pytest(?:\.ini_options)?|pytest|tool:pytest)\]/m;
const PYTEST_DEPENDENCY = /(?:^|[\s"'=])pytest(?:\b|_)/m;
const PYTEST_STYLE_TEST =
  /^(?:async\s+)?def test_|^(?:import|from)\s+pytest\b|^class Test\w*\s*(?:\(\s*\))?:/m;
const TEST_FILE = /^(?:test_.*|.*_test)\.py$/;
const PYTEST_PROBE = [
  'python',
  '-c',
  'import importlib.util as u, pytest; print(pytest.__version__, *(int(u.find_spec(m) is not None) for m in ("pytest_cov", "xdist", "pytest_rerunfailures")))',
];
const probes = new WeakMap();
export const UNITTEST_SCRIPT = fileURLToPath(
  new URL('../test-runs/unittest_timings.py', import.meta.url),
);

function existingTestFiles(projectRoot) {
  const directories = TEST_DIRECTORIES.filter((name) => existsSync(path.join(projectRoot, name)));
  return [
    ...readdirSync(projectRoot).filter((name) => TEST_FILE.test(name)),
    ...directories.flatMap((directory) =>
      readdirSync(path.join(projectRoot, directory), { recursive: true })
        .filter((name) => TEST_FILE.test(path.basename(name)))
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

export function detectTestRunner(projectRoot, setting) {
  if (setting !== undefined) {
    return setting;
  }
  const hints = readProjectHints(projectRoot);
  const indicated =
    PYTEST_CONFIGURATION.test(hints) ||
    PYTEST_DEPENDENCY.test(hints) ||
    existsSync(path.join(projectRoot, 'pytest.ini')) ||
    hasPytestFile(projectRoot);
  return indicated ? 'pytest' : 'unittest';
}

function probePytest(context) {
  if (!probes.has(context)) {
    const result = execute(context, PYTEST_PROBE);
    const [version, coverage, xdist, rerunfailures] =
      result.error === undefined && result.status === 0 ? result.stdout.trim().split(' ') : [];
    probes.set(
      context,
      VERSION_PATTERN.test(version ?? '')
        ? {
            version,
            coverage: coverage === '1',
            xdist: xdist === '1',
            rerunfailures: rerunfailures === '1',
          }
        : undefined,
    );
  }
  return probes.get(context);
}

export function pytestLabel(context) {
  return `pytest@${probePytest(context)?.version ?? 'missing'}`;
}

export function testRunnerLabel(context) {
  const { testRunner } = context.project;
  return testRunner === 'pytest' ? pytestLabel(context) : testRunner;
}

/** PYTEST_ADDOPTS for the pytest runs mutmut starts: pinned, single-process, `ignored` left out. */
export function mutmutPytestEnvironment(context, ignored = []) {
  const inherited = context.pytestAddopts;
  const pinned = pinnedEnvironmentAddopts(inherited).PYTEST_ADDOPTS ?? inherited;
  const options = [
    pinned,
    ...(probePytest(context)?.xdist ? ['-n0'] : []),
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
    '-m',
    'pytest',
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

export function testCommand(context) {
  return context.project.testRunner === 'pytest'
    ? pytestCommand(context)
    : unittestCommand(context);
}

export function testsRan({ status, stderr }) {
  return status !== NO_TESTS_EXIT && !/^Ran 0 tests?\b/m.test(stderr);
}
