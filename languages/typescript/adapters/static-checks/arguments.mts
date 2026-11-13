import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  PACKAGE_ROOT,
  SNAPSHOT_DIRECTORY_NAMES,
} from '../../../../core/tooling/tool-resolution.mjs';
import { realTemporaryDirectory } from '../../../../core/tooling/temporary-files.mjs';
const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;
const SUPPORTED_KINDS: ReadonlySet<string> = new Set(['prettier', 'typecheck', 'architecture']);

export type StaticCheckOptions = {
  readonly analyzerName: string;
  readonly kind: string;
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly toolRoot: string;
  readonly liveProjectRoot: string;
  readonly configRelativePath: string;
  readonly ignoreRelativePath: string | undefined;
  readonly includeOnly: string | undefined;
  readonly exclude: string | undefined;
  readonly patterns: readonly string[];
};

const VALUE_ARGUMENTS = new Set([
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

function recordValue(values: Map<string, string>, name: string, value: string): void {
  if (!VALUE_ARGUMENTS.has(name)) {
    throw new Error(`Unknown static-check adapter argument: ${name}`);
  }
  values.set(name, value);
}

function collectArguments(arguments_: readonly string[]): {
  values: Map<string, string>;
  patterns: string[];
} {
  const values = new Map<string, string>();
  const patterns: string[] = [];
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

export function parseArguments(arguments_: readonly string[]): StaticCheckOptions {
  const { values, patterns } = collectArguments(arguments_);
  const kind = requiredValue(values, '--kind');
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Unsupported static check: ${kind}`);
  }
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  const liveProjectRoot = values.get('--live-project-root');
  const ignoreRelativePath = values.get('--ignore-path');
  return {
    analyzerName: requiredValue(values, '--analyzer-name'),
    kind,
    projectRoot: validatedSnapshotRoot(requiredValue(values, '--project-root'), '--project-root'),
    policyRoot: validatedSnapshotRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    liveProjectRoot:
      liveProjectRoot === undefined
        ? PACKAGE_ROOT
        : directoryRoot(liveProjectRoot, '--live-project-root'),
    configRelativePath: normalizedRelativePath(requiredValue(values, '--config'), '--config'),
    ignoreRelativePath:
      ignoreRelativePath === undefined
        ? undefined
        : normalizedRelativePath(ignoreRelativePath, '--ignore-path'),
    includeOnly: values.get('--include-only'),
    exclude: values.get('--exclude'),
    patterns: patterns.map((value) => normalizedPattern(value)),
  };
}

function directoryRoot(value: string, name: string): string {
  const root = realpathSync(path.resolve(value));
  if (!statSync(root).isDirectory()) {
    throw new Error(`${name} must be a directory`);
  }
  return root;
}

function validatedSnapshotRoot(value: string, name: string): string {
  const root = directoryRoot(value, name);
  if (root === TRUSTED_TOOL_ROOT) {
    return root;
  }
  const relativeToTemporaryRoot = path.relative(realTemporaryDirectory(), root);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !(segments[0] ?? '').startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1] ?? '')
  ) {
    throw new Error(`${name} must be inside a generated quality-diff worktree`);
  }
  return root;
}

function normalizedPattern(value: string): string {
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

export function normalizedRelativePath(value: string, context: string): string {
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

function requiredValue(values: ReadonlyMap<string, string>, name: string): string {
  return requiredString(values.get(name), name);
}

export function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}
