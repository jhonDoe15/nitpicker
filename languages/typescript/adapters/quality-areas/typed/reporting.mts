import type { Finding } from '../../static-checks/shared.mts';
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
