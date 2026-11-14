import { compareFindings as untypedCompareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { isStrictRule as untypedIsStrictRule } from '../../../preset/strict-rules.mjs';
import type { EslintFinding } from '../typed/engine.mts';

type Ranges = readonly (readonly [number, number])[];

type TouchedCode = {
  readonly changedLines: ReadonlyMap<
    string,
    { readonly added: boolean; readonly ranges: Ranges; readonly inserted: Ranges }
  >;
  readonly isStrictRule: (rule: string) => boolean;
};

type ComparedFinding = EslintFinding & { readonly heldAtBase?: number };

type Comparison = {
  readonly newFindings: ComparedFinding[];
  readonly resolvedFindings: ComparedFinding[];
  readonly unchangedFindings: ComparedFinding[];
};

const comparisonOf: (input: {
  readonly baseFindings: readonly EslintFinding[];
  readonly headFindings: readonly EslintFinding[];
  readonly baseToHeadRenames?: Map<string, string> | undefined;
  readonly baseToHeadDirectories?: Map<string, string> | undefined;
  readonly touchedCode: TouchedCode | undefined;
  readonly unknownOnBase: ((finding: EslintFinding) => boolean) | undefined;
}) => Readonly<Record<string, ComparedFinding[]>> = untypedCompareFindings;

export function compareFindings(input: Parameters<typeof comparisonOf>[0]): Comparison {
  const { newFindings = [], resolvedFindings = [], unchangedFindings = [] } = comparisonOf(input);
  return { newFindings, resolvedFindings, unchangedFindings };
}

export const isStrictRule: (rule: string) => boolean = untypedIsStrictRule;

export function firstOf<Item>(items: readonly Item[]): Item {
  const [first] = items;
  if (first === undefined) {
    throw new RangeError('Expected at least one item');
  }
  return first;
}
