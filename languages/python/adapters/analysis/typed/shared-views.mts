import { duplicateFindings as untypedDuplicateFindings } from '../../../../java/adapters/metrics/java-duplicates.mts';
import {
  readStructureFindings as untypedStructureFindings,
  sourceLines as untypedSourceLines,
} from '../../../../../shared/ingest/structure-report.mts';
import { collectFileLimitFindings as untypedFileLimits } from '../../../../../shared/rules/file-limits.mts';
import type { ExceptionEntry } from '../../configuration/python-exceptions.mts';
import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';

type Clone = Readonly<Record<string, unknown>>;

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
