import type { Finding } from '../../static-checks/shared.mts';
import type { Layout } from '../../typed/head-policy.mts';
import type { QualityAreaOptions } from './area-types.mts';
import {
  coverageFailureFindings as untypedCoverageFailureFindings,
  readCoverageFindings as untypedReadCoverageFindings,
  toolErrorFinding as untypedToolErrorFinding,
} from '../reporting/test-report.mjs';
import {
  withDeadCodeSourceHashes as untypedDeadCodeSourceHashes,
  withFunctionSourceHashes as untypedFunctionSourceHashes,
} from '../reporting/source-hashes.mjs';
import { normalizeCrap as untypedNormalizeCrap } from '../reporting/tests.mjs';
import { readSlowTestFindings as untypedSlowTestFindings } from '../../slow-tests/slow-tests.mjs';
import { runProjectTests as untypedRunProjectTests } from '../../test-runners/run-project-tests.mjs';
import {
  hasProjectTests as untypedHasProjectTests,
  projectTestFiles as untypedProjectTestFiles,
} from '../../test-runners/test-run.mjs';

export type ToolErrorDetails = {
  readonly rule: string;
  readonly path?: string | undefined;
  readonly message: string;
  readonly anchor: string | undefined;
};

export type ProjectTestRun = {
  readonly failed: boolean;
  readonly report: { readonly numTotalTests?: number };
  readonly runnerName: string;
  readonly result: unknown;
  readonly precedingCommands: unknown;
};

export const toolErrorFinding: (
  options: Pick<QualityAreaOptions, 'analyzerName'>,
  details: ToolErrorDetails,
) => Finding = untypedToolErrorFinding;

export const coverageFailureFindings: (
  options: QualityAreaOptions,
  run: ProjectTestRun,
) => Finding[] = untypedCoverageFailureFindings;

export const readCoverageFindings: (options: QualityAreaOptions, testReport: unknown) => Finding[] =
  untypedReadCoverageFindings;

export const withFunctionSourceHashes: (report: unknown, projectRoot: string) => unknown =
  untypedFunctionSourceHashes;

export const withDeadCodeSourceHashes: (report: unknown, projectRoot: string) => unknown =
  untypedDeadCodeSourceHashes;

export const normalizeCrap: (
  report: unknown,
  analyzerName: string,
  options: { readonly scoreLimit: number },
) => Finding[] = untypedNormalizeCrap;

export const readSlowTestFindings: (
  options: QualityAreaOptions,
  report: unknown,
) => Promise<Finding[]> = untypedSlowTestFindings;

export const runProjectTests: (options: QualityAreaOptions) => Promise<ProjectTestRun> =
  untypedRunProjectTests;

export const hasProjectTests: (
  options: QualityAreaOptions,
  layout: Layout,
  files: readonly string[],
) => boolean = untypedHasProjectTests;

export const projectTestFiles: (
  options: QualityAreaOptions,
  layout: Layout,
  files: readonly string[],
) => string[] = untypedProjectTestFiles;
