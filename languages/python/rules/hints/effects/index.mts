import { ACCUMULATOR_HINTS } from './accumulator.mts';
import { LAZY_HINTS } from './lazy.mts';
import { LOOP_IO_HINTS } from './loop-io.mts';
import type { RuleHint } from '../hint-types.mts';

export const EFFECT_HINTS: readonly RuleHint[] = [
  ...LOOP_IO_HINTS,
  ...ACCUMULATOR_HINTS,
  ...LAZY_HINTS,
];
