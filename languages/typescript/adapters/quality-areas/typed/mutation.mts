import type { Finding } from '../../static-checks/shared.mts';
import type { StrykerConfig } from '../../../preset/project-configs/project-config-types.mts';
import { parseChangedLines as untypedParseChangedLines } from '../../../../../core/diff/git/patches/changed-lines.mts';
import { runGit } from '../../../../../core/diff/git/repository/command.mts';
import { diffFromBase } from '../../../../../core/tooling/git/base-diff.mts';
import {
  isInMutationScope as untypedIsInMutationScope,
  scopedProjectFiles as untypedScopedProjectFiles,
} from '../../../../../core/scope/mutation-scope.mts';
import { globMatcher } from '../../../../../shared/paths/glob.mts';
import { pathInside as untypedPathInside } from '../../../../../shared/filesystem.mts';
import { exceptionRoute as untypedExceptionRoute } from '../../../../../shared/exceptions/rule-names.mts';
import { mutantRuleId as untypedMutantRuleId } from '../../../../../shared/policy.mts';
import {
  layeredStrykerConfig as untypedLayeredStrykerConfig,
  withoutProjectIgnoredMutants as untypedWithoutProjectIgnoredMutants,
} from '../../../preset/project-configs/stryker-project-config.mts';
import { readHeadPolicyFile as toolPolicy } from '../../../preset/project-tools/typed/shared-views.mts';
import { layoutTransformFor } from '../../../preset/tool-configs.mts';

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
  | {
      readonly report: MutationReport;
      readonly skipped?: undefined;
      readonly notes?: readonly Finding[];
    };

export type ChangedFile = { readonly path: string; readonly ranges: [number, number][] };

export const parseChangedLines: (diffText: string) => Map<string, ChangedFile> =
  untypedParseChangedLines;

export function gitDiffFromBase(
  baselineRoot: string,
  projectRoot: string,
  args: readonly string[],
): string {
  return diffFromBase({ runGit, baselineRoot, projectRoot, args });
}

export const isInMutationScope: (
  file: string,
  mutationScope: readonly string[] | undefined,
) => boolean = untypedIsInMutationScope;

export const scopedProjectFiles: (
  projectRoot: string,
  mutationScope: readonly string[],
) => string[] = untypedScopedProjectFiles;

export { globMatcher };

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

export function layeredStrykerConfig(
  config: StrykerConfig,
  environment: Readonly<Record<string, string | undefined>>,
): StrykerConfig {
  return untypedLayeredStrykerConfig(config, toolPolicy(environment).tools?.['stryker']);
}

export const withoutProjectIgnoredMutants: (
  report: MutationReport,
  appliedConfig: StrykerConfig,
) => MutationReport = untypedWithoutProjectIgnoredMutants;

export { layoutTransformFor };
