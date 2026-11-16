import type { Dirent } from 'node:fs';
import { duplicateFindings as untypedDuplicateFindings } from '../../../../java/adapters/metrics/java-duplicates.mts';
import {
  readStructureFindings as untypedStructureFindings,
  sourceLines as untypedSourceLines,
} from '../../../../../shared/ingest/structure-report.mjs';
import { projectFilesUnder as untypedFilesUnder } from '../../../../../shared/project-files/project-files.mjs';
import { featureRoleContract as untypedRoleContract } from '../../../../../shared/rules/features/feature-roles.mjs';
import { collectFileLimitFindings as untypedFileLimits } from '../../../../../shared/rules/file-limits.mjs';
import type { ExceptionEntry } from '../../configuration/python-exceptions.mts';
import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';

export type FeatureRole = {
  readonly kind: string;
  readonly isPublic?: true;
  readonly directory?: string;
};

type Clone = Readonly<Record<string, unknown>>;

export const projectFilesUnder: (
  root: string,
  options: { skipDirectory: (absolute: string, entry: Dirent) => boolean },
) => string[] = untypedFilesUnder;

export const featureRoleContract: (
  layout: unknown,
  face: unknown,
) => (file: string) => FeatureRole = untypedRoleContract;

export const sourceLines: (
  sources: Map<string, string[]>,
  projectRoot: string,
  file: string,
) => string[] = untypedSourceLines;

export const readStructureFindings: (
  reportRoot: string,
  projectRoot: string,
  options: {
    textOf: (
      sources: Map<string, string[]>,
      projectRoot: string,
      range: { file: string; start: number; end: number },
    ) => string;
    hints: Readonly<Record<string, string>>;
    numberedAmongSameSource: boolean;
  },
) => IngestedFinding[] = untypedStructureFindings;

export const collectFileLimitFindings: (
  projectRoot: string,
  entries: readonly { path: string; kind: string; countsInFolder: boolean }[],
  options: {
    analyzerName: string;
    thresholds: Readonly<Record<string, unknown>>;
    exceptions: readonly ExceptionEntry[];
  },
) => IngestedFinding[] = untypedFileLimits;

export const duplicateFindings: (
  plain: Clone[],
  options: { reportRoot: string; reportFile: string; projectRoot: string; syntax: string },
) => IngestedFinding[] = untypedDuplicateFindings;
