import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  PACKAGE_ROOT,
  SNAPSHOT_DIRECTORY_NAMES,
} from '../../../../core/tooling/tool-resolution.mjs';
export const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;
export const SUPPORTED_KINDS = new Set(['prettier', 'typecheck', 'architecture']);

export const VALUE_ARGUMENTS = new Set([
  '--analyzer-name',
  '--kind',
  '--project-root',
  '--policy-root',
  '--tool-root',
  '--live-project-root',
  '--config',
  '--ignore-path',
  '--include-only',
  '--exclude',
]);

export function recordValue(values, name, value) {
  if (!VALUE_ARGUMENTS.has(name)) {
    throw new Error(`Unknown static-check adapter argument: ${name}`);
  }
  values.set(name, value);
}

export function collectArguments(arguments_) {
  const values = new Map();
  const patterns = [];
  const remaining = arguments_.values();
  for (const name of remaining) {
    const { value } = remaining.next();
    if (value === undefined) {
      throw new Error(`${name} requires a value`);
    }
    if (name === '--pattern') {
      patterns.push(value);
    } else {
      recordValue(values, name, value);
    }
  }
  return { values, patterns };
}

export function parseArguments(arguments_) {
  const { values, patterns } = collectArguments(arguments_);
  const kind = requiredValue(values, '--kind');
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Unsupported static check: ${kind}`);
  }
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return {
    analyzerName: requiredValue(values, '--analyzer-name'),
    kind,
    projectRoot: validatedSnapshotRoot(requiredValue(values, '--project-root'), '--project-root'),
    policyRoot: validatedSnapshotRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    liveProjectRoot:
      values.get('--live-project-root') === undefined
        ? PACKAGE_ROOT
        : directoryRoot(values.get('--live-project-root'), '--live-project-root'),
    configRelativePath: normalizedRelativePath(requiredValue(values, '--config'), '--config'),
    ignoreRelativePath:
      values.get('--ignore-path') === undefined
        ? undefined
        : normalizedRelativePath(values.get('--ignore-path'), '--ignore-path'),
    includeOnly: values.get('--include-only'),
    exclude: values.get('--exclude'),
    patterns: patterns.map((value) => normalizedPattern(value)),
  };
}

export function directoryRoot(value, name) {
  const root = realpathSync(path.resolve(value));
  if (!statSync(root).isDirectory()) {
    throw new Error(`${name} must be a directory`);
  }
  return root;
}

export function validatedSnapshotRoot(value, name) {
  const root = directoryRoot(value, name);
  if (root === TRUSTED_TOOL_ROOT) {
    return root;
  }
  const relativeToTemporaryRoot = path.relative(realpathSync(tmpdir()), root);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !segments[0].startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    throw new Error(`${name} must be inside a generated quality-diff worktree`);
  }
  return root;
}

export function normalizedPattern(value) {
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:\//.test(value) ||
    value.split('/').includes('..')
  ) {
    throw new Error('--pattern must stay within the analyzed snapshot');
  }
  return value.replaceAll('\\', '/');
}

export function normalizedRelativePath(value, context) {
  const normalizedPath = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (
    normalizedPath.length === 0 ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath) ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new Error(`${context} must stay within the analyzed snapshot`);
  }
  return normalizedPath;
}

export function requiredValue(values, name) {
  return requiredString(values.get(name), name);
}

export function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}
