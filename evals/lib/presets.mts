import { isCollectedPythonFile, isTestFile } from '../detectors/languages/project-files.mjs';
import { fieldAt, type Fields, requiredFields } from '../../scripts/json/fields.mts';

export const PRESETS = ['typescript', 'javascript', 'python', 'java', 'kotlin'] as const;
export type Preset = (typeof PRESETS)[number];
export const DEFAULT_PRESET: Preset = 'typescript';
type Files = ReadonlyMap<string, string>;

const SCRIPT_PRESETS = new Set<Preset>(['typescript', 'javascript']);
const JVM_PRESETS = new Set<Preset>(['java', 'kotlin']);
const BASE_IGNORED = ['node_modules/', 'reports/'];
const IGNORED: Partial<Record<Preset, readonly string[]>> = {
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
const WHOLE_GATE: readonly string[] = [];
const QUICK_ANALYZERS: Record<Preset, readonly string[]> = {
  typescript: SCRIPT_QUICK_ANALYZERS,
  javascript: SCRIPT_QUICK_ANALYZERS,
  python: WHOLE_GATE,
  java: WHOLE_GATE,
  kotlin: WHOLE_GATE,
};

const PYTHON_FILE = /\.py$/u;
const JAVA_FILE = /\.java$/u;
const KOTLIN_FILE = /\.kt$/u;
const PACKAGE = /^package\s+([\w.]+)/mu;
const TOP_LEVEL_CLASS =
  /^(?:(?:public|internal|private|open|final|abstract|data|sealed)\s+)*class\s+(\w+)/gmu;
const PYTEST_ARGUMENTS = ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'];

function isPreset(value: unknown): value is Preset {
  return PRESETS.some((preset) => preset === value);
}

export function presetOf(definition: Fields): Preset {
  const preset = definition['preset'] ?? DEFAULT_PRESET;
  if (!isPreset(preset)) {
    throw new Error(
      `${String(definition['id'])}: preset must be one of ${PRESETS.join(', ')}, not ${String(preset)}`,
    );
  }
  if (isJvm(preset) && definition['dependencies'] !== undefined) {
    throw new Error(
      `${String(definition['id'])}: dependencies are declared in the build file for ${preset}`,
    );
  }
  return preset;
}

export function usesNpmPackages(preset: Preset): boolean {
  return SCRIPT_PRESETS.has(preset);
}

export function isJvm(preset: Preset): boolean {
  return JVM_PRESETS.has(preset);
}

export function peerDependencies(preset: Preset, manifest: unknown): Fields {
  if (!usesNpmPackages(preset)) return {};
  const devDependencies = requiredFields(fieldAt(manifest, 'devDependencies'), 'devDependencies');
  return Object.fromEntries(SCRIPT_PEERS.map((name) => [name, devDependencies[name]]));
}

export function gitignoreOf(preset: Preset, fixtureText = ''): string {
  const lines = [...BASE_IGNORED, ...(IGNORED[preset] ?? [])];
  return `${lines.join('\n')}\n${fixtureText}`;
}

export function quickAnalyzersOf(preset: Preset): readonly string[] {
  return QUICK_ANALYZERS[preset];
}

function isJvmTestSource(file: string): boolean {
  return (
    (JAVA_FILE.test(file) && isTestFile('java', file)) ||
    (KOTLIN_FILE.test(file) && isTestFile('kotlin', file))
  );
}

function classesOf(file: string, text: string): string[] {
  if (!isJvmTestSource(file)) return [];
  const prefix = PACKAGE.exec(text)?.[1];
  return [...text.matchAll(TOP_LEVEL_CLASS)].flatMap(([, name]) =>
    name === undefined ? [] : [prefix ? `${prefix}.${name}` : name],
  );
}

function acceptanceClasses(files: Files): string[] {
  return [...files].flatMap(([file, text]) => classesOf(file, text));
}

function pythonAcceptance(files: Files): string[] {
  const sources = [...files.keys()].filter((file) => PYTHON_FILE.test(file));
  const tests = sources.filter(isCollectedPythonFile);
  const selected = tests.length > 0 ? tests : sources;
  if (selected.length === 0) {
    throw new Error('a Python case needs pytest files in acceptance/ or an acceptance.command');
  }
  return ['.venv/bin/python', ...PYTEST_ARGUMENTS, ...selected];
}

function gradleAcceptance(files: Files): string[] {
  const classes = acceptanceClasses(files);
  return ['gradle', '--console=plain', 'test', ...classes.flatMap((name) => ['--tests', name])];
}

function mavenAcceptance(files: Files): string[] {
  const names = acceptanceClasses(files).map((name) => name.split('.').at(-1) ?? name);
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

export function defaultAcceptance({
  preset,
  files,
  buildTool,
}: {
  readonly preset: Preset;
  readonly files: Files;
  readonly buildTool?: string | undefined;
}): string[] {
  if (usesNpmPackages(preset)) return ['npx', '--no-install', 'vitest', 'run'];
  if (preset === 'python') return pythonAcceptance(files);
  return buildTool === 'maven' ? mavenAcceptance(files) : gradleAcceptance(files);
}
