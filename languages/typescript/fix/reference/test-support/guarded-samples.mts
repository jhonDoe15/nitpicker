import { EFFECT_CASES } from './guarded/effect-cases.mts';
import type { GuardedCase, Replacement } from './guarded/guarded-case.mts';
import { VALUE_CASES } from './guarded/value-cases.mts';

export type GuardedSample = {
  readonly rule: string;
  readonly path: string;
  readonly input: string;
  readonly plain: string;
  readonly selected: string;
};

function replaced(input: string, replacement: Replacement | undefined): string {
  return replacement === undefined ? input : input.replace(...replacement);
}

function sampleOf({ rule, input, fixed, selected }: GuardedCase, index: number): GuardedSample {
  return {
    rule,
    path: `src/main/samples/g${String(index).padStart(2, '0')}.ts`,
    input,
    plain: replaced(input, fixed),
    selected: replaced(input, selected ?? fixed),
  };
}

export const GUARDED_SAMPLES: readonly GuardedSample[] = [...VALUE_CASES, ...EFFECT_CASES].map(
  sampleOf,
);
