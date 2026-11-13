import type { Finding } from '../../static-checks/shared.mts';
import type { CruiseReport } from '../../typed/static-checks.mts';
import type { Layout } from '../../typed/head-policy.mts';
import type { QualityAreaOptions } from './area-types.mts';
import type { KnipConfig } from './policy.mts';
import { hash as untypedHash } from '../../../../../shared/rules/finding-helpers.mjs';
import { typescriptStructureProjectFindings as untypedStructureProjectFindings } from '../../../preset/structure/project-findings.mjs';
import {
  layoutJscpdConfig as untypedLayoutJscpdConfig,
  layoutKnipConfig as untypedLayoutKnipConfig,
} from '../../../preset/tool-configs.mjs';
import { layeredJscpdConfig as untypedLayeredJscpdConfig } from '../../../../../core/tooling/jscpd/config.mjs';
import { rootsPattern as untypedRootsPattern } from '../../../../../core/tooling/jscpd/skipped-folders.mjs';
import { normalizeDuplicates as untypedNormalizeDuplicates } from '../../../preset/duplicates/normalize.mjs';
import { renamedDuplicatesReport as untypedRenamedDuplicatesReport } from '../../../preset/duplicates/renamed.mjs';
import { spawnedEntryFiles as untypedSpawnedEntryFiles } from '../../dependency-graph/spawned-entries.mjs';
import { baselinePathsOf as untypedBaselinePathsOf } from '../../../../../shared/rules/facts/baseline.mjs';
import { projectImports as untypedProjectImports } from '../../../preset/dependency-graph/cruise.mjs';
import { moduleImportsSection as untypedModuleImportsSection } from '../../../../../shared/history/co-change/dependencies/module-imports.mjs';

export type JscpdConfig = { readonly path: string[]; readonly [key: string]: unknown };

export type JscpdRun = (run: { readonly configPath: string; readonly cwd?: string }) => unknown;

export type RenamedReport = { readonly report: unknown; readonly root: string };

export const hash: (value: unknown) => string = untypedHash;

export const typescriptStructureProjectFindings: (
  options: QualityAreaOptions & { readonly baselinePaths: unknown },
) => Finding[] = untypedStructureProjectFindings;

export const layoutJscpdConfig: (base: unknown, layout: Layout) => JscpdConfig =
  untypedLayoutJscpdConfig;

export const layoutKnipConfig: (base: unknown, layout: Layout) => KnipConfig =
  untypedLayoutKnipConfig;

export const layeredJscpdConfig: (base: JscpdConfig) => Readonly<Record<string, unknown>> =
  untypedLayeredJscpdConfig;

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

export const spawnedEntryFiles: (projectRoot: string) => string[] = untypedSpawnedEntryFiles;

export const baselinePathsOf: (options: QualityAreaOptions) => unknown = untypedBaselinePathsOf;

export const projectImports: (
  graph: CruiseReport,
  isSourceFile: (relativePath: string) => boolean,
) => unknown = untypedProjectImports;

export const moduleImportsSection: (
  imports: unknown,
  history: unknown,
) => Readonly<Record<string, unknown>> = untypedModuleImportsSection;
