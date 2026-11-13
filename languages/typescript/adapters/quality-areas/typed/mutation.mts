import type { Finding } from '../../static-checks/shared.mts';
import type { Layout } from '../../typed/head-policy.mts';
import type { QualityAreaOptions } from './area-types.mts';
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
import { projectTestRunner as untypedProjectTestRunner } from '../../../preset/test-runner/project-runner.mjs';
import {
  cracoJestConfigText as untypedCracoJestConfigText,
  mutationRunnerConfig as untypedMutationRunnerConfig,
  unsupportedMutationRunner as untypedUnsupportedMutationRunner,
} from '../../test-runners/mutation-runner-config.mjs';
import { runnableTestFiles as untypedRunnableTestFiles } from '../../test-runners/test-run.mjs';
import {
  layeredStrykerConfig as untypedLayeredStrykerConfig,
  withoutProjectIgnoredMutants as untypedWithoutProjectIgnoredMutants,
} from '../../../preset/project-configs/stryker-project-config.mjs';
import {
  normalizeMutation as untypedNormalizeMutation,
  withUnreachedMutantsUncovered as untypedWithUnreachedMutantsUncovered,
} from '../reporting/tests.mjs';
import { withMutationSourceHashes as untypedWithMutationSourceHashes } from '../reporting/source-hashes.mjs';
import { layoutTransformFor as untypedLayoutTransformFor } from '../../../preset/tool-configs.mjs';

type Position = { readonly line?: number; readonly column?: number };

export type Mutant = {
  readonly mutatorName: string;
  readonly replacement?: string;
  readonly original?: string;
  readonly status: string;
  readonly location?: { readonly start?: Position; readonly end?: Position };
};

export type MutationFile = { readonly mutants?: readonly Mutant[] };

export type MutationReport = { readonly files?: Readonly<Record<string, MutationFile>> };

export type MutationOutcome =
  | { readonly skipped: Finding[]; readonly report?: undefined }
  | { readonly report: MutationReport; readonly skipped?: undefined };

export type StrykerConfig = Readonly<Record<string, unknown>>;

export type RunnerCommand = {
  readonly launcher?: string;
  readonly environment: Readonly<Record<string, string>>;
};

export type TestRunner = { readonly runner: unknown; readonly command: RunnerCommand };

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

export const projectTestRunner: (options: QualityAreaOptions) => TestRunner =
  untypedProjectTestRunner;

export const unsupportedMutationRunner: (
  options: QualityAreaOptions,
  runner: unknown,
) => string | undefined = untypedUnsupportedMutationRunner;

export const cracoJestConfigText: () => string = untypedCracoJestConfigText;

export const mutationRunnerConfig: (request: {
  readonly options: QualityAreaOptions;
  readonly runner: unknown;
  readonly command: RunnerCommand;
  readonly testFiles: readonly string[];
  readonly sourceConfig: StrykerConfig;
}) => StrykerConfig = untypedMutationRunnerConfig;

export const runnableTestFiles: (options: QualityAreaOptions) => string[] =
  untypedRunnableTestFiles;

export const layeredStrykerConfig: (config: StrykerConfig) => StrykerConfig =
  untypedLayeredStrykerConfig;

export const withoutProjectIgnoredMutants: (
  report: MutationReport,
  appliedConfig: StrykerConfig,
) => MutationReport = untypedWithoutProjectIgnoredMutants;

export const normalizeMutation: (report: MutationReport, analyzerName: string) => Finding[] =
  untypedNormalizeMutation;

export const withUnreachedMutantsUncovered: (
  report: unknown,
  coverageAnalysis: unknown,
) => MutationReport = untypedWithUnreachedMutantsUncovered;

export const withMutationSourceHashes: (
  report: MutationReport,
  projectRoot: string,
) => MutationReport = untypedWithMutationSourceHashes;

export const layoutTransformFor: (
  policyFileName: string,
  layout: Layout,
  options?: { readonly strictMutants: boolean },
) => Transform = untypedLayoutTransformFor;
