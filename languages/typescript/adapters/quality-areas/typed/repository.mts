import type { Finding } from '../../static-checks/shared.mts';
import { type CruiseReport, reachModuleOf } from '../../typed/static-checks.mts';
import type { DependencyGraph } from '../../../preset/dependency-graph/graph-types.mts';
import type { QualityAreaOptions } from './area-types.mts';

export type JscpdConfig = { readonly path: string[]; readonly [key: string]: unknown };
import { hash as untypedHash } from '../../../../../shared/rules/finding-parts.mts';
import { typescriptStructureProjectFindings as untypedStructureProjectFindings } from '../../../preset/structure/project-findings.mts';
import {
  headJscpdSettings as untypedHeadJscpdSettings,
  layeredJscpdConfig as untypedLayeredJscpdConfig,
} from '../../../../../core/tooling/jscpd/config.mts';
import { rootsPattern as untypedRootsPattern } from '../../../../../core/tooling/jscpd/skipped-folders.mts';
import {
  layoutJscpdConfig,
  layoutKnipConfig,
} from '../../../preset/project-configs/typescript/layout-rewrites.mts';
import { normalizeDuplicates as untypedNormalizeDuplicates } from '../../../preset/duplicates/normalize.mts';
import { renamedDuplicatesReport as untypedRenamedDuplicatesReport } from '../../../preset/duplicates/renamed.mts';
import { baselinePathsOf as untypedBaselinePathsOf } from '../../../../../shared/rules/facts/baseline.mts';
import { graphImports as untypedGraphImports } from '../../../preset/dependency-graph/workspace-imports.mts';
import {
  moduleImportsSection as untypedModuleImportsSection,
  wantsModuleImports as untypedWantsModuleImports,
} from '../../../../../shared/history/co-change/dependencies/module-imports.mts';

export type JscpdRun = (run: { readonly configPath: string; readonly cwd?: string }) => unknown;

export type RenamedReport = { readonly report: unknown; readonly root: string };

export const hash: (value: unknown) => string = untypedHash;

export const typescriptStructureProjectFindings: (
  options: QualityAreaOptions & { readonly baselinePaths: unknown },
) => Finding[] = untypedStructureProjectFindings;

export function layeredJscpdConfig(
  base: object,
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, unknown>> {
  return untypedLayeredJscpdConfig(base, untypedHeadJscpdSettings(environment));
}

export const rootsPattern: (roots: readonly string[]) => string = untypedRootsPattern;

export const normalizeDuplicates: (
  report: unknown,
  analyzerName: string,
  options: {
    readonly configuredPaths: string[];
    readonly projectRoot: string;
    readonly renamedReport: unknown;
  },
) => Finding[] = untypedNormalizeDuplicates;

export const renamedDuplicatesReport: (run: {
  readonly projectRoot: string;
  readonly config: JscpdConfig;
  readonly runJscpd: JscpdRun;
  readonly scratchRoot: string;
}) => RenamedReport | undefined = untypedRenamedDuplicatesReport;

export const baselinePathsOf: (options: QualityAreaOptions) => unknown = untypedBaselinePathsOf;

const workspaceGraphImports: (
  graph: DependencyGraph,
  project: {
    isSourceFile: (relativePath: string) => boolean;
    projectRoot: string;
  },
) => unknown = untypedGraphImports;

export function graphImports(
  graph: CruiseReport,
  project: {
    readonly isSourceFile: (relativePath: string) => boolean;
    readonly projectRoot: string;
  },
): unknown {
  const modules: readonly unknown[] = Array.isArray(graph.modules) ? graph.modules : [];
  return workspaceGraphImports({ modules: modules.flatMap(reachModuleOf) }, project);
}

export const wantsModuleImports: (history: unknown) => boolean = untypedWantsModuleImports;

export const moduleImportsSection: (
  imports: unknown,
  history: unknown,
) => Readonly<Record<string, unknown>> = untypedModuleImportsSection;

export { layoutJscpdConfig };

export { layoutKnipConfig };
