import { isCollectedPythonFile, isTestFile } from '../detectors/languages/project-files.mjs';

export const PRESETS = ['typescript', 'javascript', 'python', 'java', 'kotlin'];
export const DEFAULT_PRESET = 'typescript';

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);
const JVM_PRESETS = new Set(['java', 'kotlin']);
const BASE_IGNORED = ['node_modules/', 'reports/'];
const IGNORED = {
  python: [
    '.venv/',
    '__pycache__/',
    '.pytest_cache/',
    '.ruff_cache/',
    '.mypy_cache/',
    '.coverage',
    'mutants/',
  ],
  java: ['build/', '.gradle/', 'target/'],
  kotlin: ['build/', '.gradle/', '.kotlin/', 'target/'],
};
const SCRIPT_PEERS = ['vitest', '@vitest/coverage-v8', 'typescript', '@types/node'];
// A TypeScript run of the quick subset checks the sources without the slow analyzers (coverage,
// CRAP and mutation). Python and the JVM presets have no such subset: mutmut finishes a small
// project in seconds, and the JVM preset is a single analyzer, so they run the whole gate.
const SCRIPT_QUICK_ANALYZERS = [
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
];
const QUICK_ANALYZERS = {
  typescript: SCRIPT_QUICK_ANALYZERS,
  javascript: SCRIPT_QUICK_ANALYZERS,
  python: [],
  java: [],
  kotlin: [],
};

const PYTHON_FILE = /\.py$/u;
const JAVA_FILE = /\.java$/u;
const KOTLIN_FILE = /\.kt$/u;
const PACKAGE = /^package\s+([\w.]+)/mu;
const TOP_LEVEL_CLASS =
  /^(?:(?:public|internal|private|open|final|abstract|data|sealed)\s+)*class\s+(\w+)/gmu;
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

const isJvmTestSource = (file) =>
  (JAVA_FILE.test(file) && isTestFile('java', file)) ||
  (KOTLIN_FILE.test(file) && isTestFile('kotlin', file));

function classesOf(file, text) {
  if (!isJvmTestSource(file)) return [];
  const prefix = PACKAGE.exec(text)?.[1];
  return [...text.matchAll(TOP_LEVEL_CLASS)].map(([, name]) =>
    prefix ? `${prefix}.${name}` : name,
  );
}

function acceptanceClasses(files) {
  return [...files].flatMap(([file, text]) => classesOf(file, text));
}

function pythonAcceptance(files) {
  const sources = [...files.keys()].filter((file) => PYTHON_FILE.test(file));
  const tests = sources.filter(isCollectedPythonFile);
  const selected = tests.length > 0 ? tests : sources;
  if (selected.length === 0) {
    throw new Error('a Python case needs pytest files in acceptance/ or an acceptance.command');
  }
  return ['.venv/bin/python', ...PYTEST_ARGUMENTS, ...selected];
}

function gradleAcceptance(files) {
  const classes = acceptanceClasses(files);
  return ['gradle', '--console=plain', 'test', ...classes.flatMap((name) => ['--tests', name])];
}

function mavenAcceptance(files) {
  const names = acceptanceClasses(files).map((name) => name.split('.').at(-1));
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
 * test --tests <class>` or `mvn test -Dtest=<class>` for the JVM, each limited to the test files
 * of `acceptance/`. `files` maps their relative paths to their text: a Python case runs its
 * `test_*.py` and `*_test.py` files (all its `.py` files when none has such a name), a JVM case the
 * top-level classes declared in its test sources, named by package and class, not by file.
 * `buildTool` is `maven` or `gradle` (see `detectJavaBuild`).
 */
export function defaultAcceptance({ preset, files, buildTool }) {
  if (usesNpmPackages(preset)) return ['npx', '--no-install', 'vitest', 'run'];
  if (preset === 'python') return pythonAcceptance(files);
  return buildTool === 'maven' ? mavenAcceptance(files) : gradleAcceptance(files);
}
