import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { callUntyped, findingsOf } from '../../adapters/typed/java-values.mts';
import type { JavaFinding } from '../../adapters/typed/java-values.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

export type Comparison = {
  readonly newFindings: JavaFinding[];
  readonly unchangedFindings: JavaFinding[];
};

export function comparison(input: Readonly<Record<string, unknown>>): Comparison {
  const result = callUntyped(compareFindings, { unknownOnBase: undefined, ...input });
  return {
    newFindings: findingsOf(fieldOf(result, 'newFindings')),
    unchangedFindings: findingsOf(fieldOf(result, 'unchangedFindings')),
  };
}
