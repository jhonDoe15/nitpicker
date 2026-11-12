import {
  toolNameForPath,
  resolveTool as resolveUntypedTool,
} from '../../../../core/tooling/tool-resolution.mjs';
import { spawnSyncWithOutputFile } from '../../../../core/tooling/output-file/output-file.mjs';
import { realpathSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';
import { type StaticCheckOptions, normalizedRelativePath, requiredString } from './arguments.mts';
import { createHash } from 'node:crypto';
import { TOOL_RUN_CEILING_MS } from '../../../../shared/processes/deadlines.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

type ToolLocation = {
  readonly projectRoot?: string;
  readonly bin?: string;
  readonly packageRoot?: string;
};

type ResolvedTool = { readonly root: string; readonly binPath: string | undefined };

export const resolveTool: (name: string, location?: ToolLocation) => ResolvedTool =
  resolveUntypedTool;

export function toolBinaryPath(
  name: string,
  location: ToolLocation & { readonly bin: string },
): string {
  return requiredString(resolveTool(name, location).binPath, `${name} binary`);
}

export type Finding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  message: string;
  classification: 'enforceable' | 'descriptive';
  symbol?: string;
  location?: { line: number; column?: number; endLine?: number };
};

type NodeToolRun = {
  readonly options: StaticCheckOptions;
  readonly relativeToolPath: string;
  readonly arguments_: readonly string[];
  readonly acceptedStatuses: readonly (number | null)[];
};

export type NodeToolResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

export function runNodeTool({
  options,
  relativeToolPath,
  arguments_,
  acceptedStatuses,
}: NodeToolRun): NodeToolResult {
  const name = toolNameForPath(relativeToolPath);
  const toolPath = toolBinaryPath(name, {
    projectRoot: options.liveProjectRoot,
    bin: relativeToolPath.slice(name.length + 1),
  });
  const result = spawnSyncWithOutputFile(process.execPath, [toolPath, ...arguments_], {
    cwd: options.projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: TOOL_RUN_CEILING_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${options.kind} exited with ${String(result.status)}: ${detail}`);
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
  const filePath = path.resolve(options.policyRoot, normalizedPath);
  const relativeToPolicy = path.relative(options.policyRoot, filePath);
  if (relativeToPolicy.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPolicy)) {
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
