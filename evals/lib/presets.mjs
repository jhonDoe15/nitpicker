import path from 'node:path';

export const PRESETS = ['typescript', 'javascript', 'python', 'java', 'kotlin'];
export const DEFAULT_PRESET = 'typescript';

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);
const JVM_PRESETS = new Set(['java', 'kotlin']);
const BASE_IGNORED = ['node_modules/', 'reports/'];
const IGNORED = {
  python: ['.venv/', '__pycache__/', '.pytest_cache/', '.ruff_cache/', '.mypy_cache/', 'mutants/'],
  java: ['build/', '.gradle/', 'target/'],
  kotlin: ['build/', '.gradle/', '.kotlin/', 'target/'],
};
const SCRIPT_PEERS = ['vitest', '@vitest/coverage-v8', 'typescript', '@types/node'];
// A TypeScript run of the quick subset checks the sources without the slow analyzers (coverage,
// CRAP and mutation). Python and the JVM presets have no such subset: mutmut finishes a small
// project in seconds, and the JVM preset is a single analyzer, so they run the whole gate.
const QUICK_ANALYZERS = {
  typescript: [
    'eslint-lint',
    'eslint-errors',
    'eslint-logging',
    'eslint-module-effects',
    'entry-points',
    'prettier-format',
    'typescript-typecheck',
    'dependency-architecture',
    'coding-standards',
    'coupling',
    'structure',
    'duplicates',
    'dead-code',
  ],
  python: [],
  java: [],
  kotlin: [],
};
QUICK_ANALYZERS.javascript = QUICK_ANALYZERS.typescript;

const TEST_FILE = /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.py$/u;
const JVM_TEST_FILE = /(?:^|\/)src\/test\/(?:java|kotlin)\/(.+)\.(?:java|kt)$/u;
const PYTEST_ARGUMENTS = ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'];

/**
 * The preset a case runs under: `case.json`'s `preset`, `typescript` when it names none. A case
 * for a Gradle or Maven preset cannot list `dependencies`; its build file declares them.
 */
export function presetOf(definition) {
  const preset = definition.preset ?? DEFAULT_PRESET;
  if (!PRESETS.includes(preset)) {
    throw new Error(`${definition.id}: preset must be one of ${PRESETS.join(', ')}, not ${preset}`);
  }
  if (isJvm(preset) && definition.dependencies !== undefined) {
    throw new Error(`${definition.id}: dependencies are declared in the build file for ${preset}`);
  }
  return preset;
}

export const usesNpmPackages = (preset) => SCRIPT_PRESETS.has(preset);
export const isJvm = (preset) => JVM_PRESETS.has(preset);

/** The peers a consumer of the preset installs next to nitpicker; only scripts need any. */
export function peerDependencies(preset, manifest) {
  if (!usesNpmPackages(preset)) return {};
  return Object.fromEntries(SCRIPT_PEERS.map((name) => [name, manifest.devDependencies[name]]));
}

/** The consumer's `.gitignore`: what the preset's tools leave behind, then the fixture's own. */
export function gitignoreOf(preset, fixtureText = '') {
  const lines = [...BASE_IGNORED, ...(IGNORED[preset] ?? [])];
  return `${lines.join('\n')}\n${fixtureText}`;
}

export function quickAnalyzersOf(preset) {
  return QUICK_ANALYZERS[preset];
}

function classNameOf(file) {
  return JVM_TEST_FILE.exec(file)?.[1].replaceAll('/', '.');
}

function pythonAcceptance(files) {
  const tests = files.filter((file) => TEST_FILE.test(file));
  return ['.venv/bin/python', ...PYTEST_ARGUMENTS, ...(tests.length > 0 ? tests : ['tests'])];
}

function gradleAcceptance(files) {
  const classes = files.map(classNameOf).filter((name) => name !== undefined);
  return ['gradle', '--console=plain', 'test', ...classes.flatMap((name) => ['--tests', name])];
}

function mavenAcceptance(files) {
  const simple = files.map(classNameOf).filter((name) => name !== undefined);
  const names = simple.map((name) => name.split('.').at(-1));
  return [
    'mvn',
    '-B',
    '-q',
    'test',
    ...(names.length > 0
      ? [`-Dtest=${names.join(',')}`, '-Dsurefire.failIfNoSpecifiedTests=false']
      : []),
  ];
}

/**
 * The command that runs a case's hidden acceptance tests when `case.json` sets no
 * `acceptance.command`: vitest for scripts, pytest in the project's `.venv` for Python, `gradle
 * test --tests <class>` or `mvn test -Dtest=<class>` (the build tool on the PATH) for the JVM, each
 * limited to the test files of `acceptance/` (`files`, relative paths) when it recognizes any.
 * `buildTool` is `maven` or `gradle`.
 */
export function defaultAcceptance({ preset, files, buildTool }) {
  if (usesNpmPackages(preset)) return ['npx', '--no-install', 'vitest', 'run'];
  if (preset === 'python') return pythonAcceptance(files);
  return buildTool === 'maven' ? mavenAcceptance(files) : gradleAcceptance(files);
}

export const buildToolOf = (fixtureFiles) =>
  fixtureFiles.some((file) => path.posix.basename(file) === 'pom.xml') &&
  !fixtureFiles.some((file) => /(?:^|\/)build\.gradle(?:\.kts)?$/u.test(file))
    ? 'maven'
    : 'gradle';
