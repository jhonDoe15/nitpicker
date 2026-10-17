import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { environmentError } from './python-environment.mjs';
import { execute, VERSION_PATTERN } from './python-process.mjs';
import { isTestFileName, readProjectHints, TEST_DIRECTORIES } from './python-project.mjs';

export const NO_TESTS_EXIT = 5;
const PYTEST_CONFIGURATION = /^\s*\[(?:tool\.pytest(?:\.ini_options)?|pytest|tool:pytest)\]/m;
const PYTEST_DEPENDENCY = /(?:^|[\s"'=])pytest(?:\b|_)/m;
const PYTEST_STYLE_TEST =
  /^(?:async\s+)?def test_|^(?:import|from)\s+pytest\b|^class Test\w*\s*(?:\(\s*\))?:/m;
const PYTEST_PROBE = [
  'python',
  '-c',
  'import importlib.util as u, pytest; print(pytest.__version__, int(u.find_spec("pytest_cov") is not None), int(u.find_spec("xdist") is not None))',
];
const probes = new WeakMap();

function existingTestFiles(projectRoot) {
  const directories = TEST_DIRECTORIES.filter((name) => existsSync(path.join(projectRoot, name)));
  return [
    ...readdirSync(projectRoot).filter((name) => isTestFileName(name)),
    ...directories.flatMap((directory) =>
      readdirSync(path.join(projectRoot, directory), { recursive: true })
        .filter((name) => isTestFileName(path.basename(name)))
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
    const [version, coverage, xdist] =
      result.error === undefined && result.status === 0 ? result.stdout.trim().split(' ') : [];
    probes.set(
      context,
      VERSION_PATTERN.test(version ?? '')
        ? { version, coverage: coverage === '1', xdist: xdist === '1' }
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

export function singleProcessPytestEnvironment(context) {
  return probePytest(context)?.xdist
    ? { PYTEST_ADDOPTS: [process.env.PYTEST_ADDOPTS, '-n0'].filter(Boolean).join(' ') }
    : {};
}

function pytestCommand(context) {
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
  ];
}

function unittestCommand(context) {
  const directory = TEST_DIRECTORIES.find((name) =>
    existsSync(path.join(context.projectRoot, name)),
  );
  if (directory === undefined) {
    return ['-m', 'unittest', 'discover'];
  }
  const packaged = existsSync(path.join(context.projectRoot, directory, '__init__.py'));
  return ['-m', 'unittest', 'discover', '-s', directory, ...(packaged ? ['-t', '.'] : [])];
}

export function testCommand(context) {
  return context.project.testRunner === 'pytest'
    ? pytestCommand(context)
    : unittestCommand(context);
}

export function testsRan({ status, stderr }) {
  return status !== NO_TESTS_EXIT && !/^Ran 0 tests?\b/m.test(stderr);
}
