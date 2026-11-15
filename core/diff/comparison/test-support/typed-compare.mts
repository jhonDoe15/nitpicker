import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { compareFindings as compareFindingsJs } from '../compare.mjs';

export type CompareRequest = {
  readonly baseFindings: readonly unknown[];
  readonly headFindings: readonly unknown[];
  readonly baseToHeadRenames?: Map<string, string> | undefined;
  readonly baseToHeadDirectories?: Map<string, string> | undefined;
  readonly touchedCode?: unknown;
  readonly unknownOnBase?: unknown;
};

export type ComparedFinding = {
  readonly identity: string;
  readonly path: string;
  readonly [field: string]: unknown;
};

export type Comparison = {
  readonly newFindings: ComparedFinding[];
  readonly resolvedFindings: ComparedFinding[];
  readonly unchangedFindings: ComparedFinding[];
  readonly changedMetrics: ComparedFinding[];
};

function isCompared(value: unknown): value is ComparedFinding {
  return (
    typeof fieldOf(value, 'identity') === 'string' && typeof fieldOf(value, 'path') === 'string'
  );
}

function comparedIn(result: unknown, key: string): ComparedFinding[] {
  return listOf(fieldOf(result, key)).filter(isCompared);
}

const compareAll: (request: {
  readonly baseFindings: readonly unknown[];
  readonly headFindings: readonly unknown[];
  readonly baseToHeadRenames: Map<string, string> | undefined;
  readonly baseToHeadDirectories: Map<string, string> | undefined;
  readonly touchedCode: unknown;
  readonly unknownOnBase: unknown;
}) => unknown = compareFindingsJs;

export function compareFindings({
  baseFindings,
  headFindings,
  baseToHeadRenames,
  baseToHeadDirectories,
  touchedCode,
  unknownOnBase,
}: CompareRequest): Comparison {
  const result = compareAll({
    baseFindings,
    headFindings,
    baseToHeadRenames,
    baseToHeadDirectories,
    touchedCode,
    unknownOnBase,
  });
  return {
    newFindings: comparedIn(result, 'newFindings'),
    resolvedFindings: comparedIn(result, 'resolvedFindings'),
    unchangedFindings: comparedIn(result, 'unchangedFindings'),
    changedMetrics: comparedIn(result, 'changedMetrics'),
  };
}
