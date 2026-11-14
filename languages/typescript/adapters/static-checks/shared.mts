import type { SpawnSyncReturns } from 'node:child_process';
import { spawnSyncWithOutputFile, toolBinaryPath, toolNameForPath } from '../typed/tooling.mts';
import { realpathSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';
import { type StaticCheckOptions, normalizedRelativePath } from './arguments.mts';
import { createHash } from 'node:crypto';
import { TOOL_RUN_CEILING_MS } from '../../../../shared/processes/deadlines.mjs';
import { describeProcessEnd } from '../../../../shared/processes/process-failure.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

export type Finding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  message: string;
  classification: string;
  symbol?: string;
  location?: { line: number; column?: number; endLine?: number };
};

type NodeToolRun = {
  readonly options: StaticCheckOptions;
  readonly relativeToolPath: string;
  readonly toolArguments: readonly string[];
  readonly acceptedStatuses: readonly NodeToolResult['status'][];
};

export type NodeToolResult = Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'>;

export function runNodeTool({
  options,
  relativeToolPath,
  toolArguments,
  acceptedStatuses,
}: NodeToolRun): NodeToolResult {
  const name = toolNameForPath(relativeToolPath);
  const toolPath = toolBinaryPath(name, {
    projectRoot: options.liveProjectRoot,
    bin: relativeToolPath.slice(name.length + 1),
  });
  const result = spawnSyncWithOutputFile(process.execPath, [toolPath, ...toolArguments], {
    cwd: options.projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: TOOL_RUN_CEILING_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(describeProcessEnd(options.kind, result));
  }
  return result;
}

export function projectFile(projectRoot: string, filePath: string): string {
  const resolvedPath = realpathSync(path.resolve(projectRoot, filePath));
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Analyzer path must stay within ${projectRoot}: ${filePath} resolved to ${resolvedPath}`,
    );
  }
  const entry = lstatSync(resolvedPath);
  if (!entry.isFile()) {
    throw new Error(`Analyzer returned a non-file path: ${filePath}`);
  }
  return relativePath.replaceAll('\\', '/');
}

export function policyFile(options: StaticCheckOptions, relativePath: string): string {
  const normalizedPath = normalizedRelativePath(relativePath, relativePath);
  return policyPath(options.policyRoot, relativePath, normalizedPath);
}

export function policyPath(
  policyRoot: string,
  relativePath: string,
  resolved = relativePath,
): string {
  const root = path.resolve(policyRoot);
  const filePath = path.resolve(root, resolved);
  if (!filePath.startsWith(root + path.sep)) {
    throw new Error(`Policy path must stay within the policy root: ${relativePath}`);
  }
  if (!statSync(filePath).isFile()) {
    throw new Error(`Policy path is not a regular file: ${relativePath}`);
  }
  return filePath;
}

export function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
