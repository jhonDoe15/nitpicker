import type { Finding } from '../static-checks/shared.mts';
import { loadDependencyGraph as loadUntypedDependencyGraph } from '../dependency-graph/project-dependency-graph.mjs';
import { applyAreaExceptions as applyUntypedAreaExceptions } from '../exceptions/area-exceptions.mjs';
import { withTypeScriptHint as withUntypedTypeScriptHint } from '../hints/tool-failure-hint.mjs';
import {
  prepareSnapshotDependencies as prepareUntypedSnapshotDependencies,
  removeSnapshotDependencies as removeUntypedSnapshotDependencies,
} from '../static-checks/dependencies.mjs';
import { sharedReachPath as untypedSharedReachPath } from '../../preset/architecture/strict-boundary-rules.mjs';
import { existingRoots as untypedExistingRoots } from '../../preset/layout.mjs';

export type CruiseViolation = {
  readonly rule?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly type?: unknown;
  readonly cycle?: unknown;
  readonly via?: unknown;
};

export type CruiseSummary = {
  readonly violations?: unknown;
  readonly ruleSetUsed?: {
    readonly forbidden?: readonly unknown[];
    readonly required?: readonly unknown[];
  };
};

export type CruiseReport = { readonly summary?: CruiseSummary; readonly modules?: unknown };

export type DependencyGraphRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly liveProjectRoot?: string;
  readonly patterns: readonly string[];
  readonly exclude: string | undefined;
  readonly includeOnly?: string | undefined;
  readonly configRelativePath?: string;
  readonly reportsConfigErrors?: boolean;
};

export type SnapshotDependencyRequest = {
  readonly projectRoot: string;
  readonly policyRoot: string;
  readonly liveProjectRoot: string;
};

export const loadDependencyGraph: (request: DependencyGraphRequest) => CruiseReport =
  loadUntypedDependencyGraph;

export const applyAreaExceptions: (findings: readonly Finding[]) => Finding[] =
  applyUntypedAreaExceptions;

export const withTypeScriptHint: (failure: unknown) => Error = withUntypedTypeScriptHint;

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
