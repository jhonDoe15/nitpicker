import type { Layout } from '../../typed/head-policy.mts';
import type { CruiseReport } from '../../typed/static-checks.mts';
import type { Finding, NodeToolResult } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from './area-types.mts';
import {
  importPolicyModule as importUntypedPolicyModule,
  parseReportJson as parseUntypedReportJson,
  policyFile as untypedPolicyFile,
  relativeProjectPath as untypedRelativeProjectPath,
  runDependencyCruiser as runUntypedDependencyCruiser,
  runNodeTool as runUntypedNodeTool,
  spawnNodeTool as spawnUntypedNodeTool,
} from '../runners/tooling.mjs';

export type NodeToolInvocation = {
  readonly options: QualityAreaOptions;
  readonly relativeToolPath?: string;
  readonly absoluteToolPath?: string;
  readonly arguments_: readonly string[];
  readonly nodeArguments?: readonly string[];
  readonly nodeOptions?: readonly string[];
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly acceptedStatuses: readonly NodeToolResult['status'][];
};

export type PolicyFunction = (...values: readonly unknown[]) => unknown;

export const runNodeTool: (invocation: NodeToolInvocation) => NodeToolResult = runUntypedNodeTool;

export function spawnNodeTool(
  invocation: Pick<NodeToolInvocation, 'options' | 'arguments_'> & {
    readonly relativeToolPath: string;
  },
): NodeToolResult {
  return spawnUntypedNodeTool({ absoluteToolPath: undefined, ...invocation });
}

export const parseReportJson: (text: string) => unknown = parseUntypedReportJson;

export const policyFile: (policyRoot: string, relativePath: string | undefined) => string =
  untypedPolicyFile;

export const relativeProjectPath: (projectRoot: string, filePath: string) => string =
  untypedRelativeProjectPath;

export const runDependencyCruiser: (options: QualityAreaOptions, layout: Layout) => CruiseReport =
  runUntypedDependencyCruiser;

export const importPolicyModule: (
  options: QualityAreaOptions,
  relativePath: string,
  suffix?: string,
) => Promise<unknown> = importUntypedPolicyModule;

function isPolicyFunction(value: unknown): value is PolicyFunction {
  return typeof value === 'function';
}

export async function policyExport(
  options: QualityAreaOptions,
  relativePath: string,
  name: string,
): Promise<PolicyFunction> {
  const loaded: unknown = await importPolicyModule(options, relativePath);
  const exported: unknown =
    typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, name) : undefined;
  if (!isPolicyFunction(exported)) {
    throw new TypeError(`${relativePath} does not export ${name}`);
  }
  return exported;
}

function isFindingList(value: unknown): value is Finding[] {
  return Array.isArray(value);
}

export function findingsOf(value: unknown): Finding[] {
  if (!isFindingList(value)) {
    throw new TypeError('The policy analyzer did not return a list of findings');
  }
  return value;
}
