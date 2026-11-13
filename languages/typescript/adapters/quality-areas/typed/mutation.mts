import type { Finding } from '../../static-checks/shared.mts';
import type { Layout } from '../../typed/head-policy.mts';
import { parseChangedLines as untypedParseChangedLines } from '../../../../../core/diff/git/patches/changed-lines.mjs';
import { runGit as untypedRunGit } from '../../../../../core/diff/git/repository/command.mjs';
import { diffFromBase as untypedDiffFromBase } from '../../../../../core/tooling/git/base-diff.mjs';
import {
  isInMutationScope as untypedIsInMutationScope,
  scopedProjectFiles as untypedScopedProjectFiles,
} from '../../../../../core/scope/mutation-scope.mjs';
import { globMatcher as untypedGlobMatcher } from '../../../../../shared/paths/glob.mjs';
import { pathInside as untypedPathInside } from '../../../../../shared/filesystem.mjs';
import { exceptionRoute as untypedExceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { mutantRuleId as untypedMutantRuleId } from '../../../../../shared/policy.mjs';
import {
  layeredStrykerConfig as untypedLayeredStrykerConfig,
  withoutProjectIgnoredMutants as untypedWithoutProjectIgnoredMutants,
} from '../../../preset/project-configs/stryker-project-config.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../../preset/tool-configs.mjs';

type Position = { readonly line?: number; readonly column?: number };

export type MutantLocation = { readonly start?: Position; readonly end?: Position };

export type Mutant = {
  readonly mutatorName: string;
  readonly replacement?: string;
  readonly original?: string | undefined;
  readonly status: string;
  readonly location?: MutantLocation;
  readonly coveredBy?: unknown;
  readonly sourceHash?: string;
  readonly functionName?: string | undefined;
};

export type MutationFile = { readonly mutants?: readonly Mutant[] };

export type MutationReport = { readonly files?: Readonly<Record<string, MutationFile>> };

export type MutationOutcome =
  | { readonly skipped: Finding[]; readonly report?: undefined }
  | { readonly report: MutationReport; readonly skipped?: undefined };

export type StrykerConfig = Readonly<Record<string, unknown>>;

export type ChangedFile = { readonly path: string; readonly ranges: [number, number][] };

type Transform = ((text: string, targetPath: string) => string) | undefined;

export const parseChangedLines: (diffText: string) => Map<string, ChangedFile> =
  untypedParseChangedLines;

const diffFromBase: (request: {
  readonly runGit: unknown;
  readonly baselineRoot: string;
  readonly projectRoot: string;
  readonly args: readonly string[];
}) => string = untypedDiffFromBase;

export function gitDiffFromBase(
  baselineRoot: string,
  projectRoot: string,
  args: readonly string[],
): string {
  return diffFromBase({ runGit: untypedRunGit, baselineRoot, projectRoot, args });
}

export const isInMutationScope: (
  file: string,
  mutationScope: readonly string[] | undefined,
) => boolean = untypedIsInMutationScope;

export const scopedProjectFiles: (
  projectRoot: string,
  mutationScope: readonly string[],
) => string[] = untypedScopedProjectFiles;

export const globMatcher: (pattern: string) => RegExp = untypedGlobMatcher;

export const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;

const routeOf: (target: {
  readonly rule: string;
  readonly path: string;
  readonly function: undefined;
  readonly name: undefined;
  readonly key: undefined;
}) => string | undefined = untypedExceptionRoute;

export function exceptionRoute(rule: string, path: string): string {
  return routeOf({ rule, path, function: undefined, name: undefined, key: undefined }) ?? '';
}

export const mutantRuleId: (status: string) => string = untypedMutantRuleId;

export const layeredStrykerConfig: (config: StrykerConfig) => StrykerConfig =
  untypedLayeredStrykerConfig;

export const withoutProjectIgnoredMutants: (
  report: MutationReport,
  appliedConfig: StrykerConfig,
) => MutationReport = untypedWithoutProjectIgnoredMutants;

export const layoutTransformFor: (
  policyFileName: string,
  layout: Layout,
  options?: { readonly strictMutants: boolean },
) => Transform = untypedLayoutTransformFor;
