import { compareFindings } from '../../../../core/diff/comparison/compare.mts';
import { fieldsOf } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';

export type GuardFinding = { readonly path: string; readonly location?: { readonly line: number } };
type ComparisonInput = {
  readonly baseFindings: readonly GuardFinding[];
  readonly headFindings: readonly GuardFinding[];
  readonly baseToHeadRenames: Map<string, string>;
  readonly touchedCode: undefined;
  readonly unknownOnBase: undefined;
};

export function compare(input: ComparisonInput): Readonly<Record<string, unknown>> {
  return fieldsOf(callUntyped(compareFindings, input));
}
