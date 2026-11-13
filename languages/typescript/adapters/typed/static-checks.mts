import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Finding } from '../static-checks/shared.mts';
import type { CruiseViolation } from '../dependency-graph/project-dependency-graph.mts';
import { withTypeScriptHint } from '../hints/tool-failure-hint.mts';
import {
  prepareSnapshotDependencies as prepareUntypedSnapshotDependencies,
  removeSnapshotDependencies as removeUntypedSnapshotDependencies,
} from '../static-checks/dependencies.mjs';
import { sharedReachPath as untypedSharedReachPath } from '../../preset/architecture/strict-boundary-rules.mjs';
import { existingRoots as untypedExistingRoots } from '../../preset/layout.mjs';

export type SnapshotDependencyRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly liveProjectRoot: string;
};

export {
  type CruiseReport,
  type CruiseSummary,
  type CruiseViolation,
  loadDependencyGraph,
} from '../dependency-graph/project-dependency-graph.mts';

export const sharedReachPath: (
  violation: CruiseViolation,
  modules: readonly unknown[],
) => string[] | undefined = untypedSharedReachPath;

export const existingRoots: (projectRoot: string, roots: readonly string[]) => string[] =
  untypedExistingRoots;

export const prepareSnapshotDependencies: (options: SnapshotDependencyRequest) => unknown =
  prepareUntypedSnapshotDependencies;

export const removeSnapshotDependencies: (dependencies: unknown) => void =
  removeUntypedSnapshotDependencies;

export function isInvokedModule(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  return invokedPath !== undefined && moduleUrl === pathToFileURL(realpathSync(invokedPath)).href;
}

export type AdapterOutput = {
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
};

export async function writeAdapterFindings(
  failurePrefix: string,
  findingsOf: () => Promise<readonly Finding[]>,
  output: AdapterOutput,
): Promise<number> {
  return writeAdapterReport(failurePrefix, async () => ({ findings: await findingsOf() }), output);
}

export async function writeAdapterReport(
  failurePrefix: string,
  reportOf: () => Promise<{ readonly findings: readonly Finding[] }>,
  output: AdapterOutput,
): Promise<number> {
  try {
    const report = await reportOf();
    output.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (failure) {
    const error = withTypeScriptHint(failure);
    output.stderr.write(`${failurePrefix}: ${error.message}\n`);
    return 2;
  }
}
