import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fieldOf, fieldsOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';
import { runnerDisplayName } from '../runners.mts';

type RunnerTypesEntry = {
  readonly types: string;
  readonly installedAs?: string;
  readonly globals?: string;
};

type Diagnostic = {
  readonly code: number;
  readonly file?: { readonly text: string } | undefined;
  readonly start?: number | undefined;
  readonly length?: number | undefined;
};

type TypesContext = {
  readonly projectDirectory: string;
  readonly analyzers: readonly { readonly name: string }[];
};

const VITEST_GLOBALS = 'vitest/globals';

const RUNNER_TYPES: Readonly<Record<string, RunnerTypesEntry>> = {
  vitest: { types: VITEST_GLOBALS },
  jest: { types: 'jest', installedAs: '@types/jest', globals: 'jest' },
  mocha: { types: 'mocha', installedAs: '@types/mocha', globals: 'mocha' },
};
const TEST_RUNNER_TYPES_MISSING = new Set([2582, 2593]);
const CANNOT_FIND_NAME = 2304;
const TYPE_CHECK_ANALYZER = 'typescript-typecheck';

function lookup(
  packageName: string,
  projectDirectory: string,
): { installed: boolean; reason?: string } {
  const from = pathToFileURL(path.join(projectDirectory, 'package.json')).href;
  try {
    return { installed: findPackageJSON(packageName, from) !== undefined };
  } catch (error) {
    return { installed: false, reason: String(error) };
  }
}

function isInstalled(packageName: string, projectDirectory: string): boolean {
  return lookup(packageName, projectDirectory).installed;
}

export function missingRunnerTypes(
  runner: string | undefined,
  projectDirectory: string,
): string | undefined {
  const packageName = runner === undefined ? undefined : RUNNER_TYPES[runner]?.installedAs;
  return packageName === undefined || isInstalled(packageName, projectDirectory)
    ? undefined
    : packageName;
}

export function runnerTypes(runner: string, projectDirectory: string): string[] {
  const entry = RUNNER_TYPES[runner];
  if (entry === undefined) {
    return [];
  }
  return missingRunnerTypes(runner, projectDirectory) === undefined ? [entry.types] : [];
}

function diagnosticName(diagnostic: Diagnostic): string {
  const { file, start, length } = diagnostic;
  return file === undefined || start === undefined
    ? ''
    : file.text.slice(start, start + (length ?? 0));
}

function runnerGlobals(key: string): Readonly<Record<string, unknown>> {
  const globals: unknown = createRequire(import.meta.url)('globals');
  return fieldsOf(fieldOf(globals, key));
}

export function isUntypedRunnerGlobal(diagnostic: Diagnostic, runner: string): boolean {
  if (TEST_RUNNER_TYPES_MISSING.has(diagnostic.code)) {
    return true;
  }
  const globalsKey = RUNNER_TYPES[runner]?.globals;
  if (diagnostic.code !== CANNOT_FIND_NAME || globalsKey === undefined) {
    return false;
  }
  return Object.hasOwn(runnerGlobals(globalsKey), diagnosticName(diagnostic));
}

export function runnerTypesNotices(
  runner: string | undefined,
  { projectDirectory, analyzers }: TypesContext,
): string[] {
  const packageName = missingRunnerTypes(runner, projectDirectory);
  const name = runnerDisplayName(runner);
  if (packageName === undefined || !analyzers.some(({ name }) => name === TYPE_CHECK_ANALYZER)) {
    return [];
  }
  return [
    `The project runs its tests with ${name}, but ${packageName} is not installed, ` +
      `so the type check does not know the ${name} globals and does not report the ` +
      `errors they cause in test files. Install ${packageName} (npm install --save-dev ${packageName}) ` +
      'to have the tests type checked against them.',
  ];
}

export function withRunnerTypes(
  text: string,
  { runner, projectDirectory }: { readonly runner: string; readonly projectDirectory: string },
): string {
  const config = parseJson(text);
  const compilerOptions = fieldOf(config, 'compilerOptions');
  const current = listOf(fieldOf(compilerOptions, 'types'));
  if (!current.includes(VITEST_GLOBALS)) {
    return text;
  }
  const types = current.flatMap((type) =>
    type === VITEST_GLOBALS ? runnerTypes(runner, projectDirectory) : [type],
  );
  if (JSON.stringify(types) === JSON.stringify(current)) {
    return text;
  }
  const updated = { ...fieldsOf(config), compilerOptions: { ...fieldsOf(compilerOptions), types } };
  return `${JSON.stringify(updated, null, 2)}\n`;
}
