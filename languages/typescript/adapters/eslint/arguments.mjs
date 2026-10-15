import {
  PACKAGE_ROOT,
  SNAPSHOT_DIRECTORY_NAMES,
} from '../../../../core/tooling/tool-resolution.mjs';
import { realpathSync, statSync } from 'node:fs';
import { normalizedRelativePath, assertContainedPath } from './paths.mjs';
import path from 'node:path';
import { tmpdir } from 'node:os';

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

function requiredValue(name, value) {
  if (value === undefined) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function environmentEntry(value) {
  const separator = value.indexOf('=');
  if (separator < 1) {
    throw new Error('--environment requires NAME=value');
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function recordArgument({ values, patterns }, name, value) {
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
  requiredValue(name, value);
  if (name !== '--environment') {
    values.set(name, value);
    return;
  }
  const [variable, variableValue] = environmentEntry(value);
  values.set(`environment:${variable}`, variableValue);
}

function collectArguments(arguments_) {
  const collected = { values: new Map(), patterns: [] };
  const remaining = arguments_.values();
  for (const name of remaining) {
    recordArgument(collected, name, remaining.next().value);
  }
  return collected;
}

function prefixedValues(values, prefix) {
  return [...values]
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, value]) => [name.slice(prefix.length), value]);
}

export function parseArguments(arguments_) {
  const { values, patterns } = collectArguments(arguments_);
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
    liveProjectRoot:
      values.get('--live-project-root') === undefined
        ? PACKAGE_ROOT
        : realpathSync(values.get('--live-project-root')),
    toolRoot: validatedToolRoot(requiredArgument(values, '--tool-root')),
    configRelativePath: normalizedRelativePath(requiredArgument(values, '--config'), '--config'),
    timeoutMs: positiveInteger(
      Number(values.get('--timeout-ms') ?? DEFAULT_ESLINT_TIMEOUT_MS),
      '--timeout-ms',
    ),
    eslintCliPath:
      values.get('--eslint-cli') === undefined
        ? undefined
        : validatedEslintCli(values.get('--eslint-cli')),
    environment,
    patterns: patterns.map(validatePattern),
    policyFiles: policyFiles.map((value) => normalizedRelativePath(value, '--policy-file')),
  };
}

function validatedSnapshotRoot(value, context) {
  const canonicalRoot = realpathSync(path.resolve(value));
  if (!statSync(canonicalRoot).isDirectory()) {
    throw new Error(`${context} must be a directory`);
  }

  const relativeToTemporaryRoot = path.relative(realpathSync(tmpdir()), canonicalRoot);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !segments[0].startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    throw new Error(`${context} must be inside a generated quality-diff worktree`);
  }
  return canonicalRoot;
}

function validatedPolicyRoot(value) {
  const root = realpathSync(path.resolve(value));
  return root === PACKAGE_ROOT ? root : validatedSnapshotRoot(value, '--policy-root');
}

function validatedToolRoot(value) {
  const canonicalRoot = realpathSync(path.resolve(value));
  if (canonicalRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return canonicalRoot;
}

function validatedEslintCli(value) {
  const canonicalPath = realpathSync(path.resolve(value));
  assertContainedPath(TRUSTED_TOOL_ROOT, canonicalPath, '--eslint-cli');
  if (!statSync(canonicalPath).isFile()) {
    throw new Error('--eslint-cli must be a regular file');
  }
  return canonicalPath;
}

function validatePattern(value) {
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

function requiredArgument(values, name) {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}

export function positiveInteger(value, context) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${context} must be a positive integer`);
  }
  return value;
}
