import { compareFindings as untypedCompareFindings } from '../../../../../core/diff/comparison/compare.mts';
import { isStrictRule as untypedIsStrictRule } from '../../../preset/strict-rules.mts';
import type { CompareRequest } from '../../../../../core/diff/comparison/compare.mts';
import type { TrackedFinding } from '../../../../../core/diff/comparison/model/finding-types.mts';

type Comparison = {
  readonly newFindings: TrackedFinding[];
  readonly resolvedFindings: TrackedFinding[];
  readonly unchangedFindings: TrackedFinding[];
};

export function compareFindings(input: CompareRequest): Comparison {
  const { newFindings, resolvedFindings, unchangedFindings } = untypedCompareFindings(input);
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
