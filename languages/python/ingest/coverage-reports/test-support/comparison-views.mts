import { compareFindings as untypedCompare } from '../../../../../core/diff/comparison/compare.mjs';
import {
  baseMoves as untypedBaseMoves,
  comparisonKey as untypedComparisonKey,
} from '../../../../../core/diff/comparison/fingerprint.mjs';
import { parseAnalyzerReport as untypedParseReport } from '../../../../../core/diff/comparison/finding-schema.mjs';
import { parseChangedLines as untypedChangedLines } from '../../../../../core/diff/git/patches/changed-lines.mjs';
import { isStrictRule as untypedStrictRule } from '../../../../typescript/preset/strict-rules.mts';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../typed/ingest-types.mts';

type FindingMoves = ReturnType<typeof untypedBaseMoves>;

export type TouchedCode = { changedLines: unknown; isStrictRule: unknown };

type Comparison = { newFindings: IngestedFinding[]; unchangedFindings: IngestedFinding[] };

function isFinding(value: unknown): value is IngestedFinding {
  return typeof value === 'object' && value !== null;
}

export function compareFindings(input: {
  baseFindings: readonly IngestedFinding[];
  headFindings: readonly IngestedFinding[];
  touchedCode: TouchedCode;
}): Comparison {
  const result: unknown = untypedCompare({ ...input, unknownOnBase: undefined });
  return {
    newFindings: listOf(fieldOf(result, 'newFindings')).filter(isFinding),
    unchangedFindings: listOf(fieldOf(result, 'unchangedFindings')).filter(isFinding),
  };
}
export const baseMoves: (renames: Map<string, string>) => FindingMoves = untypedBaseMoves;
export const comparisonKey: (finding: IngestedFinding, moves?: FindingMoves) => string =
  untypedComparisonKey;
export const parseAnalyzerReport: (
  value: unknown,
  analyzerName: string,
) => { findings: unknown[] } = untypedParseReport;
export const parseChangedLines: (diffText: string) => unknown = untypedChangedLines;
export const isStrictRule: (rule: string, finding: { tool: string }) => boolean = untypedStrictRule;
