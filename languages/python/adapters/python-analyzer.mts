import { readdirSync } from 'node:fs';
import path from 'node:path';
import { importClosure as untypedClosure } from '../../../shared/import-closure.mjs';
import { hashConfigurationFiles } from '../../../shared/values/configuration-hash.mts';
import { RULES_TOOL } from '../rules/rule-hints.mts';
import { createToolContext, mutationVersions, toolVersions } from './python-tools.mts';
import { TEST_CONSOLE_TOOL } from './test-results/console-output.mts';
import { FACTS_TOOL } from './facts/python-facts.mts';
import { mutationScopeArguments as untypedScopeArguments } from '../../../core/tooling/runner-arguments.mjs';
import { checkoutModulePath as untypedModulePath } from '../../../shared/paths/checkout-module.mjs';
import type {
  AnalyzerProbes,
  AnalyzerSettings,
  InvocationContext,
  PythonAnalyzer,
  PythonInvocation,
  VersionReader,
} from './typed/context/analyzer-types.mts';
import { EXECUTION_INPUTS } from '../../../shared/input-sets/inputs.mjs';

const importClosure: (relativePaths: string[], root: string) => Map<string, string> =
  untypedClosure;
const mutationScopeArguments: (scope: unknown) => string[] = untypedScopeArguments;
const checkoutModulePath: (file: string) => string = untypedModulePath;
export const PYTHON_ANALYZER_NAME = 'python';
export const MUTATION_ANALYZER_NAME = 'mutation';
const UNRESOLVED_VERSION = 'unresolved';
const ANALYZER_TIMEOUT_MS = 30 * 60 * 1000;
const MUTATION_TIMEOUT_MS = 70 * 60 * 1000;
const MUTATION_SHARD_WEIGHT = 90;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const pythonRoot = path.join(packageRoot, 'languages/python');
const runnerPath = checkoutModulePath(path.join(import.meta.dirname, 'python-runner.mjs'));
const TEST_ONLY_FOLDERS = new Set(['fixtures', 'test-support']);

function importedRunnerFiles(): string[] {
  const entry = path.relative(packageRoot, runnerPath);
  return [...importClosure([entry], packageRoot).keys()].map((file) =>
    path.join(packageRoot, file),
  );
}

function pythonResourceFiles(): string[] {
  return readdirSync(pythonRoot, { recursive: true, encoding: 'utf8' })
    .filter((file) => !/\.test\.m[jt]s$/u.test(file))
    .filter((file) => !file.split(path.sep).some((folder) => TEST_ONLY_FOLDERS.has(folder)))
    .filter((file) => path.extname(file) !== '')
    .map((file) => path.join(pythonRoot, file));
}

export function configurationFiles(): string[] {
  const files = new Set([...pythonResourceFiles(), ...importedRunnerFiles()]);
  return [...files].map((file) => path.relative(packageRoot, file)).sort();
}

function hashConfiguration(settings: AnalyzerSettings, part: string): string {
  return hashConfigurationFiles(packageRoot, [part, settings], configurationFiles());
}

function resolveVersion(
  liveProjectRoot: string,
  versions: VersionReader,
  { settings, probes }: { settings: AnalyzerSettings; probes: AnalyzerProbes },
): string {
  return versions(
    createToolContext({
      projectRoot: liveProjectRoot,
      liveRoot: liveProjectRoot,
      settings,
      probes,
    }),
  );
}

function pythonInvocation(
  settings: AnalyzerSettings,
  part: string,
): (context: InvocationContext) => PythonInvocation {
  return ({ projectRoot, liveProjectRoot, toolRoot, baselineMovesFile, mutationScope }) => ({
    command: process.execPath,
    args: [
      runnerPath,
      '--part',
      part,
      '--project-root',
      projectRoot,
      '--live-root',
      liveProjectRoot,
      ...(Object.keys(settings).length === 0
        ? []
        : ['--python-settings', JSON.stringify(settings)]),
      ...(part === PYTHON_ANALYZER_NAME && baselineMovesFile !== undefined
        ? ['--baseline-moves-file', baselineMovesFile]
        : []),
      ...(part === MUTATION_ANALYZER_NAME ? mutationScopeArguments(mutationScope) : []),
    ],
    cwd: toolRoot,
  });
}

function pythonAnalyzer(settings: AnalyzerSettings, probes: AnalyzerProbes): PythonAnalyzer {
  return {
    name: PYTHON_ANALYZER_NAME,
    inputs: EXECUTION_INPUTS,
    publishesModuleImports: true,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) =>
      resolveVersion(liveProjectRoot, toolVersions, { settings, probes }),
    configurationHash: hashConfiguration(settings, PYTHON_ANALYZER_NAME),
    exclusions: [],
    reportedTools: [
      'ruff',
      'ruff-format',
      'black',
      'coverage',
      'mypy',
      'pyright',
      'basedpyright',
      'structure',
      'crap',
      RULES_TOOL,
      'coverage-py',
      'duplicates',
      'coupling',
      'import-linter',
      'tests',
      'test-runtime',
      TEST_CONSOLE_TOOL,
      FACTS_TOOL,
      'dependencies',
    ],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation: pythonInvocation(settings, PYTHON_ANALYZER_NAME),
  };
}

function mutationAnalyzer(settings: AnalyzerSettings, probes: AnalyzerProbes): PythonAnalyzer {
  return {
    name: MUTATION_ANALYZER_NAME,
    inputs: EXECUTION_INPUTS,
    version: UNRESOLVED_VERSION,
    resolveVersion: (liveProjectRoot) =>
      resolveVersion(liveProjectRoot, mutationVersions, { settings, probes }),
    configurationHash: hashConfiguration(settings, MUTATION_ANALYZER_NAME),
    exclusions: [],
    reportedTools: ['mutmut'],
    dependencies: [PYTHON_ANALYZER_NAME],
    toleratedDependencyErrors: ['tests', 'test-runtime', 'dependencies'],
    shardWeight: MUTATION_SHARD_WEIGHT,
    timeoutMs: MUTATION_TIMEOUT_MS,
    createInvocation: pythonInvocation(settings, MUTATION_ANALYZER_NAME),
  };
}

export function createPythonAnalyzer(settings: AnalyzerSettings = {}): PythonAnalyzer {
  return pythonAnalyzer(settings, new Map());
}

export function createMutationAnalyzer(settings: AnalyzerSettings = {}): PythonAnalyzer {
  return mutationAnalyzer(settings, new Map());
}

export function createPythonAnalyzers(settings: AnalyzerSettings = {}): PythonAnalyzer[] {
  const probes: AnalyzerProbes = new Map();
  return [pythonAnalyzer(settings, probes), mutationAnalyzer(settings, probes)];
}
