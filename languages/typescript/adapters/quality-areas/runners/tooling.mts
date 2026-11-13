import type { SpawnSyncReturns } from 'node:child_process';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import {
  type CruiseReport,
  loadDependencyGraph,
} from '../../dependency-graph/project-dependency-graph.mts';
import { existingRoots } from '../../typed/static-checks.mts';
import { EXCLUDED_PATH_PATTERN } from '../../../preset/dependency-graph/cruise.mjs';
import { spawnSyncWithOutputFile, toolBinaryPath, toolNameForPath } from '../../typed/tooling.mts';
import type { Layout } from '../../typed/head-policy.mts';
import type { NodeToolResult } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { lstatSync } from 'node:fs';
import { TOOL_RUN_CEILING_MS } from '../../../../../shared/processes/deadlines.mjs';

export type NodeToolSpawn = {
  readonly options: QualityAreaOptions;
  readonly relativeToolPath?: string | undefined;
  readonly absoluteToolPath?: string | undefined;
  readonly arguments_: readonly string[];
  readonly nodeArguments?: readonly string[];
  readonly nodeOptions?: readonly string[] | undefined;
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string>>;
};

export type NodeToolInvocation = NodeToolSpawn & {
  readonly acceptedStatuses: readonly NodeToolResult['status'][];
};

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

export const TRUSTED_TOOL_ROOT: string = PACKAGE_ROOT;

export function runDependencyCruiser(options: QualityAreaOptions, layout: Layout): CruiseReport {
  const report = loadDependencyGraph({
    projectRoot: options.projectRoot,
    policyRoot: options.policyRoot,
    liveProjectRoot: options.liveProjectRoot,
    patterns: existingRoots(options.projectRoot, layout.graphRoots),
    exclude: EXCLUDED_PATH_PATTERN,
  });
  if (!Array.isArray(report.modules)) {
    throw new TypeError('dependency-cruiser report is missing its modules array');
  }
  return report;
}

export function runNodeTool({
  acceptedStatuses,
  ...invocation
}: NodeToolInvocation): SpawnSyncReturns<string> {
  const result = spawnNodeTool(invocation);
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${invocation.options.kind} exited with ${String(result.status)}: ${detail}`);
  }
  return result;
}

function nodeToolPaths(
  options: QualityAreaOptions,
  {
    relativeToolPath,
    absoluteToolPath,
  }: Pick<NodeToolSpawn, 'relativeToolPath' | 'absoluteToolPath'>,
): string[] {
  if (absoluteToolPath !== undefined) {
    return [absoluteToolPath];
  }
  if (relativeToolPath === undefined) {
    return [];
  }
  const name = toolNameForPath(relativeToolPath);
  const bin = relativeToolPath.slice(name.length + 1);
  return [toolBinaryPath(name, { projectRoot: options.liveProjectRoot, bin })];
}

function withNodeOptions(
  env: NodeJS.ProcessEnv,
  nodeOptions: readonly string[],
): NodeJS.ProcessEnv {
  return nodeOptions.length === 0
    ? env
    : { ...env, NODE_OPTIONS: [env['NODE_OPTIONS'] ?? '', ...nodeOptions].join(' ').trim() };
}

export function spawnNodeTool({
  options,
  relativeToolPath,
  absoluteToolPath,
  arguments_,
  nodeArguments = [],
  nodeOptions = [],
  cwd = options.projectRoot,
  environment = {},
}: NodeToolSpawn): SpawnSyncReturns<string> {
  const toolPaths = nodeToolPaths(options, { relativeToolPath, absoluteToolPath });
  const result = spawnSyncWithOutputFile(
    process.execPath,
    [...nodeArguments, ...toolPaths, ...arguments_],
    {
      cwd,
      env: withNodeOptions({ ...process.env, ...environment }, nodeOptions),
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: TOOL_RUN_CEILING_MS,
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
}

export async function importPolicyModule(
  options: Pick<QualityAreaOptions, 'policyRoot'>,
  relativePath: string,
  suffix = '',
): Promise<unknown> {
  const loaded: unknown = await import(
    `${pathToFileURL(path.join(options.policyRoot, relativePath)).href}${suffix}`
  );
  return loaded;
}

export function policyFile(policyRoot: string, relativePath: unknown): string {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError('Mutation companion config must be a relative path');
  }
  const filePath = path.resolve(policyRoot, relativePath);
  const relativeToPolicy = path.relative(policyRoot, filePath);
  if (
    relativeToPolicy === '..' ||
    relativeToPolicy.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToPolicy) ||
    !lstatSync(filePath).isFile()
  ) {
    throw new Error(`Mutation companion config must stay within the policy root: ${relativePath}`);
  }
  return filePath;
}

export function relativeProjectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).replaceAll('\\', '/');
}

export function parseReportJson(text: string): unknown {
  try {
    const report: unknown = JSON.parse(text);
    return report;
  } catch (error) {
    throw new Error('Invalid quality area JSON report', { cause: error });
  }
}
