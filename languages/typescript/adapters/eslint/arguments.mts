import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { realpathSync, statSync } from 'node:fs';
import { normalizedRelativePath, assertContainedPath } from './paths.mts';
import { validatedWorktreeRoot as validatedSnapshotRoot } from '../static-checks/arguments.mts';
import { positiveInteger as untypedPositiveInteger } from '../../../../core/diff/comparison/schema/values.mjs';
import path from 'node:path';
import { analyzerDeadlineMs } from '../../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';

export type EslintOptions = {
  readonly analyzerName: string;
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly liveProjectRoot: string;
  readonly toolRoot: string;
  readonly configRelativePath: string;
  readonly timeoutMs: number;
  readonly eslintCliPath: string | undefined;
  readonly environment: Readonly<Record<string, string>>;
  readonly patterns: readonly string[];
  readonly policyFiles: readonly string[];
};

type CollectedArguments = { readonly values: Map<string, string>; readonly patterns: string[] };

export const positiveInteger: (value: unknown, context: string) => number = untypedPositiveInteger;

const DEFAULT_ESLINT_TIMEOUT_MS = 4 * 60 * 1000;

const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;

const VALUE_ARGUMENTS = new Set([
  '--analyzer-name',
  '--project-root',
  '--policy-root',
  '--tool-root',
  '--live-project-root',
  '--config',
  '--timeout-ms',
  '--eslint-cli',
  '--environment',
]);

function requiredValue(name: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function environmentEntry(value: string): [string, string] {
  const separator = value.indexOf('=');
  if (separator < 1) {
    throw new Error('--environment requires NAME=value');
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function recordArgument(
  { values, patterns }: CollectedArguments,
  name: string,
  value: string | undefined,
): void {
  if (name === '--pattern') {
    patterns.push(requiredValue(name, value));
    return;
  }
  if (name === '--policy-file') {
    values.set(`policy-file:${String(values.size)}`, requiredValue(name, value));
    return;
  }
  if (!VALUE_ARGUMENTS.has(name)) {
    throw new Error(`Unknown ESLint adapter argument: ${name}`);
  }
  const present = requiredValue(name, value);
  if (name !== '--environment') {
    values.set(name, present);
    return;
  }
  const [variable, variableValue] = environmentEntry(present);
  values.set(`environment:${variable}`, variableValue);
}

function collectArguments(argumentList: readonly string[]): CollectedArguments {
  const collected: CollectedArguments = { values: new Map(), patterns: [] };
  const remaining = argumentList.values();
  for (const name of remaining) {
    recordArgument(collected, name, remaining.next().value);
  }
  return collected;
}

function prefixedValues(values: ReadonlyMap<string, string>, prefix: string): [string, string][] {
  return [...values]
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, value]): [string, string] => [name.slice(prefix.length), value]);
}

export function parseArguments(
  argumentList: readonly string[],
  processEnvironment: Readonly<Record<string, string | undefined>> = {},
): EslintOptions {
  const { values, patterns } = collectArguments(argumentList);
  const liveProjectRoot = values.get('--live-project-root');
  const eslintCli = values.get('--eslint-cli');
  if (patterns.length === 0) {
    throw new Error('ESLint adapter requires at least one --pattern');
  }
  const environment = Object.fromEntries(prefixedValues(values, 'environment:'));
  const policyFiles = prefixedValues(values, 'policy-file:').map(([, value]) => value);
  return {
    analyzerName: requiredArgument(values, '--analyzer-name'),
    projectRoot: validatedSnapshotRoot(
      requiredArgument(values, '--project-root'),
      '--project-root',
    ),
    policyRoot: validatedPolicyRoot(requiredArgument(values, '--policy-root')),
    liveProjectRoot: liveProjectRoot === undefined ? PACKAGE_ROOT : realpathSync(liveProjectRoot),
    toolRoot: validatedToolRoot(requiredArgument(values, '--tool-root')),
    configRelativePath: normalizedRelativePath(requiredArgument(values, '--config'), '--config'),
    timeoutMs: positiveInteger(
      Number(
        values.get('--timeout-ms') ??
          analyzerDeadlineMs(processEnvironment) ??
          DEFAULT_ESLINT_TIMEOUT_MS,
      ),
      '--timeout-ms',
    ),
    eslintCliPath: eslintCli === undefined ? undefined : validatedEslintCli(eslintCli),
    environment,
    patterns: patterns.map(validatePattern),
    policyFiles: policyFiles.map((value) => normalizedRelativePath(value, '--policy-file')),
  };
}

function validatedPolicyRoot(value: string): string {
  const root = realpathSync(path.resolve(value));
  return root === PACKAGE_ROOT ? root : validatedSnapshotRoot(value, '--policy-root');
}

function validatedToolRoot(value: string): string {
  const canonicalRoot = realpathSync(path.resolve(value));
  if (canonicalRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return canonicalRoot;
}

function validatedEslintCli(value: string): string {
  const canonicalPath = realpathSync(path.resolve(value));
  assertContainedPath(TRUSTED_TOOL_ROOT, canonicalPath, '--eslint-cli');
  if (!statSync(canonicalPath).isFile()) {
    throw new Error('--eslint-cli must be a regular file');
  }
  return canonicalPath;
}

function validatePattern(value: string): string {
  const normalizedPattern = value.replaceAll('\\', '/');
  if (
    normalizedPattern.length === 0 ||
    path.posix.isAbsolute(normalizedPattern) ||
    /^[A-Za-z]:\//.test(normalizedPattern) ||
    normalizedPattern.split('/').includes('..')
  ) {
    throw new Error('--pattern must stay within the analyzed snapshot');
  }
  return normalizedPattern;
}

function requiredArgument(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
