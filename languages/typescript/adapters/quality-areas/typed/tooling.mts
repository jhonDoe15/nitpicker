import type { Finding } from '../../static-checks/shared.mts';
import type { QualityAreaOptions } from './area-types.mts';
import { importPolicyModule } from '../runners/tooling.mts';

export {
  type NodeToolInvocation,
  importPolicyModule,
  parseReportJson,
  policyFile,
  relativeProjectPath,
  runDependencyCruiser,
  runNodeTool,
  spawnNodeTool,
} from '../runners/tooling.mts';

export type PolicyFunction = (...values: readonly unknown[]) => unknown;

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
