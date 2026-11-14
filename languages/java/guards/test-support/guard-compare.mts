import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';

export type GuardFinding = { readonly path: string; readonly location?: { readonly line: number } };
type Comparison = (input: {
  readonly baseFindings: readonly GuardFinding[];
  readonly headFindings: readonly GuardFinding[];
  readonly baseToHeadRenames: Map<string, string>;
  readonly touchedCode: undefined;
  readonly unknownOnBase: undefined;
}) => Readonly<Record<string, unknown>>;

export const compare: Comparison = compareFindings;
